import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus, BackgroundJob } from '@prisma/client';
import { JobTaskBridgeService } from './job-task-bridge.service';
import { JobHandlerRegistry } from './job-handler.registry';

export const DEFAULT_JOB_TIMEOUT_MS = 60_000;
export const MAX_JOB_TIMEOUT_MS = 300_000;

@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorkerService.name);
  private workerId = `worker-${Math.random().toString(36).substring(7)}`;
  private timer: NodeJS.Timeout;
  private isPolling = false;
  private isProcessing = false;
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => JobTaskBridgeService))
    private readonly taskBridge?: JobTaskBridgeService,
    @Optional() workerId?: string,
    @Optional() private readonly registry?: JobHandlerRegistry,
  ) {
    if (workerId) this.workerId = workerId;
  }
  getWorkerId(): string {
    return this.workerId;
  }

  onModuleInit() {
    this.startPolling();
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.timer = setInterval(() => this.poll(), 5000); // 5 second poll
    this.logger.log(`Worker ${this.workerId} started polling`);
  }

  stopPolling() {
    this.isPolling = false;
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async recoverStaleJobs() {
    // C3: Recover stuck processing jobs older than 5 minutes
    const staleTimeout = new Date(Date.now() - 5 * 60 * 1000);
    const recovered = await this.prisma.backgroundJob.updateMany({
      where: {
        status: JobStatus.PROCESSING,
        lockedAt: { lt: staleTimeout }
      },
      data: {
        status: JobStatus.QUEUED,
        lockedAt: null,
        workerId: null,
        lastError: 'Stale lock recovery',
      }
    });

    if (recovered.count > 0) {
      this.logger.warn(`Recovered ${recovered.count} stale jobs from PROCESSING back to QUEUED`);
    }
  }

  private async poll() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.recoverStaleJobs();

      // 1. Find a QUEUED job
      const job = await this.prisma.backgroundJob.findFirst({
        where: {
          status: JobStatus.QUEUED,
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: new Date() } }
          ]
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      if (!job) return;

      // 2. Lock the job
      const lockedJob = await this.prisma.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: JobStatus.QUEUED // optimistic locking
        },
        data: {
          status: JobStatus.PROCESSING,
          workerId: this.workerId,
          lockedAt: new Date(),
          startedAt: new Date(),
          attempts: { increment: 1 }
        }
      });

      if (lockedJob.count === 0) return; // someone else locked it

      this.logger.log(`Processing job ${job.id} [${job.type}]`);

      // 3. Process it
      await this.processJob(job);

    } catch (error) {
      this.logger.error(`Error in poll loop: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: BackgroundJob) {
    try {
      this.logger.debug(`Executing job logic for type: ${job.type}`);

      // A type with no handler must not be reported as done: fail it terminally instead of a silent COMPLETED.
      const registered = this.registry?.get(job.type);
      const isTask = job.type === 'TASK_EXECUTION' && !!this.taskBridge;
      if (!isTask && !registered) {
        await this.prisma.backgroundJob.updateMany({
          where: { id: job.id, status: JobStatus.PROCESSING, workerId: this.workerId },
          data: {
            status: JobStatus.FAILED,
            lockedAt: null,
            workerId: null,
            lastError: `No handler registered for job type ${job.type}`,
          },
        });
        this.logger.error(`Job ${job.id} failed: no handler for type ${job.type}`);
        return;
      }

      // Per-job execution timeout
      const rawTimeout = (job.payload as any)?.timeoutMs;
      const timeoutMs = typeof rawTimeout === 'number' && rawTimeout > 0
        ? Math.min(rawTimeout, MAX_JOB_TIMEOUT_MS)
        : DEFAULT_JOB_TIMEOUT_MS;

      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job execution timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      });

      try {
        await Promise.race([
          isTask ? this.taskBridge!.executeTaskJob(job) : registered!(job),
          timeoutPromise,
        ]);
      } finally {
        clearTimeout(timer!);
      }

      // Compare-and-set: only complete if this worker still holds the valid PROCESSING lease
      const completed = await this.prisma.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: JobStatus.PROCESSING,
          workerId: this.workerId,
        },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          lockedAt: null,
          workerId: null,
        },
      });

      if (completed.count === 0) {
        this.logger.warn(`Job ${job.id} execution succeeded but lease was lost (worker ${this.workerId}). Completion ignored.`);
        return;
      }

      this.logger.log(`Completed job ${job.id}`);
    } catch (error) {
      // `job` was read before the lock incremented attempts, so this run is attempt job.attempts + 1.
      const attempt = job.attempts + 1;
      const isFinalAttempt = attempt >= job.maxAttempts;
      
      // M6: True exponential backoff (e.g. 5s, 10s, 20s, up to 1hr cap + jitter)
      const baseWait = 5000;
      const maxWait = 3600000;
      const exponentialDelay = Math.min(maxWait, baseWait * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 1000); // 0-1s jitter
      const nextAttemptTime = new Date(Date.now() + exponentialDelay + jitter);
      
      // Compare-and-set: only update if this worker still owns the PROCESSING lease
      const failed = await this.prisma.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: JobStatus.PROCESSING,
          workerId: this.workerId,
        },
        data: {
          status: isFinalAttempt ? JobStatus.FAILED : JobStatus.QUEUED,
          lockedAt: null,
          workerId: null,
          lastError: error.message,
          nextAttemptAt: isFinalAttempt ? null : nextAttemptTime,
        },
      });

      if (failed.count === 0) {
        this.logger.warn(`Job ${job.id} failed by worker ${this.workerId} but lease was lost. State update discarded.`);
        return;
      }
      
      if (isFinalAttempt) {
        this.logger.error(`Job ${job.id} failed permanently after ${attempt} attempts.`);
      } else {
        this.logger.warn(`Job ${job.id} failed attempt, requeued.`);
      }
    }
  }
}

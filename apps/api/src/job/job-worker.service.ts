import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus, BackgroundJob } from '@prisma/client';

@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorkerService.name);
  private workerId = `worker-${Math.random().toString(36).substring(7)}`;
  private timer: NodeJS.Timeout;
  private isPolling = false;

  constructor(private readonly prisma: PrismaService) {}

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
    }
  }

  private async processJob(job: BackgroundJob) {
    try {
      // Stub execution - we can route this based on job.type
      this.logger.debug(`Executing job logic for type: ${job.type}`);
      
      // Assume success for now
      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
        }
      });
      this.logger.log(`Completed job ${job.id}`);
    } catch (error) {
      const isFinalAttempt = (job.attempts) >= job.maxAttempts;
      
      // M6: True exponential backoff (e.g. 5s, 10s, 20s, up to 1hr cap + jitter)
      const baseWait = 5000;
      const maxWait = 3600000;
      const exponentialDelay = Math.min(maxWait, baseWait * Math.pow(2, job.attempts));
      const jitter = Math.floor(Math.random() * 1000); // 0-1s jitter
      const nextAttemptTime = new Date(Date.now() + exponentialDelay + jitter);
      
      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: isFinalAttempt ? JobStatus.FAILED : JobStatus.QUEUED,
          lastError: error.message,
          nextAttemptAt: isFinalAttempt ? null : nextAttemptTime,
        }
      });
      
      if (isFinalAttempt) {
        this.logger.error(`Job ${job.id} failed permanently after ${job.attempts + 1} attempts.`);
      } else {
        this.logger.warn(`Job ${job.id} failed attempt, requeued.`);
      }
    }
  }
}

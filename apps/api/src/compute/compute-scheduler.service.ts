import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComputeWorkerService } from './compute-worker.service';
import { TrainingJobService } from './training-job.service';

import { LocalAdapterTrainingRuntime } from './local-adapter-training.runtime';

@Injectable()
export class ComputeScheduler implements OnModuleInit {
  private readonly logger = new Logger(ComputeScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerService: ComputeWorkerService,
    private readonly jobService: TrainingJobService,
    private readonly localRuntime: LocalAdapterTrainingRuntime
  ) {}

  onModuleInit() {
    this.startSchedulingLoop();
  }

  private startSchedulingLoop() {
    if (this.running) return;
    this.running = true;
    
    // Run the scheduler loop every 5 seconds
    setInterval(async () => {
      try {
        await this.scheduleJobs();
      } catch (err) {
        this.logger.error(`Error in scheduling loop: ${err.message}`);
      }
    }, 5000).unref(); // .unref() allows the process to exit even if the timer is still pending
  }

  async scheduleJobs() {
    // 1. Mark lost workers
    await this.workerService.markLostWorkers();

    // 2. Fetch queued jobs
    const queuedJobs = await this.prisma.trainingJob.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      include: { trainingRun: { include: { configuration: true } } }
    });

    if (queuedJobs.length === 0) return;

    // 3. Fetch idle workers
    const idleWorkers = await this.prisma.computeWorker.findMany({
      where: { status: 'IDLE', health: 'HEALTHY' }
    });

    for (const job of queuedJobs) {
      if (idleWorkers.length === 0) break;

      // Extremely simple scheduling: pick the first idle worker
      const worker = idleWorkers.shift();
      if (!worker) break;

      this.logger.log(`Scheduling job ${job.id} to worker ${worker.id}`);

      // Atomically attempt to claim
      const updatedJob = await this.prisma.trainingJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'SCHEDULED', workerId: worker.id }
      });

      if (updatedJob.count > 0) {
        await this.prisma.computeWorker.update({
          where: { id: worker.id },
          data: { status: 'BUSY' }
        });

        await this.prisma.computeReservation.create({
          data: {
            workerId: worker.id,
            jobId: job.id,
            status: 'ACTIVE'
          }
        });

        await this.jobService.updateJobStatus(job.id, 'SCHEDULED');
        
        // Execute!
        // In a distributed system, this would be a message queue.
        // Here we just trigger the local runtime directly if the worker is LOCAL_MACHINE.
        if (worker.type === 'LOCAL_MACHINE') {
          // Fire and forget (it manages its own lifecycle)
          this.localRuntime.execute(job.id, job.trainingRun.configuration, [], null).catch(err => {
            this.logger.error(`Failed to execute local runtime for job ${job.id}: ${err.message}`);
          });
        }
      } else {
        // Someone else grabbed it, push worker back
        idleWorkers.unshift(worker);
      }
    }
  }

  async releaseResources(jobId: string) {
    const reservation = await this.prisma.computeReservation.findUnique({
      where: { jobId }
    });

    if (reservation && reservation.status === 'ACTIVE') {
      this.logger.log(`Releasing resources for job ${jobId}`);
      await this.prisma.computeReservation.update({
        where: { jobId },
        data: { status: 'RELEASED' }
      });

      await this.prisma.computeWorker.update({
        where: { id: reservation.workerId },
        data: { status: 'IDLE' }
      });
    }
  }
}

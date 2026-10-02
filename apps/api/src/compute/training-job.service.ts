import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModelTrainingStatus } from '@prisma/client';

@Injectable()
export class TrainingJobService {
  private readonly logger = new Logger(TrainingJobService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createJobFromRun(trainingRunId: string, executor: string = 'LOCAL_CPU') {
    const run = await this.prisma.trainingRun.findUnique({
      where: { id: trainingRunId },
      include: { configuration: true }
    });
    
    if (!run) throw new NotFoundException('TrainingRun not found');

    const job = await this.prisma.trainingJob.create({
      data: {
        trainingRunId: run.id,
        executor,
        status: 'QUEUED',
        resourceAllocation: run.resourceAllocation || {},
      }
    });

    return job;
  }

  async getJob(id: string) {
    const job = await this.prisma.trainingJob.findUnique({ where: { id }, include: { worker: true } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async updateJobStatus(id: string, status: string, failureReason?: string) {
    const job = await this.prisma.trainingJob.findUnique({ where: { id }});
    if (!job) return;

    const data: any = { status };
    if (status === 'RUNNING') data.startedAt = new Date();
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'RESOURCE_LIMIT', 'WORKER_LOST'].includes(status)) {
      data.completedAt = new Date();
    }
    if (failureReason) data.failureReason = failureReason;

    await this.prisma.trainingJob.update({
      where: { id },
      data
    });

    // Propagate status back to TrainingRun mapping ModelTrainingStatus where possible
    let runStatus: ModelTrainingStatus | null = null;
    switch (status) {
      case 'QUEUED':
      case 'SCHEDULED':
      case 'STARTING':
      case 'COMPLETING':
        runStatus = ModelTrainingStatus.QUEUED; break;
      case 'RUNNING': runStatus = ModelTrainingStatus.RUNNING; break;
      case 'COMPLETED': runStatus = ModelTrainingStatus.COMPLETED; break;
      case 'FAILED': runStatus = ModelTrainingStatus.FAILED; break;
      case 'CANCELLED': runStatus = ModelTrainingStatus.CANCELLED; break;
      case 'TIMEOUT': 
      case 'RESOURCE_LIMIT': 
      case 'WORKER_LOST':
        runStatus = ModelTrainingStatus.RESOURCE_LIMIT; break;
    }

    if (runStatus) {
      await this.prisma.trainingRun.update({
        where: { id: job.trainingRunId },
        data: {
          status: runStatus,
          ...(data.startedAt ? { startedAt: data.startedAt } : {}),
          ...(data.completedAt ? { completedAt: data.completedAt } : {}),
          ...(failureReason ? { failureReason } : {})
        }
      });
    }
  }

  async recordHeartbeat(jobId: string, workerId: string, progress: number, currentStep: number, resourceUsage: any) {
    await this.prisma.trainingJobHeartbeat.create({
      data: {
        jobId,
        workerId,
        progress,
        currentStep,
        resourceUsage
      }
    });
  }

  async getJobs() {
    return this.prisma.trainingJob.findMany({ include: { worker: true } });
  }

  async cancelJob(id: string) {
    await this.updateJobStatus(id, 'CANCELLED', 'Cancelled by user');
  }

  async getLogs(id: string) {
    return this.prisma.trainingLog.findMany({
      where: { jobId: id },
      orderBy: { timestamp: 'asc' }
    });
  }

  async log(jobId: string, message: string, severity: string = 'INFO', step?: number, category?: string) {
    await this.prisma.trainingLog.create({
      data: {
        jobId,
        message,
        severity,
        step,
        category
      }
    });
  }
}

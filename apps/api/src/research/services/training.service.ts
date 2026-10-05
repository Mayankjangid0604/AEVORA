import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EconomyService } from '../../economy/economy.service';
import { TrainingGateway } from '../training/training.gateway';
import { ModelTrainingStatus } from '@prisma/client';

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economyService: EconomyService,
    private readonly gateway: TrainingGateway
  ) {}

  async createTrainingRun(configId: string, executor: string = 'SIMULATED') {
    const config = await this.prisma.trainingConfiguration.findUnique({
      where: { id: configId }
    });
    if (!config) throw new NotFoundException('Configuration not found');

    const run = await this.prisma.trainingRun.create({
      data: {
        companyId: config.companyId,
        researchProjectId: config.researchProjectId,
        configurationId: config.id,
        baseModelVersionId: config.baseModelVersionId,
        datasetVersions: config.datasetVersions,
        status: ModelTrainingStatus.PLANNED,
        executor
      }
    });

    return run;
  }

  async startTrainingRun(runId: string) {
    const run = await this.prisma.trainingRun.findUnique({
      where: { id: runId },
      include: { configuration: true }
    });
    if (!run) throw new NotFoundException('Run not found');

    const allowedStates: ModelTrainingStatus[] = [
      ModelTrainingStatus.PLANNED, 
      ModelTrainingStatus.FAILED, 
      ModelTrainingStatus.RESOURCE_LIMIT, 
      ModelTrainingStatus.CANCELLED
    ];
    if (!allowedStates.includes(run.status)) {
      throw new BadRequestException('Run is not in a startable state');
    }

    const config = run.configuration;
    
    // Resource limits / budget check
    const project = await this.prisma.researchProject.findUnique({ where: { id: config.researchProjectId }});
    if (!project) throw new NotFoundException('Project not found');

    if (config.maxComputeUnits) {
      if (project.budget < config.maxComputeUnits) {
        await this.prisma.trainingRun.update({
          where: { id: runId },
          data: { status: ModelTrainingStatus.RESOURCE_LIMIT, failureReason: 'Insufficient project budget' }
        });
        throw new BadRequestException('Insufficient project budget to start training');
      }

      // Deduct budget
      await this.prisma.researchProject.update({
        where: { id: project.id },
        data: { budget: project.budget - config.maxComputeUnits }
      });
    }

    // Determine attempt number
    const attemptsCount = await this.prisma.trainingRunAttempt.count({ where: { trainingRunId: runId }});
    const attempt = await this.prisma.trainingRunAttempt.create({
      data: {
        trainingRunId: runId,
        attemptNumber: attemptsCount + 1,
        status: ModelTrainingStatus.QUEUED,
        executor: run.executor
      }
    });

    // In a real system, we'd queue this up. Here we just execute synchronously for the gateway.
    // In Phase 14 MVP, the Gateway handles it directly.
    await this.gateway.executeTraining(config, attempt, []);

    return attempt;
  }

  async cancelTrainingRun(runId: string) {
    const attempt = await this.prisma.trainingRunAttempt.findFirst({
      where: { trainingRunId: runId, status: ModelTrainingStatus.RUNNING },
      orderBy: { attemptNumber: 'desc' }
    });
    
    if (!attempt) throw new BadRequestException('No running attempt to cancel');
    
    return this.gateway.cancelTraining(attempt.id);
  }
}

import { Injectable, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { SimulatedTrainingExecutor } from './simulated.training-executor';
import { LocalPythonTrainingExecutor } from './local-python.training-executor';
import { TrainingExecutor } from './training.executor.interface';
import { TrainingConfiguration, TrainingRunAttempt, ModelTrainingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class TrainingGateway implements OnModuleInit {
  private readonly logger = new Logger(TrainingGateway.name);
  private executors: Map<string, TrainingExecutor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly simulatedExecutor: SimulatedTrainingExecutor,
    private readonly localPythonExecutor: LocalPythonTrainingExecutor
  ) {
    this.executors = new Map();
  }

  onModuleInit() {
    this.registerExecutor(this.simulatedExecutor);
    this.registerExecutor(this.localPythonExecutor);
  }


  private registerExecutor(executor: TrainingExecutor) {
    this.executors.set(executor.getIdentifier(), executor);
  }

  getExecutor(identifier: string): TrainingExecutor {
    const executor = this.executors.get(identifier);
    if (!executor) {
      throw new BadRequestException(`Training executor '${identifier}' is not supported or not configured.`);
    }
    return executor;
  }

  async executeTraining(
    configuration: TrainingConfiguration,
    attempt: TrainingRunAttempt,
    datasetPaths: string[]
  ) {
    const executor = this.getExecutor(attempt.executor);
    
    try {
      this.logger.log(`Dispatching training attempt ${attempt.id} to executor ${attempt.executor}`);
      
      await this.prisma.trainingRunAttempt.update({
        where: { id: attempt.id },
        data: { status: ModelTrainingStatus.RUNNING, startedAt: new Date() }
      });

      // Update parent run
      await this.prisma.trainingRun.update({
        where: { id: attempt.trainingRunId },
        data: { status: ModelTrainingStatus.RUNNING, startedAt: new Date() }
      });

      const result = await executor.execute(configuration, attempt, datasetPaths);

      // Record result
      await this.prisma.trainingRunAttempt.update({
        where: { id: attempt.id },
        data: {
          status: result.status,
          completedAt: new Date(),
          resourceConsumption: result.resourceConsumption || {},
          failureReason: result.failureReason
        }
      });

      await this.prisma.trainingRun.update({
        where: { id: attempt.trainingRunId },
        data: {
          status: result.status,
          completedAt: new Date(),
          resourceConsumption: result.resourceConsumption || {},
          metricsSummary: result.metrics || {},
          failureReason: result.failureReason
        }
      });

      // If successful, create artifact
      if (result.status === ModelTrainingStatus.COMPLETED && result.artifactRef) {
        let checksum = '';
        let sizeBytes = 1024 * 1024 * 100; // default for simulated

        if (attempt.executor !== 'SIMULATED' && fs.existsSync(result.artifactRef)) {
          const fileBuffer = fs.readFileSync(result.artifactRef);
          checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          sizeBytes = fileBuffer.length;
        } else {
          // For SIMULATED, create a deterministic representation and hash the actual bytes
          const simData = JSON.stringify({ type: 'SIMULATED_MODEL', attemptId: attempt.id, result: result.status });
          checksum = crypto.createHash('sha256').update(simData).digest('hex');
          sizeBytes = Buffer.byteLength(simData);
        }

        await this.prisma.modelArtifact.create({
          data: {
            type: 'MODEL_WEIGHTS',
            checksum,
            sizeBytes,
            storageRef: result.artifactRef,
            creatorId: configuration.creatorId,
            trainingRunId: attempt.trainingRunId,
            status: attempt.executor === 'SIMULATED' ? 'SIMULATED' : 'REGISTERED'
          }
        });
      }

    } catch (error) {
      this.logger.error(`Execution failed for attempt ${attempt.id}: ${error.message}`);
      
      await this.prisma.trainingRunAttempt.update({
        where: { id: attempt.id },
        data: {
          status: ModelTrainingStatus.FAILED,
          completedAt: new Date(),
          failureReason: error.message
        }
      });

      await this.prisma.trainingRun.update({
        where: { id: attempt.trainingRunId },
        data: {
          status: ModelTrainingStatus.FAILED,
          completedAt: new Date(),
          failureReason: error.message
        }
      });
    }
  }

  async cancelTraining(attemptId: string) {
    const attempt = await this.prisma.trainingRunAttempt.findUnique({ where: { id: attemptId }});
    if (!attempt) throw new BadRequestException('Attempt not found');
    
    if (attempt.status === ModelTrainingStatus.RUNNING) {
      const executor = this.getExecutor(attempt.executor);
      await executor.cancel(attemptId);

      await this.prisma.trainingRunAttempt.update({
        where: { id: attemptId },
        data: { status: ModelTrainingStatus.CANCELLED, completedAt: new Date() }
      });
      await this.prisma.trainingRun.update({
        where: { id: attempt.trainingRunId },
        data: { status: ModelTrainingStatus.CANCELLED, completedAt: new Date() }
      });
    }
  }
}

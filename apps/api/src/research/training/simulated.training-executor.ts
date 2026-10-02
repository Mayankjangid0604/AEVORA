import { Injectable, Logger } from '@nestjs/common';
import { TrainingExecutor, TrainingExecutionResult } from './training.executor.interface';
import { TrainingConfiguration, TrainingRunAttempt, ModelTrainingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class SimulatedTrainingExecutor implements TrainingExecutor {
  private readonly logger = new Logger(SimulatedTrainingExecutor.name);

  constructor(private readonly prisma: PrismaService) {}

  getIdentifier(): string {
    return 'SIMULATED';
  }

  async execute(
    configuration: TrainingConfiguration,
    attempt: TrainingRunAttempt,
    _datasetPaths: string[]
  ): Promise<TrainingExecutionResult> {
    this.logger.log(`Starting simulated training for attempt ${attempt.id}`);

    // Wait for a deterministic amount of time to simulate execution
    const delay = configuration.maxRuntimeMs ? Math.min(configuration.maxRuntimeMs, 2000) : 1500;
    
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate outcome based on configuration limits
    if (configuration.maxComputeUnits && configuration.maxComputeUnits < 100) {
      return {
        status: ModelTrainingStatus.RESOURCE_LIMIT,
        failureReason: 'Insufficient simulated compute limits to complete training.',
        resourceConsumption: { computeUnits: configuration.maxComputeUnits },
      };
    }

    if (configuration.name.includes('FAIL_TEST')) {
      return {
        status: ModelTrainingStatus.RESOURCE_LIMIT,
        failureReason: 'Deliberate failure triggered by FAIL_TEST configuration.',
        resourceConsumption: { computeUnits: 10 },
      };
    }

    // Persist mock metrics and checkpoints
    for (let step = 1; step <= 5; step++) {
      await this.prisma.trainingMetric.create({
        data: {
          attemptId: attempt.id,
          step,
          epoch: step * 2,
          name: 'loss',
          value: 1.0 - (step * 0.1),
          metricType: 'SCALAR',
        }
      });
      await this.prisma.trainingCheckpoint.create({
        data: {
          attemptId: attempt.id,
          checkpointNumber: step,
          step,
          artifactRef: `simulated://artifacts/${attempt.id}/ckpt-${step}.bin`,
          checksum: require('crypto').createHash('sha256').update(`mock-${step}`).digest('hex'),
        }
      });
    }

    this.logger.log(`Created metrics and checkpoints for attempt ${attempt.id}`);

    const loss = 1.0 - (Math.random() * 0.2);

    return {
      status: ModelTrainingStatus.COMPLETED,
      metrics: {
        finalLoss: loss,
        epochsCompleted: 10,
        throughput: '100 samples/sec'
      },
      resourceConsumption: {
        computeUnits: 150,
        peakMemoryMb: 4096
      },
      artifactRef: `simulated://artifacts/${attempt.id}/model.bin`
    };
  }

  async cancel(attemptId: string): Promise<boolean> {
    this.logger.log(`Cancelled simulated training for attempt ${attemptId}`);
    return true;
  }

  async getStatus(_attemptId: string): Promise<ModelTrainingStatus> {
    return ModelTrainingStatus.RUNNING;
  }
}

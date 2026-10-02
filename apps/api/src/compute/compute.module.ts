import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ComputeWorkerService } from './compute-worker.service';
import { TrainingJobService } from './training-job.service';
import { ComputeScheduler } from './compute-scheduler.service';
import { LocalComputeProvider } from './local-compute.provider';
import { LocalAdapterTrainingRuntime } from './local-adapter-training.runtime';
import { ComputeController } from './compute.controller';

@Module({
  imports: [PrismaModule],
  providers: [
    ComputeWorkerService,
    TrainingJobService,
    ComputeScheduler,
    LocalComputeProvider,
    LocalAdapterTrainingRuntime
  ],
  controllers: [ComputeController],
  exports: [
    ComputeWorkerService,
    TrainingJobService,
    ComputeScheduler,
    LocalComputeProvider,
    LocalAdapterTrainingRuntime
  ]
})
export class ComputeModule {}

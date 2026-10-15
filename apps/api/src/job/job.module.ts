import { Module, forwardRef } from '@nestjs/common';
import { JobService } from './job.service';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobWorkerService } from './job-worker.service';
import { JobController } from './job.controller';
import { ApprovalModule } from '../approval/approval.module';
import { JobTaskBridgeService } from './job-task-bridge.service';
import { TaskModule } from '../task/task.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    ApprovalModule,
    forwardRef(() => TaskModule),
    forwardRef(() => WorkforceModule),
  ],
  providers: [JobService, JobWorkerService, JobTaskBridgeService, JobHandlerRegistry, PrismaService],
  controllers: [JobController],
  exports: [JobService, JobTaskBridgeService, JobHandlerRegistry],
})
export class JobModule {}

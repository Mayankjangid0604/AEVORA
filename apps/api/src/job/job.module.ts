import { Module, forwardRef } from '@nestjs/common';
import { JobService } from './job.service';
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
  providers: [JobService, JobWorkerService, JobTaskBridgeService, PrismaService],
  controllers: [JobController],
  exports: [JobService, JobTaskBridgeService],
})
export class JobModule {}

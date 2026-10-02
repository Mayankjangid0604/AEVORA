import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { JobWorkerService } from './job-worker.service';
import { JobController } from './job.controller';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [ApprovalModule],
  providers: [JobService, JobWorkerService],
  controllers: [JobController],
  exports: [JobService],
})
export class JobModule {}

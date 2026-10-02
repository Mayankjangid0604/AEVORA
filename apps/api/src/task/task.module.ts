import { Module, forwardRef } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { PrismaService } from '../prisma/prisma.service';

import { ResearchModule } from '../research/research.module';

import { WorkforceModule } from '../workforce/workforce.module';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { CeoModule } from '../ceo/ceo.module';
import { DepartmentModule } from '../department/department.module';

@Module({
  imports: [ResearchModule, WorkforceModule, forwardRef(() => CeoModule), DepartmentModule],
  controllers: [TaskController],
  providers: [TaskService, PrismaService, TaskOrchestratorService],
  exports: [TaskService, TaskOrchestratorService],
})
export class TaskModule {}

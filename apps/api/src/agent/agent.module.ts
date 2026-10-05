import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentContextBuilder } from './agent-context.service';
import { AgentPolicyService } from './agent-policy.service';
import { WorkCycleService } from './work-cycle.service';
import { MemoryService } from './memory.service';
import { TaskModule } from '../task/task.module';
import { WorkloadModule } from '../workload/workload.module';
import { PrismaService } from '../prisma/prisma.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { IdleCodegenService } from './idle-codegen.service';
import { ProjectExecutionModule } from '../project-execution/project-execution.module';
import { CompanyOperationsModule } from '../company-operations/company-operations.module';
import { CommunicationModule } from '../communication/communication.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [forwardRef(() => TaskModule), WorkloadModule, ProjectExecutionModule, CompanyOperationsModule, KnowledgeModule, IntelligenceModule, forwardRef(() => CommunicationModule)],
  controllers: [AgentController],
  providers: [
    AgentRuntimeService,
    AgentContextBuilder,
    AgentPolicyService,
    WorkCycleService,
    MemoryService,
    PrismaService,
    AgentSchedulerService,
    IdleCodegenService,
  ],
  exports: [AgentRuntimeService, WorkCycleService, AgentSchedulerService],
})
export class AgentModule {}

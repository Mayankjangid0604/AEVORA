import { Module, forwardRef } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchModule } from '../research/research.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskQualityGateService } from './task-quality-gate.service';
import { RetryPolicyService } from './retry-policy.service';
import { EvidenceVerificationService } from './evidence-verification.service';
import { OutcomeVerificationService } from './outcome-verification.service';
import { StrategicOutcomeReconciliationService } from './strategic-outcome-reconciliation.service';
import { CeoModule } from '../ceo/ceo.module';
import { DepartmentModule } from '../department/department.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [
    ResearchModule,
    WorkforceModule,
    forwardRef(() => CeoModule),
    DepartmentModule,
    forwardRef(() => JobModule),
  ],
  controllers: [TaskController],
  providers: [
    TaskService,
    PrismaService,
    TaskOrchestratorService,
    TaskExecutionService,
    TaskQualityGateService,
    RetryPolicyService,
    EvidenceVerificationService,
    OutcomeVerificationService,
    StrategicOutcomeReconciliationService,
  ],
  exports: [
    TaskService,
    TaskOrchestratorService,
    TaskExecutionService,
    TaskQualityGateService,
    RetryPolicyService,
    EvidenceVerificationService,
    OutcomeVerificationService,
    StrategicOutcomeReconciliationService,
  ],
})
export class TaskModule {}

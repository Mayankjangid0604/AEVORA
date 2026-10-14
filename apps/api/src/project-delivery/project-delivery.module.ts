import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskModule } from '../task/task.module';
import { ReliabilityModule } from '../reliability/reliability.module';
import { ProjectDeliveryController } from './project-delivery.controller';
import { ProjectIntakeService } from './project-intake.service';
import { ScopeBudgetAssessmentService } from './scope-budget-assessment.service';
import { FactoryPlanningService } from './factory-planning.service';
import { GovernedToolRouterService } from './governed-tool-router.service';
import { FactoryWorkspaceService } from './factory-workspace.service';
import { FactoryBuildOrchestratorService } from './factory-build-orchestrator.service';
import { FactoryQualityGateService } from './factory-quality-gate.service';
import { FactoryDeploymentService } from './factory-deployment.service';
import { FactoryDeliveryHandoverService } from './factory-delivery-handover.service';
import { FactorySafeCleanupService } from './factory-safe-cleanup.service';
import { FactoryResilienceIncidentService } from './factory-resilience-incident.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => TaskModule),
    forwardRef(() => ReliabilityModule),
  ],
  controllers: [ProjectDeliveryController],
  providers: [
    ProjectIntakeService,
    ScopeBudgetAssessmentService,
    FactoryPlanningService,
    GovernedToolRouterService,
    FactoryWorkspaceService,
    FactoryBuildOrchestratorService,
    FactoryQualityGateService,
    FactoryDeploymentService,
    FactoryDeliveryHandoverService,
    FactorySafeCleanupService,
    FactoryResilienceIncidentService,
  ],
  exports: [
    ProjectIntakeService,
    ScopeBudgetAssessmentService,
    FactoryPlanningService,
    GovernedToolRouterService,
    FactoryWorkspaceService,
    FactoryBuildOrchestratorService,
    FactoryQualityGateService,
    FactoryDeploymentService,
    FactoryDeliveryHandoverService,
    FactorySafeCleanupService,
    FactoryResilienceIncidentService,
  ],
})
export class ProjectDeliveryModule {}

import { forwardRef, Module } from '@nestjs/common';
import { CeoStrategicPlanningService } from './ceo-strategic-planning.service';
import { DevicesModule } from '../devices/devices.module';
import { TaskModule } from '../task/task.module';
import { VenturesModule } from '../ventures/ventures.module';
import { LeadGenModule } from '../lead-gen/lead-gen.module';
import { SalesOutreachModule } from '../sales-outreach/sales-outreach.module';
import { IntegrationModule } from '../integration/integration.module';
import { IdeasModule } from '../ideas/ideas.module';
import { PipelineManagementService } from './pipeline-management.service';
import { WeeklyReportService } from './weekly-report.service';
import { SelfImprovementService } from './self-improvement.service';
import { CeoDialogueService } from './ceo-dialogue.service';
import { CeoReviewService } from './ceo-review.service';
import { CeoDecisionsService } from './ceo-decisions.service';
import { CeoController } from './ceo.controller';
import { CeoHiringService } from './ceo-hiring.service';
import { HeadHiringService } from './head-hiring.service';
import { ProjectStaffingService } from './project-staffing.service';
import { VoiceModule } from '../voice/voice.module';
import { CeoOperatingService } from './ceo-operating.service';
import { CeoAutonomousService } from './ceo-autonomous.service';
import { CeoBudgetService } from './ceo-budget.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { CeoPerformanceService } from './ceo-performance.service';
import { CeoSuccessionService } from './ceo-succession.service';
import { CommunicationModule } from '../communication/communication.module';
import { ManagementModule } from '../management/management.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { EnterpriseBrainModule } from '../enterprise-brain/enterprise-brain.module';
import { CeoContextAssemblyService } from './ceo-context-assembly.service';
import { CeoProactiveDetectionService } from './ceo-proactive-detection.service';
import { CeoObjectiveDecompositionService } from './ceo-objective-decomposition.service';
import { CeoDecisionLifecycleService } from './ceo-decision-lifecycle.service';
import { CeoConsequenceAnalysisService } from './ceo-consequence-analysis.service';

@Module({
  imports: [
    DevicesModule,
    forwardRef(() => TaskModule),
    VenturesModule,
    LeadGenModule,
    SalesOutreachModule,
    IntegrationModule,
    IdeasModule,
    VoiceModule,
    forwardRef(() => CommunicationModule),
    ManagementModule,
    forwardRef(() => WorkforceModule),
    EnterpriseBrainModule,
  ],
  providers: [
    CeoStrategicPlanningService,
    CeoReviewService,
    CeoDecisionsService,
    PipelineManagementService,
    WeeklyReportService,
    SelfImprovementService,
    CeoDialogueService,
    CeoHiringService,
    HeadHiringService,
    ProjectStaffingService,
    CeoOperatingService,
    CeoAutonomousService,
    CeoBudgetService,
    CeoFinancialAuthorityService,
    CeoPerformanceService,
    CeoSuccessionService,
    CeoContextAssemblyService,
    CeoProactiveDetectionService,
    CeoObjectiveDecompositionService,
    CeoDecisionLifecycleService,
    CeoConsequenceAnalysisService,
  ],
  controllers: [CeoController],
  exports: [
    CeoStrategicPlanningService,
    CeoReviewService,
    CeoDecisionsService,
    CeoHiringService,
    HeadHiringService,
    ProjectStaffingService,
    CeoDialogueService,
    CeoOperatingService,
    CeoAutonomousService,
    CeoBudgetService,
    CeoFinancialAuthorityService,
    CeoPerformanceService,
    CeoSuccessionService,
    CeoContextAssemblyService,
    CeoProactiveDetectionService,
    CeoObjectiveDecompositionService,
    CeoDecisionLifecycleService,
    CeoConsequenceAnalysisService,
  ],
})
export class CeoModule {}

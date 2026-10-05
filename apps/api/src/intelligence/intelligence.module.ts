import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntelligenceSessionService } from './services/intelligence-session.service';
import { IntelligenceContextBuilder } from './services/intelligence-context.builder';
import { IntelligenceAssessmentService } from './services/intelligence-assessment.service';
import { PlanningService } from './services/planning.service';
import { DecisionProposalService } from './services/decision-proposal.service';
import { AssistanceRequestService } from './services/assistance-request.service';
import { RiskDetectionService } from './services/risk-detection.service';
import { OutcomeService } from './services/outcome.service';
import { IntelligenceController } from './controllers/intelligence.controller';

@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [
    IntelligenceSessionService,
    IntelligenceContextBuilder,
    IntelligenceAssessmentService,
    PlanningService,
    DecisionProposalService,
    AssistanceRequestService,
    RiskDetectionService,
    OutcomeService,
  ],
  exports: [
    IntelligenceSessionService,
    IntelligenceContextBuilder,
    IntelligenceAssessmentService,
    PlanningService,
    DecisionProposalService,
    AssistanceRequestService,
    RiskDetectionService,
    OutcomeService,
  ],
})
export class IntelligenceModule {}

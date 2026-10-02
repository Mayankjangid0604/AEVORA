import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RdAuditService } from './rd-audit.service';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdInitiativeService } from './rd-initiative.service';
import { RdCapabilityService } from './rd-capability.service';
import { RdCapabilityLinkService } from './rd-capability-link.service';
import { RdFeedbackService } from './rd-feedback.service';
import { RdResourcePlanService } from './rd-resource-plan.service';
import { RdAnalyticsService } from './rd-analytics.service';
import { RdFlywheelController } from './rd-flywheel.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RdFlywheelController],
  providers: [
    RdAuditService,
    RdPortfolioService,
    RdInitiativeService,
    RdCapabilityService,
    RdCapabilityLinkService,
    RdFeedbackService,
    RdResourcePlanService,
    RdAnalyticsService,
  ],
  exports: [RdPortfolioService, RdInitiativeService, RdCapabilityService, RdAuditService],
})
export class RdFlywheelModule {}

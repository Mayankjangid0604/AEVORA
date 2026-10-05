import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AeAuditService } from './ae-audit.service';
import { AeObjectiveService } from './ae-objective.service';
import { AeOperatingCycleService } from './ae-operating-cycle.service';
import { AeEscalationService } from './ae-escalation.service';
import { AeDecisionService } from './ae-decision.service';
import { AeRecommendationService } from './ae-recommendation.service';
import { AeDashboardService } from './ae-dashboard.service';
import { AutonomousEnterpriseController } from './autonomous-enterprise.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AutonomousEnterpriseController],
  providers: [
    AeAuditService,
    AeObjectiveService,
    AeOperatingCycleService,
    AeEscalationService,
    AeDecisionService,
    AeRecommendationService,
    AeDashboardService,
  ],
  exports: [AeAuditService],
})
export class AutonomousEnterpriseModule {}

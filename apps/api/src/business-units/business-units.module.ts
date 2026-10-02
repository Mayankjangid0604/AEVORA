import { Module } from '@nestjs/common';
import { BusinessUnitsController } from './business-units.controller';
import { BuBusinessUnitService } from './bu-business-unit.service';
import { BuObjectiveService } from './bu-objective.service';
import { BuKpiService } from './bu-kpi.service';
import { BuBudgetService } from './bu-budget.service';
import { BuRiskService } from './bu-risk.service';
import { BuCapitalRequestService } from './bu-capital-request.service';
import { BuPerformanceReviewService } from './bu-performance-review.service';
import { BuPnlService } from './bu-pnl.service';
import { BuAuditService } from './bu-audit.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessUnitsController],
  providers: [
    BuBusinessUnitService,
    BuObjectiveService,
    BuKpiService,
    BuBudgetService,
    BuRiskService,
    BuCapitalRequestService,
    BuPerformanceReviewService,
    BuPnlService,
    BuAuditService,
  ],
  exports: [BuBusinessUnitService, BuAuditService],
})
export class BusinessUnitsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoAuditService } from './go-audit.service';
import { GoRegionService } from './go-region.service';
import { GoCountryService } from './go-country.service';
import { GoEntityService } from './go-entity.service';
import { GoKpiService } from './go-kpi.service';
import { GoRiskService } from './go-risk.service';
import { GoBudgetService } from './go-budget.service';
import { GoComplianceService } from './go-compliance.service';
import { GoFxService } from './go-fx.service';
import { GoAnalyticsService } from './go-analytics.service';
import { GlobalOperationsController } from './global-operations.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GlobalOperationsController],
  providers: [
    GoAuditService,
    GoRegionService,
    GoCountryService,
    GoEntityService,
    GoKpiService,
    GoRiskService,
    GoBudgetService,
    GoComplianceService,
    GoFxService,
    GoAnalyticsService,
  ],
  exports: [GoAuditService],
})
export class GlobalOperationsModule {}

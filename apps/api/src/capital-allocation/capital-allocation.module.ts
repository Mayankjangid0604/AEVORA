import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaAuditService } from './ca-audit.service';
import { CaPoolService } from './ca-pool.service';
import { CaProposalService } from './ca-proposal.service';
import { CaScenarioService } from './ca-scenario.service';
import { CaConstraintService } from './ca-constraint.service';
import { CaAllocationService } from './ca-allocation.service';
import { CaPerformanceService } from './ca-performance.service';
import { CaAnalyticsService } from './ca-analytics.service';
import { CapitalAllocationController } from './capital-allocation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CapitalAllocationController],
  providers: [
    CaAuditService,
    CaPoolService,
    CaProposalService,
    CaScenarioService,
    CaConstraintService,
    CaAllocationService,
    CaPerformanceService,
    CaAnalyticsService,
  ],
  exports: [CaAuditService],
})
export class CapitalAllocationModule {}

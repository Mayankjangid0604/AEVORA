import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeObjectiveStatus, AeDecisionStatus } from '@prisma/client';

@Injectable()
export class AeDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // READ-ONLY advisory aggregation. NEVER writes to any model.
  async enterpriseSummary(companyId: string) {
    const [
      rdPortfolios,
      businessUnits,
      capitalPools,
      regions,
      openObjectives,
      pendingDecisions,
      openEscalations,
    ] = await Promise.all([
      this.prisma.rdPortfolio.count({ where: { companyId } }),
      this.prisma.businessUnit.count({ where: { companyId } }),
      this.prisma.caCapitalPool.count({ where: { companyId } }),
      this.prisma.goRegion.count({ where: { companyId } }),
      this.prisma.aeEnterpriseObjective.count({ where: { companyId, status: AeObjectiveStatus.ACTIVE } }),
      this.prisma.aeChairmanDecision.count({ where: { companyId, status: AeDecisionStatus.PENDING } }),
      this.prisma.aeEscalation.count({ where: { companyId, status: AeDecisionStatus.PENDING } }),
    ]);

    // Advisory count of active initiatives via rdPortfolio
    const activeInitiatives = await this.prisma.rdInitiative.count({ where: { companyId } });

    return {
      isAdvisory: true,
      rdPortfolios,
      activeInitiatives,
      businessUnits,
      capitalPools,
      regions,
      openObjectives,
      pendingDecisions,
      openEscalations,
    };
  }
}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSummary(companyId: string) {
    const [totalRegions, totalEntities, activeEntities, totalRisks, openRisks] = await Promise.all([
      this.prisma.goRegion.count({ where: { companyId } }),
      this.prisma.goOperatingEntity.count({ where: { companyId } }),
      this.prisma.goOperatingEntity.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.goRegionalRisk.count({ where: { companyId } }),
      this.prisma.goRegionalRisk.count({ where: { companyId, status: 'OPEN' } }),
    ]);
    return {
      isAdvisory: true,
      totalRegions,
      totalEntities,
      activeEntities,
      totalRisks,
      openRisks,
    };
  }

  async regionalHealth(companyId: string, regionId: string) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    const [kpiCount, riskCount, budgets] = await Promise.all([
      this.prisma.goRegionalKpi.count({ where: { companyId, regionId } }),
      this.prisma.goRegionalRisk.count({ where: { companyId, regionId } }),
      this.prisma.goRegionalBudget.findMany({ where: { companyId, regionId }, select: { allocatedMc: true, forecastedMc: true } }),
    ]);
    const totalAllocatedMc = budgets.reduce((s, b) => s + b.allocatedMc, 0);
    return {
      isAdvisory: true,
      regionId, regionName: region.name,
      kpiCount, riskCount,
      budgetCount: budgets.length,
      totalAllocatedMc,
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BuPnlService {
  constructor(private readonly prisma: PrismaService) {}

  // ponytail: advisory read-only view — queries Phase 28 data but never mutates Finance models
  async pnlSummary(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId }, include: { budgets: true } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');

    // Advisory aggregation of budget records — no Finance writes
    const totalAllocatedMc = bu.budgets.reduce((sum, b) => sum + b.allocatedMc, 0);
    const totalForecastedMc = bu.budgets.reduce((sum, b) => sum + (b.forecastedSpendMc ?? 0), 0);
    const totalActualMc = bu.budgets.reduce((sum, b) => sum + (b.actualSpendMc ?? 0), 0);

    return {
      isAdvisory: true,
      buId,
      companyId,
      totalAllocatedMc,
      totalForecastedMc,
      totalActualMc,
      budgetCount: bu.budgets.length,
      note: 'Advisory view only. Authoritative P&L lives in Phase 28 Finance module.',
    };
  }
}

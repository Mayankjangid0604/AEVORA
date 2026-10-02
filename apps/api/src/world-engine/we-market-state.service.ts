import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeMarketState } from '@prisma/client';
import { MarketStateDelta } from './we-interpretation.service';

@Injectable()
export class WeMarketStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(companyId: string): Promise<WeMarketState> {
    return this.prisma.weMarketState.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
  }

  async getState(companyId: string): Promise<WeMarketState> {
    return this.getOrCreate(companyId);
  }

  async applyDelta(companyId: string, delta: MarketStateDelta, lastEventId?: string): Promise<WeMarketState> {
    const current = await this.getOrCreate(companyId);

    const updateData: Record<string, unknown> = {
      tickCount: { increment: 1 },
      lastUpdatedAt: new Date(),
    };
    if (lastEventId) updateData.lastEventId = lastEventId;

    // Additive deltas for indices (they are relative shifts), absolute for rates
    if (delta.energyCostIndex !== undefined) {
      updateData.energyCostIndex = current.energyCostIndex + delta.energyCostIndex;
    }
    if (delta.logisticsCostIndex !== undefined) {
      updateData.logisticsCostIndex = current.logisticsCostIndex + delta.logisticsCostIndex;
    }
    if (delta.supplyCostIndex !== undefined) {
      updateData.supplyCostIndex = current.supplyCostIndex + delta.supplyCostIndex;
    }
    if (delta.consumerDemandIndex !== undefined) {
      updateData.consumerDemandIndex = current.consumerDemandIndex + delta.consumerDemandIndex;
    }
    if (delta.geopoliticalRiskScore !== undefined) {
      // Clamp to 0–1
      updateData.geopoliticalRiskScore = Math.min(1.0, current.geopoliticalRiskScore + delta.geopoliticalRiskScore);
    }
    // Absolute overwrites for rates
    if (delta.usdInrRate !== undefined) updateData.usdInrRate = delta.usdInrRate;
    if (delta.eurUsdRate !== undefined) updateData.eurUsdRate = delta.eurUsdRate;
    if (delta.inflationRate !== undefined) updateData.inflationRate = delta.inflationRate;
    if (delta.baseInterestRate !== undefined) updateData.baseInterestRate = delta.baseInterestRate;
    if (delta.gdpGrowthRate !== undefined) updateData.gdpGrowthRate = delta.gdpGrowthRate;

    return this.prisma.weMarketState.update({
      where: { companyId },
      data: updateData as any,
    });
  }

  async reset(companyId: string): Promise<WeMarketState> {
    return this.prisma.weMarketState.upsert({
      where: { companyId },
      create: { companyId },
      update: {
        energyCostIndex: 1.0,
        logisticsCostIndex: 1.0,
        supplyCostIndex: 1.0,
        consumerDemandIndex: 1.0,
        geopoliticalRiskScore: 0.0,
        inflationRate: 0.0,
        baseInterestRate: 0.0,
        usdInrRate: null,
        eurUsdRate: null,
        gdpGrowthRate: null,
        lastEventId: null,
        tickCount: 0,
        lastUpdatedAt: new Date(),
      },
    });
  }
}

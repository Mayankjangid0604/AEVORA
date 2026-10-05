import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesStage } from '@prisma/client';

export interface PipelineMetrics {
  totalOpportunities: number;
  byStage: Record<SalesStage, number>;
  totalEstimatedValue: number;
  weightedPipelineValue: number;
  averageConfidence: number;
  wonCount: number;
  lostCount: number;
  disqualifiedCount: number;
  staleOpportunities: number;
  forecastDisclaimer: string;
}

@Injectable()
export class SalesPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getPipelineMetrics(companyId: string): Promise<PipelineMetrics> {
    const opportunities = await this.prisma.opportunity.findMany({
      where: { companyId },
      select: {
        salesStage: true,
        estimatedValue: true,
        probability: true,
        confidence: true,
        lastActivityAt: true,
        updatedAt: true,
      },
    });

    const byStage: Record<string, number> = {};
    for (const stage of Object.values(SalesStage)) {
      byStage[stage] = 0;
    }

    let totalEstimatedValue = 0;
    let weightedPipelineValue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let disqualifiedCount = 0;
    let confidenceSum = 0;
    let staleCount = 0;
    const staleThreshold = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

    for (const opp of opportunities) {
      byStage[opp.salesStage] = (byStage[opp.salesStage] ?? 0) + 1;

      const val = opp.estimatedValue ?? 0;
      totalEstimatedValue += val;
      weightedPipelineValue += val * (opp.probability / 100);
      confidenceSum += opp.confidence;

      if (opp.salesStage === SalesStage.WON) wonCount++;
      if (opp.salesStage === SalesStage.LOST) lostCount++;
      if (opp.salesStage === SalesStage.DISQUALIFIED) disqualifiedCount++;

      const lastActivity = opp.lastActivityAt ?? opp.updatedAt;
      if (Date.now() - lastActivity.getTime() > staleThreshold) {
        staleCount++;
      }
    }

    return {
      totalOpportunities: opportunities.length,
      byStage: byStage as Record<SalesStage, number>,
      totalEstimatedValue,
      weightedPipelineValue: Math.round(weightedPipelineValue),
      averageConfidence: opportunities.length > 0
        ? Math.round(confidenceSum / opportunities.length)
        : 0,
      wonCount,
      lostCount,
      disqualifiedCount,
      staleOpportunities: staleCount,
      // Clearly labeled as forecast, not realized revenue
      forecastDisclaimer:
        'weightedPipelineValue is a FORECAST based on probability weighting. ' +
        'It is NOT realized revenue. Revenue is only recognized through the authoritative financial lifecycle.',
    };
  }

  async getStaleOpportunities(companyId: string, staleDays = 14) {
    const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    return this.prisma.opportunity.findMany({
      where: {
        companyId,
        salesStage: { notIn: [SalesStage.WON, SalesStage.LOST, SalesStage.DISQUALIFIED] },
        OR: [
          { lastActivityAt: { lt: threshold } },
          { lastActivityAt: null, updatedAt: { lt: threshold } },
        ],
      },
      include: { client: true, owner: { select: { id: true, name: true } } },
    });
  }

  async getSalesManagerRecommendations(companyId: string): Promise<{
    recommendations: string[];
    disclaimer: string;
    generatedAt: string;
  }> {
    const metrics = await this.getPipelineMetrics(companyId);
    const stale = await this.getStaleOpportunities(companyId);

    const recommendations: string[] = [];

    if (stale.length > 0) {
      recommendations.push(
        `${stale.length} opportunities have had no activity for >14 days — review for follow-up or closure.`,
      );
    }

    if (metrics.byStage[SalesStage.QUALIFICATION] > 5) {
      recommendations.push(
        `${metrics.byStage[SalesStage.QUALIFICATION]} opportunities are in QUALIFICATION stage — consider prioritizing qualification reviews.`,
      );
    }

    if (metrics.totalOpportunities === 0) {
      recommendations.push('No active opportunities found — consider prospecting or lead generation.');
    }

    if (metrics.weightedPipelineValue < 100000) {
      recommendations.push(
        'Weighted pipeline value is low — review conversion rates and top-of-funnel activity.',
      );
    }

    return {
      recommendations,
      disclaimer:
        'These recommendations are AI-generated observations based on pipeline data. ' +
        'They are NON-AUTHORITATIVE and require human review before any action. ' +
        'No recommendation here constitutes a business commitment.',
      generatedAt: new Date().toISOString(),
    };
  }
}

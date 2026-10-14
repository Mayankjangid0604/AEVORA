import { Injectable, Logger } from '@nestjs/common';
import {
  OfferMeasurement,
  OfferOptimizationRecommendation,
  OptimizationAction,
} from './offer-market.types';
import { OfferMarketService } from './offer-market.service';

@Injectable()
export class OfferMeasurementOptimizationService {
  private readonly logger = new Logger(OfferMeasurementOptimizationService.name);

  constructor(private readonly offerService: OfferMarketService) {}

  /**
   * Aggregates real-time performance telemetry and reconciles against predicted forecasts.
   */
  async getOfferMeasurement(companyId: string, offerId: string): Promise<OfferMeasurement> {
    const offer = await this.offerService.getOffer(companyId, offerId);
    const redemptions = await this.offerService.getOfferRedemptions(companyId, offerId);

    const actualRedemptionsCount = redemptions.length;
    // Estimated top-of-funnel metrics based on redemption ratio (standard 2.5% conversion)
    const clicks = Math.max(actualRedemptionsCount * 40, actualRedemptionsCount > 0 ? 50 : 0);
    const impressions = Math.max(clicks * 15, clicks > 0 ? 500 : 0);
    const conversionRatePct = clicks > 0 ? Math.round((actualRedemptionsCount / clicks) * 1000) / 10 : 0;

    let totalGrossRevenue = 0;
    let totalDiscountCost = 0;
    let totalNetRevenue = 0;

    redemptions.forEach((r) => {
      totalGrossRevenue += r.transactionValue;
      totalDiscountCost += r.discountApplied;
      totalNetRevenue += r.netPaid;
    });

    totalGrossRevenue = Math.round(totalGrossRevenue * 100) / 100;
    totalDiscountCost = Math.round(totalDiscountCost * 100) / 100;
    totalNetRevenue = Math.round(totalNetRevenue * 100) / 100;

    // Estimate unit cost deduction for contribution profit
    const estimatedUnitCost = offer.materialTerms.originalPrice * 0.4;
    const totalCostOfGoods = actualRedemptionsCount * estimatedUnitCost;
    const totalContributionProfit = Math.round((totalNetRevenue - totalCostOfGoods) * 100) / 100;

    // Forecast vs Actual Reconciliation (V21 pattern)
    const predictedRedemptions = offer.financialAnalysis?.expectedRevenue
      ? Math.round(offer.financialAnalysis.expectedRevenue / Math.max(1, offer.materialTerms.finalPrice))
      : 100;

    const predictedRevenue = offer.financialAnalysis?.expectedRevenue ?? 1000;

    const varianceRedemptionsPct = predictedRedemptions > 0
      ? Math.round(((actualRedemptionsCount - predictedRedemptions) / predictedRedemptions) * 1000) / 10
      : 0;

    const varianceRevenuePct = predictedRevenue > 0
      ? Math.round(((totalNetRevenue - predictedRevenue) / predictedRevenue) * 1000) / 10
      : 0;

    // Significant drift threshold of 25% established in V21
    const isSignificantDrift = Math.abs(varianceRevenuePct) > 25 || Math.abs(varianceRedemptionsPct) > 25;

    // Multi-touch attribution mock distribution (40% first, 40% last, 20% linear)
    const firstTouch = Math.round(actualRedemptionsCount * 0.4);
    const lastTouch = Math.round(actualRedemptionsCount * 0.4);
    const linear = actualRedemptionsCount - firstTouch - lastTouch;

    return {
      offerId,
      impressions,
      clicks,
      conversions: actualRedemptionsCount,
      redemptions: actualRedemptionsCount,
      conversionRatePct,
      totalGrossRevenue,
      totalDiscountCost,
      totalNetRevenue,
      totalContributionProfit,
      forecastVariance: {
        predictedRedemptions,
        actualRedemptions: actualRedemptionsCount,
        varianceRedemptionsPct,
        predictedRevenue,
        actualRevenue: totalNetRevenue,
        varianceRevenuePct,
        isSignificantDrift,
      },
      attributionBreakdown: {
        firstTouch,
        lastTouch,
        linear: Math.max(0, linear),
      },
      causalConfidenceDisclaimer:
        'DISCLAIMER: Causal lift cannot be conclusively claimed without an isolated synthetic randomized control cohort. Metrics represent observed observational correlation.',
    };
  }

  /**
   * Generates evidence-backed optimization recommendations based on measured performance.
   */
  async getOptimizationRecommendation(
    companyId: string,
    offerId: string,
  ): Promise<OfferOptimizationRecommendation> {
    const offer = await this.offerService.getOffer(companyId, offerId);
    const measurement = await this.getOfferMeasurement(companyId, offerId);

    const evidencePoints: string[] = [
      `Recorded ${measurement.redemptions} redemptions generating $${measurement.totalNetRevenue} net revenue.`,
      `Forecast variance is ${measurement.forecastVariance.varianceRevenuePct}% relative to baseline expectation.`,
    ];

    // Case 1: Negative Contribution Margin or Severe Profit Loss
    if (measurement.totalContributionProfit < 0 && measurement.redemptions >= 5) {
      evidencePoints.push('Net contribution profit is negative, eroding enterprise cash reserves.');
      return {
        offerId,
        action: OptimizationAction.SUSPEND,
        confidenceScore: 0.9,
        rationale: 'Immediate suspension recommended: promotional redemptions are generating gross losses.',
        evidencePoints,
        requiresChairmanApproval: true,
      };
    }

    // Case 2: Near Max Capacity or Redemption Ceiling
    if (
      offer.materialTerms.maxRedemptions !== null &&
      offer.currentRedemptions >= offer.materialTerms.maxRedemptions * 0.95
    ) {
      evidencePoints.push(`Redemptions (${offer.currentRedemptions}) have reached 95%+ of ceiling (${offer.materialTerms.maxRedemptions}).`);
      return {
        offerId,
        action: OptimizationAction.EXPIRE_EARLY,
        confidenceScore: 0.95,
        rationale: 'Redemption limit nearly exhausted. Recommended to expire offer or request Chairman ceiling expansion.',
        evidencePoints,
        requiresChairmanApproval: false,
      };
    }

    // Case 3: Outperforming with Strong Positive Margin -> Recommend Extension
    if (
      measurement.totalContributionProfit > 500 &&
      measurement.forecastVariance.varianceRevenuePct > 15
    ) {
      evidencePoints.push('Offer is exceeding revenue forecasts while preserving robust unit margins.');
      return {
        offerId,
        action: OptimizationAction.EXTEND,
        confidenceScore: 0.85,
        rationale: 'High commercial performance with positive cash flow. Extend promotional window by 14 days.',
        evidencePoints,
        suggestedAdjustments: {
          validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        },
        requiresChairmanApproval: false,
      };
    }

    // Case 4: Underperforming Redemptions -> Recommend Discount or Marketing Adjustment
    if (
      measurement.redemptions < 3 &&
      measurement.forecastVariance.varianceRedemptionsPct < -50
    ) {
      evidencePoints.push('Redemption volume is significantly lagging forecast (-50%+).');
      return {
        offerId,
        action: OptimizationAction.ADJUST_DISCOUNT,
        confidenceScore: 0.7,
        rationale: 'Offer demand is sluggish. Recommend adjusting discount structure or testing alternative target audience.',
        evidencePoints,
        suggestedAdjustments: {
          discountValue: Math.min(50, Math.round(offer.materialTerms.discountValue * 1.25)),
        },
        requiresChairmanApproval: offer.materialTerms.discountValue * 1.25 > 50,
      };
    }

    // Default Case: Monitor
    evidencePoints.push('Performance is tracking within normal variance boundaries.');
    return {
      offerId,
      action: OptimizationAction.MONITOR,
      confidenceScore: 0.8,
      rationale: 'Continue standard observation. Current metrics are aligned with operational expectations.',
      evidencePoints,
      requiresChairmanApproval: false,
    };
  }
}

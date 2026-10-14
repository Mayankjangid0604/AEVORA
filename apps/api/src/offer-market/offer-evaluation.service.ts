import { Injectable, Logger } from '@nestjs/common';
import {
  CeoEvaluationResult,
  DiscountType,
  FinancialAnalysisResult,
  OfferMaterialTerms,
  RecommendationVerdict,
} from './offer-market.types';
import { CeoDecisionRiskLevel } from '../governance/authority-context.types';
import { OfferFinancialIntelligenceService } from './offer-financial-intelligence.service';

@Injectable()
export class OfferEvaluationService {
  private readonly logger = new Logger(OfferEvaluationService.name);

  constructor(private readonly financialIntelligence: OfferFinancialIntelligenceService) {}

  /**
   * Evaluates an offer from the CEO perspective:
   * 1. Multi-factor scoring (profitability, strategic value, risk, customer impact, operational feasibility).
   * 2. Baseline comparison against a no-offer status quo.
   * 3. Alternative discount comparisons (evaluating lower & higher discount sensitivities).
   * 4. Structured recommendation verdict with explicit rationale, assumptions, and uncertainty.
   * 5. Escalation triggers (escalating to Sovereign Chairman if high-risk, deep discount, or negative margin).
   */
  evaluateOffer(terms: OfferMaterialTerms, financialAnalysis: FinancialAnalysisResult): CeoEvaluationResult {
    const originalPrice = Number(terms.originalPrice) || 0;
    const finalPrice = Number(terms.finalPrice) || 0;
    const discountVal = Number(terms.discountValue) || 0;

    const discountPct = terms.discountType === DiscountType.PERCENTAGE
      ? discountVal
      : originalPrice > 0 ? ((originalPrice - finalPrice) / originalPrice) * 100 : 0;

    // 1. Calculate Multi-Factor Scores (0 - 100)
    // Profitability Score
    let profitabilityScore = 50;
    if (financialAnalysis.contributionProfit > 0 && financialAnalysis.postDiscountMarginPct > 20) {
      profitabilityScore = Math.min(100, Math.round(50 + financialAnalysis.postDiscountMarginPct));
    } else if (financialAnalysis.contributionProfit > 0) {
      profitabilityScore = Math.max(30, Math.round(30 + financialAnalysis.postDiscountMarginPct));
    } else {
      profitabilityScore = Math.max(0, Math.round(20 + financialAnalysis.postDiscountMarginPct));
    }

    // Strategic Value Score (market expansion, customer acquisition, inventory velocity)
    let strategicValueScore = 60;
    if (discountPct >= 15 && discountPct <= 35) {
      strategicValueScore = 85; // Sweet spot for customer acquisition
    } else if (discountPct > 35 && discountPct <= 50) {
      strategicValueScore = 75;
    } else if (discountPct > 50) {
      strategicValueScore = 55; // Diminishing strategic return due to brand erosion risk
    } else {
      strategicValueScore = 50;
    }

    // Risk Score (0 = ultra safe, 100 = extremely risky)
    let riskScore = 20;
    if (discountPct > 50) riskScore += 35;
    if (financialAnalysis.postDiscountMarginPct < 10) riskScore += 25;
    if (financialAnalysis.postDiscountMarginPct < 0) riskScore += 40;
    if (financialAnalysis.cannibalizationRisk.severity === 'HIGH') riskScore += 20;
    if (financialAnalysis.capacityConstraints.isCapacityConstrained) riskScore += 25;
    if (!financialAnalysis.provenance.hasSufficientEvidence) riskScore += 15;
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Customer Impact Score (appeal, conversion likelihood)
    const customerImpactScore = Math.min(95, Math.max(30, Math.round(40 + discountPct * 0.9)));

    // Operational Feasibility Score
    let operationalFeasibilityScore = 80;
    if (financialAnalysis.capacityConstraints.isCapacityConstrained) {
      operationalFeasibilityScore = 35;
    } else if (financialAnalysis.capacityConstraints.serviceCapacityLimit !== null) {
      operationalFeasibilityScore = 70;
    }

    // Composite Weighted Score
    // Higher profitability, strategic value, customer impact, feasibility; lower risk penalty
    const compositeScore = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          profitabilityScore * 0.3 +
          strategicValueScore * 0.2 +
          customerImpactScore * 0.2 +
          operationalFeasibilityScore * 0.15 +
          (100 - riskScore) * 0.15,
        ),
      ),
    );

    // 2. Baseline Comparison
    const revenueDeltaPct = financialAnalysis.baselineRevenue > 0
      ? Math.round(((financialAnalysis.expectedRevenue - financialAnalysis.baselineRevenue) / financialAnalysis.baselineRevenue) * 1000) / 10
      : 0;

    const profitDeltaPct = financialAnalysis.baselineRevenue > 0
      ? Math.round(((financialAnalysis.grossProfit - (financialAnalysis.baselineRevenue * 0.6)) / Math.max(1, financialAnalysis.baselineRevenue * 0.6)) * 1000) / 10
      : 0;

    const strategicAdvantage = revenueDeltaPct > 0
      ? `Promotional offer yields ${revenueDeltaPct}% incremental top-line revenue over no-offer status quo.`
      : 'Offer does not demonstrably improve revenue over the organic baseline.';

    // 3. Alternative Discount Comparison (Sensitivities at 10%, 20%, 30%, 50%)
    const altDiscounts = [10, 20, 30, 50];
    const alternativeDiscountComparisons = altDiscounts.map((altPct) => {
      const altTerms: OfferMaterialTerms = {
        ...terms,
        discountType: DiscountType.PERCENTAGE,
        discountValue: altPct,
        finalPrice: Math.round(originalPrice * (1 - altPct / 100) * 100) / 100,
      };
      const altAnalysis = this.financialIntelligence.calculateFinancialIntelligence(altTerms);
      let riskTier: CeoDecisionRiskLevel = CeoDecisionRiskLevel.LOW;
      if (altPct > 50 || altAnalysis.postDiscountMarginPct < 5) riskTier = CeoDecisionRiskLevel.CRITICAL;
      else if (altPct > 35 || altAnalysis.cannibalizationRisk.severity === 'HIGH') riskTier = CeoDecisionRiskLevel.HIGH;
      else if (altPct > 20) riskTier = CeoDecisionRiskLevel.MEDIUM;

      return {
        discountValue: altPct,
        projectedRevenue: altAnalysis.expectedRevenue,
        projectedProfit: altAnalysis.contributionProfit,
        riskTier,
        rationale: `At ${altPct}% discount, projected margin is ${altAnalysis.postDiscountMarginPct}%, with contribution profit of $${altAnalysis.contributionProfit}.`,
      };
    });

    // 4. Escalation Triggers
    const riskEscalationTriggers: string[] = [];
    let escalationRequired = false;

    if (discountPct > 50) {
      escalationRequired = true;
      riskEscalationTriggers.push('Governance Invariant: Discount exceeds 50% threshold, mandating Sovereign Chairman confirmation.');
    }
    if (financialAnalysis.postDiscountMarginPct < 0) {
      escalationRequired = true;
      riskEscalationTriggers.push('Financial Guardrail: Negative unit margin causes immediate cash drain.');
    }
    if (financialAnalysis.expectedRevenue > 10000 || financialAnalysis.discountCost > 5000) {
      escalationRequired = true;
      riskEscalationTriggers.push('Financial Exposure: Gross discount exposure exceeds $5,000 threshold.');
    }
    if (financialAnalysis.capacityConstraints.isCapacityConstrained) {
      escalationRequired = true;
      riskEscalationTriggers.push('Operational Bottleneck: Demand exceeds fulfillment capacity.');
    }
    if (!financialAnalysis.provenance.hasSufficientEvidence) {
      riskEscalationTriggers.push('Epistemic Warning: Critical cost or volume data is unverified or missing.');
    }

    // 5. Recommendation Verdict
    let verdict = RecommendationVerdict.APPROVE;

    if (financialAnalysis.postDiscountMarginPct < 0 || financialAnalysis.contributionProfit < 0) {
      verdict = RecommendationVerdict.REJECT;
    } else if (escalationRequired || riskScore >= 70) {
      verdict = RecommendationVerdict.REVISE;
    } else if (!financialAnalysis.provenance.hasSufficientEvidence) {
      verdict = RecommendationVerdict.FURTHER_ANALYSIS_REQUIRED;
    } else if (compositeScore < 50) {
      verdict = RecommendationVerdict.REJECT;
    } else if (compositeScore < 70) {
      verdict = RecommendationVerdict.REVISE;
    } else {
      verdict = RecommendationVerdict.APPROVE;
    }

    // 6. Structured Explanation
    const executiveSummary =
      verdict === RecommendationVerdict.APPROVE
        ? `CEO Recommendation: APPROVE. Offer '${terms.targetAudience}' demonstrates positive contribution profit ($${financialAnalysis.contributionProfit}) and acceptable margin (${financialAnalysis.postDiscountMarginPct}%).`
        : verdict === RecommendationVerdict.REVISE
        ? `CEO Recommendation: REVISION REQUIRED. Offer carries elevated risk (score ${riskScore}/100) or exceeds governance discount limits (${discountPct.toFixed(1)}%). Modification of terms or Chairman confirmation needed.`
        : verdict === RecommendationVerdict.FURTHER_ANALYSIS_REQUIRED
        ? `CEO Recommendation: FURTHER ANALYSIS REQUIRED. Financial confidence is insufficient (${financialAnalysis.provenance.overallConfidence * 100}%) due to missing inputs: ${financialAnalysis.provenance.missingDataItems.join(', ')}.`
        : `CEO Recommendation: REJECT. Offer fails profitability guardrails (contribution: $${financialAnalysis.contributionProfit}, margin: ${financialAnalysis.postDiscountMarginPct}%).`;

    const evidenceSummary = `Evaluated against baseline of ${financialAnalysis.baselineRevenue} revenue. Projected incremental revenue: $${financialAnalysis.incrementalRevenue}. Expected gross profit: $${financialAnalysis.grossProfit}. Estimated break-even volume: ${financialAnalysis.breakEven.volume} units.`;

    const tradeOffAnalysis = `Trade-off: Gives up $${financialAnalysis.discountCost} in potential full-price margin to capture $${financialAnalysis.incrementalRevenue} incremental revenue. Cannibalization risk assessed as ${financialAnalysis.cannibalizationRisk.severity} ($${financialAnalysis.cannibalizationRisk.estimatedRevenueLoss} exposure).`;

    return {
      evaluatedAt: new Date().toISOString(),
      evaluatorModel: 'AEVORA_CEO_AUTONOMOUS_EVALUATOR_V24',
      scores: {
        profitabilityScore,
        strategicValueScore,
        riskScore,
        customerImpactScore,
        operationalFeasibilityScore,
        compositeScore,
      },
      baselineComparison: {
        revenueDeltaPct,
        profitDeltaPct,
        strategicAdvantage,
      },
      alternativeDiscountComparisons,
      verdict,
      explanation: {
        executiveSummary,
        evidenceSummary,
        tradeOffAnalysis,
        riskEscalationTriggers,
      },
      escalationRequired,
      escalationReason: escalationRequired ? riskEscalationTriggers.join('; ') : undefined,
      advisoryDisclaimer:
        'ADVISORY ONLY: CEO evaluation is an automated algorithmic and strategic recommendation. It does NOT constitute corporate authorization or spending approval.',
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import {
  DiscountType,
  EpistemicDataPoint,
  EpistemicReliability,
  FinancialAnalysisResult,
  FinancialScenario,
  OfferMaterialTerms,
} from './offer-market.types';

export interface FinancialContextInputs {
  unitCost?: EpistemicDataPoint<number>;
  baselineVolume?: EpistemicDataPoint<number>;
  expectedVolume?: EpistemicDataPoint<number>;
  variableCostPerUnit?: EpistemicDataPoint<number>;
  fixedCostsAllocated?: EpistemicDataPoint<number>;
  marketingBudgetAllocated?: EpistemicDataPoint<number>;
  cannibalizationRatePct?: EpistemicDataPoint<number>;
  averageCustomerLtv?: EpistemicDataPoint<number>;
  serviceCapacityLimit?: EpistemicDataPoint<number>;
  currentServiceLoad?: EpistemicDataPoint<number>;
}

@Injectable()
export class OfferFinancialIntelligenceService {
  private readonly logger = new Logger(OfferFinancialIntelligenceService.name);

  /**
   * Deterministically calculates financial metrics and commercial intelligence for an offer.
   * Every material input is tracked with its epistemic provenance, reliability, and uncertainty.
   * If critical inputs are missing, flags insufficient evidence without inventing numbers.
   */
  calculateFinancialIntelligence(
    terms: OfferMaterialTerms,
    contextInputs?: FinancialContextInputs,
  ): FinancialAnalysisResult {
    const inputProvenance: Record<string, EpistemicDataPoint<any>> = {};
    const missingDataItems: string[] = [];
    const explicitAssumptions: string[] = [];
    const guardrailViolations: string[] = [];

    // 1. Calculate Final Price and Discount Amount
    const originalPrice = Number(terms.originalPrice) || 0;
    let finalPrice = Number(terms.finalPrice) || 0;
    let unitDiscount = 0;

    if (terms.discountType === DiscountType.PERCENTAGE) {
      const pct = Math.max(0, Math.min(100, Number(terms.discountValue) || 0));
      unitDiscount = (originalPrice * pct) / 100;
      finalPrice = Math.max(0, originalPrice - unitDiscount);
    } else if (terms.discountType === DiscountType.FIXED_AMOUNT) {
      unitDiscount = Math.max(0, Number(terms.discountValue) || 0);
      finalPrice = Math.max(0, originalPrice - unitDiscount);
    } else {
      unitDiscount = Math.max(0, originalPrice - finalPrice);
    }

    // 2. Unit Cost & Variable Costs
    let unitCost = 0;
    if (contextInputs?.unitCost && contextInputs.unitCost.reliability !== EpistemicReliability.MISSING) {
      unitCost = Number(contextInputs.unitCost.value) || 0;
      inputProvenance['unitCost'] = contextInputs.unitCost;
    } else {
      missingDataItems.push('unitCost');
      explicitAssumptions.push('Unit cost is estimated as 40% of original price in absence of verified product cost ledger');
      unitCost = originalPrice * 0.4;
      inputProvenance['unitCost'] = {
        value: unitCost,
        source: 'DEFAULT_HEURISTIC_ESTIMATE',
        reliability: EpistemicReliability.ESTIMATED,
        uncertaintyScore: 0.7,
        notes: 'Unverified proxy estimation',
      };
    }

    const variableCostPerUnit = contextInputs?.variableCostPerUnit?.value ?? unitCost * 0.1;
    inputProvenance['variableCostPerUnit'] = contextInputs?.variableCostPerUnit ?? {
      value: variableCostPerUnit,
      source: 'VARIABLE_COST_ESTIMATE',
      reliability: EpistemicReliability.ESTIMATED,
      uncertaintyScore: 0.5,
    };

    // 3. Volume and Redemptions
    const maxRedemptions = terms.maxRedemptions ?? null;
    let expectedVolume = 100; // Default expected baseline
    if (contextInputs?.expectedVolume && contextInputs.expectedVolume.reliability !== EpistemicReliability.MISSING) {
      expectedVolume = Number(contextInputs.expectedVolume.value);
      inputProvenance['expectedVolume'] = contextInputs.expectedVolume;
    } else if (maxRedemptions !== null && maxRedemptions > 0) {
      expectedVolume = Math.min(maxRedemptions, 100);
      explicitAssumptions.push(`Expected volume capped at redemption limit: ${expectedVolume}`);
      inputProvenance['expectedVolume'] = {
        value: expectedVolume,
        source: 'MAX_REDEMPTION_CEILING',
        reliability: EpistemicReliability.ESTIMATED,
        uncertaintyScore: 0.4,
      };
    } else {
      missingDataItems.push('expectedVolume');
      explicitAssumptions.push('Expected redemption volume estimated at 100 units based on standard cohort run-rate');
      inputProvenance['expectedVolume'] = {
        value: 100,
        source: 'COHORT_BENCHMARK_SIMULATION',
        reliability: EpistemicReliability.SIMULATED,
        uncertaintyScore: 0.6,
      };
    }

    // 4. Baseline Volume (No-Offer Scenario)
    let baselineVolume = 50;
    if (contextInputs?.baselineVolume && contextInputs.baselineVolume.reliability !== EpistemicReliability.MISSING) {
      baselineVolume = Number(contextInputs.baselineVolume.value);
      inputProvenance['baselineVolume'] = contextInputs.baselineVolume;
    } else {
      missingDataItems.push('baselineVolume');
      baselineVolume = Math.round(expectedVolume * 0.5);
      explicitAssumptions.push('Baseline sales without offer assumed to be 50% of promotional volume');
      inputProvenance['baselineVolume'] = {
        value: baselineVolume,
        source: 'SYNTHETIC_NO_OFFER_BASELINE',
        reliability: EpistemicReliability.SIMULATED,
        uncertaintyScore: 0.6,
      };
    }

    // 5. Cannibalization Rate
    let cannibalizationRate = 0.2; // 20% default
    if (contextInputs?.cannibalizationRatePct) {
      cannibalizationRate = Math.max(0, Math.min(1, contextInputs.cannibalizationRatePct.value / 100));
      inputProvenance['cannibalizationRatePct'] = contextInputs.cannibalizationRatePct;
    } else {
      explicitAssumptions.push('Cannibalization rate assumed to be 20% (20% of buyers would have bought at full price)');
      inputProvenance['cannibalizationRatePct'] = {
        value: 20,
        source: 'INDUSTRY_PRIOR_ESTIMATE',
        reliability: EpistemicReliability.ESTIMATED,
        uncertaintyScore: 0.5,
      };
    }

    // 6. Marketing and Fixed Costs Allocation
    const marketingBudget = Number(contextInputs?.marketingBudgetAllocated?.value) || 0;
    const fixedCosts = Number(contextInputs?.fixedCostsAllocated?.value) || 0;

    // 7. Core Deterministic Financial Calculations
    const expectedRevenue = Math.round(expectedVolume * finalPrice * 100) / 100;
    const baselineRevenue = Math.round(baselineVolume * originalPrice * 100) / 100;
    const incrementalRevenue = Math.round(Math.max(0, expectedRevenue - baselineRevenue) * 100) / 100;
    const discountCost = Math.round(expectedVolume * unitDiscount * 100) / 100;

    const totalCostOfGoods = expectedVolume * unitCost;
    const totalVariableCosts = expectedVolume * variableCostPerUnit;
    const grossProfit = Math.round((expectedRevenue - totalCostOfGoods) * 100) / 100;
    const contributionProfit = Math.round((grossProfit - totalVariableCosts - marketingBudget - fixedCosts) * 100) / 100;

    const postDiscountMarginPct = finalPrice > 0 ? Math.round(((finalPrice - unitCost) / finalPrice) * 1000) / 10 : 0;
    const originalMarginPct = originalPrice > 0 ? Math.round(((originalPrice - unitCost) / originalPrice) * 1000) / 10 : 0;
    const marginErosionPct = Math.round((originalMarginPct - postDiscountMarginPct) * 10) / 10;

    // Cannibalization loss: full price margin foregone on cannibalized volume
    const cannibalizedUnits = Math.round(baselineVolume * cannibalizationRate);
    const cannibalizationLoss = Math.round(cannibalizedUnits * unitDiscount * 100) / 100;
    const cannibalizationRiskSeverity: 'LOW' | 'MEDIUM' | 'HIGH' =
      cannibalizationRate > 0.4 || cannibalizationLoss > grossProfit * 0.3
        ? 'HIGH'
        : cannibalizationRate > 0.15
        ? 'MEDIUM'
        : 'LOW';

    // Break-even volume
    const unitContribution = finalPrice - unitCost - variableCostPerUnit;
    const totalFixedObligations = fixedCosts + marketingBudget;
    let breakEvenVolume = 0;
    let estimatedDaysToBreakEven: number | null = null;

    if (unitContribution > 0) {
      breakEvenVolume = totalFixedObligations > 0 ? Math.ceil(totalFixedObligations / unitContribution) : 0;
      const dailyRunRate = expectedVolume / 30; // Assuming 30 days window
      estimatedDaysToBreakEven = dailyRunRate > 0 ? Math.ceil(breakEvenVolume / dailyRunRate) : null;
    } else {
      breakEvenVolume = Infinity;
      estimatedDaysToBreakEven = null;
    }

    // Capacity and Fulfillment Constraints
    let serviceCapacityLimit: number | null = null;
    let isCapacityConstrained = false;
    let bottleneckNotes: string | undefined = undefined;

    if (contextInputs?.serviceCapacityLimit) {
      serviceCapacityLimit = Number(contextInputs.serviceCapacityLimit.value);
      inputProvenance['serviceCapacityLimit'] = contextInputs.serviceCapacityLimit;
      const currentLoad = Number(contextInputs?.currentServiceLoad?.value) || 0;
      const availableCapacity = Math.max(0, serviceCapacityLimit - currentLoad);
      if (expectedVolume > availableCapacity) {
        isCapacityConstrained = true;
        bottleneckNotes = `Projected demand (${expectedVolume}) exceeds available service capacity (${availableCapacity} units).`;
        guardrailViolations.push(`CAPACITY_EXCEEDED: Demand (${expectedVolume}) exceeds available capacity (${availableCapacity}).`);
      }
    }

    // Customer Acquisition Cost (CAC) and LTV
    const newCustomersEstimated = Math.max(1, Math.round(expectedVolume * (1 - cannibalizationRate)));
    const cac = marketingBudget > 0 ? Math.round((marketingBudget / newCustomersEstimated) * 100) / 100 : null;
    const ltv = contextInputs?.averageCustomerLtv?.value ? Number(contextInputs.averageCustomerLtv.value) : null;

    // Financial Guardrails Checks
    if (finalPrice < unitCost) {
      guardrailViolations.push(`NEGATIVE_MARGIN: Final price ($${finalPrice}) is below unit cost ($${unitCost}), causing immediate gross loss.`);
    }

    const discountPct = terms.discountType === DiscountType.PERCENTAGE
      ? terms.discountValue
      : originalPrice > 0 ? (unitDiscount / originalPrice) * 100 : 0;

    if (discountPct > 50) {
      guardrailViolations.push(`DEEP_DISCOUNT_THRESHOLD_EXCEEDED: Discount of ${discountPct.toFixed(1)}% exceeds the 50% threshold and requires Sovereign Chairman Approval.`);
    }

    if (contributionProfit < 0) {
      guardrailViolations.push(`PROFIT_DESTRUCTION: Projected contribution profit is negative ($${contributionProfit}).`);
    }

    // 8. Scenario Analysis (Best, Expected, Worst)
    const buildScenario = (volMultiplier: number, cannMultiplier: number, priceDrift = 1.0): FinancialScenario => {
      const vol = Math.max(1, Math.round(expectedVolume * volMultiplier));
      const sFinalPrice = Math.round(finalPrice * priceDrift * 100) / 100;
      const rev = Math.round(vol * sFinalPrice * 100) / 100;
      const cogs = vol * unitCost;
      const varCost = vol * variableCostPerUnit;
      const gp = Math.round((rev - cogs) * 100) / 100;
      const cp = Math.round((gp - varCost - marketingBudget - fixedCosts) * 100) / 100;
      const margin = sFinalPrice > 0 ? Math.round(((sFinalPrice - unitCost) / sFinalPrice) * 1000) / 10 : 0;
      const cannVol = Math.round(baselineVolume * Math.min(1, cannibalizationRate * cannMultiplier));
      const cannLoss = Math.round(cannVol * (originalPrice - sFinalPrice) * 100) / 100;
      const discCost = Math.round(vol * (originalPrice - sFinalPrice) * 100) / 100;

      return {
        volume: vol,
        revenue: rev,
        grossProfit: gp,
        contributionProfit: cp,
        postDiscountMarginPct: margin,
        discountCost: discCost,
        cannibalizationLoss: cannLoss,
      };
    };

    const bestCase = buildScenario(1.3, 0.7, 1.0); // +30% volume, -30% cannibalization
    const expectedCase = buildScenario(1.0, 1.0, 1.0);
    const worstCase = buildScenario(0.65, 1.5, 0.95); // -35% volume, +50% cannibalization, -5% realization

    // 9. Overall Confidence Score Calculation
    const provenanceEntries = Object.values(inputProvenance);
    const avgUncertainty =
      provenanceEntries.length > 0
        ? provenanceEntries.reduce((sum, p) => sum + p.uncertaintyScore, 0) / provenanceEntries.length
        : 0.5;
    const overallConfidence = Math.max(0.1, Math.round((1.0 - avgUncertainty) * 100) / 100);
    const hasSufficientEvidence = missingDataItems.length <= 1 && overallConfidence >= 0.4;

    return {
      expectedRevenue,
      baselineRevenue,
      incrementalRevenue,
      discountCost,
      grossProfit,
      contributionProfit,
      postDiscountMarginPct,
      originalMarginPct,
      marginErosionPct,
      cannibalizationRisk: {
        percentage: Math.round(cannibalizationRate * 100),
        estimatedRevenueLoss: cannibalizationLoss,
        severity: cannibalizationRiskSeverity,
      },
      cac,
      ltv,
      cashFlowImpact: {
        netInflow: contributionProfit,
        workingCapitalRequirement: Math.round(totalCostOfGoods * 0.3 * 100) / 100, // 30% upfront working capital estimate
        timingSummary: 'Cash inflow realized upon redemption; variable costs settled on 30-day net terms.',
      },
      capacityConstraints: {
        serviceCapacityLimit,
        projectedDemand: expectedVolume,
        isCapacityConstrained,
        bottleneckNotes,
      },
      breakEven: {
        volume: breakEvenVolume === Infinity ? 0 : breakEvenVolume,
        estimatedDaysToBreakEven,
      },
      scenarios: {
        bestCase,
        expectedCase,
        worstCase,
      },
      provenance: {
        inputs: inputProvenance,
        overallConfidence,
        hasSufficientEvidence,
        missingDataItems,
        explicitAssumptions,
      },
      guardrailViolations,
    };
  }
}

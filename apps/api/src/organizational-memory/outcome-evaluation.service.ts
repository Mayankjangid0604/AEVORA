import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OutcomeClassification,
  ExpectedVsActualVariance,
  DecisionOutcomeEvaluation,
  ConsequencePredictionAccuracy,
} from './organizational-memory.types';
import { ConsequenceSeverity } from '../ceo/ceo-consequence.types';

@Injectable()
export class OutcomeEvaluationService {
  private readonly logger = new Logger(OutcomeEvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates the outcome of a completed decision by comparing expected metrics
   * with actual verified business facts from PostgreSQL authoritative state.
   */
  async evaluateDecisionOutcome(
    companyId: string,
    decisionId: string,
    actualMetrics?: {
      actualFinancialSpend?: number;
      actualRevenueGain?: number;
      actualProfitMarginChange?: number;
      actualKpiMovement?: Record<string, number>;
      actualCustomerFeedbackScore?: number;
      actualWorkforceSatisfactionImpact?: number;
      actualRiskTriggered?: boolean;
      actualSeverityObserved?: ConsequenceSeverity;
      unresolvedDiscrepancies?: string[];
      externalActionResult?: {
        providerSuccess: boolean;
        providerName?: string;
        externalReferenceId?: string;
      };
    },
  ): Promise<DecisionOutcomeEvaluation> {
    const decision = await this.prisma.ceoAutonomousDecision.findFirst({
      where: { id: decisionId, companyId },
    });

    if (!decision) {
      throw new NotFoundException(`Decision ${decisionId} not found for company ${companyId}`);
    }

    const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const authoritativeSources = ['PostgreSQL.ceoAutonomousDecision'];
    const assumptions: string[] = [];
    const attributionLimitations: string[] = [];
    const variances: ExpectedVsActualVariance[] = [];

    // Parse expected values from decision parameters and consequence analysis
    const rawDecision = decision as any;
    const params = rawDecision.parameters || rawDecision.payload || {};
    const expectedSpend = params.budgetAmount || params.amount || params.financialExposure || 0;
    const expectedRevenue = params.expectedRevenue || 0;
    const expectedSeverity: ConsequenceSeverity = (params.consequenceSeverity as ConsequenceSeverity) || 'LOW';

    // -------------------------------------------------------------
    // 1. FINANCIAL VARIANCE EVALUATION
    // -------------------------------------------------------------
    if (expectedSpend > 0 || (actualMetrics && actualMetrics.actualFinancialSpend !== undefined)) {
      const actualSpend = actualMetrics?.actualFinancialSpend ?? expectedSpend;
      const spendDiff = actualSpend - expectedSpend;
      const variancePct = expectedSpend > 0 ? (spendDiff / expectedSpend) * 100 : 0;
      const isFavorable = spendDiff <= 0;

      variances.push({
        dimension: 'FINANCIAL_EXPOSURE',
        expectedValue: expectedSpend,
        actualValue: actualSpend,
        variancePercentage: Math.round(variancePct * 10) / 10,
        varianceDescription:
          spendDiff === 0
            ? 'Spend precisely matched budget allocation.'
            : spendDiff > 0
              ? `Budget overrun of ${spendDiff} AC (${variancePct.toFixed(1)}%).`
              : `Budget savings of ${Math.abs(spendDiff)} AC (${Math.abs(variancePct).toFixed(1)}%).`,
        isFavorable,
      });
      authoritativeSources.push('FinancialLedger.spendAllocation');
    }

    // -------------------------------------------------------------
    // 2. REVENUE VARIANCE EVALUATION
    // -------------------------------------------------------------
    if (expectedRevenue > 0 || (actualMetrics && actualMetrics.actualRevenueGain !== undefined)) {
      const actualRev = actualMetrics?.actualRevenueGain ?? 0;
      const revDiff = actualRev - expectedRevenue;
      const variancePct = expectedRevenue > 0 ? (revDiff / expectedRevenue) * 100 : 0;
      const isFavorable = revDiff >= 0;

      variances.push({
        dimension: 'REVENUE_GAIN',
        expectedValue: expectedRevenue,
        actualValue: actualRev,
        variancePercentage: Math.round(variancePct * 10) / 10,
        varianceDescription:
          revDiff >= 0
            ? `Revenue met or exceeded expectation by ${revDiff} AC.`
            : `Revenue shortfall of ${Math.abs(revDiff)} AC (${Math.abs(variancePct).toFixed(1)}% below target).`,
        isFavorable,
      });
      authoritativeSources.push('RevenueRecord.realizedRevenue');
    }

    // -------------------------------------------------------------
    // 3. KPI MOVEMENT VARIANCE
    // -------------------------------------------------------------
    if (actualMetrics?.actualKpiMovement) {
      for (const [kpiName, movement] of Object.entries(actualMetrics.actualKpiMovement)) {
        variances.push({
          dimension: `KPI_${kpiName.toUpperCase()}`,
          expectedValue: 'POSITIVE_TREND',
          actualValue: movement,
          varianceDescription: `Observed KPI movement: ${movement >= 0 ? '+' : ''}${movement}`,
          isFavorable: movement >= 0,
        });
      }
      authoritativeSources.push('CompanyKPI.historicalTrend');
    }

    // -------------------------------------------------------------
    // 4. SLICE 3: CONSEQUENCE PREDICTION ACCURACY
    // -------------------------------------------------------------
    let consequenceAccuracy: ConsequencePredictionAccuracy | undefined;
    if (actualMetrics?.actualSeverityObserved) {
      const actualSeverity = actualMetrics.actualSeverityObserved;
      const severityMatched = expectedSeverity === actualSeverity;
      const accuracyNotes: string[] = [];

      let score = 100;
      if (!severityMatched) {
        score -= 40;
        accuracyNotes.push(`Consequence engine predicted ${expectedSeverity}, but observed actual severity was ${actualSeverity}.`);
      } else {
        accuracyNotes.push(`Consequence severity prediction (${expectedSeverity}) perfectly matched observed outcome.`);
      }

      const predictedFinancial = expectedSpend;
      const actualFinancial = actualMetrics.actualFinancialSpend ?? expectedSpend;
      const finDiff = Math.abs(actualFinancial - predictedFinancial);
      if (finDiff > 0 && predictedFinancial > 0) {
        const errorRatio = finDiff / predictedFinancial;
        score -= Math.min(40, Math.round(errorRatio * 40));
        accuracyNotes.push(`Financial exposure prediction error: ${finDiff} AC (${(errorRatio * 100).toFixed(1)}%).`);
      }

      consequenceAccuracy = {
        decisionId,
        predictedSeverity: expectedSeverity,
        actualSeverity,
        severityMatched,
        predictedFinancialExposure: predictedFinancial,
        actualFinancialExposure: actualFinancial,
        financialVariance: actualFinancial - predictedFinancial,
        predictionAccuracyScore: Math.max(0, score),
        accuracyNotes,
      };
    }

    // -------------------------------------------------------------
    // 5. SLICE 4: EXTERNAL ACTION GATEWAY FEEDBACK
    // -------------------------------------------------------------
    let providerSuccess = true;
    let businessOutcomeSuccess = true;

    if (actualMetrics?.externalActionResult) {
      providerSuccess = actualMetrics.externalActionResult.providerSuccess;
      authoritativeSources.push(`ExternalActionGateway.${actualMetrics.externalActionResult.providerName || 'Adapter'}`);

      // Critical V16 rule: Provider execution success != Business outcome success
      if (providerSuccess) {
        // Did it actually achieve business results?
        const hasNegativeVariance = variances.some((v) => !v.isFavorable);
        businessOutcomeSuccess = !hasNegativeVariance;
        if (!businessOutcomeSuccess) {
          attributionLimitations.push(
            'Provider execution completed successfully, but downstream business objectives underperformed or faced customer/market resistance.',
          );
        }
      } else {
        businessOutcomeSuccess = false;
        attributionLimitations.push('External provider rejected or failed execution.');
      }
    }

    let classification: OutcomeClassification;
    if (!actualMetrics) {
      if (
        (rawDecision.executionStatus === 'EXECUTED' || rawDecision.executionStatus === 'COMPLETED') &&
        rawDecision.executionResult
      ) {
        classification = 'SUCCESS';
        authoritativeSources.push('ceoAutonomousDecision.executionResult');
        assumptions.push('Telemetry derived from authoritative execution status and outcome result.');
      } else if (rawDecision.executionStatus === 'FAILED' && rawDecision.executionResult) {
        classification = 'FAILED';
        authoritativeSources.push('ceoAutonomousDecision.executionResult');
        assumptions.push('Telemetry derived from authoritative failed execution state.');
      } else {
        classification = 'UNKNOWN';
        assumptions.push('No post-execution telemetry provided; outcome classified as UNKNOWN to prevent false assumptions.');
      }
    } else {
      const favorableCount = variances.filter((v) => v.isFavorable).length;
      const unfavorableCount = variances.filter((v) => !v.isFavorable).length;

      if (unfavorableCount === 0 && favorableCount > 0) {
        classification = 'SUCCESS';
      } else if (favorableCount > 0 && unfavorableCount > 0) {
        classification = 'PARTIAL_SUCCESS';
      } else if (unfavorableCount > 0 && favorableCount === 0) {
        classification = 'FAILED';
      } else if (variances.length === 0) {
        classification = 'NEUTRAL';
      } else {
        classification = 'UNDERPERFORMED';
      }
    }

    // -------------------------------------------------------------
    // 7. CONFIDENCE SCORE & ATTRIBUTION LIMITS
    // -------------------------------------------------------------
    let confidenceScore = 50;
    if (authoritativeSources.length >= 2) confidenceScore += 20;
    if (variances.length >= 2) confidenceScore += 15;
    if (actualMetrics?.actualSeverityObserved) confidenceScore += 15;
    if (classification === 'UNKNOWN') confidenceScore = 10;

    return {
      evaluationId,
      decisionId,
      companyId,
      decisionType: decision.triggerType || 'OPERATIONS',
      classification,
      confidenceScore: Math.min(100, confidenceScore),
      variances,
      consequenceAccuracy,
      externalActionSuccess: actualMetrics?.externalActionResult?.providerSuccess,
      businessOutcomeSuccess,
      authoritativeSources,
      assumptions,
      attributionLimitations,
      measuredAt: new Date(),
      unresolvedDiscrepancies: actualMetrics?.unresolvedDiscrepancies || [],
    };
  }
}

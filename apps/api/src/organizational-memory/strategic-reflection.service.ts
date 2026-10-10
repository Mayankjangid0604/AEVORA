import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StrategicReflectionReport,
  StrategicAdjustmentRecommendation,
  ExpectedVsActualVariance,
  DecisionOutcomeEvaluation,
} from './organizational-memory.types';
import { OutcomeEvaluationService } from './outcome-evaluation.service';
import { LessonPatternExtractionService } from './lesson-pattern-extraction.service';
import { ExecutiveMemoryService } from './executive-memory.service';

@Injectable()
export class StrategicReflectionService {
  private readonly logger = new Logger(StrategicReflectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outcomeService: OutcomeEvaluationService,
    private readonly lessonPatternService: LessonPatternExtractionService,
    private readonly executiveMemory: ExecutiveMemoryService,
  ) {}

  /**
   * Conducts a structured CEO strategic reflection over a specified operating period.
   * Produces verifiable, auditable reflection reports that feed into downstream closed-loop replanning.
   */
  async performStrategicReflection(
    companyId: string,
    options?: {
      periodDays?: number;
      actorId?: string;
    },
  ): Promise<StrategicReflectionReport> {
    if (!companyId) throw new BadRequestException('companyId is required');

    const periodDays = options?.periodDays ?? 30;
    const periodStart = new Date(Date.now() - periodDays * 24 * 3600 * 1000);
    const periodEnd = new Date();
    const reflectionId = `refl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 1. GATHER COMPLETED DECISIONS IN PERIOD
    const decisions = await this.prisma.ceoAutonomousDecision.findMany({
      where: {
        companyId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 2. EVALUATE OUTCOMES FOR EACH COMPLETED DECISION
    const evaluations: DecisionOutcomeEvaluation[] = [];
    const aggregatedVariances: ExpectedVsActualVariance[] = [];
    const keySuccesses: string[] = [];
    const keyFailures: string[] = [];

    for (const dec of decisions) {
      try {
        const evalResult = await this.outcomeService.evaluateDecisionOutcome(companyId, dec.id);
        evaluations.push(evalResult);

        aggregatedVariances.push(...evalResult.variances);

        if (evalResult.classification === 'SUCCESS') {
          keySuccesses.push(`Decision ${dec.triggerType} (${dec.id}): met all execution milestones.`);
        } else if (evalResult.classification === 'FAILED' || evalResult.classification === 'UNDERPERFORMED') {
          keyFailures.push(`Decision ${dec.triggerType} (${dec.id}): underperformed with ${evalResult.variances.length} unfavorable variances.`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not evaluate decision ${dec.id}: ${err.message}`);
      }
    }

    // 3. EXTRACT LESSONS AND PATTERNS
    const extractedLessons = evaluations.map((e) =>
      this.lessonPatternService.extractLesson(e),
    );
    const recurringPatterns = this.lessonPatternService.detectPatterns(companyId, evaluations);

    // 4. IDENTIFY RECURRING RISKS & EMERGING OPPORTUNITIES
    const recurringRisks: string[] = recurringPatterns
      .filter((p) => p.category === 'RISK' || p.category === 'FAILURE')
      .map((p) => `${p.title}: ${p.description}`);

    const emergingOpportunities: string[] = recurringPatterns
      .filter((p) => p.category === 'SUCCESS')
      .map((p) => `Strategic leverage: ${p.title} (${p.supportingObservationsCount} validated instances)`);

    // 5. SYNTHESIZE STRATEGIC IMPLICATIONS
    const strategicImplications: string[] = [];
    if (keyFailures.length > keySuccesses.length && keyFailures.length > 0) {
      strategicImplications.push(
        'Executive execution pace is exceeding operational capacity; rate of variance indicates need for consolidation.',
      );
    } else if (keySuccesses.length > 0) {
      strategicImplications.push(
        'Operational core demonstrated stability across tested decision vectors; selective scaling is supported by memory evidence.',
      );
    }

    // 6. GENERATE STRATEGIC ADJUSTMENT RECOMMENDATIONS (REPLANNING HOOKS)
    const recommendedAdjustments: StrategicAdjustmentRecommendation[] = [];

    // Recurring failure or overrun pattern adjustment
    const hasIssuePattern = recurringPatterns.some((p) => p.category === 'RISK' || p.category === 'FAILURE');
    if (hasIssuePattern) {
      const issuePattern = recurringPatterns.find((p) => p.category === 'RISK' || p.category === 'FAILURE');
      recommendedAdjustments.push({
        adjustmentType: 'RESOURCE_REALLOCATION',
        targetEntity: 'OperationsBudget',
        currentSetting: 'Zero-buffer financial planning',
        recommendedSetting: '15% contingency reserve allocation',
        rationale: `Historical evaluations confirmed recurring pattern: ${issuePattern?.description}`,
        supportingLessons: extractedLessons.map((l) => l.id),
        requiresChairmanApproval: true, // Does NOT grant authority directly!
      });
    }

    // Process improvement adjustment for unfulfilled external conversions
    const hasConversionGap = extractedLessons.some((l) => l.likelyRootCause.includes('conversion gap'));
    if (hasConversionGap) {
      recommendedAdjustments.push({
        adjustmentType: 'PROCESS_IMPROVEMENT',
        targetEntity: 'MarketingOutreachPipeline',
        currentSetting: 'Immediate outbound delivery',
        recommendedSetting: 'Pre-flight audience verification and warm-up sequence',
        rationale: 'Slice 4 gateway execution succeeded technically, but business lead conversion lagged behind targets.',
        supportingLessons: extractedLessons.filter((l) => l.likelyRootCause.includes('conversion gap')).map((l) => l.id),
        requiresChairmanApproval: false,
      });
    }

    // 7. RECORD REFLECTION LESSONS & PATTERNS INTO CONTROLLED MEMORY
    const actorId = options?.actorId || 'system-ceo';
    for (const pattern of recurringPatterns.filter((p) => p.maturity === 'CONFIRMED')) {
      await this.executiveMemory.recordPattern(actorId, pattern);
    }

    // 8. ASSEMBLE COMPLETE REPORT
    const report: StrategicReflectionReport = {
      reflectionId,
      companyId,
      periodStart,
      periodEnd,
      keySuccesses,
      keyFailures,
      expectationVariances: aggregatedVariances,
      recurringPatterns,
      extractedLessons,
      recurringRisks,
      emergingOpportunities,
      strategicImplications,
      recommendedAdjustments,
      overallConfidence: evaluations.length > 0 ? 80 : 30,
      unresolvedUncertainties:
        evaluations.length === 0
          ? ['No completed decisions found within reflection operating window.']
          : [],
      reflectedAt: new Date(),
    };

    this.logger.log(
      `[Strategic Reflection] Completed reflection ${reflectionId} for company ${companyId}. Generated ${recommendedAdjustments.length} adjustment recommendations.`,
    );

    return report;
  }
}

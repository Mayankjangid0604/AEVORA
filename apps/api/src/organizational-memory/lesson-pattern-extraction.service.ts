import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionOutcomeEvaluation,
  StructuredLesson,
  DetectedPattern,
  MemoryMaturity,
} from './organizational-memory.types';

@Injectable()
export class LessonPatternExtractionService {
  private readonly logger = new Logger(LessonPatternExtractionService.name);

  /**
   * Generates a structured lesson from a completed decision outcome evaluation.
   */
  extractLesson(
    evaluation: DecisionOutcomeEvaluation,
    decisionContext?: { title?: string; proposedAction?: string; rationale?: string; domain?: string },
  ): StructuredLesson {
    const lessonId = `les_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const domain = decisionContext?.domain || evaluation.decisionType || 'GENERAL';
    const isSuccess = evaluation.classification === 'SUCCESS' || evaluation.classification === 'PARTIAL_SUCCESS';

    const varianceSummary =
      evaluation.variances.length > 0
        ? evaluation.variances.map((v) => `${v.dimension}: ${v.varianceDescription}`).join('; ')
        : 'No measurable variance recorded.';

    let likelyRootCause = 'Standard operational execution within modeled parameters.';
    if (evaluation.classification === 'FAILED') {
      likelyRootCause = 'Assumption mismatch: Execution underperformed expected operational and financial models.';
    } else if (evaluation.classification === 'UNDERPERFORMED') {
      likelyRootCause = 'Partial delivery friction or market response delay.';
    } else if (evaluation.externalActionSuccess === true && !evaluation.businessOutcomeSuccess) {
      likelyRootCause = 'Downstream conversion gap: External technical execution succeeded but business target did not convert.';
    }

    return {
      id: lessonId,
      companyId: evaluation.companyId,
      sourceDecisionId: evaluation.decisionId,
      observedSituation: `Decision ${evaluation.decisionId} (${evaluation.decisionType}) executed.`,
      actionTaken: decisionContext?.proposedAction || `Action under decision ${evaluation.decisionId}`,
      expectedResult: isSuccess ? 'Expected positive business outcome' : 'Expected operational stability',
      actualResult: `Outcome evaluated as ${evaluation.classification} (Confidence: ${evaluation.confidenceScore}%)`,
      varianceSummary,
      likelyRootCause,
      confidence: evaluation.confidenceScore,
      applicabilityDomain: domain,
      maturity: evaluation.confidenceScore >= 70 ? 'CONFIRMED' : 'PROVISIONAL',
      evidenceReferences: evaluation.authoritativeSources,
      createdAt: new Date(),
    };
  }

  /**
   * Detects recurring organizational patterns across multiple historical evaluations.
   * Enforces the V16 rule:
   * A single event may create an OBSERVATION/PROVISIONAL pattern, but CONFIRMED recurring
   * organizational patterns require multiple supporting observations (>= 2).
   */
  detectPatterns(
    companyId: string,
    historicalEvaluations: DecisionOutcomeEvaluation[],
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (!historicalEvaluations || historicalEvaluations.length === 0) {
      return patterns;
    }

    // 1. GROUP EVALUATIONS BY DECISION TYPE & DOMAIN
    const failureGroups = new Map<string, DecisionOutcomeEvaluation[]>();
    const successGroups = new Map<string, DecisionOutcomeEvaluation[]>();
    const overrunGroups = new Map<string, DecisionOutcomeEvaluation[]>();

    for (const evalItem of historicalEvaluations) {
      const typeKey = evalItem.decisionType;

      // Group Failures & Underperformance
      if (evalItem.classification === 'FAILED' || evalItem.classification === 'UNDERPERFORMED') {
        const list = failureGroups.get(typeKey) || [];
        list.push(evalItem);
        failureGroups.set(typeKey, list);
      }

      // Group Successes
      if (evalItem.classification === 'SUCCESS') {
        const list = successGroups.get(typeKey) || [];
        list.push(evalItem);
        successGroups.set(typeKey, list);
      }

      // Group Cost Overruns
      const hasOverrun = evalItem.variances.some(
        (v) => v.dimension === 'FINANCIAL_EXPOSURE' && !v.isFavorable,
      );
      if (hasOverrun) {
        const list = overrunGroups.get(typeKey) || [];
        list.push(evalItem);
        overrunGroups.set(typeKey, list);
      }
    }

    // 2. DETECT REPEATED FAILURE PATTERNS
    for (const [decisionType, evals] of failureGroups.entries()) {
      const count = evals.length;
      const maturity: MemoryMaturity = count >= 2 ? 'CONFIRMED' : 'PROVISIONAL';
      const confidence = count >= 2 ? Math.min(95, 60 + count * 15) : 40;

      patterns.push({
        id: `pat_fail_${decisionType.toLowerCase()}_${Date.now()}`,
        companyId,
        patternSignature: `RECURRING_FAILURE:${decisionType}`,
        category: 'FAILURE',
        title: `Repeated Underperformance in ${decisionType}`,
        description: `Observed ${count} underperforming or failed decision(s) in category '${decisionType}'.`,
        supportingObservationsCount: count,
        supportingDecisionIds: evals.map((e) => e.decisionId),
        maturity,
        confidence,
        recommendedAction: `Escalate pre-decision validation thresholds and review assumptions for ${decisionType}.`,
        firstObservedAt: evals[0].measuredAt,
        lastObservedAt: evals[evals.length - 1].measuredAt,
      });
    }

    // 3. DETECT RECURRING COST OVERRUN PATTERNS
    for (const [decisionType, evals] of overrunGroups.entries()) {
      const count = evals.length;
      const maturity: MemoryMaturity = count >= 2 ? 'CONFIRMED' : 'PROVISIONAL';
      const confidence = count >= 2 ? Math.min(90, 50 + count * 15) : 35;

      patterns.push({
        id: `pat_overrun_${decisionType.toLowerCase()}_${Date.now()}`,
        companyId,
        patternSignature: `RECURRING_COST_OVERRUN:${decisionType}`,
        category: 'RISK',
        title: `Recurring Cost Overruns in ${decisionType}`,
        description: `Observed ${count} decision(s) in '${decisionType}' exceeding initial financial budget estimates.`,
        supportingObservationsCount: count,
        supportingDecisionIds: evals.map((e) => e.decisionId),
        maturity,
        confidence,
        recommendedAction: `Apply 15-20% contingency buffering to budget estimations in ${decisionType}.`,
        firstObservedAt: evals[0].measuredAt,
        lastObservedAt: evals[evals.length - 1].measuredAt,
      });
    }

    // 4. DETECT PROVEN SUCCESS STRATEGIES
    for (const [decisionType, evals] of successGroups.entries()) {
      const count = evals.length;
      if (count >= 2) {
        patterns.push({
          id: `pat_succ_${decisionType.toLowerCase()}_${Date.now()}`,
          companyId,
          patternSignature: `PROVEN_STRATEGY:${decisionType}`,
          category: 'SUCCESS',
          title: `Proven High-Yield Strategy in ${decisionType}`,
          description: `Observed ${count} consistently successful decision(s) in '${decisionType}' meeting all target KPIs.`,
          supportingObservationsCount: count,
          supportingDecisionIds: evals.map((e) => e.decisionId),
          maturity: 'CONFIRMED',
          confidence: Math.min(95, 70 + count * 10),
          recommendedAction: `Replicate structural methodology and resource allocation profile for future ${decisionType} initiatives.`,
          firstObservedAt: evals[0].measuredAt,
          lastObservedAt: evals[evals.length - 1].measuredAt,
        });
      }
    }

    return patterns;
  }

  /**
   * Phase 7.1 & 7.3: Extracts a structured lesson from a verified task outcome.
   * Feeds verified operational reality into organizational memory.
   */
  extractLessonFromVerifiedOutcome(input: {
    companyId: string;
    taskId: string;
    taskTitle: string;
    outcomeState: string;
    success: boolean;
    confidence: number;
    evidenceReferences?: string[];
    departmentId?: string;
    workerId?: string;
    capability?: string;
    rootCause?: string;
    actionTaken?: string;
    expectedResult?: string;
    observedOutcome?: string;
    varianceSummary?: string;
  }): StructuredLesson {
    const lessonId = `les_out_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const maturity: MemoryMaturity = input.confidence >= 0.8 ? 'CONFIRMED' : 'PROVISIONAL';

    return {
      id: lessonId,
      companyId: input.companyId,
      sourceTaskId: input.taskId,
      observedSituation: `Task execution evaluated: "${input.taskTitle}" (status: ${input.outcomeState}).`,
      actionTaken: input.actionTaken || `Execution of task ${input.taskId}`,
      expectedResult: input.expectedResult || 'Expected verified outcome criteria to be satisfied',
      actualResult: input.observedOutcome || `Outcome evaluated with confidence ${input.confidence}`,
      varianceSummary: input.varianceSummary || (input.success ? 'Outcome successfully verified.' : 'Verification failed or underperformed.'),
      likelyRootCause: input.rootCause || (input.success ? 'Operational execution met verified success contract.' : 'Prerequisites or execution parameters deviated.'),
      confidence: Math.round(input.confidence * 100),
      applicabilityDomain: input.capability || 'OPERATIONS',
      maturity,
      evidenceReferences: input.evidenceReferences || [],
      departmentId: input.departmentId,
      workerId: input.workerId,
      capability: input.capability,
      contradictionCount: 0,
      createdAt: new Date(),
    };
  }

  /**
   * Phase 7.3 & 7.12: Detects patterns from verified operational history:
   * repeated worker failures, recurring capability failures, recurring task failures,
   * repeated timeouts, recurring department bottlenecks, recurring evidence rejections,
   * and proven successful execution patterns.
   */
  detectOperationalPatterns(
    companyId: string,
    history: Array<{
      taskId: string;
      workerId?: string;
      departmentId?: string;
      capability?: string;
      success: boolean;
      failureType?: string;
      timeout?: boolean;
      evidenceFailure?: boolean;
      measuredAt: Date;
    }>,
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    if (!history || history.length === 0) return patterns;

    const workerFailures = new Map<string, typeof history>();
    const capabilityFailures = new Map<string, typeof history>();
    const departmentBottlenecks = new Map<string, typeof history>();
    const workerSuccesses = new Map<string, typeof history>();

    for (const h of history) {
      if (!h.success) {
        if (h.workerId) {
          const list = workerFailures.get(h.workerId) || [];
          list.push(h);
          workerFailures.set(h.workerId, list);
        }
        if (h.capability) {
          const list = capabilityFailures.get(h.capability) || [];
          list.push(h);
          capabilityFailures.set(h.capability, list);
        }
        if (h.departmentId) {
          const list = departmentBottlenecks.get(h.departmentId) || [];
          list.push(h);
          departmentBottlenecks.set(h.departmentId, list);
        }
      } else {
        if (h.workerId && h.capability) {
          const key = `${h.workerId}:${h.capability}`;
          const list = workerSuccesses.get(key) || [];
          list.push(h);
          workerSuccesses.set(key, list);
        }
      }
    }

    // 1. Worker Failure Patterns
    for (const [workerId, failures] of workerFailures.entries()) {
      const count = failures.length;
      const maturity: MemoryMaturity = count >= 2 ? 'CONFIRMED' : 'PROVISIONAL';
      patterns.push({
        id: `pat_wfail_${workerId}_${Date.now()}`,
        companyId,
        patternSignature: `REPEATED_WORKER_FAILURE:${workerId}`,
        category: 'FAILURE',
        title: `Repeated Worker Failure: ${workerId}`,
        description: `Worker ${workerId} experienced ${count} failed execution(s).`,
        supportingObservationsCount: count,
        supportingDecisionIds: [],
        supportingTaskIds: failures.map((f) => f.taskId),
        affectedScope: 'WORKER',
        affectedEntityId: workerId,
        maturity,
        confidence: count >= 2 ? Math.min(95, 60 + count * 15) : 40,
        recommendedAction: `Demote assignment ranking or adjust capability profile for worker ${workerId}.`,
        firstObservedAt: failures[0].measuredAt,
        lastObservedAt: failures[failures.length - 1].measuredAt,
      });
    }

    // 2. Capability Failure Patterns
    for (const [cap, failures] of capabilityFailures.entries()) {
      const count = failures.length;
      const maturity: MemoryMaturity = count >= 2 ? 'CONFIRMED' : 'PROVISIONAL';
      patterns.push({
        id: `pat_capfail_${cap}_${Date.now()}`,
        companyId,
        patternSignature: `RECURRING_CAPABILITY_FAILURE:${cap}`,
        category: 'FAILURE',
        title: `Recurring Capability Failure: ${cap}`,
        description: `Capability ${cap} failed across ${count} task(s).`,
        supportingObservationsCount: count,
        supportingDecisionIds: [],
        supportingTaskIds: failures.map((f) => f.taskId),
        affectedScope: 'CAPABILITY',
        affectedEntityId: cap,
        maturity,
        confidence: count >= 2 ? Math.min(95, 60 + count * 15) : 40,
        recommendedAction: `Review prompt instructions, tool contracts, and validation criteria for ${cap}.`,
        firstObservedAt: failures[0].measuredAt,
        lastObservedAt: failures[failures.length - 1].measuredAt,
      });
    }

    // 3. Department Bottleneck Patterns
    for (const [deptId, failures] of departmentBottlenecks.entries()) {
      const count = failures.length;
      if (count >= 2) {
        patterns.push({
          id: `pat_deptbtl_${deptId}_${Date.now()}`,
          companyId,
          patternSignature: `DEPARTMENT_BOTTLENECK:${deptId}`,
          category: 'RISK',
          title: `Department Bottleneck: ${deptId}`,
          description: `Department ${deptId} recorded ${count} execution issues/bottlenecks.`,
          supportingObservationsCount: count,
          supportingDecisionIds: [],
          supportingTaskIds: failures.map((f) => f.taskId),
          affectedScope: 'DEPARTMENT',
          affectedEntityId: deptId,
          maturity: 'CONFIRMED',
          confidence: Math.min(95, 65 + count * 10),
          recommendedAction: `Reallocate capacity or trigger department replanning for ${deptId}.`,
          firstObservedAt: failures[0].measuredAt,
          lastObservedAt: failures[failures.length - 1].measuredAt,
        });
      }
    }

    // 4. Proven Successful Execution Patterns
    for (const [key, successes] of workerSuccesses.entries()) {
      const count = successes.length;
      if (count >= 2) {
        const [workerId, capability] = key.split(':');
        patterns.push({
          id: `pat_succ_${workerId}_${Date.now()}`,
          companyId,
          patternSignature: `PROVEN_EXECUTION_SUCCESS:${key}`,
          category: 'SUCCESS',
          title: `Proven Success: ${workerId} on ${capability}`,
          description: `Worker ${workerId} repeatedly succeeded on capability ${capability} (${count} verified tasks).`,
          supportingObservationsCount: count,
          supportingDecisionIds: [],
          supportingTaskIds: successes.map((s) => s.taskId),
          affectedScope: 'WORKER',
          affectedEntityId: workerId,
          maturity: 'CONFIRMED',
          confidence: Math.min(98, 75 + count * 10),
          recommendedAction: `Boost affinity score and specialization confidence for worker ${workerId} on ${capability}.`,
          firstObservedAt: successes[0].measuredAt,
          lastObservedAt: successes[successes.length - 1].measuredAt,
        });
      }
    }

    return patterns;
  }

  /**
   * Phase 7.21: Contradicts or deprecates an existing lesson when new verified evidence disproves it.
   */
  evaluateLessonContradiction(
    lesson: StructuredLesson,
    contradictingEvidence: { reason: string; evidenceReference: string },
  ): StructuredLesson {
    const contradictionCount = (lesson.contradictionCount || 0) + 1;
    // Policy threshold: >= 2 contradictions deprecates lesson
    const isDeprecated = contradictionCount >= 2;
    const newMaturity: MemoryMaturity = isDeprecated ? 'DEPRECATED' : 'PROVISIONAL';

    return {
      ...lesson,
      contradictionCount,
      maturity: newMaturity,
      invalidationReason: isDeprecated ? `Contradicted by verified evidence: ${contradictingEvidence.reason}` : lesson.invalidationReason,
      confidence: Math.max(10, lesson.confidence - 35),
    };
  }
}

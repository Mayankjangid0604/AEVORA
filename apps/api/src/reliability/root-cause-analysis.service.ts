import { Injectable, Logger } from '@nestjs/common';
import {
  DiagnosticContext,
  RankedRootCauseHypothesis,
  IncidentDiagnosticReportSummary,
  ObservableEvidenceItem,
} from './diagnostic.types';
import { ProbeTargetType } from './health-probe.types';
import { randomUUID } from 'crypto';

@Injectable()
export class RootCauseAnalysisService {
  private readonly logger = new Logger(RootCauseAnalysisService.name);

  /**
   * Analyzes an assembled diagnostic context to produce a structured,
   * evidence-grounded root-cause analysis report.
   * Ranks hypotheses, scores confidence, handles inconclusive states,
   * and separates observed evidence from unverified hypotheses.
   */
  analyzeRootCause(context: DiagnosticContext): IncidentDiagnosticReportSummary {
    const reportId = `diag-${randomUUID()}`;

    // 1. Check for insufficient evidence / inconclusive state
    if (context.primaryTargetObservations.length === 0) {
      return {
        id: reportId,
        incidentId: context.incidentId,
        companyId: context.companyId,
        status: 'INCONCLUSIVE',
        diagnosticContext: context,
        rankedHypotheses: [],
        evidenceGaps: context.evidenceGaps,
        contradictions: context.contradictorySignals,
        recommendedAction: 'Trigger an immediate on-demand probe for the affected target to gather telemetry before re-running diagnostic analysis.',
        confidenceScore: 0.1,
        isInconclusive: true,
        inconclusiveReason: 'No technical observations were recorded for the target within the diagnostic time window.',
        analyzedBy: 'SYSTEM_DIAGNOSTIC_ENGINE',
        createdAt: new Date(),
      };
    }

    // 2. Synthesize hypotheses through deterministic correlation rules
    const candidateHypotheses: RankedRootCauseHypothesis[] = [];

    switch (context.targetType) {
      case ProbeTargetType.DATABASE_POOL:
        candidateHypotheses.push(...this.evaluateDatabaseFailure(context));
        break;
      case ProbeTargetType.PROCESS_MEMORY:
        candidateHypotheses.push(...this.evaluateMemoryFailure(context));
        break;
      case ProbeTargetType.EVENT_LOOP_LAG:
        candidateHypotheses.push(...this.evaluateEventLoopFailure(context));
        break;
      case ProbeTargetType.BACKGROUND_QUEUE:
        candidateHypotheses.push(...this.evaluateQueueFailure(context));
        break;
      case ProbeTargetType.MODEL_GATEWAY:
        candidateHypotheses.push(...this.evaluateModelGatewayFailure(context));
        break;
      default:
        candidateHypotheses.push(...this.evaluateGenericFailure(context));
        break;
    }

    // Correlate multi-subsystem burst load if aggregate metrics show systemic pressure
    if (context.telemetryMetricsSnapshot.errorRate > 0.05 || context.correlatedSubsystemObservations.some((o) => o.status === 'ANOMALOUS')) {
      candidateHypotheses.push(this.evaluateBurstLoad(context));
    }

    // 3. Incorporate historical organizational lessons strictly as non-conclusive advisory guidance
    if (context.relevantHistoricalLessons && context.relevantHistoricalLessons.length > 0) {
      for (const lesson of context.relevantHistoricalLessons) {
        for (const hyp of candidateHypotheses) {
          hyp.nonExecutableRecommendations.push(
            `[Advisory Historical Precedent - Non-Conclusive]: Lesson ${lesson.id} recorded '${lesson.situation}' (${lesson.rootCause}). Historical lessons cannot serve as factual evidence.`,
          );
        }
      }
    }

    // 4. Apply governance notice if company is in EMERGENCY_STOP
    const isEmergencyStop = context.emergencyStatus === 'EMERGENCY_STOP';
    if (isEmergencyStop) {
      for (const hyp of candidateHypotheses) {
        hyp.nonExecutableRecommendations.unshift(
          '[GOVERNANCE LOCK - EMERGENCY_STOP]: All autonomous remediation runbooks and probe triggers are suspended. Manual human operator intervention required.',
        );
      }
    }

    // 5. Apply confidence penalties for contradictory signals and evidence gaps
    let confidencePenalty = 0.0;
    if (context.contradictorySignals.length > 0) {
      confidencePenalty += context.contradictorySignals.length * 0.15;
    }
    if (context.evidenceGaps.some((g) => g.impactOnConfidence === 'HIGH')) {
      confidencePenalty += 0.20;
    }

    // Adjust and clamp confidence scores (strictly bounded between 0.10 and 0.95 - never 1.0 without human proof)
    for (const hyp of candidateHypotheses) {
      hyp.confidence = Math.max(0.1, Math.min(0.95, Number((hyp.confidence - confidencePenalty).toFixed(2))));
    }

    // 6. Sort and rank hypotheses by confidence descending
    candidateHypotheses.sort((a, b) => b.confidence - a.confidence);
    candidateHypotheses.forEach((h, idx) => {
      h.rank = idx + 1;
    });

    const topHypothesis = candidateHypotheses[0];
    const overallConfidence = topHypothesis ? topHypothesis.confidence : 0.0;

    // 7. Check if overall analysis remains inconclusive
    const isBelowConfidenceThreshold = overallConfidence < 0.40;
    const hasMajorContradictions = context.contradictorySignals.length >= 2;
    const isInconclusive = isBelowConfidenceThreshold || hasMajorContradictions;

    let inconclusiveReason: string | null = null;
    if (isInconclusive) {
      if (hasMajorContradictions) {
        inconclusiveReason = 'Contradictory technical signals prevent confident root cause disambiguation.';
      } else {
        inconclusiveReason = `Diagnostic confidence (${(overallConfidence * 100).toFixed(0)}%) is below conclusive threshold (40%).`;
      }
    }

    let recommendedAction = topHypothesis?.nonExecutableRecommendations[0] ?? 'Inspect correlated system logs and await additional telemetry.';
    if (isEmergencyStop) {
      recommendedAction = `[GOVERNANCE NOTICE: Target company is in EMERGENCY_STOP. Autonomous remediation is suspended. Read-only advisory only.] ${recommendedAction}`;
    }

    return {
      id: reportId,
      incidentId: context.incidentId,
      companyId: context.companyId,
      status: isInconclusive ? 'INCONCLUSIVE' : 'COMPLETED',
      diagnosticContext: context,
      rankedHypotheses: candidateHypotheses,
      evidenceGaps: context.evidenceGaps,
      contradictions: context.contradictorySignals,
      recommendedAction,
      confidenceScore: overallConfidence,
      isInconclusive,
      inconclusiveReason,
      analyzedBy: 'SYSTEM_DIAGNOSTIC_ENGINE',
      createdAt: new Date(),
    };
  }

  private evaluateDatabaseFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    const hypotheses: RankedRootCauseHypothesis[] = [];
    const obs = context.primaryTargetObservations;
    const supportingIds = obs.map((o) => o.id);

    const hasDisconnect = obs.some((o) => {
      const err = o.observedValue?.errorMessage ?? '';
      return err.includes('Connection') || err.includes('refused') || err.includes('Socket') || o.observedValue?.status === 'UNHEALTHY';
    });

    if (hasDisconnect) {
      hypotheses.push({
        rank: 1,
        id: 'rca-db-disconnect',
        category: 'DATABASE_CONNECTIVITY_LOSS',
        title: 'PostgreSQL Connection Drop or Daemon Failure',
        explanation: 'Observable socket disconnection or health ping refusal on primary database connection pool.',
        confidence: 0.90,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: supportingIds,
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['PostgreSQL system log around timestamp', 'Container status check: pg_isready'],
        nonExecutableRecommendations: [
          'Verify PostgreSQL process liveness and inspect host port 5432 availability.',
          'Inspect connection pool capacity and connection lifecycle timeouts.',
        ],
      });
    }

    const hasLatencySpike = obs.some((o) => (o.observedValue?.latencyMs ?? 0) >= 2000);
    if (hasLatencySpike) {
      hypotheses.push({
        rank: 2,
        id: 'rca-db-pool-saturation',
        category: 'DATABASE_POOL_SATURATION',
        title: 'Database Connection Pool Exhaustion or Heavy Lock Contention',
        explanation: 'Elevated query latency observed on database ping probe while connection socket remains responsive.',
        confidence: hasDisconnect ? 0.70 : 0.85,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: supportingIds,
        contradictingEvidenceIds: hasDisconnect ? supportingIds : [],
        dataNeededToConfirm: ['Query pg_stat_activity for waiting queries or active exclusive locks', 'Inspect client pool checkout times'],
        nonExecutableRecommendations: [
          'Inspect long-running transactions and active row locks in pg_stat_activity.',
          'Consider connection pooling pool-size tuning and query timeout limits.',
        ],
      });
    }

    return hypotheses;
  }

  private evaluateMemoryFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    const obs = context.primaryTargetObservations;
    const latest = obs[0];
    const heapRatio = latest?.observedValue?.details?.heapUsageRatio ?? 0;
    const heapUsedMb = Math.round((latest?.observedValue?.details?.heapUsedBytes ?? 0) / 1024 / 1024);

    return [
      {
        rank: 1,
        id: 'rca-mem-oom',
        category: 'MEMORY_LEAK_OR_OOM',
        title: 'Node.js V8 Heap Exhaustion / Unbounded Memory Accumulation',
        explanation: `Observed heap memory ratio is ${(heapRatio * 100).toFixed(1)}% (${heapUsedMb}MB used), indicating severe heap memory pressure or cache accumulation.`,
        confidence: heapRatio >= 0.95 ? 0.92 : 0.80,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: obs.map((o) => o.id),
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['Capture and inspect V8 heap snapshot', 'Evaluate high-cardinality in-memory map caches'],
        nonExecutableRecommendations: [
          'Capture Node.js heap snapshot to identify retained object graphs.',
          'Inspect active in-memory caches and bounded buffer retention limits.',
        ],
      },
    ];
  }

  private evaluateEventLoopFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    const obs = context.primaryTargetObservations;
    const lagMs = obs[0]?.observedValue?.details?.lagMs ?? 0;

    return [
      {
        rank: 1,
        id: 'rca-eventloop-starvation',
        category: 'EVENT_LOOP_STARVATION',
        title: 'Synchronous CPU Contention Blocking Event Loop',
        explanation: `High-resolution timer skew measured event loop lag at ${lagMs}ms, indicating synchronous routine or large JSON serialization blocking I/O dispatch.`,
        confidence: lagMs >= 200 ? 0.88 : 0.75,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: obs.map((o) => o.id),
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['Node.js CPU profile (v8-profiler) during skew window', 'Trace large synchronous payload parsing'],
        nonExecutableRecommendations: [
          'Profile V8 CPU ticks to identify long-running synchronous functions.',
          'Offload heavy data processing or cryptographic hashing to worker threads.',
        ],
      },
    ];
  }

  private evaluateQueueFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    const obs = context.primaryTargetObservations;
    const stuck = obs[0]?.observedValue?.details?.stuckCount ?? 0;
    const queued = obs[0]?.observedValue?.details?.queuedCount ?? 0;

    return [
      {
        rank: 1,
        id: 'rca-queue-stall',
        category: 'QUEUE_WORKER_STALL',
        title: 'Background Worker Starvation or Stuck Job Execution',
        explanation: `Queue service reports ${stuck} stuck jobs and ${queued} queued backlog items, indicating worker process stalls or unhandled process termination on long-running jobs.`,
        confidence: stuck > 5 ? 0.86 : 0.74,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: obs.map((o) => o.id),
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['Inspect background job worker process heartbeats', 'Review failed job exception traces in database'],
        nonExecutableRecommendations: [
          'Inspect background job worker logs for uncaught exceptions.',
          'Reset expired locks on stalled jobs and ensure idempotency.',
        ],
      },
    ];
  }

  private evaluateModelGatewayFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    const obs = context.primaryTargetObservations;

    return [
      {
        rank: 1,
        id: 'rca-model-gateway-down',
        category: 'MODEL_GATEWAY_OUTAGE',
        title: 'Upstream Model Provider Outage or Rate Limit Depletion',
        explanation: 'Model gateway health check returned timeout or service unavailable on inference endpoint.',
        confidence: 0.85,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: obs.map((o) => o.id),
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['Model provider status dashboard / API rate limit headers', 'Local inference engine process status'],
        nonExecutableRecommendations: [
          'Verify model provider API quota and inspect upstream status page.',
          'Failover to secondary local model tier if external provider is unresponsive.',
        ],
      },
    ];
  }

  private evaluateGenericFailure(context: DiagnosticContext): RankedRootCauseHypothesis[] {
    return [
      {
        rank: 1,
        id: 'rca-generic-degradation',
        category: 'UNSPECIFIED_DEGRADATION',
        title: `Service Degradation on ${context.targetName}`,
        explanation: `Observable technical failure on ${context.targetName} (${context.targetType}).`,
        confidence: 0.60,
        epistemicStatus: 'HYPOTHESIS',
        supportingEvidenceIds: context.primaryTargetObservations.map((o) => o.id),
        contradictingEvidenceIds: [],
        dataNeededToConfirm: ['Endpoint access logs and system telemetry metrics'],
        nonExecutableRecommendations: ['Inspect dependent service logs for error traces.'],
      },
    ];
  }

  private evaluateBurstLoad(context: DiagnosticContext): RankedRootCauseHypothesis {
    return {
      rank: 99,
      id: 'rca-burst-load',
      category: 'CONCURRENT_BURST_LOAD',
      title: 'Systemic Concurrent Burst Traffic / Request Saturation',
      explanation: `System telemetry reflects elevated error rate (${(context.telemetryMetricsSnapshot.errorRate * 100).toFixed(1)}%) across multiple subsystems.`,
      confidence: 0.65,
      epistemicStatus: 'HYPOTHESIS',
      supportingEvidenceIds: context.correlatedSubsystemObservations.map((o) => o.id),
      contradictingEvidenceIds: [],
      dataNeededToConfirm: ['HTTP request throughput metrics (requests per second)', 'Load balancer active connection count'],
      nonExecutableRecommendations: [
        'Inspect incoming traffic rates on API ingress gateway.',
        'Evaluate rate limiting and concurrent request throttling rules.',
      ],
    };
  }
}

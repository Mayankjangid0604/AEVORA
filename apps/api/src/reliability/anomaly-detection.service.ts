import { Injectable, Logger } from '@nestjs/common';
import { ProbeTargetType, ProbeResultStatus } from './health-probe.types';
import {
  IncidentSeverity,
  AnomalyDetectionInput,
  AnomalyEvaluationResult,
  IncidentHypothesis,
} from './incident.types';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  /**
   * Evaluates technical telemetry and probe observations to detect anomalies,
   * assign objective severity, compute deterministic deduplication keys,
   * and synthesize epistemic triage hypotheses.
   */
  evaluateAnomaly(input: AnomalyDetectionInput): AnomalyEvaluationResult {
    const isAnomaly =
      input.status === ProbeResultStatus.DEGRADED ||
      input.status === ProbeResultStatus.UNHEALTHY ||
      input.status === ProbeResultStatus.TIMEOUT ||
      input.latencyMs > 2000;

    if (!isAnomaly) {
      return {
        isAnomaly: false,
        severity: IncidentSeverity.SEV4_LOW,
        deduplicationKey: this.computeDeduplicationKey(input),
        title: `Normal Operation: ${input.targetName}`,
        description: `Probe ${input.targetName} observed healthy.`,
        affectedServices: [],
        hypotheses: [],
        requiresUrgentTask: false,
      };
    }

    const severity = this.classifySeverity(input);
    const affectedServices = this.identifyAffectedServices(input);
    const hypotheses = this.generateHypotheses(input, severity);
    const requiresUrgentTask =
      severity === IncidentSeverity.SEV1_CRITICAL || severity === IncidentSeverity.SEV2_HIGH;

    const deduplicationKey = this.computeDeduplicationKey(input);
    const title = this.formatIncidentTitle(input, severity);
    const description = input.errorMessage
      ? `Observable failure on ${input.targetName}: ${input.errorMessage}`
      : `Degraded performance detected on ${input.targetName} (latency: ${input.latencyMs}ms, status: ${input.status}).`;

    return {
      isAnomaly: true,
      severity,
      deduplicationKey,
      title,
      description,
      affectedServices,
      hypotheses,
      requiresUrgentTask,
    };
  }

  /**
   * Deterministic deduplication key computation to suppress duplicate incident storms.
   */
  computeDeduplicationKey(input: AnomalyDetectionInput): string {
    const scope = input.companyId ? `tenant:${input.companyId}` : 'global';
    return `${scope}:${input.targetType}:${input.targetName}`;
  }

  /**
   * Severity classification based strictly on observable technical thresholds.
   */
  private classifySeverity(input: AnomalyDetectionInput): IncidentSeverity {
    const { targetType, status, latencyMs, details } = input;

    // SEV1_CRITICAL: Complete database connectivity loss or imminent process memory OOM
    if (targetType === ProbeTargetType.DATABASE_POOL && status === ProbeResultStatus.UNHEALTHY) {
      return IncidentSeverity.SEV1_CRITICAL;
    }
    if (targetType === ProbeTargetType.PROCESS_MEMORY) {
      const heapRatio = details?.heapUsageRatio ?? 0;
      if (heapRatio >= 0.95 || status === ProbeResultStatus.UNHEALTHY) {
        return IncidentSeverity.SEV1_CRITICAL;
      }
    }

    // SEV2_HIGH: Critical event-loop lockup, queue worker stall, model gateway outage, or severe DB latency
    if (targetType === ProbeTargetType.EVENT_LOOP_LAG && (status === ProbeResultStatus.UNHEALTHY || (details?.lagMs ?? 0) >= 200)) {
      return IncidentSeverity.SEV2_HIGH;
    }
    if (targetType === ProbeTargetType.BACKGROUND_QUEUE && (details?.stuckCount ?? 0) > 5) {
      return IncidentSeverity.SEV2_HIGH;
    }
    if (targetType === ProbeTargetType.MODEL_GATEWAY && (status === ProbeResultStatus.UNHEALTHY || status === ProbeResultStatus.TIMEOUT)) {
      return IncidentSeverity.SEV2_HIGH;
    }
    if (targetType === ProbeTargetType.DATABASE_POOL && latencyMs >= 2500) {
      return IncidentSeverity.SEV2_HIGH;
    }

    // SEV3_MEDIUM: Elevated memory, moderate event loop lag, queue backlog, or service degradation
    if (targetType === ProbeTargetType.PROCESS_MEMORY && (details?.heapUsageRatio ?? 0) >= 0.85) {
      return IncidentSeverity.SEV3_MEDIUM;
    }
    if (targetType === ProbeTargetType.EVENT_LOOP_LAG && (details?.lagMs ?? 0) >= 50) {
      return IncidentSeverity.SEV3_MEDIUM;
    }
    if (targetType === ProbeTargetType.BACKGROUND_QUEUE && ((details?.stuckCount ?? 0) > 0 || (details?.queuedCount ?? 0) > 100)) {
      return IncidentSeverity.SEV3_MEDIUM;
    }
    if (status === ProbeResultStatus.DEGRADED) {
      return IncidentSeverity.SEV3_MEDIUM;
    }

    // SEV4_LOW: Transient probe timeouts or minor warnings
    return IncidentSeverity.SEV4_LOW;
  }

  /**
   * Identifies affected subsystems based on probe target.
   */
  private identifyAffectedServices(input: AnomalyDetectionInput): string[] {
    switch (input.targetType) {
      case ProbeTargetType.DATABASE_POOL:
        return ['postgresql', 'prisma_orm', 'persistence_layer', 'all_tenants'];
      case ProbeTargetType.PROCESS_MEMORY:
        return ['api_runtime', 'node_process', 'heap_allocator'];
      case ProbeTargetType.EVENT_LOOP_LAG:
        return ['event_loop', 'http_server', 'async_io'];
      case ProbeTargetType.BACKGROUND_QUEUE:
        return ['background_job_worker', 'task_orchestrator', 'queue_scheduler'];
      case ProbeTargetType.MODEL_GATEWAY:
        return ['model_gateway', 'ai_workforce', 'local_inference'];
      case ProbeTargetType.EXTERNAL_API:
        return ['external_gateway', 'third_party_integration'];
      default:
        return [input.targetName.toLowerCase()];
    }
  }

  /**
   * Generates diagnostic hypotheses with explicit epistemic uncertainty.
   * Hypotheses are marked 'HYPOTHESIS' and never presented as verified ground truth.
   */
  private generateHypotheses(input: AnomalyDetectionInput, severity: IncidentSeverity): IncidentHypothesis[] {
    const hypotheses: IncidentHypothesis[] = [];

    switch (input.targetType) {
      case ProbeTargetType.DATABASE_POOL: {
        hypotheses.push({
          id: 'hyp-db-1',
          summary: 'Database connection pool saturation or lock contention',
          confidence: 0.75,
          epistemicStatus: 'HYPOTHESIS',
          indicators: [
            `Observed latency: ${input.latencyMs}ms`,
            `Status: ${input.status}`,
            `Pool state: ${input.details?.poolStatus ?? 'UNKNOWN'}`,
          ],
          potentialRemediation: 'Inspect pg_stat_activity and active long-running locks; consider pool size adjustment.',
        });
        if (input.errorMessage?.includes('Connection') || input.status === ProbeResultStatus.UNHEALTHY) {
          hypotheses.push({
            id: 'hyp-db-2',
            summary: 'PostgreSQL daemon restart or network socket disruption',
            confidence: 0.65,
            epistemicStatus: 'HYPOTHESIS',
            indicators: [input.errorMessage ?? 'Socket disconnection'],
            potentialRemediation: 'Verify PostgreSQL service liveness and container bridge network.',
          });
        }
        break;
      }

      case ProbeTargetType.PROCESS_MEMORY: {
        const ratio = input.details?.heapUsageRatio ?? 0;
        hypotheses.push({
          id: 'hyp-mem-1',
          summary: 'Potential Node.js heap memory leak or large payload retention',
          confidence: ratio > 0.9 ? 0.85 : 0.7,
          epistemicStatus: 'HYPOTHESIS',
          indicators: [
            `Heap ratio: ${(ratio * 100).toFixed(1)}%`,
            `Heap used: ${Math.round((input.details?.heapUsedBytes ?? 0) / 1024 / 1024)}MB`,
          ],
          potentialRemediation: 'Capture heap snapshot and evaluate high-cardinality in-memory caches.',
        });
        break;
      }

      case ProbeTargetType.EVENT_LOOP_LAG: {
        hypotheses.push({
          id: 'hyp-lag-1',
          summary: 'Synchronous CPU-intensive computation or JSON serialization blocking the event loop',
          confidence: 0.8,
          epistemicStatus: 'HYPOTHESIS',
          indicators: [`Lag: ${input.details?.lagMs ?? 0}ms`],
          potentialRemediation: 'Profile Node.js V8 tick profiler to locate blocking synchronous routines.',
        });
        break;
      }

      case ProbeTargetType.BACKGROUND_QUEUE: {
        hypotheses.push({
          id: 'hyp-queue-1',
          summary: 'Queue worker starvation or unhandled worker process crash on long-running jobs',
          confidence: 0.78,
          epistemicStatus: 'HYPOTHESIS',
          indicators: [
            `Stuck jobs: ${input.details?.stuckCount ?? 0}`,
            `Queued backlog: ${input.details?.queuedCount ?? 0}`,
          ],
          potentialRemediation: 'Inspect worker process heartbeats and reset expired locked jobs.',
        });
        break;
      }

      default: {
        hypotheses.push({
          id: 'hyp-gen-1',
          summary: 'External dependent subsystem unavailability or timeout',
          confidence: 0.6,
          epistemicStatus: 'HYPOTHESIS',
          indicators: [`Target: ${input.targetName}`, `Status: ${input.status}`],
          potentialRemediation: 'Verify endpoint connectivity and upstream status page.',
        });
        break;
      }
    }

    return hypotheses;
  }

  private formatIncidentTitle(input: AnomalyDetectionInput, severity: IncidentSeverity): string {
    const prefix = severity === IncidentSeverity.SEV1_CRITICAL ? '[CRITICAL OUTAGE]' : '[ANOMALY]';
    return `${prefix} ${input.targetName} (${input.targetType}) - ${input.status}`;
  }
}

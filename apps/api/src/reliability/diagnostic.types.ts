import { ProbeTargetType } from './health-probe.types';
import { IncidentSeverity, IncidentStatus, IncidentEventType } from './incident.types';

export type DiagnosticReportStatus = 'COMPLETED' | 'INCONCLUSIVE' | 'FAILED';

export interface EvidenceProvenance {
  sourceType: 'HEALTH_PROBE' | 'TELEMETRY_AGGREGATE' | 'INCIDENT_TIMELINE' | 'ORGANIZATIONAL_MEMORY' | 'SYSTEM_LOG';
  sourceId: string;
  observedAt: Date;
  collector: string;
  isSanitized: boolean;
}

export interface ObservableEvidenceItem {
  id: string;
  metric: string;
  observedValue: any;
  thresholdValue?: any;
  status: 'NORMAL' | 'DEGRADED' | 'ANOMALOUS' | 'FAILED';
  provenance: EvidenceProvenance;
}

export interface EvidenceGap {
  expectedSignal: string;
  reason: 'MISSING_DATA' | 'STALE_DATA' | 'COLLECTION_TIMEOUT' | 'INSUFFICIENT_WINDOW';
  impactOnConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  remediationRecommendation: string;
}

export interface ContradictorySignal {
  signalA: string;
  signalB: string;
  discrepancyDescription: string;
}

export interface DiagnosticContext {
  incidentId: string;
  companyId: string | null;
  targetType: ProbeTargetType;
  targetName: string;
  incidentSeverity: IncidentSeverity;
  incidentCreatedAt: Date;
  timeWindow: {
    start: Date;
    end: Date;
  };
  primaryTargetObservations: ObservableEvidenceItem[];
  correlatedSubsystemObservations: ObservableEvidenceItem[];
  telemetryMetricsSnapshot: {
    availabilityRate: number;
    errorRate: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgLatencyMs?: number;
    queueDepth?: number;
  };
  incidentTimelineHistory: Array<{
    eventType: IncidentEventType;
    fromStatus: IncidentStatus | null;
    toStatus: IncidentStatus | null;
    note: string | null;
    createdAt: Date;
  }>;
  relatedIncidents: Array<{
    id: string;
    title: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    createdAt: Date;
  }>;
  relevantHistoricalLessons: Array<{
    id: string;
    situation: string;
    rootCause: string;
    confidence: number;
    maturity: string;
  }>;
  evidenceGaps: EvidenceGap[];
  contradictorySignals: ContradictorySignal[];
  emergencyStatus?: string | null;
  assembledAt: Date;
}

export interface RankedRootCauseHypothesis {
  rank: number;
  id: string;
  category:
    | 'DATABASE_POOL_SATURATION'
    | 'DATABASE_CONNECTIVITY_LOSS'
    | 'MEMORY_LEAK_OR_OOM'
    | 'EVENT_LOOP_STARVATION'
    | 'QUEUE_WORKER_STALL'
    | 'MODEL_GATEWAY_OUTAGE'
    | 'EXTERNAL_DEPENDENCY_FAILURE'
    | 'CONCURRENT_BURST_LOAD'
    | 'UNSPECIFIED_DEGRADATION';
  title: string;
  explanation: string;
  confidence: number; // Strictly bounded 0.0 to 1.0
  epistemicStatus: 'PROVISIONAL' | 'HYPOTHESIS' | 'INCONCLUSIVE';
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  dataNeededToConfirm: string[];
  nonExecutableRecommendations: string[];
}

export interface IncidentDiagnosticReportSummary {
  id: string;
  incidentId: string;
  companyId: string | null;
  status: DiagnosticReportStatus;
  diagnosticContext: DiagnosticContext;
  rankedHypotheses: RankedRootCauseHypothesis[];
  evidenceGaps: EvidenceGap[];
  contradictions: ContradictorySignal[];
  recommendedAction: string | null;
  confidenceScore: number;
  isInconclusive: boolean;
  inconclusiveReason?: string | null;
  analyzedBy: string;
  createdAt: Date;
}

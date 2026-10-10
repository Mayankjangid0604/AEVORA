import { ProbeTargetType } from './health-probe.types';

export enum IncidentSeverity {
  SEV1_CRITICAL = 'SEV1_CRITICAL',
  SEV2_HIGH = 'SEV2_HIGH',
  SEV3_MEDIUM = 'SEV3_MEDIUM',
  SEV4_LOW = 'SEV4_LOW',
}

export enum IncidentStatus {
  DETECTED = 'DETECTED',
  TRIAGED = 'TRIAGED',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum IncidentEventType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  SEVERITY_UPDATE = 'SEVERITY_UPDATE',
  TRIAGE_NOTE = 'TRIAGE_NOTE',
  ESCALATION = 'ESCALATION',
  EVIDENCE_ATTACHED = 'EVIDENCE_ATTACHED',
  TASK_LINKED = 'TASK_LINKED',
  DIAGNOSTIC_REPORT_ATTACHED = 'DIAGNOSTIC_REPORT_ATTACHED',
  REMEDIATION_PLANNED = 'REMEDIATION_PLANNED',
  REMEDIATION_STARTED = 'REMEDIATION_STARTED',
  REMEDIATION_COMPLETED = 'REMEDIATION_COMPLETED',
  REMEDIATION_VERIFIED = 'REMEDIATION_VERIFIED',
  REMEDIATION_FAILED = 'REMEDIATION_FAILED',
  REMEDIATION_ROLLED_BACK = 'REMEDIATION_ROLLED_BACK',
}

export type EpistemicCertainty = 'PROVISIONAL' | 'HYPOTHESIS' | 'CONFIRMED_EVIDENCE';

export interface IncidentHypothesis {
  id: string;
  summary: string;
  confidence: number;
  epistemicStatus: EpistemicCertainty;
  indicators: string[];
  potentialRemediation?: string;
}

export interface AnomalyDetectionInput {
  targetType: ProbeTargetType;
  targetName: string;
  status: string; // ProbeResultStatus
  latencyMs: number;
  errorMessage?: string;
  details?: Record<string, any>;
  companyId?: string;
  correlationId?: string;
  probeObservationId?: string;
}

export interface AnomalyEvaluationResult {
  isAnomaly: boolean;
  severity: IncidentSeverity;
  deduplicationKey: string;
  title: string;
  description: string;
  affectedServices: string[];
  hypotheses: IncidentHypothesis[];
  requiresUrgentTask: boolean;
}

export interface CreateIncidentDto {
  companyId?: string;
  title: string;
  description: string;
  severity?: IncidentSeverity;
  targetType: ProbeTargetType;
  targetName: string;
  detectionSource?: string;
  correlationId?: string;
  causationId?: string;
  hypotheses?: IncidentHypothesis[];
  affectedServices?: string[];
  createUrgentTask?: boolean;
  actorId?: string;
  actorRole?: string;
}

export interface TransitionIncidentDto {
  toStatus: IncidentStatus;
  note?: string;
  evidence?: Record<string, any>;
  actorId?: string;
  actorRole?: string;
}

export interface EscalateIncidentDto {
  targetRole: 'CHAIRMAN' | 'CEO';
  reason: string;
  note?: string;
  actorId?: string;
  actorRole?: string;
}

export interface IncidentSummary {
  id: string;
  companyId: string | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  targetType: ProbeTargetType;
  targetName: string;
  detectionSource: string;
  deduplicationKey: string;
  occurrenceCount: number;
  correlationId: string | null;
  causationId: string | null;
  triageSummary: string | null;
  hypotheses: IncidentHypothesis[];
  affectedServices: string[];
  taskId: string | null;
  escalationRequired: boolean;
  escalatedTo: string | null;
  mitigatedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events?: Array<{
    id: string;
    eventType: IncidentEventType;
    fromStatus: IncidentStatus | null;
    toStatus: IncidentStatus | null;
    note: string | null;
    evidence: Record<string, any>;
    actorId: string | null;
    actorRole: string | null;
    createdAt: Date;
  }>;
}

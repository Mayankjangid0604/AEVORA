import { ProbeTargetType } from './health-probe.types';

export enum RunbookActionType {
  SERVICE_RESTART = 'SERVICE_RESTART',
  CONNECTION_POOL_REBALANCE = 'CONNECTION_POOL_REBALANCE',
  QUEUE_PURGE_STALE_LOCKS = 'QUEUE_PURGE_STALE_LOCKS',
  CACHE_INVALIDATION = 'CACHE_INVALIDATION',
  TRAFFIC_THROTTLE = 'TRAFFIC_THROTTLE',
}

export enum RunbookRiskTier {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum RunbookExecutionStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  VERIFYING = 'VERIFYING',
  VERIFIED_HEALTHY = 'VERIFIED_HEALTHY',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
}

export interface RunbookPrecondition {
  metric: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';
  expectedValue: any;
  description: string;
}

export interface RunbookStepResult {
  stepNumber: number;
  name: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  output?: any;
  error?: string;
  executedAt: Date;
}

export interface RunbookDefinitionSummary {
  id: string;
  companyId?: string | null;
  name: string;
  description: string;
  targetType: ProbeTargetType;
  actionType: RunbookActionType;
  riskTier: RunbookRiskTier;
  isReversible: boolean;
  parameters: Record<string, any>;
  preconditions: RunbookPrecondition[];
  postVerificationCriteria: Record<string, any>;
  maxAttempts: number;
  cooldownMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunbookExecutionSummary {
  id: string;
  companyId?: string | null;
  incidentId: string;
  runbookId: string;
  actionType: RunbookActionType;
  status: RunbookExecutionStatus;
  parameters: Record<string, any>;
  preExecutionSnapshot: Record<string, any>;
  stepResults: RunbookStepResult[];
  postVerificationSnapshot: Record<string, any>;
  rollbackResults: Record<string, any>;
  riskTier: RunbookRiskTier;
  approvalRequestId?: string | null;
  executedBy: string;
  startedAt: Date;
  completedAt?: Date | null;
  rolledBackAt?: Date | null;
  createdAt: Date;
}

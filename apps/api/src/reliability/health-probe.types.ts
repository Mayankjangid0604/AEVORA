export enum ProbeTargetType {
  DATABASE_POOL = 'DATABASE_POOL',
  PROCESS_MEMORY = 'PROCESS_MEMORY',
  EVENT_LOOP_LAG = 'EVENT_LOOP_LAG',
  BACKGROUND_QUEUE = 'BACKGROUND_QUEUE',
  MODEL_GATEWAY = 'MODEL_GATEWAY',
  EXTERNAL_API = 'EXTERNAL_API',
}

export enum ProbeResultStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  TIMEOUT = 'TIMEOUT',
}

export interface ProbeExecutionOptions {
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  companyId?: string;
  endpoint?: string;
  correlationId?: string;
  isProtected?: boolean;
  metadata?: Record<string, any>;
}

export interface ProbeExecutionResult {
  targetType: ProbeTargetType;
  targetName: string;
  status: ProbeResultStatus;
  latencyMs: number;
  errorMessage?: string;
  details?: Record<string, any>;
  observedAt: Date;
  consecutiveFails?: number;
  correlationId?: string;
  isProtected?: boolean;
}

export interface SystemProbeSummary {
  id?: string;
  companyId?: string | null;
  targetType: ProbeTargetType;
  targetName: string;
  description?: string | null;
  endpoint?: string | null;
  status: ProbeResultStatus;
  lastLatencyMs?: number | null;
  consecutiveFails: number;
  failureThreshold: number;
  lastObservedAt: Date | null;
  metadata?: Record<string, any>;
  isActive: boolean;
}

export interface AggregatedMetrics {
  totalProbes: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  timeoutCount: number;
  availabilityRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgLatencyMs: number;
  queueDepth?: number;
  activeConcurrency: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface ProcessMemoryMetrics {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  heapUsageRatio: number;
}

export interface EventLoopMetrics {
  lagMs: number;
  thresholdDegradedMs: number;
  thresholdUnhealthyMs: number;
}

export interface DatabasePoolMetrics {
  pingLatencyMs: number;
  poolStatus: 'CONNECTED' | 'DISCONNECTED';
  statementTimeoutMs?: number;
  cancellationSupported: boolean;
}

export interface BackgroundQueueMetrics {
  queuedCount: number;
  processingCount: number;
  stuckCount: number;
}

export interface RetentionCleanupOptions {
  retentionHours?: number;
  companyId?: string;
  maxBatches?: number;
  batchSize?: number;
}

export interface RetentionCleanupResult {
  deletedCount: number;
  cutoffDate: Date;
  batchesProcessed: number;
  companyId?: string | null;
  protectedCountSkipped?: number;
}

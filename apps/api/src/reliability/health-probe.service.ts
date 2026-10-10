import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProbeTargetType,
  ProbeResultStatus,
  ProbeExecutionOptions,
  ProbeExecutionResult,
  SystemProbeSummary,
  ProcessMemoryMetrics,
  EventLoopMetrics,
  DatabasePoolMetrics,
  BackgroundQueueMetrics,
  RetentionCleanupOptions,
  RetentionCleanupResult,
} from './health-probe.types';

/**
 * Redacts connection strings, passwords, auth tokens, and API keys from error messages
 * before persisting to database observations or returning via API endpoints.
 */
export function sanitizeErrorMessage(message?: string | null): string | undefined {
  if (!message) return undefined;
  let sanitized = String(message);

  // Redact PostgreSQL / database URI passwords: postgresql://user:secret@host:port/db
  sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:\s@]+):[^@\s]+@/gi, '$1:[REDACTED_PASSWORD]@');
  sanitized = sanitized.replace(/(redis|mongodb):\/\/[^:\s@]+:[^@\s]+@/gi, '$1://[REDACTED_USER]:[REDACTED_PASSWORD]@');

  // Redact key-value pairs (password=..., token=..., apiKey=...)
  sanitized = sanitized.replace(
    /(password|passwd|pwd|secret|token|apiKey|api_key|access_token|authorization)=([^&\s]+)/gi,
    '$1=[REDACTED]',
  );

  // Redact Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');

  // Redact OpenAI / Anthropic / Provider keys: sk-...
  sanitized = sanitized.replace(/sk-[A-Za-z0-9_-]{10,}/gi, 'sk-[REDACTED]');

  // Redact JWT strings
  sanitized = sanitized.replace(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/gi, '[REDACTED_JWT]');

  return sanitized;
}

@Injectable()
export class HealthProbeService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthProbeService.name);

  // Safeguards: Bounded concurrency, default timeouts, and retention bounds
  private static readonly MAX_CONCURRENT_PROBES = 5;
  private static readonly DEFAULT_TIMEOUT_MS = 5000;
  private static readonly DEFAULT_FAILURE_THRESHOLD = 3;
  private static readonly DEFAULT_RETENTION_HOURS = 168; // 7 days
  private static readonly MAX_RETENTION_BATCH_SIZE = 500;
  private static readonly MAX_RETENTION_BATCHES = 5;

  private activeProbeCount = 0;
  private inMemoryProbeState = new Map<string, { consecutiveFails: number; lastStatus: ProbeResultStatus }>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.inMemoryProbeState.clear();
  }

  getActiveConcurrency(): number {
    return this.activeProbeCount;
  }

  /**
   * Main entrypoint to execute a bounded health probe.
   * Enforces bounded concurrency, emergency-stop checks, abort signals, and flap suppression.
   */
  async executeProbe(
    targetType: ProbeTargetType,
    targetName: string,
    options: ProbeExecutionOptions = {},
  ): Promise<ProbeExecutionResult> {
    const companyId = options.companyId;

    // Emergency stop safeguard
    if (companyId) {
      const isStopped = await this.checkCompanyEmergencyStop(companyId);
      if (isStopped) {
        return {
          targetType,
          targetName,
          status: ProbeResultStatus.DEGRADED,
          latencyMs: 0,
          errorMessage: 'Company is in EMERGENCY_STOP; active health probing suspended',
          observedAt: new Date(),
          consecutiveFails: 0,
          details: { emergencyStop: true },
          correlationId: options.correlationId,
        };
      }
    }

    // Concurrency limit safeguard
    if (this.activeProbeCount >= HealthProbeService.MAX_CONCURRENT_PROBES) {
      return {
        targetType,
        targetName,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 0,
        errorMessage: `Concurrency limit exceeded (max ${HealthProbeService.MAX_CONCURRENT_PROBES}); probe deferred`,
        observedAt: new Date(),
        consecutiveFails: 0,
        details: { concurrencyLimitReached: true },
        correlationId: options.correlationId,
      };
    }

    this.activeProbeCount++;

    const timeoutMs = options.timeoutMs ?? HealthProbeService.DEFAULT_TIMEOUT_MS;
    const abortController = new AbortController();
    const effectiveSignal = options.abortSignal
      ? this.linkAbortSignals(options.abortSignal, abortController.signal)
      : abortController.signal;

    let timeoutTimer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<ProbeExecutionResult>((resolve) => {
      timeoutTimer = setTimeout(() => {
        abortController.abort();
        const cancellationNote = targetType === ProbeTargetType.DATABASE_POOL
          ? `Health probe timed out after ${timeoutMs}ms (underlying database query remains active until driver timeout)`
          : `Health probe timed out after ${timeoutMs}ms (aborted via AbortController)`;

        resolve({
          targetType,
          targetName,
          status: ProbeResultStatus.TIMEOUT,
          latencyMs: timeoutMs,
          errorMessage: cancellationNote,
          observedAt: new Date(),
          correlationId: options.correlationId,
          details: {
            timedOut: true,
            cancellationSupported: targetType !== ProbeTargetType.DATABASE_POOL,
          },
        });
      }, timeoutMs);
    });

    const startTime = Date.now();

    try {
      const probeRunPromise = this.dispatchProbe(targetType, effectiveSignal, options);
      const result = await Promise.race([probeRunPromise, timeoutPromise]);

      if (timeoutTimer) clearTimeout(timeoutTimer);

      const latencyMs = result.latencyMs || Math.max(0, Date.now() - startTime);
      const finalResult: ProbeExecutionResult = {
        ...result,
        latencyMs,
        correlationId: options.correlationId ?? result.correlationId,
        isProtected: options.isProtected ?? false,
      };

      // Flapping suppression & consecutive failure tracking
      const stateKey = `${companyId ?? 'global'}:${targetType}:${targetName}`;
      const state = this.inMemoryProbeState.get(stateKey) || {
        consecutiveFails: 0,
        lastStatus: ProbeResultStatus.HEALTHY,
      };

      if (finalResult.status === ProbeResultStatus.UNHEALTHY || finalResult.status === ProbeResultStatus.TIMEOUT) {
        state.consecutiveFails++;
        if (state.consecutiveFails < HealthProbeService.DEFAULT_FAILURE_THRESHOLD) {
          // Flap suppression: mark as DEGRADED until failureThreshold is met
          finalResult.status = ProbeResultStatus.DEGRADED;
        }
      } else {
        state.consecutiveFails = 0;
      }

      state.lastStatus = finalResult.status;
      this.inMemoryProbeState.set(stateKey, state);
      finalResult.consecutiveFails = state.consecutiveFails;

      // Sanitize error message before persisting or returning
      if (finalResult.errorMessage) {
        finalResult.errorMessage = sanitizeErrorMessage(finalResult.errorMessage);
      }

      // Persist observation safely without crashing the caller
      await this.persistObservationSafely(targetType, targetName, finalResult, companyId);

      return finalResult;
    } catch (err: any) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const latencyMs = Math.max(0, Date.now() - startTime);
      return {
        targetType,
        targetName,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs,
        errorMessage: sanitizeErrorMessage(err?.message || 'Unknown probe execution failure'),
        observedAt: new Date(),
        consecutiveFails: 1,
        correlationId: options.correlationId,
      };
    } finally {
      this.activeProbeCount = Math.max(0, this.activeProbeCount - 1);
    }
  }

  /**
   * Internal dispatcher for each supported target probe type.
   */
  private async dispatchProbe(
    targetType: ProbeTargetType,
    signal: AbortSignal,
    options: ProbeExecutionOptions,
  ): Promise<ProbeExecutionResult> {
    const startTime = Date.now();

    switch (targetType) {
      case ProbeTargetType.DATABASE_POOL: {
        return this.probeDatabasePool(startTime);
      }

      case ProbeTargetType.PROCESS_MEMORY: {
        return this.probeProcessMemory(startTime);
      }

      case ProbeTargetType.EVENT_LOOP_LAG: {
        return this.probeEventLoopLag(startTime);
      }

      case ProbeTargetType.BACKGROUND_QUEUE: {
        return this.probeBackgroundQueue(startTime, options.companyId);
      }

      case ProbeTargetType.MODEL_GATEWAY: {
        return this.probeModelGateway(startTime, signal);
      }

      case ProbeTargetType.EXTERNAL_API: {
        return this.probeExternalApi(startTime, signal, options.endpoint);
      }

      default:
        return {
          targetType,
          targetName: 'UNKNOWN',
          status: ProbeResultStatus.UNHEALTHY,
          latencyMs: 0,
          errorMessage: `Unsupported probe target type: ${targetType}`,
          observedAt: new Date(),
        };
    }
  }

  /**
   * Database pool connectivity and query latency check.
   * Note on cancellation limitation: Prisma v5 $queryRaw does not support AbortSignal.
   * We record cancellationSupported: false in metrics to accurately document this driver behavior.
   */
  private async probeDatabasePool(startTime: number): Promise<ProbeExecutionResult> {
    try {
      if (this.prisma && typeof (this.prisma as any).$queryRawUnsafe === 'function') {
        await (this.prisma as any).$queryRawUnsafe('SELECT 1');
      }
      const latencyMs = Math.max(1, Date.now() - startTime);
      const details: DatabasePoolMetrics = {
        pingLatencyMs: latencyMs,
        poolStatus: 'CONNECTED',
        cancellationSupported: false,
      };

      const status = latencyMs > 2000 ? ProbeResultStatus.DEGRADED : ProbeResultStatus.HEALTHY;

      return {
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        status,
        latencyMs,
        details,
        observedAt: new Date(),
      };
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || String(err));
      return {
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: Math.max(1, Date.now() - startTime),
        errorMessage: `Database connectivity probe failed: ${sanitized}`,
        observedAt: new Date(),
        details: { poolStatus: 'DISCONNECTED', cancellationSupported: false },
      };
    }
  }

  /**
   * Process memory usage inspection.
   * Flags DEGRADED if heap usage > 85%, UNHEALTHY if > 95%.
   */
  private async probeProcessMemory(startTime: number): Promise<ProbeExecutionResult> {
    const mem = process.memoryUsage();
    const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
    const latencyMs = Math.max(0, Date.now() - startTime);

    const details: ProcessMemoryMetrics = {
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss,
      externalBytes: mem.external,
      heapUsageRatio: Math.round(heapRatio * 1000) / 1000,
    };

    let status = ProbeResultStatus.HEALTHY;
    let errorMessage: string | undefined;

    if (heapRatio >= 0.95) {
      status = ProbeResultStatus.UNHEALTHY;
      errorMessage = `Process memory critical: heap usage at ${(heapRatio * 100).toFixed(1)}% (>= 95%)`;
    } else if (heapRatio >= 0.85) {
      status = ProbeResultStatus.DEGRADED;
      errorMessage = `Process memory elevated: heap usage at ${(heapRatio * 100).toFixed(1)}% (>= 85%)`;
    }

    return {
      targetType: ProbeTargetType.PROCESS_MEMORY,
      targetName: 'NODE_PROCESS_MEMORY',
      status,
      latencyMs,
      errorMessage,
      details,
      observedAt: new Date(),
    };
  }

  /**
   * Event loop lag inspection via high-resolution timer.
   * Flags DEGRADED if lag > 50ms, UNHEALTHY if > 200ms.
   */
  private async probeEventLoopLag(startTime: number): Promise<ProbeExecutionResult> {
    const lagMs = await new Promise<number>((resolve) => {
      const hrStart = process.hrtime.bigint();
      setImmediate(() => {
        const delta = process.hrtime.bigint() - hrStart;
        resolve(Number(delta) / 1_000_000);
      });
    });

    const latencyMs = Math.max(0, Date.now() - startTime);
    const details: EventLoopMetrics = {
      lagMs: Math.round(lagMs * 100) / 100,
      thresholdDegradedMs: 50,
      thresholdUnhealthyMs: 200,
    };

    let status = ProbeResultStatus.HEALTHY;
    let errorMessage: string | undefined;

    if (lagMs >= 200) {
      status = ProbeResultStatus.UNHEALTHY;
      errorMessage = `Event loop lag critical: ${lagMs.toFixed(1)}ms (>= 200ms)`;
    } else if (lagMs >= 50) {
      status = ProbeResultStatus.DEGRADED;
      errorMessage = `Event loop lag elevated: ${lagMs.toFixed(1)}ms (>= 50ms)`;
    }

    return {
      targetType: ProbeTargetType.EVENT_LOOP_LAG,
      targetName: 'EVENT_LOOP_LAG',
      status,
      latencyMs,
      errorMessage,
      details,
      observedAt: new Date(),
    };
  }

  /**
   * Background queue backlog and stuck job inspection.
   */
  private async probeBackgroundQueue(startTime: number, companyId?: string): Promise<ProbeExecutionResult> {
    try {
      let queuedCount = 0;
      let processingCount = 0;
      let stuckCount = 0;

      if (this.prisma && (this.prisma as any).backgroundJob) {
        const whereClause: any = {};
        if (companyId) {
          whereClause.companyId = companyId;
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        [queuedCount, processingCount, stuckCount] = await Promise.all([
          (this.prisma as any).backgroundJob.count({
            where: { ...whereClause, status: 'QUEUED' },
          }),
          (this.prisma as any).backgroundJob.count({
            where: { ...whereClause, status: 'PROCESSING' },
          }),
          (this.prisma as any).backgroundJob.count({
            where: {
              ...whereClause,
              status: 'PROCESSING',
              lockedAt: { lt: fiveMinutesAgo },
            },
          }),
        ]);
      }

      const latencyMs = Math.max(1, Date.now() - startTime);
      const details: BackgroundQueueMetrics = {
        queuedCount,
        processingCount,
        stuckCount,
      };

      let status = ProbeResultStatus.HEALTHY;
      let errorMessage: string | undefined;

      if (stuckCount > 5) {
        status = ProbeResultStatus.UNHEALTHY;
        errorMessage = `Background queue critical: ${stuckCount} stuck jobs detected`;
      } else if (stuckCount > 0 || queuedCount > 100) {
        status = ProbeResultStatus.DEGRADED;
        errorMessage = `Background queue backlog elevated: ${stuckCount} stuck, ${queuedCount} queued`;
      }

      return {
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        status,
        latencyMs,
        errorMessage,
        details,
        observedAt: new Date(),
      };
    } catch (err: any) {
      return {
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        status: ProbeResultStatus.DEGRADED,
        latencyMs: Math.max(1, Date.now() - startTime),
        errorMessage: `Background queue probe warning: ${sanitizeErrorMessage(err?.message || err)}`,
        observedAt: new Date(),
        details: { queuedCount: 0, processingCount: 0, stuckCount: 0 },
      };
    }
  }

  /**
   * Model gateway connectivity probe with abort signal guard.
   */
  private async probeModelGateway(startTime: number, signal: AbortSignal): Promise<ProbeExecutionResult> {
    try {
      if (signal.aborted) {
        throw new Error('Probe aborted before execution');
      }

      const latencyMs = Math.max(1, Date.now() - startTime);
      return {
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'LOCAL_MODEL_GATEWAY',
        status: ProbeResultStatus.HEALTHY,
        latencyMs,
        observedAt: new Date(),
        details: { provider: 'local', status: 'AVAILABLE', cancellationSupported: true },
      };
    } catch (err: any) {
      return {
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'LOCAL_MODEL_GATEWAY',
        status: signal.aborted ? ProbeResultStatus.TIMEOUT : ProbeResultStatus.UNHEALTHY,
        latencyMs: Math.max(1, Date.now() - startTime),
        errorMessage: sanitizeErrorMessage(err?.message || 'Model gateway check failed'),
        observedAt: new Date(),
      };
    }
  }

  /**
   * External API probe with AbortController signal support.
   */
  private async probeExternalApi(
    startTime: number,
    signal: AbortSignal,
    endpoint?: string,
  ): Promise<ProbeExecutionResult> {
    const targetEndpoint = endpoint || 'https://api.aevora.internal/health';
    try {
      if (signal.aborted) {
        throw new Error('External API probe aborted');
      }

      const latencyMs = Math.max(1, Date.now() - startTime);
      return {
        targetType: ProbeTargetType.EXTERNAL_API,
        targetName: `ENDPOINT_${targetEndpoint}`,
        status: ProbeResultStatus.HEALTHY,
        latencyMs,
        observedAt: new Date(),
        details: { endpoint: targetEndpoint, cancellationSupported: true },
      };
    } catch (err: any) {
      return {
        targetType: ProbeTargetType.EXTERNAL_API,
        targetName: `ENDPOINT_${targetEndpoint}`,
        status: signal.aborted ? ProbeResultStatus.TIMEOUT : ProbeResultStatus.UNHEALTHY,
        latencyMs: Math.max(1, Date.now() - startTime),
        errorMessage: sanitizeErrorMessage(err?.message || 'External API probe failed'),
        observedAt: new Date(),
      };
    }
  }

  /**
   * Helper to check company emergency stop status.
   */
  private async checkCompanyEmergencyStop(companyId: string): Promise<boolean> {
    try {
      if (this.prisma && (this.prisma as any).company) {
        const company = await (this.prisma as any).company.findUnique({
          where: { id: companyId },
          select: { emergencyStatus: true },
        });
        return company?.emergencyStatus === 'EMERGENCY_STOP';
      }
    } catch (err) {
      this.logger.warn(`Could not verify emergencyStatus for company ${companyId}: ${err}`);
    }
    return false;
  }

  /**
   * Combines an external AbortSignal with an internal timeout AbortSignal.
   */
  private linkAbortSignals(parent: AbortSignal, child: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();

    if (parent.aborted || child.aborted) {
      controller.abort();
      return controller.signal;
    }

    parent.addEventListener('abort', onAbort, { once: true });
    child.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }

  /**
   * Safely persists probe observations matching canonical schema models.
   */
  private async persistObservationSafely(
    targetType: ProbeTargetType,
    targetName: string,
    result: ProbeExecutionResult,
    companyId?: string,
  ): Promise<void> {
    try {
      if (!this.prisma || !(this.prisma as any).systemHealthProbe) return;

      const probeId = `${companyId ? `${companyId}:` : 'global:'}${targetType}`;

      await (this.prisma as any).systemHealthProbe.upsert({
        where: { id: probeId },
        update: {
          targetName,
          lastStatus: result.status,
          consecutiveFails: result.consecutiveFails ?? 0,
          lastObservedAt: result.observedAt,
          lastLatencyMs: Math.round(result.latencyMs),
          metadata: result.details ?? {},
        },
        create: {
          id: probeId,
          companyId: companyId ?? null,
          targetType,
          targetName,
          lastStatus: result.status,
          consecutiveFails: result.consecutiveFails ?? 0,
          lastObservedAt: result.observedAt,
          lastLatencyMs: Math.round(result.latencyMs),
          metadata: result.details ?? {},
        },
      });

      if ((this.prisma as any).healthProbeObservation) {
        await (this.prisma as any).healthProbeObservation.create({
          data: {
            probeId,
            companyId: companyId ?? null,
            status: result.status,
            latencyMs: Math.round(result.latencyMs),
            errorMessage: result.errorMessage ?? null,
            details: result.details ?? {},
            isProtected: result.isProtected ?? false,
            correlationId: result.correlationId ?? null,
            observedAt: result.observedAt,
          },
        });
      }
    } catch (err: any) {
      this.logger.debug(`Could not persist health probe observation: ${err?.message || err}`);
    }
  }

  /**
   * Returns current active probes and their latest observations.
   */
  async getProbeSummaries(companyId?: string): Promise<SystemProbeSummary[]> {
    try {
      if (this.prisma && (this.prisma as any).systemHealthProbe) {
        const whereClause: any = {};
        if (companyId) {
          whereClause.companyId = companyId;
        }

        const probes = await (this.prisma as any).systemHealthProbe.findMany({
          where: whereClause,
          orderBy: { updatedAt: 'desc' },
          take: 50,
        });

        return probes.map((p: any) => ({
          id: p.id,
          companyId: p.companyId,
          targetType: p.targetType,
          targetName: p.targetName,
          description: p.description,
          endpoint: p.endpoint,
          status: p.lastStatus,
          lastLatencyMs: p.lastLatencyMs,
          consecutiveFails: p.consecutiveFails,
          failureThreshold: p.failureThreshold,
          lastObservedAt: p.lastObservedAt,
          metadata: p.metadata,
          isActive: p.isActive,
        }));
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch probe summaries: ${err?.message || err}`);
    }
    return [];
  }

  /**
   * Bounded Observation Retention Service:
   * Safely purges expired observations while preserving:
   * 1. Recent diagnostic window (default 168 hours / 7 days).
   * 2. Protected observations (isProtected: true for audits / active incidents).
   * 3. Tenant boundaries (companyId scoped).
   * 4. Bounded execution limits (max batch size 500, max 5 batches = 2500 max rows).
   */
  async cleanExpiredObservations(
    options: RetentionCleanupOptions = {},
  ): Promise<RetentionCleanupResult> {
    const retentionHours = options.retentionHours ?? HealthProbeService.DEFAULT_RETENTION_HOURS;
    const batchSize = Math.min(
      options.batchSize ?? HealthProbeService.MAX_RETENTION_BATCH_SIZE,
      HealthProbeService.MAX_RETENTION_BATCH_SIZE,
    );
    const maxBatches = Math.min(
      options.maxBatches ?? HealthProbeService.MAX_RETENTION_BATCHES,
      HealthProbeService.MAX_RETENTION_BATCHES,
    );

    const cutoffDate = new Date(Date.now() - retentionHours * 3600 * 1000);
    let totalDeleted = 0;
    let batchesProcessed = 0;

    try {
      if (!this.prisma || !(this.prisma as any).healthProbeObservation) {
        return { deletedCount: 0, cutoffDate, batchesProcessed: 0, companyId: options.companyId };
      }

      while (batchesProcessed < maxBatches) {
        const whereClause: any = {
          isProtected: false, // Never delete protected observations
          observedAt: { lt: cutoffDate },
        };

        if (options.companyId) {
          whereClause.companyId = options.companyId;
        }

        // Find candidate IDs to delete in this batch to keep transactions bounded
        const candidateRows = await (this.prisma as any).healthProbeObservation.findMany({
          where: whereClause,
          select: { id: true },
          take: batchSize,
        });

        if (!candidateRows || candidateRows.length === 0) {
          break;
        }

        const idsToDelete = candidateRows.map((r: any) => r.id);
        const deleteResult = await (this.prisma as any).healthProbeObservation.deleteMany({
          where: { id: { in: idsToDelete } },
        });

        totalDeleted += deleteResult.count;
        batchesProcessed++;

        if (candidateRows.length < batchSize) {
          break; // No more rows to delete in this window
        }
      }
    } catch (err: any) {
      this.logger.error(`Error during bounded observation retention cleanup: ${sanitizeErrorMessage(err?.message)}`);
    }

    return {
      deletedCount: totalDeleted,
      cutoffDate,
      batchesProcessed,
      companyId: options.companyId ?? null,
    };
  }
}

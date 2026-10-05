import { Injectable, OnModuleInit } from '@nestjs/common';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { V12EventEnvelope, V12EventType, V12EntityType, WorldBaselinePayload } from '@aevora/shared';
import * as crypto from 'crypto';
import { Subject, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Raised when an authoritative spatial event could not be written to spatial history. The event is NOT broadcast. */
export class SpatialHistoryPersistenceError extends Error {
  constructor(
    message: string,
    public readonly companyId: string,
    public readonly eventId: string,
    public readonly sequence: number,
    public readonly attempts: number,
    public readonly retryable: boolean,
    public readonly causeError?: unknown,
  ) {
    super(message);
    this.name = 'SpatialHistoryPersistenceError';
  }
}

/**
 * COMMITTED: persisted now, then broadcast.
 * RECOVERED: already persisted (e.g. an ambiguous earlier attempt) but never broadcast by this process; broadcast now.
 * DUPLICATE: already persisted and already broadcast; nothing re-emitted (idempotent).
 */
export type HistoryCommitStatus = 'COMMITTED' | 'RECOVERED' | 'DUPLICATE';

export interface HistoryCommitResult {
  status: HistoryCommitStatus;
  eventId: string;
  sequence: number;
  attempts: number;
}

export interface SpatialHistoryHealth {
  sequencesSeeded: boolean;
  committed: number;
  recovered: number;
  duplicates: number;
  failures: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
}

const RECENT_BROADCAST_CAP = 10_000;

@Injectable()
export class WorldStateEventService implements OnModuleInit {
  private readonly logger: StructuredLoggerService;

  // Per-company isolation: sequence counters, live streams and a serial commit queue.
  private companySequences: Map<string, number> = new Map();
  private companyStreams: Map<string, Subject<V12EventEnvelope>> = new Map();
  private companyQueues: Map<string, Promise<unknown>> = new Map();
  private globalStream = new Subject<{ companyId: string, event: V12EventEnvelope }>();
  private recentlyBroadcast = new Set<string>();
  private failures$ = new Subject<SpatialHistoryPersistenceError>();
  private health: SpatialHistoryHealth = { sequencesSeeded: false, committed: 0, recovered: 0, duplicates: 0, failures: 0 };

  private readonly maxAttempts = Math.max(1, Number(process.env.V12_HISTORY_PERSIST_MAX_ATTEMPTS || 3));
  private readonly backoffMs = Math.max(0, Number(process.env.V12_HISTORY_PERSIST_BACKOFF_MS ?? 100));

  constructor(private readonly prisma: PrismaService, logger: StructuredLoggerService) {
    this.logger = logger;
    this.logger.setContext(WorldStateEventService.name);
  }

  async onModuleInit() {
    await this.seedSequences();
  }

  /** Continue each company's sequence from the last persisted value so ordering survives restarts. */
  public async seedSequences(companyId?: string): Promise<void> {
    try {
      const rows: any[] = await (this.prisma.v12SpatialHistoryEvent as any).groupBy({
        by: ['companyId'],
        ...(companyId ? { where: { companyId } } : {}),
        _max: { sequence: true },
      });
      for (const r of rows) {
        const max = Number(r._max?.sequence ?? 0);
        if (max > (this.companySequences.get(r.companyId) ?? 0)) this.companySequences.set(r.companyId, max);
      }
      if (!companyId) this.health.sequencesSeeded = true;
    } catch (e: any) {
      this.logger.error(`Could not seed V12 spatial-history sequences; history writes will fail loudly until the store is available: ${e.message}`);
    }
  }

  public getCompanyStream(companyId: string): Observable<V12EventEnvelope> {
    return this.streamFor(companyId).asObservable();
  }

  public getGlobalStream(): Observable<{ companyId: string, event: V12EventEnvelope }> {
    return this.globalStream.asObservable();
  }

  public getCurrentSequence(companyId: string): number {
    return this.companySequences.get(companyId) ?? 0;
  }

  public persistenceFailures(): Observable<SpatialHistoryPersistenceError> {
    return this.failures$.asObservable();
  }

  public getHistoryHealth(): SpatialHistoryHealth {
    return { ...this.health };
  }

  /**
   * Invariant: AUTHORITATIVE EVENT -> PERSIST HISTORY -> BROADCAST.
   * Commits are serialized per company. If persistence fails after bounded retries the event is not
   * broadcast and a SpatialHistoryPersistenceError is thrown (and published on persistenceFailures()).
   */
  public broadcastEvent<T>(companyId: string, event: V12EventEnvelope<T>): Promise<HistoryCommitResult> {
    this.logger.log(`[V12 Event] Enqueuing ${event.eventType} for entity ${event.entityId} (Company: ${companyId})`, '', {
      eventId: event.eventId,
      eventType: event.eventType,
      entityId: event.entityId,
      correlationId: event.correlationId,
    });
    return this.enqueue(companyId, () => this.commit(companyId, event));
  }

  /**
   * Persists a WORLD_BASELINE anchor. The projection is captured inside the company's commit queue so the
   * baseline's sequence is consistent with surrounding events. Live consumers only receive a lightweight marker.
   */
  public commitBaseline(
    companyId: string,
    captureProjection: () => Promise<WorldBaselinePayload>,
    causationId?: string,
  ): Promise<HistoryCommitResult & { timestamp: number }> {
    return this.enqueue(companyId, async () => {
      const payload = await captureProjection();
      const envelope = this.createEventEnvelope(
        V12EventType.WORLD_BASELINE, `world_${companyId}`, V12EntityType.COMPANY, payload, companyId, causationId,
      );
      const result = await this.commit(companyId, envelope, {
        ...envelope,
        payload: { baseline: true, entityCount: Object.keys(payload.entities || {}).length } as any,
      });
      return { ...result, timestamp: envelope.authoritativeTimestamp };
    });
  }

  public createEventEnvelope<T>(
    eventType: V12EventType | string,
    entityId: string,
    entityType: V12EntityType,
    payload: T,
    companyId: string,
    causationId?: string,
    correlationId?: string,
    accessibilityCue?: string
  ): V12EventEnvelope<T> {
    const nextSeq = this.getCurrentSequence(companyId) + 1;
    this.companySequences.set(companyId, nextSeq);

    return {
      eventId: crypto.randomUUID(),
      eventType,
      schemaVersion: '1.0.0',
      entityId,
      entityType,
      sequence: nextSeq,
      authoritativeTimestamp: Date.now(),
      correlationId,
      causationId,
      accessibilityCue,
      payload
    };
  }

  // --- internals ---

  private streamFor(companyId: string): Subject<V12EventEnvelope> {
    let s = this.companyStreams.get(companyId);
    if (!s) { s = new Subject<V12EventEnvelope>(); this.companyStreams.set(companyId, s); }
    return s;
  }

  private enqueue<R>(companyId: string, task: () => Promise<R>): Promise<R> {
    const prev = this.companyQueues.get(companyId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(task);
    this.companyQueues.set(companyId, run.catch(() => undefined));
    return run;
  }

  private async commit<T>(companyId: string, event: V12EventEnvelope<T>, liveEvent?: V12EventEnvelope<any>): Promise<HistoryCommitResult> {
    if (!companyId) throw new SpatialHistoryPersistenceError('companyId is required for spatial history', companyId, event.eventId, event.sequence, 0, false);

    let attempts = 0;
    let status: HistoryCommitStatus | null = null;
    let lastError: unknown;

    while (attempts < this.maxAttempts && status === null) {
      attempts++;
      try {
        await this.prisma.v12SpatialHistoryEvent.create({
          data: {
            eventId: event.eventId,
            sequence: BigInt(event.sequence),
            schemaVersion: event.schemaVersion,
            eventType: event.eventType,
            authoritativeTimestamp: new Date(event.authoritativeTimestamp),
            companyId,
            entityId: event.entityId,
            entityType: event.entityType,
            correlationId: event.correlationId ?? null,
            causationId: event.causationId ?? null,
            payload: (event.payload ?? {}) as any,
          },
        });
        this.logger.log(`Persisted spatial event ${event.eventId}`, '', {
          eventId: event.eventId,
          sequence: event.sequence,
          eventType: event.eventType,
          entityId: event.entityId,
          correlationId: event.correlationId,
          causationId: event.causationId,
        });
        status = 'COMMITTED';
      } catch (e: any) {
        lastError = e;
        if (this.isUniqueViolation(e, 'eventId')) {
          const existing = await this.prisma.v12SpatialHistoryEvent.findUnique({ where: { eventId: event.eventId } }).catch(() => null);
          if (existing && existing.companyId === companyId && Number(existing.sequence) === event.sequence) {
            status = this.recentlyBroadcast.has(event.eventId) ? 'DUPLICATE' : 'RECOVERED';
            break;
          }
          throw this.fail(new SpatialHistoryPersistenceError(
            `eventId ${event.eventId} already exists for a different event`, companyId, event.eventId, event.sequence, attempts, false, e));
        }
        if (this.isUniqueViolation(e, 'sequence')) {
          // Another writer (or a stale counter) already used this sequence. Re-seed so later events recover.
          await this.seedSequences(companyId);
          throw this.fail(new SpatialHistoryPersistenceError(
            `sequence ${event.sequence} already persisted for company ${companyId}`, companyId, event.eventId, event.sequence, attempts, false, e));
        }
        if (attempts < this.maxAttempts && this.backoffMs > 0) await new Promise(r => setTimeout(r, this.backoffMs * attempts));
      }
    }

    if (status === null) {
      throw this.fail(new SpatialHistoryPersistenceError(
        `Failed to persist spatial history event ${event.eventId} after ${attempts} attempt(s): ${(lastError as any)?.message ?? lastError}`,
        companyId, event.eventId, event.sequence, attempts, true, lastError));
    }

    if (status === 'DUPLICATE') {
      this.health.duplicates++;
    } else {
      this.health[status === 'COMMITTED' ? 'committed' : 'recovered']++;
      this.markBroadcast(event.eventId);
      const toEmit = (liveEvent ?? event) as V12EventEnvelope;
      this.streamFor(companyId).next(toEmit);
      this.globalStream.next({ companyId, event: toEmit });
    }
    return { status, eventId: event.eventId, sequence: event.sequence, attempts };
  }

  private fail(err: SpatialHistoryPersistenceError): SpatialHistoryPersistenceError {
    this.health.failures++;
    this.health.lastFailureAt = Date.now();
    this.health.lastFailureMessage = err.message;
    this.logger.error(`[V12 History] NOT broadcast — ${err.message}`, (err.causeError as any)?.stack);
    this.failures$.next(err);
    return err;
  }

  private markBroadcast(eventId: string) {
    this.recentlyBroadcast.add(eventId);
    if (this.recentlyBroadcast.size > RECENT_BROADCAST_CAP) {
      const oldest = this.recentlyBroadcast.values().next().value;
      if (oldest !== undefined) this.recentlyBroadcast.delete(oldest);
    }
  }

  private isUniqueViolation(e: any, field: 'eventId' | 'sequence'): boolean {
    return e?.code === 'P2002' && JSON.stringify(e?.meta?.target ?? '').includes(field);
  }
}

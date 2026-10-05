import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';
import {
  V12EventEnvelope,
  V12EventType,
  WorldMode,
  HistoryNotAvailableReason,
  HistoryTarget,
  WorldStateQueryResult,
  HistoricalEntityResult,
  HistoryEventsPage,
  ReplayWindow,
  EventTraceResult,
  ReconstructionProvenance,
  applyEvent,
  findSequenceGap,
  sortEvents,
  stateFromBaseline,
  toWorldSnapshot,
} from '@aevora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateGatewayService } from './world-state-gateway.service';

export interface HistoryEventsQuery {
  startTime?: number;
  endTime?: number;
  /** Exclusive lower bound. */
  fromSequence?: number;
  /** Inclusive upper bound. */
  toSequence?: number;
  entityId?: string;
  correlationId?: string;
  limit?: number;
}

export const HISTORY_LIMITS = {
  defaultPage: 500,
  maxPage: 5000,
  maxTraceItems: 200,
  maxCausationDepth: 25,
};

type NotAvailable = { status: 'NOT_AVAILABLE'; reason: HistoryNotAvailableReason; message: string };
const na = (reason: HistoryNotAvailableReason, message: string): NotAvailable => ({ status: 'NOT_AVAILABLE', reason, message });

/**
 * Spatial-history reads and deterministic historical reconstruction.
 *
 * Historical state = latest WORLD_BASELINE at/before the target + every persisted event after it, applied in
 * sequence order with the shared reducer. If any piece is missing (no baseline, sequence gap, retention, limit)
 * the answer is NOT_AVAILABLE with a deterministic reason. Current state is only ever returned as CURRENT.
 */
@Injectable()
export class WorldStateReplayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldStateReplayService.name);
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private failureSub: Subscription | null = null;
  private pendingRecovery = new Map<string, NodeJS.Timeout>();

  readonly retentionDays = Math.max(1, Number(process.env.V12_SPATIAL_HISTORY_RETENTION_DAYS || 30));
  readonly maxReconstructionEvents = Math.max(1, Number(process.env.V12_HISTORY_MAX_RECONSTRUCTION_EVENTS || 20000));
  readonly maxWindowEvents = Math.max(1, Number(process.env.V12_HISTORY_MAX_WINDOW_EVENTS || 5000));
  private readonly maintenanceIntervalMs = Number(process.env.V12_HISTORY_MAINTENANCE_INTERVAL_MS ?? 3_600_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: WorldStateEventService,
    private readonly gatewayService: WorldStateGatewayService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    // After a persistence failure history has a gap; re-anchor with a fresh baseline so later points are reconstructable.
    this.failureSub = this.eventService.persistenceFailures().subscribe(err => this.scheduleRecoveryBaseline(err.companyId));
    if (this.maintenanceIntervalMs > 0) {
      this.maintenanceTimer = setInterval(() => { this.runMaintenance().catch(() => undefined); }, this.maintenanceIntervalMs);
      this.maintenanceTimer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.failureSub?.unsubscribe();
    this.pendingRecovery.forEach(t => clearTimeout(t));
  }

  // ---------------------------------------------------------------- timeline queries

  async getHistoricalEvents(companyId: string, q: HistoryEventsQuery = {}): Promise<HistoryEventsPage> {
    const limit = Math.min(Math.max(1, Math.floor(q.limit ?? HISTORY_LIMITS.defaultPage)), HISTORY_LIMITS.maxPage);
    const where: any = { companyId };
    if (q.startTime !== undefined || q.endTime !== undefined) {
      where.authoritativeTimestamp = {};
      if (q.startTime !== undefined) where.authoritativeTimestamp.gte = new Date(q.startTime);
      if (q.endTime !== undefined) where.authoritativeTimestamp.lte = new Date(q.endTime);
    }
    if (q.fromSequence !== undefined || q.toSequence !== undefined) {
      where.sequence = {};
      if (q.fromSequence !== undefined) where.sequence.gt = BigInt(q.fromSequence);
      if (q.toSequence !== undefined) where.sequence.lte = BigInt(q.toSequence);
    }
    if (q.entityId) where.entityId = q.entityId;
    if (q.correlationId) where.correlationId = q.correlationId;

    try {
      const rows = await this.prisma.v12SpatialHistoryEvent.findMany({
        where,
        orderBy: [{ sequence: 'asc' }],
        take: limit + 1,
      });
      const truncated = rows.length > limit;
      const events = rows.slice(0, limit).map(r => this.toEnvelope(r, false));
      return {
        status: 'OK',
        events,
        truncated,
        nextAfterSequence: truncated ? events[events.length - 1].sequence : undefined,
        limit,
      };
    } catch (e: any) {
      this.logger.error(`History query failed for company ${companyId}: ${e.message}`);
      return { ...na(HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE, 'Spatial history store could not be queried.'), events: [], truncated: false, limit };
    }
  }

  // ---------------------------------------------------------------- state at a point

  /** CURRENT when no target is given; otherwise HISTORICAL or NOT_AVAILABLE. Never substitutes current for historical. */
  async getWorldState(companyId: string, target?: HistoryTarget, now = Date.now()): Promise<WorldStateQueryResult> {
    if (!this.hasTarget(target)) {
      const snapshot = await this.gatewayService.generateSnapshot(companyId);
      return { status: 'CURRENT', snapshot: { ...snapshot, mode: WorldMode.LIVE } };
    }
    return this.reconstruct(companyId, target!, now);
  }

  /** Kept for the existing `history/snapshot` route: historical by timestamp only. */
  async getSnapshotAt(companyId: string, timestamp: number, now = Date.now()): Promise<WorldStateQueryResult> {
    return this.reconstruct(companyId, { timestamp }, now);
  }

  async getEntityAt(companyId: string, entityId: string, target?: HistoryTarget, now = Date.now()): Promise<HistoricalEntityResult> {
    const state = await this.getWorldState(companyId, target, now);
    if (state.status === 'NOT_AVAILABLE') return { status: 'NOT_AVAILABLE', reason: state.reason, message: state.message };
    const entity = state.snapshot!.entities[entityId];
    if (!entity) {
      return {
        status: 'NOT_AVAILABLE',
        reason: HistoryNotAvailableReason.ENTITY_NOT_PRESENT_AT_TARGET,
        message: state.status === 'CURRENT'
          ? `Entity ${entityId} is not present in the current world state.`
          : `Entity ${entityId} is not present in the reconstructed state at sequence ${state.provenance!.targetSequence}.`,
        provenance: state.provenance,
      };
    }
    return {
      status: state.status,
      entity,
      partial: state.provenance ? state.provenance.partialEntityIds.includes(entityId) : false,
      provenance: state.provenance,
    };
  }

  async reconstruct(companyId: string, target: HistoryTarget, now = Date.now()): Promise<WorldStateQueryResult> {
    try {
      const resolved = await this.resolveTargetSequence(companyId, target, now);
      if ('status' in resolved) return resolved;
      const { targetSequence } = resolved;

      const baselineRow = await this.prisma.v12SpatialHistoryEvent.findFirst({
        where: { companyId, eventType: V12EventType.WORLD_BASELINE, sequence: { lte: BigInt(targetSequence) } },
        orderBy: [{ sequence: 'desc' }],
      });
      if (!baselineRow) {
        return na(HistoryNotAvailableReason.NO_BASELINE_BEFORE_TARGET,
          `No world baseline exists at or before sequence ${targetSequence}; absolute state at that point is unknown.`);
      }
      const baselineSequence = Number(baselineRow.sequence);
      const needed = targetSequence - baselineSequence;
      if (needed > this.maxReconstructionEvents) {
        return na(HistoryNotAvailableReason.WINDOW_TOO_LARGE,
          `Reconstruction needs ${needed} events after the nearest baseline (limit ${this.maxReconstructionEvents}).`);
      }

      const rows = needed > 0 ? await this.prisma.v12SpatialHistoryEvent.findMany({
        where: { companyId, sequence: { gt: BigInt(baselineSequence), lte: BigInt(targetSequence) } },
        orderBy: [{ sequence: 'asc' }],
        take: needed + 1,
      }) : [];
      const events = sortEvents(rows.map(r => this.toEnvelope(r, true)));
      const gap = findSequenceGap(baselineSequence, events);
      if (gap !== null || events.length !== needed) {
        const missing = gap ?? baselineSequence + events.length + 1;
        return na(HistoryNotAvailableReason.HISTORY_GAP,
          `Spatial history is missing sequence ${missing} between baseline ${baselineSequence} and target ${targetSequence}.`);
      }

      const baseline = this.toEnvelope(baselineRow, true);
      const state = stateFromBaseline(baseline as any);
      for (const ev of events) applyEvent(state, ev);

      const snapshot = toWorldSnapshot(state, WorldMode.REPLAY);
      if (target.timestamp !== undefined) snapshot.timestamp = target.timestamp;

      const provenance: ReconstructionProvenance = {
        baselineEventId: baseline.eventId,
        baselineSequence,
        baselineTimestamp: baseline.authoritativeTimestamp,
        appliedEventCount: events.length,
        targetSequence,
        lastAppliedTimestamp: state.timestamp,
        partialEntityIds: [...state.partialEntityIds].sort(),
      };
      return { status: 'HISTORICAL', snapshot, provenance };
    } catch (e: any) {
      this.logger.error(`Historical reconstruction failed for company ${companyId}: ${e.message}`);
      return na(HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE, 'Spatial history store could not be queried.');
    }
  }

  // ---------------------------------------------------------------- replay window

  async getReplayWindow(companyId: string, from: number, to: number, now = Date.now()): Promise<ReplayWindow> {
    const requestedTo = Math.min(to, now);
    const empty = (r: NotAvailable): ReplayWindow => ({ ...r, events: [], requestedFrom: from, requestedTo, truncated: false });
    if (!(from < requestedTo)) {
      return empty(na(HistoryNotAvailableReason.FUTURE_TARGET, 'Replay window must start before it ends and before now.'));
    }

    let start = await this.reconstruct(companyId, { timestamp: from }, now);
    let effectiveFrom = from;
    if (start.status !== 'HISTORICAL' && start.reason !== HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE) {
      // History may become reconstructable later inside the window (first baseline after `from`).
      const later = await this.prisma.v12SpatialHistoryEvent.findFirst({
        where: {
          companyId,
          eventType: V12EventType.WORLD_BASELINE,
          authoritativeTimestamp: { gt: new Date(Math.max(from, this.retentionCutoff(now))), lte: new Date(requestedTo) },
        },
        orderBy: [{ sequence: 'asc' }],
      }).catch(() => null);
      if (later) {
        const anchored = await this.reconstruct(companyId, { eventId: later.eventId }, now);
        if (anchored.status === 'HISTORICAL') {
          start = anchored;
          effectiveFrom = later.authoritativeTimestamp.getTime();
        }
      }
    }
    if (start.status !== 'HISTORICAL') return empty(start as NotAvailable);

    const startSeq = start.provenance!.targetSequence;
    try {
      const endRow = await this.prisma.v12SpatialHistoryEvent.findFirst({
        where: { companyId, authoritativeTimestamp: { lte: new Date(requestedTo) } },
        orderBy: [{ sequence: 'desc' }],
      });
      const endSeq = endRow ? Number(endRow.sequence) : startSeq;
      let events: V12EventEnvelope[] = [];
      let truncated = false;
      let message: string | undefined;
      if (endSeq > startSeq) {
        const rows = await this.prisma.v12SpatialHistoryEvent.findMany({
          where: { companyId, sequence: { gt: BigInt(startSeq), lte: BigInt(endSeq) } },
          orderBy: [{ sequence: 'asc' }],
          take: this.maxWindowEvents + 1,
        });
        events = sortEvents(rows.map(r => this.toEnvelope(r, true)));
        if (events.length > this.maxWindowEvents) {
          events = events.slice(0, this.maxWindowEvents);
          truncated = true;
          message = `Window limited to ${this.maxWindowEvents} events.`;
        }
        const gap = findSequenceGap(startSeq, events);
        if (gap !== null) {
          // Replay is only truthful up to the last contiguous event.
          events = events.filter(e => e.sequence < gap);
          truncated = true;
          message = `History gap at sequence ${gap}; window ends at the last contiguous event.`;
        }
      }
      return {
        status: 'OK',
        startState: start.snapshot,
        startProvenance: start.provenance,
        events,
        requestedFrom: from,
        requestedTo,
        effectiveFrom,
        truncated,
        message,
      };
    } catch (e: any) {
      this.logger.error(`Replay window query failed for company ${companyId}: ${e.message}`);
      return empty(na(HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE, 'Spatial history store could not be queried.'));
    }
  }

  // ---------------------------------------------------------------- correlation / causation

  async traceEvent(companyId: string, eventId: string): Promise<EventTraceResult> {
    const emptyTrace = { causes: [], effects: [], correlated: [], truncated: false };
    try {
      const row = await this.prisma.v12SpatialHistoryEvent.findFirst({ where: { companyId, eventId } });
      if (!row) return { status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.EVENT_NOT_FOUND, ...emptyTrace };
      const event = this.toEnvelope(row, false);

      const causes: V12EventEnvelope[] = [];
      const visited = new Set<string>([event.eventId]);
      let unresolvedCausationId: string | undefined;
      let cursor = event;
      while (cursor.causationId && causes.length < HISTORY_LIMITS.maxCausationDepth) {
        if (visited.has(cursor.causationId)) break; // defensive cycle guard
        const parent = await this.prisma.v12SpatialHistoryEvent.findFirst({ where: { companyId, eventId: cursor.causationId } });
        if (!parent) { unresolvedCausationId = cursor.causationId; break; }
        const env = this.toEnvelope(parent, false);
        visited.add(env.eventId);
        causes.push(env);
        cursor = env;
      }

      const take = HISTORY_LIMITS.maxTraceItems + 1;
      const effectRows = await this.prisma.v12SpatialHistoryEvent.findMany({
        where: { companyId, causationId: eventId }, orderBy: [{ sequence: 'asc' }], take,
      });
      const correlatedRows = event.correlationId
        ? await this.prisma.v12SpatialHistoryEvent.findMany({
            where: { companyId, correlationId: event.correlationId, NOT: { eventId } }, orderBy: [{ sequence: 'asc' }], take,
          })
        : [];
      const truncated = effectRows.length > HISTORY_LIMITS.maxTraceItems || correlatedRows.length > HISTORY_LIMITS.maxTraceItems;
      return {
        status: 'OK',
        event,
        causes,
        unresolvedCausationId,
        effects: effectRows.slice(0, HISTORY_LIMITS.maxTraceItems).map(r => this.toEnvelope(r, false)),
        correlated: correlatedRows.slice(0, HISTORY_LIMITS.maxTraceItems).map(r => this.toEnvelope(r, false)),
        truncated,
      };
    } catch (e: any) {
      this.logger.error(`Trace failed for company ${companyId}: ${e.message}`);
      return { status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE, ...emptyTrace };
    }
  }

  // ---------------------------------------------------------------- baselines & retention

  /** Captures the current authoritative spatial projection as a WORLD_BASELINE anchor (persist-then-broadcast). */
  async captureBaseline(companyId: string, causationId?: string) {
    return this.eventService.commitBaseline(companyId, async () => {
      const snap = await this.gatewayService.generateSnapshot(companyId);
      return {
        entities: snap.entities,
        topology: snap.topology,
        navigationNodes: snap.navigationNodes,
        movementStates: snap.movementStates,
      };
    }, causationId);
  }

  retentionCutoff(now = Date.now()): number {
    return now - this.retentionDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Spatial-history retention (independent of enterprise business-data retention). Keeps the newest baseline
   * older than the cutoff (so the boundary stays reconstructable) and deletes everything before it.
   */
  async purgeExpiredHistory(now = Date.now(), companyId?: string): Promise<{ companyId: string; deleted: number }[]> {
    const cutoff = new Date(this.retentionCutoff(now));
    const companies = companyId
      ? [companyId]
      : ((await (this.prisma.v12SpatialHistoryEvent as any).groupBy({ by: ['companyId'] })) as any[]).map(r => r.companyId);
    const results: { companyId: string; deleted: number }[] = [];
    for (const cid of companies) {
      const anchor = await this.prisma.v12SpatialHistoryEvent.findFirst({
        where: { companyId: cid, eventType: V12EventType.WORLD_BASELINE, authoritativeTimestamp: { lt: cutoff } },
        orderBy: [{ sequence: 'desc' }],
      });
      const where = anchor
        ? { companyId: cid, sequence: { lt: anchor.sequence } }
        : { companyId: cid, authoritativeTimestamp: { lt: cutoff } };
      const { count } = await this.prisma.v12SpatialHistoryEvent.deleteMany({ where });
      results.push({ companyId: cid, deleted: count });
    }
    return results;
  }

  /** Captures baselines for companies with events newer than their latest baseline, then applies retention. */
  async runMaintenance(now = Date.now()) {
    try {
      const maxima: any[] = await (this.prisma.v12SpatialHistoryEvent as any).groupBy({ by: ['companyId'], _max: { sequence: true } });
      for (const m of maxima) {
        const latest = await this.prisma.v12SpatialHistoryEvent.findFirst({
          where: { companyId: m.companyId, eventType: V12EventType.WORLD_BASELINE },
          orderBy: [{ sequence: 'desc' }],
          select: { sequence: true },
        });
        if (!latest || Number(m._max.sequence) > Number(latest.sequence)) {
          await this.captureBaseline(m.companyId).catch(err => this.logger.error(`Baseline capture failed for ${m.companyId}: ${err.message}`));
        }
      }
      await this.purgeExpiredHistory(now);
    } catch (e: any) {
      this.logger.error(`Spatial history maintenance failed: ${e.message}`);
    }
  }

  // ---------------------------------------------------------------- helpers

  private hasTarget(t?: HistoryTarget): boolean {
    return !!t && (t.timestamp !== undefined || t.sequence !== undefined || !!t.eventId);
  }

  private async resolveTargetSequence(companyId: string, target: HistoryTarget, now: number): Promise<{ targetSequence: number } | NotAvailable> {
    if (target.eventId) {
      const row = await this.prisma.v12SpatialHistoryEvent.findFirst({ where: { companyId, eventId: target.eventId } });
      if (!row) return na(HistoryNotAvailableReason.EVENT_NOT_FOUND, `Event ${target.eventId} is not in this company's spatial history.`);
      if (row.authoritativeTimestamp.getTime() < this.retentionCutoff(now)) {
        return na(HistoryNotAvailableReason.BEYOND_RETENTION, 'Event is older than the spatial-history retention boundary.');
      }
      return { targetSequence: Number(row.sequence) };
    }
    if (target.sequence !== undefined) {
      const row = await this.prisma.v12SpatialHistoryEvent.findFirst({ where: { companyId, sequence: BigInt(target.sequence) } });
      if (!row) return na(HistoryNotAvailableReason.SEQUENCE_NOT_FOUND, `Sequence ${target.sequence} is not in this company's spatial history.`);
      if (row.authoritativeTimestamp.getTime() < this.retentionCutoff(now)) {
        return na(HistoryNotAvailableReason.BEYOND_RETENTION, 'Sequence is older than the spatial-history retention boundary.');
      }
      return { targetSequence: target.sequence };
    }
    const ts = target.timestamp!;
    if (ts > now) return na(HistoryNotAvailableReason.FUTURE_TARGET, 'Cannot reconstruct a future point in time.');
    if (ts < this.retentionCutoff(now)) {
      return na(HistoryNotAvailableReason.BEYOND_RETENTION, `Target is older than the ${this.retentionDays}-day spatial-history retention boundary.`);
    }
    // Greatest sequence whose timestamp <= target; every event up to that sequence is applied (sequence order).
    const row = await this.prisma.v12SpatialHistoryEvent.findFirst({
      where: { companyId, authoritativeTimestamp: { lte: new Date(ts) } },
      orderBy: [{ sequence: 'desc' }],
    });
    if (!row) return na(HistoryNotAvailableReason.NO_HISTORY_BEFORE_TARGET, 'No spatial history exists at or before the requested time.');
    return { targetSequence: Number(row.sequence) };
  }

  private toEnvelope(r: any, includeBaselinePayload: boolean): V12EventEnvelope {
    const isBaseline = r.eventType === V12EventType.WORLD_BASELINE;
    return {
      eventId: r.eventId,
      schemaVersion: r.schemaVersion,
      sequence: Number(r.sequence),
      eventType: r.eventType,
      authoritativeTimestamp: new Date(r.authoritativeTimestamp).getTime(),
      entityId: r.entityId,
      entityType: r.entityType,
      correlationId: r.correlationId ?? undefined,
      causationId: r.causationId ?? undefined,
      payload: isBaseline && !includeBaselinePayload
        ? { baseline: true, entityCount: Object.keys((r.payload as any)?.entities || {}).length }
        : r.payload,
    };
  }

  private scheduleRecoveryBaseline(companyId: string) {
    if (!companyId || this.pendingRecovery.has(companyId)) return;
    const t = setTimeout(() => {
      this.pendingRecovery.delete(companyId);
      this.captureBaseline(companyId).catch(err => this.logger.error(`Recovery baseline failed for ${companyId}: ${err.message}`));
    }, 5000);
    t.unref?.();
    this.pendingRecovery.set(companyId, t);
  }
}

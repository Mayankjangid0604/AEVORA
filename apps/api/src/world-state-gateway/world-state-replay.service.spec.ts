import { WorldStateReplayService } from './world-state-replay.service';
import { HistoryNotAvailableReason, V12EventType } from '@aevora/shared';
import { BASE, DAY, FakeHistoryStore, NOW, fullEntity, historyRow, seedHistory } from './testing/history-store.fixture';

const full = fullEntity;
const row = historyRow;
const seed = seedHistory;

describe('WorldStateReplayService', () => {
  let store: FakeHistoryStore;
  let gateway: any;
  let eventService: any;
  let service: WorldStateReplayService;

  beforeEach(() => {
    store = new FakeHistoryStore();
    seed(store);
    gateway = { generateSnapshot: jest.fn().mockResolvedValue({ version: '1.0.0', sequence: 999, timestamp: NOW, entities: { live: full('live') }, topology: [], navigationNodes: [], movementStates: {} }) };
    eventService = { commitBaseline: jest.fn().mockResolvedValue({ status: 'COMMITTED' }), persistenceFailures: jest.fn() };
    service = new WorldStateReplayService({ v12SpatialHistoryEvent: store } as any, eventService, gateway);
  });

  describe('CURRENT vs HISTORICAL', () => {
    it('returns CURRENT (live projection) only when no target is given', async () => {
      const r = await service.getWorldState('A', undefined, NOW);
      expect(r.status).toBe('CURRENT');
      expect(gateway.generateSnapshot).toHaveBeenCalledWith('A');
    });

    it('never consults the live projection for historical queries', async () => {
      await service.getWorldState('A', { timestamp: BASE + 2500 }, NOW);
      await service.getWorldState('A', { timestamp: BASE - 1 }, NOW);
      await service.getEntityAt('A', 'live', { sequence: 2 }, NOW);
      expect(gateway.generateSnapshot).not.toHaveBeenCalled();
    });

    it('a live-only entity is NOT_AVAILABLE historically (no current-state fallback)', async () => {
      const r = await service.getEntityAt('A', 'live', { sequence: 6 }, NOW);
      expect(r.status).toBe('NOT_AVAILABLE');
      expect(r.reason).toBe(HistoryNotAvailableReason.ENTITY_NOT_PRESENT_AT_TARGET);
      expect(r.entity).toBeUndefined();
    });
  });

  describe('reconstruction', () => {
    it('reconstructs by timestamp from the baseline + subsequent events', async () => {
      const r = await service.getWorldState('A', { timestamp: BASE + 2500 }, NOW);
      expect(r.status).toBe('HISTORICAL');
      expect(r.snapshot!.entities.e1.transform.position.x).toBe(5);
      expect(r.snapshot!.entities.e2).toBeDefined();
      expect(r.snapshot!.timestamp).toBe(BASE + 2500);
      expect(r.provenance).toMatchObject({ baselineEventId: 'A-evt1', baselineSequence: 1, appliedEventCount: 1, targetSequence: 2, lastAppliedTimestamp: BASE + 2000 });
    });

    it('resolves timestamp collisions deterministically (all events at the instant are applied in sequence order)', async () => {
      const r = await service.getWorldState('A', { timestamp: BASE + 3000 }, NOW);
      expect(r.provenance!.targetSequence).toBe(4);
      expect(r.snapshot!.entities.e3).toBeDefined();
      expect(r.snapshot!.movementStates.e1).toEqual({ entityId: 'e1', movementState: 'MOVING' });
    });

    it('reconstructs by sequence', async () => {
      const r = await service.getWorldState('A', { sequence: 5 }, NOW);
      expect(r.status).toBe('HISTORICAL');
      expect(r.snapshot!.sequence).toBe(5);
      expect(r.snapshot!.entities.e2).toBeUndefined();
    });

    it('reconstructs by eventId and marks entities without full spatial data as partial (no invented transform)', async () => {
      const r = await service.getWorldState('A', { eventId: 'A-evt3' }, NOW);
      expect(r.provenance!.targetSequence).toBe(3);
      expect(r.provenance!.partialEntityIds).toEqual(['e3']);
      expect((r.snapshot!.entities.e3 as any).transform).toBeUndefined();
      const ent = await service.getEntityAt('A', 'e3', { eventId: 'A-evt3' }, NOW);
      expect(ent).toMatchObject({ status: 'HISTORICAL', partial: true });
    });

    it('entity historical state: present before deletion, not present after', async () => {
      const before = await service.getEntityAt('A', 'e2', { sequence: 4 }, NOW);
      const after = await service.getEntityAt('A', 'e2', { sequence: 5 }, NOW);
      expect(before.status).toBe('HISTORICAL');
      expect(before.entity!.transform.position.x).toBe(9);
      expect(after.status).toBe('NOT_AVAILABLE');
      expect(after.reason).toBe(HistoryNotAvailableReason.ENTITY_NOT_PRESENT_AT_TARGET);
    });

    it('is deterministic regardless of storage order', async () => {
      const a = await service.getWorldState('A', { sequence: 6 }, NOW);
      store.rows.reverse();
      const b = await service.getWorldState('A', { sequence: 6 }, NOW);
      expect(b).toEqual(a);
    });
  });

  describe('NOT_AVAILABLE reasons', () => {
    const reason = async (companyId: string, target: any) => {
      const r = await service.getWorldState(companyId, target, NOW);
      expect(r.status).toBe('NOT_AVAILABLE');
      expect(r.snapshot).toBeUndefined();
      return r.reason;
    };

    it('no history before the target', async () => expect(await reason('A', { timestamp: BASE + 500 })).toBe(HistoryNotAvailableReason.NO_HISTORY_BEFORE_TARGET));
    it('no baseline before the target', async () => expect(await reason('C', { sequence: 1 })).toBe(HistoryNotAvailableReason.NO_BASELINE_BEFORE_TARGET));
    it('sequence gap', async () => expect(await reason('D', { sequence: 4 })).toBe(HistoryNotAvailableReason.HISTORY_GAP));
    it('a point before the gap is still reconstructable', async () => {
      expect((await service.getWorldState('D', { sequence: 2 }, NOW)).status).toBe('HISTORICAL');
    });
    it('unknown sequence', async () => expect(await reason('A', { sequence: 99 })).toBe(HistoryNotAvailableReason.SEQUENCE_NOT_FOUND));
    it('unknown event', async () => expect(await reason('A', { eventId: 'nope' })).toBe(HistoryNotAvailableReason.EVENT_NOT_FOUND));
    it('future target', async () => expect(await reason('A', { timestamp: NOW + 1 })).toBe(HistoryNotAvailableReason.FUTURE_TARGET));
    it('beyond retention', async () => expect(await reason('A', { timestamp: NOW - 31 * DAY })).toBe(HistoryNotAvailableReason.BEYOND_RETENTION));
    it('reconstruction too large', async () => {
      (service as any).maxReconstructionEvents = 2;
      expect(await reason('A', { sequence: 6 })).toBe(HistoryNotAvailableReason.WINDOW_TOO_LARGE);
    });
    it('store unavailable', async () => {
      store.failing = true;
      expect(await reason('A', { sequence: 2 })).toBe(HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE);
      const page = await service.getHistoricalEvents('A');
      expect(page.status).toBe('NOT_AVAILABLE');
      expect(page.reason).toBe(HistoryNotAvailableReason.HISTORY_STORE_UNAVAILABLE);
    });
  });

  describe('company isolation', () => {
    it("company A cannot resolve company B's event", async () => {
      const r = await service.getWorldState('A', { eventId: 'b-evt-2' }, NOW);
      expect(r.reason).toBe(HistoryNotAvailableReason.EVENT_NOT_FOUND);
      const t = await service.traceEvent('A', 'b-evt-2');
      expect(t.reason).toBe(HistoryNotAvailableReason.EVENT_NOT_FOUND);
    });

    it('reconstructed state contains only the requesting company entities', async () => {
      const a = await service.getWorldState('A', { sequence: 2 }, NOW);
      const b = await service.getWorldState('B', { sequence: 2 }, NOW);
      expect(Object.keys(a.snapshot!.entities).sort()).toEqual(['e1', 'e2']);
      expect(Object.keys(b.snapshot!.entities)).toEqual(['b1']);
      expect((await service.getEntityAt('B', 'e1', { sequence: 2 }, NOW)).status).toBe('NOT_AVAILABLE');
    });

    it('every store query is company-scoped', async () => {
      await service.getWorldState('A', { timestamp: BASE + 3500 }, NOW);
      await service.getHistoricalEvents('A', { entityId: 'e1' });
      await service.getReplayWindow('A', BASE + 1500, BASE + 4500, NOW);
      await service.traceEvent('A', 'A-evt5');
      expect(store.calls.length).toBeGreaterThan(0);
      for (const c of store.calls) expect(c.args.where.companyId).toBe('A');
    });

    it('correlation tracing does not cross companies even with a shared correlationId', async () => {
      const t = await service.traceEvent('A', 'A-evt3');
      expect(t.correlated.map(e => e.eventId)).toEqual(['A-evt4']);
    });
  });

  describe('bounded event queries', () => {
    it('pages with a limit and reports truncation', async () => {
      const p = await service.getHistoricalEvents('A', { limit: 2 });
      expect(p.events.map(e => e.sequence)).toEqual([1, 2]);
      expect(p.truncated).toBe(true);
      expect(p.nextAfterSequence).toBe(2);
      const next = await service.getHistoricalEvents('A', { fromSequence: 2, limit: 10 });
      expect(next.events.map(e => e.sequence)).toEqual([3, 4, 5, 6]);
      expect(next.truncated).toBe(false);
    });

    it('clamps the limit to the maximum page size', async () => {
      await service.getHistoricalEvents('A', { limit: 1e9 });
      expect(store.calls.filter(c => c.op === 'findMany').pop()!.args.take).toBe(5001);
    });

    it('summarises baseline payloads in listings', async () => {
      const p = await service.getHistoricalEvents('A', { limit: 1 });
      expect(p.events[0].payload).toEqual({ baseline: true, entityCount: 2 });
    });

    it('filters by entity and time', async () => {
      const p = await service.getHistoricalEvents('A', { entityId: 'e1', startTime: BASE + 2500 });
      expect(p.events.map(e => e.sequence)).toEqual([4, 6]);
    });
  });

  describe('replay window', () => {
    it('returns the reconstructed start state and the ordered events in the window', async () => {
      const w = await service.getReplayWindow('A', BASE + 1500, BASE + 4500, NOW);
      expect(w.status).toBe('OK');
      expect(w.startState!.sequence).toBe(1);
      expect(w.events.map(e => e.sequence)).toEqual([2, 3, 4, 5]);
      expect(w.effectiveFrom).toBe(BASE + 1500);
      expect(w.truncated).toBe(false);
    });

    it('starts at the first later baseline when the window start is not reconstructable', async () => {
      const w = await service.getReplayWindow('E', BASE + 500, BASE + 4000, NOW);
      expect(w.status).toBe('OK');
      expect(w.effectiveFrom).toBe(BASE + 2000);
      expect(w.startProvenance!.baselineEventId).toBe('E-evt2');
      expect(w.events.map(e => e.sequence)).toEqual([3]);
    });

    it('truncates at a sequence gap rather than replaying across missing history', async () => {
      const w = await service.getReplayWindow('D', BASE + 1500, BASE + 5000, NOW);
      expect(w.events.map(e => e.sequence)).toEqual([2]);
      expect(w.truncated).toBe(true);
      expect(w.message).toContain('gap');
    });

    it('is NOT_AVAILABLE when nothing in the window can be anchored', async () => {
      const w = await service.getReplayWindow('C', BASE, BASE + 5000, NOW);
      expect(w.status).toBe('NOT_AVAILABLE');
      expect(w.events).toEqual([]);
    });

    it('rejects an empty/inverted window', async () => {
      const w = await service.getReplayWindow('A', BASE + 5000, BASE + 1000, NOW);
      expect(w.reason).toBe(HistoryNotAvailableReason.FUTURE_TARGET);
    });

    it('limits the window size', async () => {
      (service as any).maxWindowEvents = 2;
      const w = await service.getReplayWindow('A', BASE + 1500, BASE + 9000, NOW);
      expect(w.events.map(e => e.sequence)).toEqual([2, 3]);
      expect(w.truncated).toBe(true);
    });
  });

  describe('correlation / causation tracing', () => {
    it('walks the persisted causation chain', async () => {
      const t = await service.traceEvent('A', 'A-evt5');
      expect(t.status).toBe('OK');
      expect(t.causes.map(e => e.eventId)).toEqual(['A-evt4', 'A-evt3']);
      expect(t.unresolvedCausationId).toBeUndefined();
    });

    it('reports an unresolved causationId instead of inventing a link', async () => {
      const t = await service.traceEvent('A', 'A-evt6');
      expect(t.causes).toEqual([]);
      expect(t.unresolvedCausationId).toBe('missing-evt');
    });

    it('lists effects and correlated events', async () => {
      const t = await service.traceEvent('A', 'A-evt3');
      expect(t.effects.map(e => e.eventId)).toEqual(['A-evt4']);
      expect(t.correlated.map(e => e.eventId)).toEqual(['A-evt4']);
    });

    it('events without causation have no causes', async () => {
      const t = await service.traceEvent('A', 'A-evt2');
      expect(t.causes).toEqual([]);
      expect(t.effects).toEqual([]);
      expect(t.correlated).toEqual([]);
    });
  });

  describe('baselines and retention', () => {
    it('captureBaseline commits the current projection through the persist-then-broadcast path', async () => {
      await service.captureBaseline('A');
      expect(eventService.commitBaseline).toHaveBeenCalledWith('A', expect.any(Function), undefined);
      const capture = eventService.commitBaseline.mock.calls[0][1];
      const payload = await capture();
      expect(Object.keys(payload.entities)).toEqual(['live']);
    });

    it('purges expired history but keeps the newest baseline before the cutoff as an anchor', async () => {
      store.rows = [
        row('F', 1, V12EventType.WORLD_BASELINE, NOW - 40 * DAY, 'world', { entities: {} }),
        row('F', 2, V12EventType.ENTITY_UPDATED, NOW - 35 * DAY, 'f1', {}),
        row('F', 3, V12EventType.WORLD_BASELINE, NOW - 32 * DAY, 'world', { entities: { f1: full('f1') } }),
        row('F', 4, V12EventType.ENTITY_UPDATED, NOW - 1 * DAY, 'f1', { name: 'recent' }),
        row('G', 1, V12EventType.ENTITY_UPDATED, NOW - 40 * DAY, 'g1', {}),
        row('G', 2, V12EventType.ENTITY_UPDATED, NOW - 1 * DAY, 'g1', {}),
      ];
      const res = await service.purgeExpiredHistory(NOW);
      expect(res).toEqual(expect.arrayContaining([{ companyId: 'F', deleted: 2 }, { companyId: 'G', deleted: 1 }]));
      expect(store.rows.filter(r => r.companyId === 'F').map(r => Number(r.sequence))).toEqual([3, 4]);
      // recent point remains reconstructable from the kept anchor
      const r = await service.getWorldState('F', { sequence: 4 }, NOW);
      expect(r.status).toBe('HISTORICAL');
      expect((r.snapshot!.entities.f1 as any).name).toBe('recent');
    });

    it('maintenance captures a baseline only for companies with events newer than their last baseline', async () => {
      await service.runMaintenance(NOW);
      const companies = eventService.commitBaseline.mock.calls.map((c: any[]) => c[0]).sort();
      expect(companies).toEqual(['A', 'B', 'C', 'D', 'E']);
      eventService.commitBaseline.mockClear();
      store.rows = [row('H', 1, V12EventType.WORLD_BASELINE, NOW - 1000, 'world', { entities: {} })];
      await service.runMaintenance(NOW);
      expect(eventService.commitBaseline).not.toHaveBeenCalled();
    });
  });
});

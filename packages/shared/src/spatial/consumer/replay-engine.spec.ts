import { WorldStateReplayEngine, ReplayState, ReplayScheduler } from './replay-engine';
import { V12EventType, V12EventEnvelope } from '../events';
import { V12EntityType, WorldMode } from '../world-state';
import { ReplayWindow, HistoryNotAvailableReason } from '../history';

const T = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } };
const V = { isVisible: true, opacity: 1, renderState: 'NORMAL' as const };

class FakeScheduler implements ReplayScheduler {
  t = 0;
  fns = new Map<number, () => void>();
  private id = 0;
  setInterval(fn: () => void) { const h = ++this.id; this.fns.set(h, fn); return h; }
  clearInterval(h: number) { this.fns.delete(h); }
  now() { return this.t; }
  advance(ms: number, step = 50) { for (let i = 0; i < ms; i += step) { this.t += step; [...this.fns.values()].forEach(f => f()); } }
  get active() { return this.fns.size; }
}

function ev(sequence: number, ts: number, eventType: string, entityId: string, payload: any): V12EventEnvelope {
  return { eventId: `e${sequence}`, sequence, eventType, entityId, entityType: V12EntityType.PERSON, schemaVersion: '1.0.0', authoritativeTimestamp: ts, payload };
}

function windowFixture(): ReplayWindow {
  return {
    status: 'OK',
    requestedFrom: 1000,
    requestedTo: 5000,
    truncated: false,
    startState: {
      version: '1.0.0', sequence: 10, timestamp: 1000, mode: WorldMode.REPLAY,
      entities: { p1: { id: 'p1', type: V12EntityType.PERSON, name: 'Ana', transform: T, visibility: V, currentActivity: 'IDLE' } as any },
      topology: [], navigationNodes: [], movementStates: {},
    },
    startProvenance: { baselineEventId: 'b', baselineSequence: 10, baselineTimestamp: 1000, appliedEventCount: 0, targetSequence: 10, lastAppliedTimestamp: 1000, partialEntityIds: [] },
    events: [
      ev(13, 4000, V12EventType.ENTITY_DELETED, 'p1', {}),
      ev(11, 2000, V12EventType.ENTITY_UPDATED, 'p1', { currentActivity: 'TASK_STARTED' }),
      ev(12, 3000, V12EventType.ENTITY_CREATED, 'p2', { name: 'Ben' }),
    ],
  };
}

describe('WorldStateReplayEngine', () => {
  let sched: FakeScheduler;
  let engine: WorldStateReplayEngine;

  beforeEach(() => {
    sched = new FakeScheduler();
    engine = new WorldStateReplayEngine({ companyId: 'c1', apiBaseUrl: 'http://x', scheduler: sched, fetchFn: jest.fn() as any });
    engine.loadWindowData(windowFixture());
  });

  it('loads a window, sorts events by sequence and starts STOPPED at the start state', () => {
    expect(engine.getState()).toBe(ReplayState.STOPPED);
    expect(engine.getEvents().map(e => e.sequence)).toEqual([11, 12, 13]);
    expect(engine.getCursor()).toBe(-1);
    expect((engine.getEntity('p1') as any).currentActivity).toBe('IDLE');
    expect(engine.getTimelineRange()).toEqual({ min: 1000, max: 5000 });
  });

  it('SEEK / JUMP_TO_TIMESTAMP is deterministic forwards and backwards', () => {
    engine.jumpToTimestamp(3500);
    expect(engine.getCursor()).toBe(1);
    expect(engine.getEntity('p2')?.name).toBe('Ben');
    const atForward = JSON.stringify([...engine.getEntities()]);
    engine.seek(4500);
    expect(engine.getEntity('p1')).toBeUndefined();
    engine.seek(3500);
    expect(JSON.stringify([...engine.getEntities()])).toBe(atForward);
    expect(engine.getEntity('p1')).toBeDefined();
  });

  it('clamps seeks to the timeline range', () => {
    engine.seek(999999);
    expect(engine.getCurrentTimestamp()).toBe(5000);
    expect(engine.getCursor()).toBe(2);
    engine.seek(-5);
    expect(engine.getCurrentTimestamp()).toBe(1000);
    expect(engine.getCursor()).toBe(-1);
  });

  it('JUMP_TO_EVENT positions after the event; unknown events leave position unchanged', () => {
    expect(engine.jumpToEvent('e12')).toBe(true);
    expect(engine.getCursor()).toBe(1);
    expect(engine.getCurrentTimestamp()).toBe(3000);
    expect(engine.jumpToEvent('nope')).toBe(false);
    expect(engine.getCursor()).toBe(1);
    expect(engine.jumpToSequence(13)).toBe(true);
    expect(engine.getCursor()).toBe(2);
  });

  it('steps forward and backward one event at a time', () => {
    expect(engine.stepForward()).toBe(true);
    expect(engine.getCurrentSequence()).toBe(11);
    expect(engine.stepForward()).toBe(true);
    expect(engine.stepBackward()).toBe(true);
    expect(engine.getCurrentSequence()).toBe(11);
    expect(engine.stepBackward()).toBe(true);
    expect(engine.getCursor()).toBe(-1);
    expect(engine.stepBackward()).toBe(false);
  });

  it('PLAY advances with simulated time, PAUSE freezes, SPEED scales', () => {
    engine.play();
    expect(engine.getState()).toBe(ReplayState.PLAYING);
    sched.advance(1000); // 1x: 1000 -> 2000
    expect(engine.getCurrentTimestamp()).toBe(2000);
    expect(engine.getCursor()).toBe(0);
    engine.pause();
    expect(engine.getState()).toBe(ReplayState.PAUSED);
    expect(sched.active).toBe(0);
    sched.advance(1000);
    expect(engine.getCurrentTimestamp()).toBe(2000);
    engine.setSpeed(2);
    engine.play();
    sched.advance(500); // 2x: +1000 -> 3000
    expect(engine.getCurrentTimestamp()).toBe(3000);
    expect(engine.getCursor()).toBe(1);
  });

  it('completes at the end of the window and pauses', () => {
    const done = jest.fn();
    engine.onReplayComplete(done);
    engine.setSpeed(16);
    engine.play();
    sched.advance(1000);
    expect(engine.getState()).toBe(ReplayState.PAUSED);
    expect(engine.getCurrentTimestamp()).toBe(5000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(sched.active).toBe(0);
  });

  it('STOP and reset return deterministically to the start state', () => {
    engine.seek(4500);
    engine.stop();
    expect(engine.getState()).toBe(ReplayState.STOPPED);
    expect(engine.getCursor()).toBe(-1);
    expect((engine.getEntity('p1') as any).currentActivity).toBe('IDLE');
    expect(engine.getEntity('p2')).toBeUndefined();
  });

  it('rejects unsupported speeds', () => {
    expect(() => engine.setSpeed(3)).toThrow(RangeError);
    expect(engine.getSpeed()).toBe(1);
  });

  it('exposes NOT_AVAILABLE without fabricating any state', () => {
    engine.loadWindowData({ status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.NO_BASELINE_BEFORE_TARGET, message: 'no baseline', events: [], requestedFrom: 1, requestedTo: 2, truncated: false });
    expect(engine.getState()).toBe(ReplayState.NOT_AVAILABLE);
    expect(engine.getAvailability()).toMatchObject({ status: 'NOT_AVAILABLE', reason: 'NO_BASELINE_BEFORE_TARGET' });
    expect(engine.getEntities().size).toBe(0);
    engine.play();
    expect(engine.getState()).toBe(ReplayState.NOT_AVAILABLE);
  });

  it('tracks partial entities from the window and from replayed events', () => {
    engine.seek(3500);
    expect(engine.isPartialEntity('p2')).toBe(true);
    expect(engine.isPartialEntity('p1')).toBe(false);
  });

  it('loadWindow only performs a GET against the history window endpoint (no live / mutation calls)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, json: async () => windowFixture() });
    const e2 = new WorldStateReplayEngine({ companyId: 'c 1', apiBaseUrl: 'http://api', scheduler: sched, fetchFn: fetchFn as any, authToken: 'tok', headers: { 'x-company-id': 'c 1' } });
    const res = await e2.loadWindow(1000, 5000);
    expect(res.status).toBe('AVAILABLE');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://api/world-state/history/window/c%201?from=1000&to=5000');
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ 'x-company-id': 'c 1', Authorization: 'Bearer tok' });
  });

  it('reports ERROR when the window request fails', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    const e2 = new WorldStateReplayEngine({ companyId: 'c1', apiBaseUrl: 'http://api', scheduler: sched, fetchFn: fetchFn as any });
    const res = await e2.loadWindow(1, 2);
    expect(res.status).toBe('ERROR');
    expect(e2.getState()).toBe(ReplayState.ERROR);
    expect(e2.getEntities().size).toBe(0);
  });
});

import { WorldStateConsumer, ConnectionState } from './world-state-consumer';
import { WorldStateReplayEngine, ReplayScheduler } from './replay-engine';
import { V12EventType, V12EntityType, WorldMode } from '../index';

/**
 * LIVE (WorldStateConsumer) and REPLAY (WorldStateReplayEngine) must never share or leak state:
 * neither instance reads from, writes to, or receives events from the other, and the replay engine
 * performs no live I/O.
 */
class CapturingEventSource {
  static last: CapturingEventSource | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) { CapturingEventSource.last = this; }
  addEventListener() {}
  close() {}
  emit(data: any) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

const full = (id: string, x: number) => ({
  id, type: V12EntityType.PERSON, name: id,
  transform: { position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
  visibility: { isVisible: true },
});

const manualScheduler = (): ReplayScheduler => ({ setInterval: () => 1, clearInterval: () => undefined, now: () => 0 });

describe('LIVE / REPLAY state separation', () => {
  const T = 1_700_000_000_000;

  async function setup() {
    const liveFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0.0', sequence: 500, timestamp: T + 99_000, mode: WorldMode.LIVE, entities: { shared: full('shared', 100), liveOnly: full('liveOnly', 7) }, movementStates: { shared: { entityId: 'shared', movementState: 'MOVING' } } }),
    });
    const consumer = new WorldStateConsumer({ companyId: 'A', apiBaseUrl: 'http://api', fetchFn: liveFetch as any, EventSourceClass: CapturingEventSource });
    await consumer.connect();

    const replayFetch = jest.fn();
    const engine = new WorldStateReplayEngine({ companyId: 'A', apiBaseUrl: 'http://api', fetchFn: replayFetch as any, scheduler: manualScheduler() });
    engine.loadWindowData({
      status: 'OK',
      requestedFrom: T, requestedTo: T + 10_000, effectiveFrom: T, truncated: false,
      startState: { version: '1.0.0', sequence: 1, timestamp: T, mode: WorldMode.REPLAY, entities: { shared: full('shared', 1) } as any, topology: [], navigationNodes: [], movementStates: {} },
      startProvenance: { baselineEventId: 'b', baselineSequence: 1, baselineTimestamp: T, appliedEventCount: 0, targetSequence: 1, lastAppliedTimestamp: T, partialEntityIds: [] },
      events: [
        { eventId: 'r2', schemaVersion: '1.0.0', sequence: 2, eventType: V12EventType.TRANSFORM_UPDATED, authoritativeTimestamp: T + 1000, entityId: 'shared', entityType: V12EntityType.PERSON, payload: { position: { x: 2, y: 0, z: 0 } } },
        { eventId: 'r3', schemaVersion: '1.0.0', sequence: 3, eventType: V12EventType.ENTITY_CREATED, authoritativeTimestamp: T + 2000, entityId: 'replayOnly', entityType: V12EntityType.PERSON, payload: full('replayOnly', 3) },
      ],
    });
    return { consumer, engine, liveFetch, replayFetch, es: CapturingEventSource.last! };
  }

  it('each side exposes only its own state for the same entity id', async () => {
    const { consumer, engine } = await setup();
    engine.jumpToTimestamp(T + 5000);
    expect((consumer.getEntity('shared') as any).transform.position.x).toBe(100);
    expect((engine.getEntity('shared') as any).transform.position.x).toBe(2);
    expect(engine.getEntity('liveOnly')).toBeUndefined();
    expect(consumer.getEntity('replayOnly')).toBeUndefined();
    expect(engine.getMovementStates().size).toBe(0); // live movement never appears in replay
  });

  it('replay operations do not mutate live state', async () => {
    const { consumer, engine } = await setup();
    const before = JSON.stringify([...consumer.getEntities()]);
    const seqBefore = consumer.getSequence();
    engine.play(); engine.stepForward(); engine.jumpToEvent('r3'); engine.stepBackward(); engine.stop(); engine.reset(); engine.unload();
    expect(JSON.stringify([...consumer.getEntities()])).toBe(before);
    expect(consumer.getSequence()).toBe(seqBefore);
    expect(consumer.getState()).not.toBe(ConnectionState.ERROR);
  });

  it('live stream events do not reach replay state', async () => {
    const { consumer, engine, es } = await setup();
    engine.jumpToTimestamp(T + 5000);
    const replayBefore = JSON.stringify([...engine.getEntities()]);
    es.emit({ eventId: 'l501', schemaVersion: '1.0.0', sequence: 501, eventType: V12EventType.TRANSFORM_UPDATED, authoritativeTimestamp: T + 100_000, entityId: 'shared', entityType: V12EntityType.PERSON, payload: { position: { x: 555, y: 0, z: 0 } } });
    await new Promise(r => setTimeout(r, 0));
    expect((consumer.getEntity('shared') as any).transform.position.x).toBe(555);
    expect(JSON.stringify([...engine.getEntities()])).toBe(replayBefore);
  });

  it('the replay engine performs no live I/O (no snapshot, no stream)', async () => {
    const { engine, replayFetch } = await setup();
    replayFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'NOT_AVAILABLE', reason: 'NO_BASELINE_BEFORE_TARGET', events: [], requestedFrom: 1, requestedTo: 2, truncated: false }) });
    const esBefore = CapturingEventSource.last;
    await engine.loadWindow(1, 2);
    expect(replayFetch).toHaveBeenCalledTimes(1);
    expect(replayFetch.mock.calls[0][0]).toBe('http://api/world-state/history/window/A?from=1&to=2');
    expect(CapturingEventSource.last).toBe(esBefore); // no new stream opened
    expect(engine.getEntities().size).toBe(0); // NOT_AVAILABLE shows nothing, not live state
  });

  it('a new replay session starts clean (no carry-over from a previous session)', async () => {
    const { engine } = await setup();
    engine.jumpToTimestamp(T + 5000);
    engine.dispose();
    const fresh = new WorldStateReplayEngine({ companyId: 'A', apiBaseUrl: 'http://api', fetchFn: jest.fn() as any, scheduler: manualScheduler() });
    expect(fresh.getEntities().size).toBe(0);
    expect(fresh.getAvailability().status).toBe('UNLOADED');
  });
});

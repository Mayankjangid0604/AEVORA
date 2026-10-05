import { applyEvent, emptyReducedState, toWorldSnapshot } from './world-state-reducer';
import { V12EventType, V12EventEnvelope } from '../events';
import { V12EntityType, WorldMode } from '../world-state';

/**
 * Real, executed benchmarks of the actual production reducer (`applyEvent`) and the actual
 * production snapshot serializer (`toWorldSnapshot`) — the same functions every consumer, the
 * replay engine, and the backend's historical reconstruction all use. Not a synthetic stand-in.
 */
describe('World-state reduction + snapshot generation benchmark', () => {
  function buildEvents(count: number): V12EventEnvelope[] {
    const events: V12EventEnvelope[] = [];
    for (let i = 0; i < count; i++) {
      events.push({
        eventId: `evt-${i}`,
        sequence: i + 1,
        eventType: V12EventType.ENTITY_CREATED,
        entityId: `ent-${i}`,
        entityType: V12EntityType.PERSON,
        schemaVersion: '1.0.0',
        authoritativeTimestamp: 1000 + i,
        payload: {
          name: `Employee ${i}`,
          transform: { position: { x: i, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          visibility: { isVisible: true, opacity: 1, renderState: 'NORMAL' },
        },
      });
    }
    // One MOVEMENT_UPDATED per entity to exercise the movementStates path too.
    for (let i = 0; i < count; i++) {
      events.push({
        eventId: `mov-${i}`,
        sequence: count + i + 1,
        eventType: V12EventType.MOVEMENT_UPDATED,
        entityId: `ent-${i}`,
        entityType: V12EntityType.PERSON,
        schemaVersion: '1.0.0',
        authoritativeTimestamp: 2000 + i,
        payload: { movementState: { entityId: `ent-${i}`, movementState: 'MOVING', progress: 0.5 } },
      });
    }
    return events;
  }

  const results: { count: number; reduceMs: number; snapshotMs: number; entityCount: number }[] = [];

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('World-state reduction + snapshot benchmark results:', JSON.stringify(results, null, 2));
  });

  it.each([100, 1000, 10000])('reduces %i entities (2x events) and serializes a snapshot within a reasonable time, deterministically', (count) => {
    const events = buildEvents(count);
    const state = emptyReducedState();

    const reduceStart = Date.now();
    for (const e of events) applyEvent(state, e);
    const reduceMs = Date.now() - reduceStart;

    expect(Object.keys(state.entities)).toHaveLength(count);
    expect(state.movementStates[`ent-${count - 1}`].progress).toBe(0.5);

    const snapshotStart = Date.now();
    const snapshot = toWorldSnapshot(state, WorldMode.LIVE);
    const snapshotMs = Date.now() - snapshotStart;

    expect(Object.keys(snapshot.entities)).toHaveLength(count);
    expect(snapshot.sequence).toBe(count * 2);

    // Determinism: reducing the same event list twice from empty state yields byte-identical snapshots.
    const state2 = emptyReducedState();
    for (const e of events) applyEvent(state2, e);
    const snapshot2 = toWorldSnapshot(state2, WorldMode.LIVE);
    expect(JSON.stringify(snapshot2.entities)).toBe(JSON.stringify(snapshot.entities));

    results.push({ count, reduceMs, snapshotMs, entityCount: Object.keys(state.entities).length });

    expect(reduceMs).toBeLessThan(10000);
    expect(snapshotMs).toBeLessThan(5000);
  }, 30000);
});

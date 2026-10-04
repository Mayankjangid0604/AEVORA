import {
  applyEvent, compareEvents, findSequenceGap, sortEvents, stateFromBaseline, toWorldSnapshot, cloneReducedState,
} from './world-state-reducer';
import { V12EventType, V12EventEnvelope } from '../events';
import { V12EntityType, WorldMode } from '../world-state';

const T = { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } };
const V = { isVisible: true, opacity: 1, renderState: 'NORMAL' };

function ev(sequence: number, eventType: string, entityId: string, payload: any, ts = 1000 + sequence, eventId = `e${sequence}`): V12EventEnvelope {
  return { eventId, sequence, eventType, entityId, entityType: V12EntityType.PERSON, schemaVersion: '1.0.0', authoritativeTimestamp: ts, payload };
}

const baseline = ev(10, V12EventType.WORLD_BASELINE, 'world_c1', {
  entities: { p1: { id: 'p1', type: 'PERSON', name: 'Ana', transform: T, visibility: V, currentActivity: 'IDLE' } },
  movementStates: {},
  topology: [{ id: 't1', sourceId: 'a', sourceType: 'NODE', targetId: 'b', targetType: 'NODE' }],
  navigationNodes: [],
});

describe('world-state-reducer', () => {
  it('orders by sequence, then timestamp, then eventId (timestamp collisions are deterministic)', () => {
    const a = ev(2, 'X', 'p', {}, 500, 'b');
    const b = ev(2, 'X', 'p', {}, 500, 'a');
    const c = ev(1, 'X', 'p', {}, 900, 'z');
    expect(sortEvents([a, b, c]).map(e => e.eventId)).toEqual(['z', 'a', 'b']);
    expect(compareEvents(b, a)).toBeLessThan(0);
  });

  it('detects sequence gaps', () => {
    expect(findSequenceGap(10, [ev(11, 'X', 'p', {}), ev(12, 'X', 'p', {})])).toBeNull();
    expect(findSequenceGap(10, [ev(11, 'X', 'p', {}), ev(13, 'X', 'p', {})])).toBe(12);
    expect(findSequenceGap(10, [ev(12, 'X', 'p', {})])).toBe(11);
  });

  it('builds state from a baseline and applies updates deterministically', () => {
    const s1 = stateFromBaseline(baseline as any);
    const s2 = stateFromBaseline(baseline as any);
    const events = [
      ev(11, V12EventType.ENTITY_UPDATED, 'p1', { currentActivity: 'TASK_STARTED' }),
      ev(12, V12EventType.TRANSFORM_UPDATED, 'p1', { position: { x: 9, y: 9, z: 9 } }),
    ];
    events.forEach(e => applyEvent(s1, e));
    events.forEach(e => applyEvent(s2, e));
    expect(toWorldSnapshot(s1)).toEqual(toWorldSnapshot(s2));
    expect((s1.entities.p1 as any).currentActivity).toBe('TASK_STARTED');
    expect(s1.entities.p1.transform.position).toEqual({ x: 9, y: 9, z: 9 });
    expect(s1.entities.p1.transform.rotation).toEqual(T.rotation);
    expect(s1.sequence).toBe(12);
    expect(toWorldSnapshot(s1).mode).toBe(WorldMode.REPLAY);
  });

  it('never invents a transform for entities created without one (tracked as partial)', () => {
    const s = stateFromBaseline(baseline as any);
    applyEvent(s, ev(11, V12EventType.ENTITY_CREATED, 'p2', { name: 'Ben', aevoraId: 'emp2' }));
    expect(s.entities.p2).toEqual({ id: 'p2', type: V12EntityType.PERSON, name: 'Ben', aevoraId: 'emp2' });
    expect((s.entities.p2 as any).transform).toBeUndefined();
    expect(s.partialEntityIds.has('p2')).toBe(true);
    expect(s.partialEntityIds.has('p1')).toBe(false);
  });

  it('merges ENTITY_CREATED into an entity already present in the baseline instead of dropping its transform', () => {
    const s = stateFromBaseline(baseline as any);
    applyEvent(s, ev(11, V12EventType.ENTITY_CREATED, 'p1', { name: 'Ana B.' }));
    expect(s.entities.p1.name).toBe('Ana B.');
    expect(s.entities.p1.transform).toEqual(T);
  });

  it('applies deletes and movement events', () => {
    const s = stateFromBaseline(baseline as any);
    applyEvent(s, ev(11, V12EventType.MOVEMENT_STARTED, 'emp1', { movementState: { movementState: 'MOVING', entityId: 'emp1' } }));
    expect(s.movementStates.emp1.movementState).toBe('MOVING');
    applyEvent(s, ev(12, V12EventType.ENTITY_DELETED, 'p1', {}));
    expect(s.entities.p1).toBeUndefined();
  });

  it('cloning isolates states', () => {
    const s = stateFromBaseline(baseline as any);
    const c = cloneReducedState(s);
    applyEvent(c, ev(11, V12EventType.ENTITY_UPDATED, 'p1', { name: 'Changed' }));
    expect(s.entities.p1.name).toBe('Ana');
  });

  it('rejects non-baseline anchors', () => {
    expect(() => stateFromBaseline(ev(1, V12EventType.ENTITY_UPDATED, 'p1', {}) as any)).toThrow();
  });
});

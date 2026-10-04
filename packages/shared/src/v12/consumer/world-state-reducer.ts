import { WorldSnapshot, WorldEntity, V12EntityId, WorldMode, MovementState, TopologyEdge, NavigationNode } from '../world-state';
import { V12EventEnvelope, V12EventType, WorldBaselinePayload } from '../events';

/**
 * Pure, deterministic world-state reducer shared by backend historical reconstruction and the
 * client replay engine. Given the same baseline and the same ordered events it always yields the
 * same state. It never invents fields: entities whose full spatial definition was never recorded
 * are tracked in `partialEntityIds` instead of being given default positions.
 */
export interface ReducedWorldState {
  sequence: number;
  timestamp: number;
  entities: Record<V12EntityId, WorldEntity>;
  movementStates: Record<string, MovementState>;
  topology: TopologyEdge[];
  navigationNodes: NavigationNode[];
  partialEntityIds: Set<V12EntityId>;
}

const MOVEMENT_EVENTS = new Set<string>([
  V12EventType.MOVEMENT_STARTED,
  V12EventType.MOVEMENT_UPDATED,
  V12EventType.MOVEMENT_ARRIVED,
  V12EventType.MOVEMENT_BLOCKED,
  V12EventType.MOVEMENT_CANCELLED,
]);

/** Total order: sequence, then authoritative timestamp, then eventId. Resolves timestamp collisions deterministically. */
export function compareEvents(a: V12EventEnvelope, b: V12EventEnvelope): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.authoritativeTimestamp !== b.authoritativeTimestamp) return a.authoritativeTimestamp - b.authoritativeTimestamp;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

export function sortEvents(events: V12EventEnvelope[]): V12EventEnvelope[] {
  return [...events].sort(compareEvents);
}

/** Returns the first missing sequence after `afterSequence`, or null if `events` are contiguous. Events must be sorted. */
export function findSequenceGap(afterSequence: number, events: V12EventEnvelope[]): number | null {
  let expected = afterSequence + 1;
  for (const e of events) {
    if (e.sequence !== expected) return expected;
    expected++;
  }
  return null;
}

export function isFullySpatialEntity(entity: any): boolean {
  const t = entity?.transform;
  return !!(
    t && t.position && t.rotation && t.scale &&
    typeof t.position.x === 'number' && typeof t.position.y === 'number' && typeof t.position.z === 'number' &&
    entity.visibility && typeof entity.visibility.isVisible === 'boolean'
  );
}

export function emptyReducedState(): ReducedWorldState {
  return { sequence: 0, timestamp: 0, entities: {}, movementStates: {}, topology: [], navigationNodes: [], partialEntityIds: new Set() };
}

export function cloneReducedState(s: ReducedWorldState): ReducedWorldState {
  return {
    sequence: s.sequence,
    timestamp: s.timestamp,
    entities: { ...s.entities },
    movementStates: { ...s.movementStates },
    topology: s.topology,
    navigationNodes: s.navigationNodes,
    partialEntityIds: new Set(s.partialEntityIds),
  };
}

function refreshPartial(state: ReducedWorldState, id: V12EntityId) {
  const e = state.entities[id];
  if (!e || isFullySpatialEntity(e)) state.partialEntityIds.delete(id);
  else state.partialEntityIds.add(id);
}

function loadBaselinePayload(state: ReducedWorldState, payload: WorldBaselinePayload) {
  state.entities = { ...(payload.entities || {}) };
  state.movementStates = { ...(payload.movementStates || {}) };
  state.topology = payload.topology || [];
  state.navigationNodes = payload.navigationNodes || [];
  state.partialEntityIds = new Set();
  for (const id of Object.keys(state.entities)) refreshPartial(state, id);
}

/** Builds reducer state from a WORLD_BASELINE envelope. */
export function stateFromBaseline(baseline: V12EventEnvelope<WorldBaselinePayload>): ReducedWorldState {
  if (baseline.eventType !== V12EventType.WORLD_BASELINE) {
    throw new Error(`stateFromBaseline requires a WORLD_BASELINE event, got ${baseline.eventType}`);
  }
  const state = emptyReducedState();
  loadBaselinePayload(state, baseline.payload);
  state.sequence = baseline.sequence;
  state.timestamp = baseline.authoritativeTimestamp;
  return state;
}

/** Builds reducer state from a (historical) snapshot, e.g. a replay window start state. */
export function stateFromSnapshot(snapshot: WorldSnapshot, partialEntityIds: V12EntityId[] = []): ReducedWorldState {
  const state = emptyReducedState();
  loadBaselinePayload(state, {
    entities: snapshot.entities,
    movementStates: snapshot.movementStates,
    topology: snapshot.topology,
    navigationNodes: snapshot.navigationNodes,
  });
  for (const id of partialEntityIds) if (state.entities[id]) state.partialEntityIds.add(id);
  state.sequence = snapshot.sequence;
  state.timestamp = snapshot.timestamp;
  return state;
}

/**
 * Applies one event in place. Callers must apply events in `compareEvents` order.
 * Returns the ids of entities touched (for renderer notifications).
 */
export function applyEvent(state: ReducedWorldState, envelope: V12EventEnvelope): { updated: V12EntityId[]; removed: V12EntityId[]; reset: boolean } {
  const { eventType, entityId } = envelope;
  const payload: any = envelope.payload ?? {};
  const result = { updated: [] as V12EntityId[], removed: [] as V12EntityId[], reset: false };

  state.sequence = envelope.sequence;
  state.timestamp = envelope.authoritativeTimestamp;

  if (eventType === V12EventType.WORLD_BASELINE) {
    // A later baseline is an authoritative re-anchor of the whole projection.
    loadBaselinePayload(state, payload);
    result.reset = true;
    return result;
  }

  if (MOVEMENT_EVENTS.has(eventType)) {
    if (payload.movementState && typeof payload.movementState === 'object') {
      state.movementStates[entityId] = payload.movementState as MovementState;
      result.updated.push(entityId);
    }
    return result;
  }

  if (eventType === V12EventType.ENTITY_DELETED) {
    delete state.entities[entityId];
    delete state.movementStates[entityId];
    state.partialEntityIds.delete(entityId);
    result.removed.push(entityId);
    return result;
  }

  const existing = state.entities[entityId] as any;
  let next: any;

  switch (eventType) {
    case V12EventType.ENTITY_CREATED:
    case V12EventType.ENTITY_UPDATED:
      // Merge over what is known; never fill in fields the history does not contain.
      next = existing ? { ...existing, ...payload } : { id: entityId, type: envelope.entityType, ...payload };
      break;
    case V12EventType.TRANSFORM_UPDATED:
      next = existing
        ? { ...existing, transform: { ...(existing.transform || {}), ...payload } }
        : { id: entityId, type: envelope.entityType, transform: { ...payload } };
      break;
    case V12EventType.VISIBILITY_UPDATED:
      next = existing
        ? { ...existing, visibility: { ...(existing.visibility || {}), ...payload } }
        : { id: entityId, type: envelope.entityType, visibility: { ...payload } };
      break;
    default:
      // Unknown event types advance the sequence but do not alter state.
      return result;
  }

  next.id = entityId;
  state.entities[entityId] = next as WorldEntity;
  refreshPartial(state, entityId);
  result.updated.push(entityId);
  return result;
}

export function toWorldSnapshot(state: ReducedWorldState, mode: WorldMode = WorldMode.REPLAY): WorldSnapshot {
  return {
    version: '1.0.0',
    sequence: state.sequence,
    timestamp: state.timestamp,
    mode,
    entities: { ...state.entities },
    topology: state.topology,
    navigationNodes: state.navigationNodes,
    movementStates: { ...state.movementStates },
  };
}

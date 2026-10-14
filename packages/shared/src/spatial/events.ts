import { V12EntityType } from './world-state';

export enum V12EventType {
  ENTITY_CREATED = 'ENTITY_CREATED',
  ENTITY_UPDATED = 'ENTITY_UPDATED',
  ENTITY_DELETED = 'ENTITY_DELETED',
  TRANSFORM_UPDATED = 'TRANSFORM_UPDATED',
  VISIBILITY_UPDATED = 'VISIBILITY_UPDATED',
  
  // Movement Events
  MOVEMENT_STARTED = 'MOVEMENT_STARTED',
  MOVEMENT_UPDATED = 'MOVEMENT_UPDATED',
  MOVEMENT_ARRIVED = 'MOVEMENT_ARRIVED',
  MOVEMENT_BLOCKED = 'MOVEMENT_BLOCKED',
  MOVEMENT_CANCELLED = 'MOVEMENT_CANCELLED',

  /**
   * History anchor: full spatial projection captured from authoritative state at a known sequence.
   * Persisted in spatial history; broadcast to live consumers only as a lightweight sequence marker.
   */
  WORLD_BASELINE = 'WORLD_BASELINE'
}

export interface WorldBaselinePayload {
  entities: Record<string, any>;
  topology?: any[];
  navigationNodes?: any[];
  movementStates?: Record<string, any>;
}

export interface V12EventEnvelope<T = any> {
  eventId: string;
  eventType: V12EventType | string;
  schemaVersion: string;
  entityId: string;
  entityType: V12EntityType;
  aggregateId?: string;
  sequence: number;
  authoritativeTimestamp: number;
  correlationId?: string;
  causationId?: string;
  accessibilityCue?: string;
  payload: T;
}

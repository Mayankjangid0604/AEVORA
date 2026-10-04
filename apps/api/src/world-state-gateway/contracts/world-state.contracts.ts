export const WORLD_STATE_CONTRACT_VERSION = '1.0.0' as const;

export type WorldEntityType =
  | 'COMPANY' | 'EMPLOYEE' | 'DEPARTMENT' | 'TEAM' | 'PROJECT' | 'TASK'
  | 'LEADERSHIP' | 'MEETING' | 'WORLD_LOCATION' | 'WORLD_OBJECT';

export interface EnterpriseIdentity {
  enterpriseType: string;
  enterpriseId: string;
  companyId: string;
}

export interface WorldIdentity {
  worldId: string;
  entityType: WorldEntityType;
}

export interface IdentityMapping extends EnterpriseIdentity {
  worldId: string;
  entityType: WorldEntityType;
  mappingVersion: number;
}

export interface WorldLocation {
  locationId: string;
  parentLocationId?: string | null;
  kind: string;
  state?: Record<string, unknown>;
}

export interface WorldEntity {
  identity: IdentityMapping;
  state: Record<string, unknown>;
  version: number;
  streamKey: string;
  updatedAt: string;
}

export interface WorldState {
  contractVersion: typeof WORLD_STATE_CONTRACT_VERSION;
  companyId: string;
  globalCheckpoint: number;
  entities: WorldEntity[];
  stale: boolean;
  degraded: boolean;
  reconciliationState: 'HEALTHY' | 'STALE' | 'DEGRADED' | 'RECONCILING' | 'FAILED';
}

export interface WorldEventEnvelope {
  contractVersion: typeof WORLD_STATE_CONTRACT_VERSION;
  eventId: string;
  sourceEventId: string;
  eventType: string;
  occurredAt: string;
  ingestedAt: string;
  companyId: string;
  streamKey: string;
  streamSequence: number;
  globalCheckpoint: number;
  correlationId: string;
  causationId: string;
  enterpriseIdentity?: EnterpriseIdentity;
  worldIdentity?: WorldIdentity;
  payload: Record<string, unknown>;
}

export interface WorldDelta {
  contractVersion: typeof WORLD_STATE_CONTRACT_VERSION;
  eventId: string;
  companyId: string;
  globalCheckpoint: number;
  streamKey: string;
  streamSequence: number;
  changed: WorldEntity[];
  removedWorldIds: string[];
  stale: boolean;
  degraded: boolean;
}

export interface WorldSnapshot {
  contractVersion: typeof WORLD_STATE_CONTRACT_VERSION;
  snapshotId: string;
  companyId: string;
  scope: 'GLOBAL' | 'COMPANY' | 'STREAM';
  scopeKey: string;
  globalCheckpoint: number;
  streamVersions: Record<string, number>;
  state: WorldState;
  createdAt: string;
}

export interface WorldCheckpoint {
  companyId: string;
  globalCheckpoint: number;
  streamVersions: Record<string, number>;
  updatedAt: string;
}

export interface ReconciliationState {
  companyId: string;
  status: 'HEALTHY' | 'STALE' | 'DEGRADED' | 'RECONCILING' | 'FAILED';
  authoritativeCheckpoint: number;
  materializedCheckpoint: number;
  lastAuditAt?: string | null;
  lastError?: string | null;
}

export interface WorldGatewayCommandRequest {
  contractVersion: typeof WORLD_STATE_CONTRACT_VERSION;
  requestId: string;
  companyId: string;
  actorId: string;
  action: string;
  target?: EnterpriseIdentity;
  parameters: Record<string, unknown>;
  correlationId: string;
}

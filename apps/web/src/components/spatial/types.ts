/**
 * V15 Authoritative Spatial Entity Types & Viewport Contracts.
 * Directly reflects @aevora/shared/src/v12/world-state.ts without exposing internal server internals.
 */

export type V12EntityId = string;

export enum V12EntityType {
  WORLD = 'WORLD',
  REGION = 'REGION',
  COUNTRY = 'COUNTRY',
  CITY = 'CITY',
  CAMPUS = 'CAMPUS',
  BUILDING = 'BUILDING',
  FLOOR = 'FLOOR',
  ROOM = 'ROOM',
  OFFICE = 'OFFICE',
  DEPARTMENT_SPACE = 'DEPARTMENT_SPACE',
  MEETING_ROOM = 'MEETING_ROOM',
  WORKSPACE = 'WORKSPACE',
  PARKING = 'PARKING',
  PERSON = 'PERSON',
  VEHICLE = 'VEHICLE',
  COMPANY = 'COMPANY',
  UNKNOWN = 'UNKNOWN',
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vector3D;
  rotation: Quaternion;
  scale: Vector3D;
}

export interface VisibilityMetadata {
  isVisible: boolean;
  opacity: number;
  renderState: 'NORMAL' | 'HIGHLIGHTED' | 'DIMMED' | 'HIDDEN' | 'OCCLUDED' | 'WIREFRAME';
}

export interface BaseWorldEntity {
  id: V12EntityId;
  type: V12EntityType;
  name: string;
  parentId?: V12EntityId;
  transform: Transform;
  visibility: VisibilityMetadata;
  assetId?: string;
  metadata?: Record<string, unknown>;
}

export interface RoomEntity extends BaseWorldEntity {
  roomType?: string;
  departmentId?: string;
}

export interface WorkspaceEntity extends BaseWorldEntity {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  floorId?: string;
  buildingId?: string;
  isActive?: boolean;
  isOccupied?: boolean;
}

export interface ParkingEntity extends BaseWorldEntity {
  capacity?: number;
  availableSpots?: number;
}

export interface PersonEntity extends BaseWorldEntity {
  aevoraId?: string;
  aevoraType?: string;
  departmentId?: string;
  departmentName?: string;
  roleId?: string;
  roleTitle?: string;
  workspaceId?: string;
  floorId?: string;
  floorLevel?: number;
  buildingId?: string;
  buildingName?: string;
  spatialState?: string;
  currentActivity?: string;
  movement?: {
    movementState?: string;
    currentLocationId?: string;
    currentLocationType?: string;
    currentNodeId?: string;
    destinationNodeId?: string;
    path?: string[];
    progress?: number;
    intentSource?: string;
    intentId?: string;
  };
}

export interface VehicleEntity extends BaseWorldEntity {
  companyId?: string;
  ownerEmployeeId?: string;
  vehicleClass?: string;
  parkingAreaId?: string;
  isParked?: boolean;
  occupantEmployeeIds?: string[];
}

export interface FloorEntity extends BaseWorldEntity {
  level: number;
  rooms?: V12EntityId[];
}

export interface BuildingEntity extends BaseWorldEntity {
  floors?: V12EntityId[];
}

export type WorldEntity =
  | BaseWorldEntity
  | RoomEntity
  | WorkspaceEntity
  | ParkingEntity
  | PersonEntity
  | VehicleEntity
  | FloorEntity
  | BuildingEntity;

export interface TopologyEdge {
  id: string;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  distance: number;
  traversalType: string;
  accessibility: string;
  isEnabled: boolean;
}

export interface NavigationNode {
  id: string;
  entityId: string;
  entityType: string;
  isTraversable: boolean;
  nodeType: string;
  position: Vector3D;
}

export interface WorldSnapshot {
  version: string;
  sequence: number;
  timestamp: number;
  entities: Record<V12EntityId, WorldEntity>;
  topology?: TopologyEdge[];
  navigationNodes?: NavigationNode[];
  streamingStates?: Record<string, string>;
}

export type ConnectionState =
  | 'INITIALIZING'
  | 'LOADING_SNAPSHOT'
  | 'SYNCHRONIZED'
  | 'STREAMING'
  | 'RECONCILING'
  | 'DISCONNECTED'
  | 'ERROR';

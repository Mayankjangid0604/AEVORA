export type V12EntityId = string;
export type AevoraEntityId = string;

export interface Vector3 {
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
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export interface VisibilityMetadata {
  isVisible: boolean;
  opacity: number;
  renderState: 'NORMAL' | 'GHOSTED' | 'HIDDEN';
}

export enum V12EntityType {
  REGION = 'REGION',
  CITY = 'CITY',
  CAMPUS = 'CAMPUS',
  BUILDING = 'BUILDING',
  FLOOR = 'FLOOR',
  ROOM = 'ROOM',
  OFFICE = 'OFFICE',
  DEPARTMENT_SPACE = 'DEPARTMENT_SPACE',
  WORKSPACE = 'WORKSPACE',
  MEETING_ROOM = 'MEETING_ROOM',
  PARKING = 'PARKING',
  VEHICLE = 'VEHICLE',
  PERSON = 'PERSON',
  COMPANY = 'COMPANY',
}

export interface BaseWorldEntity {
  id: V12EntityId;
  type: V12EntityType;
  name: string;
  transform: Transform;
  visibility: VisibilityMetadata;
  parentId?: V12EntityId; 
  
  // Enterprise Relationship Reference - The authoritative Aevora entity
  aevoraId?: AevoraEntityId;
  aevoraType?: string; 
}

export interface Region extends BaseWorldEntity { type: V12EntityType.REGION; }
export interface City extends BaseWorldEntity { type: V12EntityType.CITY; }
export interface Campus extends BaseWorldEntity { type: V12EntityType.CAMPUS; }
export interface Building extends BaseWorldEntity { type: V12EntityType.BUILDING; floors: V12EntityId[]; }
export interface Floor extends BaseWorldEntity { type: V12EntityType.FLOOR; rooms: V12EntityId[]; level: number; }
export interface Room extends BaseWorldEntity { type: V12EntityType.ROOM; roomType?: string; }
export interface Office extends BaseWorldEntity { type: V12EntityType.OFFICE; roomType?: string; assignedEmployeeId?: AevoraEntityId; }
export interface DepartmentSpace extends BaseWorldEntity { type: V12EntityType.DEPARTMENT_SPACE; roomType?: string; departmentId?: AevoraEntityId; }
export interface MeetingRoom extends BaseWorldEntity { type: V12EntityType.MEETING_ROOM; roomType?: string; }
export interface Workspace extends BaseWorldEntity { type: V12EntityType.WORKSPACE; employeeId?: AevoraEntityId; companyId?: AevoraEntityId; departmentId?: AevoraEntityId; isActive?: boolean; isOccupied?: boolean; }
export interface Parking extends BaseWorldEntity { type: V12EntityType.PARKING; capacity: number; availableSpots: number; }

export interface Vehicle extends BaseWorldEntity { 
  type: V12EntityType.VEHICLE; 
  ownerId?: AevoraEntityId; 
  currentVelocity?: Vector3; 
  movement?: Partial<MovementState>; 
  vehicleClass?: 'STANDARD' | 'EXECUTIVE' | 'ASSISTANT' | 'CHAIRMAN' | 'CEO' | 'MD';
  occupants?: AevoraEntityId[];
}
export interface Person extends BaseWorldEntity { type: V12EntityType.PERSON; currentActivity?: string; movement?: Partial<MovementState>; }
export interface CompanyEntity extends BaseWorldEntity { type: V12EntityType.COMPANY; }

export type WorldEntity = 
  | Region | City | Campus | Building | Floor | Room | Office 
  | DepartmentSpace | Workspace | MeetingRoom | Parking | Vehicle | Person | CompanyEntity;

export enum WorldMode {
  LIVE = 'LIVE',
  REPLAY = 'REPLAY'
}

export interface WorldSnapshot {
  version: string;
  sequence: number;
  timestamp: number;
  mode?: WorldMode;
  entities: Record<V12EntityId, WorldEntity>;
  topology?: TopologyEdge[];
  navigationNodes?: NavigationNode[];
  movementStates?: Record<V12EntityId, MovementState>;
}

export interface TopologyEdge {
  id: string;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  distance?: number;
  traversalType?: string;
  accessibility?: string;
  isEnabled?: boolean;
  isBidirectional?: boolean;
  isAccessible?: boolean;
}

export interface NavigationNode {
  id: string;
  entityId: string;
  entityType: string;
  position: Vector3;
  floorId?: string;
  buildingId?: string;
  siteId?: string;
  nodeType: string;
  isTraversable: boolean;
  name?: string;
  metadata?: any;
}

export interface MovementState {
  id: string;
  entityId: string;
  entityType: string;
  currentLocationId: string;
  currentLocationType: string;
  currentNodeId?: string;
  destinationNodeId?: string;
  path: string[];
  movementState: 'IDLE' | 'MOVING' | 'ARRIVED' | 'WAITING' | 'BLOCKED' | 'INTERRUPTED' | 'UNKNOWN';
  movementMode: string;
  progress: number;
  blockedReason?: string;
  intentSource?: string;
  intentId?: string;
  timestamp: number;
}

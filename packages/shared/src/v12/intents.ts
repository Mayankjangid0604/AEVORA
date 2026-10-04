export enum V12IntentType {
  // Navigation
  NAVIGATE_TO = 'NAVIGATE_TO',
  GO_TO_COMPANY = 'GO_TO_COMPANY',
  GO_TO_DEPARTMENT = 'GO_TO_DEPARTMENT',
  GO_TO_EMPLOYEE = 'GO_TO_EMPLOYEE',
  GO_TO_OFFICE = 'GO_TO_OFFICE',
  GO_TO_VEHICLE = 'GO_TO_VEHICLE',

  // Selection & Inspection
  SELECT_ENTITY = 'SELECT_ENTITY',
  INSPECT_ENTITY = 'INSPECT_ENTITY',
  FOLLOW_ENTITY = 'FOLLOW_ENTITY',
  
  // Information
  WHO_IS_THIS = 'WHO_IS_THIS',
  WHO_MANAGES_THIS = 'WHO_MANAGES_THIS',
  WHERE_IS_EMPLOYEE = 'WHERE_IS_EMPLOYEE',
  WHERE_IS_DEPARTMENT = 'WHERE_IS_DEPARTMENT',
  WHAT_IS_THIS = 'WHAT_IS_THIS',
  WHAT_IS_HAPPENING_HERE = 'WHAT_IS_HAPPENING_HERE',

  // Executive Action (Consequential)
  BRING_EXECUTIVE = 'BRING_EXECUTIVE',
  CALL_EXECUTIVE = 'CALL_EXECUTIVE',
  START_MEETING = 'START_MEETING',

  // Camera / Presentation
  SET_VIEW_MODE = 'SET_VIEW_MODE'
}

export enum V12IntentCategory {
  READ_ONLY = 'READ_ONLY',
  PRESENTATION = 'PRESENTATION',
  CONSEQUENTIAL = 'CONSEQUENTIAL',
  SPATIAL_NAVIGATION = 'SPATIAL_NAVIGATION',
  ASSISTANT = 'ASSISTANT'
}

export interface V12IntentContext {
  currentCompanyId?: string;
  currentBuildingId?: string;
  currentFloorId?: string;
  currentRoomId?: string;
  selectedEntityId?: string;
  correlationId?: string;
  timestamp?: number;
  selectedEmployeeId?: string;
  selectedVehicleId?: string;
  currentCameraMode?: string;
  currentLocation?: any; // Vector3 or similar
  recentConversationContext?: string[];
}

export interface V12ExecutiveAssistantContext {
  actorId?: string;
  actorRole?: string;
  currentCompanyId?: string;
  currentSiteId?: string;
  currentBuildingId?: string;
  currentFloorId?: string;
  currentRoomId?: string;
  currentSpatialEntityId?: string;
  selectedCompanyId?: string;
  selectedEmployeeId?: string;
  selectedDepartmentId?: string;
  selectedTeamId?: string;
  selectedProjectId?: string;
  selectedTaskId?: string;
  currentMeetingId?: string;
  selectedEntityId?: string;
  selectedEntityType?: string;
  currentCameraMode?: string;
  currentVehicleId?: string;
  currentOccupants?: string[];
  currentCompanyScope?: string;
  sessionContext?: any;
  currentCommandId?: string;
  timestamp: string;
  correlationId: string;
  causationId?: string;
}

export interface V12AssistantResponse {
  status: 'SUCCESS' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'VALIDATION_ERROR' | 'BACKEND_FAILURE' | 'CONFLICT' | 'REPLAY_READ_ONLY' | 'TEMPORARILY_UNAVAILABLE' | 'ERROR';
  correlationId: string;
  responseText: string;
  structuredData?: any;
  sourceInformation?: string;
  authoritativeStatus?: string;
  referencedEntityIds?: string[];
}

export interface V12ResolvedIntent {
  intent: V12IntentType;
  category: V12IntentCategory;
  confidence: number;
  parameters: Record<string, any>; // e.g. { targetName: "Research", viewMode: "overhead" }
  targetEntityId?: string;
  ambiguous?: boolean;
  message?: string; // e.g. response text
}

export enum V12VoiceState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  TRANSCRIBING = 'TRANSCRIBING',
  UNDERSTANDING = 'UNDERSTANDING',
  RESOLVING = 'RESOLVING',
  AUTHORIZING = 'AUTHORIZING',
  EXECUTING = 'EXECUTING',
  CONFIRMING = 'CONFIRMING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  AMBIGUOUS = 'AMBIGUOUS',
  FAILED = 'FAILED',
  UNSUPPORTED = 'UNSUPPORTED'
}

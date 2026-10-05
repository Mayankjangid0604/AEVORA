/**
 * The V12 employee spatial embodiment state machine.
 *
 * This is deliberately NOT a new stored state machine: Aevora's Employee.activity already carries
 * the authoritative "why" (WORKING, IN_MEETING, IDLE, ...), and V12SpatialMovementState already
 * carries the authoritative "where/how" (MOVING, BLOCKED, INTERRUPTED, movementMode). Storing a
 * third, independent "current spatial state" field would be a second authority that could drift
 * out of sync with those two. Instead this is a pure, deterministic derivation over them, computed
 * fresh every time — same inputs always produce the same state, with no randomness and no timers.
 */
export enum EmployeeSpatialState {
  IDLE = 'IDLE',
  WORKING = 'WORKING',
  MOVING = 'MOVING',
  IN_MEETING = 'IN_MEETING',
  TRAVELLING = 'TRAVELLING',
  IN_VEHICLE = 'IN_VEHICLE',
  AT_WORKSPACE = 'AT_WORKSPACE',
  AT_OFFICE = 'AT_OFFICE',
  ON_BREAK = 'ON_BREAK',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface EmployeeSpatialStateInputs {
  /** V12SpatialMovementState.movementState, or undefined if the employee has no movement record yet. */
  movementState?: 'IDLE' | 'MOVING' | 'ARRIVED' | 'WAITING' | 'BLOCKED' | 'INTERRUPTED' | 'UNKNOWN' | null;
  /** V12SpatialMovementState.movementMode, e.g. 'WALK' | 'VEHICLE'. */
  movementMode?: string | null;
  /** Authoritative Employee.activity (or the V12 currentActivity payload derived from it). */
  currentActivity?: string | null;
  /** Authoritative Employee.status — a terminated/suspended employee is never spatially active. */
  employeeStatus?: string | null;
}

/**
 * Deterministically derives the V12 spatial embodiment state from authoritative inputs.
 * Precedence (most specific physical fact wins over the business "why"):
 *   1. Employee status (terminated/suspended -> UNAVAILABLE) — the one rule that overrides everything
 *   2. In-transit movement (MOVING, by VEHICLE or on foot)
 *   3. A blocked/interrupted movement attempt -> UNAVAILABLE (physically can't get where they're going)
 *   4. Authoritative business activity (IN_MEETING, WORKING, ON_BREAK)
 *   5. Settled/idle location (AT_WORKSPACE if we have a workspace-anchored movement record, else IDLE)
 */
export function deriveEmployeeSpatialState(inputs: EmployeeSpatialStateInputs): EmployeeSpatialState {
  const status = (inputs.employeeStatus || '').toUpperCase();
  if (status && status !== 'ACTIVE') {
    return EmployeeSpatialState.UNAVAILABLE;
  }

  const movementState = (inputs.movementState || '').toUpperCase();
  const movementMode = (inputs.movementMode || '').toUpperCase();
  const activity = (inputs.currentActivity || '').toUpperCase();

  if (movementState === 'MOVING') {
    if (movementMode === 'VEHICLE') return EmployeeSpatialState.IN_VEHICLE;
    return activity === 'WORKING' || activity === 'TASK_ASSIGNED' ? EmployeeSpatialState.TRAVELLING : EmployeeSpatialState.MOVING;
  }

  if (movementState === 'BLOCKED' || movementState === 'INTERRUPTED') {
    return EmployeeSpatialState.UNAVAILABLE;
  }

  if (activity === 'IN_MEETING') return EmployeeSpatialState.IN_MEETING;
  if (activity === 'WORKING') return EmployeeSpatialState.WORKING;
  if (activity === 'ON_BREAK') return EmployeeSpatialState.ON_BREAK;
  if (activity === 'UNAVAILABLE') return EmployeeSpatialState.UNAVAILABLE;
  if (activity === 'AT_OFFICE') return EmployeeSpatialState.AT_OFFICE;

  if (movementState === 'ARRIVED' || movementState === 'IDLE') return EmployeeSpatialState.AT_WORKSPACE;

  return EmployeeSpatialState.IDLE;
}

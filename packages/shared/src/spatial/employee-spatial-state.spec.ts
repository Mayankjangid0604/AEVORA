import { deriveEmployeeSpatialState, EmployeeSpatialState } from './employee-spatial-state';

describe('deriveEmployeeSpatialState', () => {
  it('task start/assignment while travelling on foot -> TRAVELLING', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'MOVING', movementMode: 'WALK', currentActivity: 'WORKING' }))
      .toBe(EmployeeSpatialState.TRAVELLING);
  });

  it('task completion (settled, idle activity) -> AT_WORKSPACE', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'ARRIVED', currentActivity: 'IDLE' }))
      .toBe(EmployeeSpatialState.AT_WORKSPACE);
  });

  it('meeting start -> IN_MEETING', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'ARRIVED', currentActivity: 'IN_MEETING' }))
      .toBe(EmployeeSpatialState.IN_MEETING);
  });

  it('meeting completion (back to idle) -> AT_WORKSPACE', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'IDLE', currentActivity: 'IDLE' }))
      .toBe(EmployeeSpatialState.AT_WORKSPACE);
  });

  it('in-progress navigation on foot with no declared activity -> MOVING', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'MOVING', movementMode: 'WALK' }))
      .toBe(EmployeeSpatialState.MOVING);
  });

  it('vehicle travel -> IN_VEHICLE regardless of business activity', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'MOVING', movementMode: 'VEHICLE', currentActivity: 'WORKING' }))
      .toBe(EmployeeSpatialState.IN_VEHICLE);
  });

  it('interruption (navigation cancelled mid-flight) -> UNAVAILABLE', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'INTERRUPTED' }))
      .toBe(EmployeeSpatialState.UNAVAILABLE);
  });

  it('cancellation/blocked movement -> UNAVAILABLE', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'BLOCKED' }))
      .toBe(EmployeeSpatialState.UNAVAILABLE);
  });

  it('a terminated employee is UNAVAILABLE even mid-transit (status overrides everything, incl. replay/stale data)', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'MOVING', movementMode: 'WALK', employeeStatus: 'TERMINATED' }))
      .toBe(EmployeeSpatialState.UNAVAILABLE);
  });

  it('no movement record and no activity at all -> IDLE (safe default, never fabricates a specific state)', () => {
    expect(deriveEmployeeSpatialState({})).toBe(EmployeeSpatialState.IDLE);
  });

  it('is a pure deterministic function: identical inputs always produce identical output', () => {
    const inputs = { movementState: 'MOVING' as const, movementMode: 'VEHICLE', currentActivity: 'WORKING', employeeStatus: 'ACTIVE' };
    const results = new Set(Array.from({ length: 20 }, () => deriveEmployeeSpatialState(inputs)));
    expect(results.size).toBe(1);
  });

  it('ON_BREAK activity is preserved when settled', () => {
    expect(deriveEmployeeSpatialState({ movementState: 'IDLE', currentActivity: 'ON_BREAK' })).toBe(EmployeeSpatialState.ON_BREAK);
  });
});

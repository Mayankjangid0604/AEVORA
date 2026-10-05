import { canOccupyNode, canInteract, envelopeFor, HUMAN_ENVELOPE, VEHICLE_COLLISION_ENVELOPE, PhysicsLayer } from './physics';

describe('physics foundation — canOccupyNode', () => {
  const traversableNode = { id: 'n1', isTraversable: true };
  const blockedNode = { id: 'n2', isTraversable: false };

  it('blocks invalid movement into a non-traversable (STATIC_WORLD) node regardless of occupancy', () => {
    const result = canOccupyNode(blockedNode, [], { entityId: 'emp-1', entityType: 'EMPLOYEE' });
    expect(result).toEqual({ allowed: false, reason: 'STATIC_COLLISION', layer: PhysicsLayer.STATIC_WORLD });
  });

  it('allows a human into an empty traversable node', () => {
    const result = canOccupyNode(traversableNode, [], { entityId: 'emp-1', entityType: 'EMPLOYEE' });
    expect(result).toEqual({ allowed: true });
  });

  it('allows multiple humans to share a traversable-but-occupied node (traversable != unoccupied)', () => {
    const occupants = [{ entityId: 'emp-1', entityType: 'EMPLOYEE' as const }];
    const result = canOccupyNode(traversableNode, occupants, { entityId: 'emp-2', entityType: 'EMPLOYEE' });
    expect(result).toEqual({ allowed: true });
  });

  it('allows a human to enter a node a vehicle already occupies (boarding/alighting)', () => {
    const occupants = [{ entityId: 'veh-1', entityType: 'VEHICLE' as const }];
    const result = canOccupyNode(traversableNode, occupants, { entityId: 'emp-1', entityType: 'EMPLOYEE' });
    expect(result).toEqual({ allowed: true });
  });

  it('blocks a second vehicle from occupying a node a vehicle already occupies (VEHICLE_ENVELOPE exclusivity)', () => {
    const occupants = [{ entityId: 'veh-1', entityType: 'VEHICLE' as const }];
    const result = canOccupyNode(traversableNode, occupants, { entityId: 'veh-2', entityType: 'VEHICLE' });
    expect(result).toEqual({ allowed: false, reason: 'VEHICLE_COLLISION', layer: PhysicsLayer.VEHICLE_ENVELOPE });
  });

  it('allows a vehicle into an empty node even though the node is also traversable for humans', () => {
    const result = canOccupyNode(traversableNode, [], { entityId: 'veh-1', entityType: 'VEHICLE' });
    expect(result).toEqual({ allowed: true });
  });

  it('a vehicle re-evaluating its own current node is never blocked by itself', () => {
    const occupants = [{ entityId: 'veh-1', entityType: 'VEHICLE' as const }];
    const result = canOccupyNode(traversableNode, occupants, { entityId: 'veh-1', entityType: 'VEHICLE' });
    expect(result).toEqual({ allowed: true });
  });

  it('enforces an explicit occupancy ceiling for humans (ENTITY_OCCUPANCY layer)', () => {
    const occupants = Array.from({ length: 3 }, (_, i) => ({ entityId: `emp-${i}`, entityType: 'EMPLOYEE' as const }));
    const result = canOccupyNode(traversableNode, occupants, { entityId: 'emp-new', entityType: 'EMPLOYEE' }, 3);
    expect(result).toEqual({ allowed: false, reason: 'OCCUPANCY_LIMIT', layer: PhysicsLayer.ENTITY_OCCUPANCY });
  });

  it('is deterministic: the same inputs always produce the same result, regardless of how many times it is called', () => {
    const occupants = [{ entityId: 'veh-1', entityType: 'VEHICLE' as const }];
    const results = new Set(Array.from({ length: 10 }, () =>
      JSON.stringify(canOccupyNode(traversableNode, occupants, { entityId: 'veh-2', entityType: 'VEHICLE' }))));
    expect(results.size).toBe(1);
  });

  it('company/world isolation: this function has no companyId concept at all — isolation is enforced by whoever supplies the occupant list, never silently bypassed here', () => {
    // There is no companyId parameter to this function by design: physics only ever sees the
    // occupants it's given, and the caller (V12NavigationService) is responsible for only ever
    // querying same-company occupants. This test documents that contract.
    // (node, currentOccupants, incoming[, maxOccupants]) — no company param to accidentally misuse.
    // maxOccupants has a default, so JS Function.length (3) only counts params before the first default.
    expect(canOccupyNode.length).toBe(3);
  });
});

describe('physics foundation — collision envelopes', () => {
  it('human and vehicle envelopes are distinct dimensions', () => {
    expect(envelopeFor('EMPLOYEE')).toEqual(HUMAN_ENVELOPE);
    expect(envelopeFor('VEHICLE')).toEqual(VEHICLE_COLLISION_ENVELOPE);
    expect(VEHICLE_COLLISION_ENVELOPE.width).toBeGreaterThan(HUMAN_ENVELOPE.width);
    expect(VEHICLE_COLLISION_ENVELOPE.depth).toBeGreaterThan(HUMAN_ENVELOPE.depth);
  });
});

describe('physics foundation — canInteract (INTERACTION_ZONE)', () => {
  it('two entities at the same node can interact', () => {
    expect(canInteract({ nodeId: 'n1' }, { nodeId: 'n1' })).toBe(true);
  });
  it('two entities at different nodes cannot interact', () => {
    expect(canInteract({ nodeId: 'n1' }, { nodeId: 'n2' })).toBe(false);
  });
  it('an entity with no current node cannot interact with anyone', () => {
    expect(canInteract({ nodeId: null }, { nodeId: null })).toBe(false);
  });
});

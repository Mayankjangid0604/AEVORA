/**
 * V12 layered physics foundation (decision 88).
 *
 * This is explicitly a FOUNDATION, not rigid-body simulation: deterministic collision/occupancy
 * checks over the existing navigation graph, distinct from mere traversability. It is
 * renderer-independent (no Three.js/engine types) and carries no business logic — it only answers
 * "can this entity occupy this node given who else is there," using data the caller supplies.
 *
 * Layers, named after the existing repository's own spatial hierarchy
 * (V12SpatialWorld → ...Site → ...Building → ...Floor → ...Room, V12NavigationNode,
 * V12SpatialMovementState) rather than invented generic terms:
 *   - STATIC_WORLD:      world/building geometry that never moves (a node's own isTraversable flag)
 *   - BUILDING_BOUNDARY: floor/building containment (a node's floorId/buildingId)
 *   - NAVIGATION_GRAPH:  the pathfinding graph itself (V12NavigationNode/V12SpatialTopologyEdge)
 *   - ENTITY_OCCUPANCY:  who currently occupies a node (humans — many can share a room)
 *   - VEHICLE_ENVELOPE:  a vehicle's larger, exclusive footprint (only one vehicle per node)
 *   - INTERACTION_ZONE:  the loose "can these entities interact" check (same node, not colliding)
 *
 * A future real physics engine (rigid bodies, continuous collision, floor-transition dynamics) can
 * be attached behind this same `canOccupyNode`/`CollisionEnvelope` contract without the world-state
 * architecture changing — this module defines the contract, not the final physics implementation.
 */

export enum PhysicsLayer {
  STATIC_WORLD = 'STATIC_WORLD',
  BUILDING_BOUNDARY = 'BUILDING_BOUNDARY',
  NAVIGATION_GRAPH = 'NAVIGATION_GRAPH',
  ENTITY_OCCUPANCY = 'ENTITY_OCCUPANCY',
  VEHICLE_ENVELOPE = 'VEHICLE_ENVELOPE',
  INTERACTION_ZONE = 'INTERACTION_ZONE',
}

export type PhysicsEntityKind = 'EMPLOYEE' | 'VEHICLE';

export interface CollisionEnvelope {
  width: number;
  depth: number;
  height: number;
}

/** A human's footprint is small enough that a room/node comfortably holds many at once. */
export const HUMAN_ENVELOPE: CollisionEnvelope = { width: 0.6, depth: 0.6, height: 1.8 };
/** A vehicle's footprint is large enough that a node can hold at most one at a time (VEHICLE_ENVELOPE layer is exclusive). */
export const VEHICLE_COLLISION_ENVELOPE: CollisionEnvelope = { width: 1.8, depth: 4.5, height: 1.6 };

export function envelopeFor(kind: PhysicsEntityKind): CollisionEnvelope {
  return kind === 'VEHICLE' ? VEHICLE_COLLISION_ENVELOPE : HUMAN_ENVELOPE;
}

export interface NodeOccupant {
  entityId: string;
  entityType: PhysicsEntityKind;
}

export interface NavigationNodeLike {
  id: string;
  isTraversable: boolean;
}

/** A sane, explicit ceiling on simultaneous human occupancy of one node — not a magic number pulled from nowhere, but also not unlimited. */
export const DEFAULT_MAX_ENTITY_OCCUPANTS = 50;

export type CollisionDenialReason =
  | 'STATIC_COLLISION'     // the node itself is not traversable (STATIC_WORLD / BUILDING_BOUNDARY layer)
  | 'VEHICLE_COLLISION'    // a vehicle is already occupying this node (VEHICLE_ENVELOPE layer is exclusive)
  | 'OCCUPANCY_LIMIT';     // too many entities already present (ENTITY_OCCUPANCY layer capacity)

export type CollisionCheckResult =
  | { allowed: true }
  | { allowed: false; reason: CollisionDenialReason; layer: PhysicsLayer };

/**
 * Deterministic collision check: given the current occupants of a node (as the caller observed
 * them — order never affects the outcome, this function does not iterate nondeterministically) and
 * an incoming entity, decides whether that entity may occupy the node right now.
 */
export function canOccupyNode(
  node: NavigationNodeLike,
  currentOccupants: NodeOccupant[],
  incoming: { entityId: string; entityType: PhysicsEntityKind },
  maxOccupants: number = DEFAULT_MAX_ENTITY_OCCUPANTS,
): CollisionCheckResult {
  if (!node.isTraversable) {
    return { allowed: false, reason: 'STATIC_COLLISION', layer: PhysicsLayer.STATIC_WORLD };
  }

  const others = currentOccupants.filter((o) => o.entityId !== incoming.entityId);

  if (incoming.entityType === 'VEHICLE') {
    const vehicleAlreadyThere = others.some((o) => o.entityType === 'VEHICLE');
    if (vehicleAlreadyThere) {
      return { allowed: false, reason: 'VEHICLE_COLLISION', layer: PhysicsLayer.VEHICLE_ENVELOPE };
    }
  } else {
    // A human entering a node a vehicle currently occupies is allowed (e.g. boarding/alighting at
    // a parking node) — only vehicle-vehicle exclusivity is enforced at this foundation layer.
    if (others.length >= maxOccupants) {
      return { allowed: false, reason: 'OCCUPANCY_LIMIT', layer: PhysicsLayer.ENTITY_OCCUPANCY };
    }
  }

  return { allowed: true };
}

/** Loose INTERACTION_ZONE check: can two entities interact right now — same node, both present. Carries no business meaning beyond proximity. */
export function canInteract(a: { nodeId: string | null }, b: { nodeId: string | null }): boolean {
  return a.nodeId !== null && a.nodeId === b.nodeId;
}

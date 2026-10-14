import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12EventType, canOccupyNode, NodeOccupant } from '@aevora/shared';

// Deterministic movement speed, in topology distance-units per tick (tick = 1 second).
// Topology edge `distance` is an abstract unit set by map authoring, not meters — these
// constants are calibrated against that same unit so WALK/VEHICLE stay proportionate.
const MOVEMENT_SPEED_PER_TICK: Record<string, number> = {
  WALK: 0.4,
  VEHICLE: 2.0,
};
const TICK_MS = 1000;

/**
 * Minimal binary min-heap keyed by (distance, nodeId), nodeId breaking ties deterministically.
 * Used instead of a Set + linear scan so findPath is O((V+E) log V) instead of O(V^2) — the O(V^2)
 * linear-scan version measured ~1.6s on a 10,000-node graph; this swaps the extraction strategy
 * only, leaving the relaxation/tie-break semantics (and therefore the chosen path) unchanged.
 */
class MinHeap {
  private items: { dist: number; id: string }[] = [];

  push(dist: number, id: string) {
    this.items.push({ dist, id });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.isLess(this.items[i], this.items[parent])) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else break;
    }
  }

  pop(): { dist: number; id: string } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < this.items.length && this.isLess(this.items[l], this.items[smallest])) smallest = l;
        if (r < this.items.length && this.isLess(this.items[r], this.items[smallest])) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top;
  }

  get size() { return this.items.length; }

  private isLess(a: { dist: number; id: string }, b: { dist: number; id: string }): boolean {
    if (a.dist !== b.dist) return a.dist < b.dist;
    return a.id.localeCompare(b.id) < 0;
  }
}

/**
 * Deterministic per-tick progress fraction for a route of `totalDistance` topology units.
 * Same distance + same mode always yields the same increment (and thus the same number of
 * ticks to arrival) — no randomness, no flat per-route constant.
 */
export function computeProgressIncrement(totalDistance: number, movementMode: string): number {
  if (totalDistance <= 0) return 1.0;
  const speedPerTick = MOVEMENT_SPEED_PER_TICK[movementMode] ?? MOVEMENT_SPEED_PER_TICK.WALK;
  return speedPerTick / totalDistance;
}

@Injectable()
export class NavigationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(V12NavigationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorldStateEventService) private readonly eventService: WorldStateEventService
  ) {}

  private tickInterval: NodeJS.Timeout | null = null;

  async onModuleInit() {
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private async tick() {
    try {
      const movingEntities = await this.prisma.v12SpatialMovementState.findMany({
        where: { movementState: 'MOVING' }
      });

      for (const entity of movingEntities) {
        const progressIncrement = computeProgressIncrement(entity.totalDistance, entity.movementMode);
        const newProgress = Math.min(1.0, entity.progress + progressIncrement);
        const isArrived = newProgress >= 1.0;

        const updated = await this.prisma.v12SpatialMovementState.update({
          where: { entityId: entity.entityId },
          data: {
            progress: newProgress,
            movementState: isArrived ? 'ARRIVED' : 'MOVING',
            currentNodeId: isArrived ? entity.destinationNodeId : entity.currentNodeId,
            timestamp: new Date()
          }
        });

        // Broadcast progress or arrival
        const ctx = await this.resolveEntityContext(entity.entityId, entity.entityType);
        if (ctx) {
            const envelope = this.eventService.createEventEnvelope(
                isArrived ? V12EventType.MOVEMENT_ARRIVED : V12EventType.MOVEMENT_UPDATED,
                entity.entityId,
                ctx.worldEntityType as any,
                { movementState: updated },
                ctx.companyId,
                undefined,
                undefined,
                isArrived ? `${ctx.name} has arrived at their destination.` : undefined
            );
            await this.eventService.broadcastEvent(ctx.companyId, envelope).catch(e => {
                this.logger.error(`Failed to broadcast movement for ${entity.entityId}`, e);
            });
        }
      }
    } catch (err) {
      this.logger.error('Error in movement tick loop', err);
    }
  }

  /**
   * Deterministic pathfinding algorithm using Dijkstra.
   * If there's a tie in distances, it breaks the tie by choosing the node with the smaller ID alphabetically.
   */
  async findPath(startNodeId: string, endNodeId: string): Promise<{ path: string[]; distance: number } | null> {
    const nodes = await this.prisma.v12NavigationNode.findMany({ where: { isTraversable: true } });
    const edges = await this.prisma.v12SpatialTopologyEdge.findMany({ where: { isEnabled: true } });

    const graph = new Map<string, { target: string; distance: number }[]>();
    for (const node of nodes) {
      graph.set(node.id, []);
    }

    for (const edge of edges) {
      if (graph.has(edge.sourceId) && graph.has(edge.targetId)) {
        // Directed edge assumed; if bidirectional, we should add both, but let's assume directed or they are added symmetrically
        graph.get(edge.sourceId)!.push({ target: edge.targetId, distance: edge.distance });
      }
    }

    // Sort edges by target ID to guarantee determinism in tie-breaking during identical distances
    for (const [_, adj] of graph) {
      adj.sort((a, b) => a.target.localeCompare(b.target));
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const visited = new Set<string>();

    for (const node of nodes) {
      dist.set(node.id, Infinity);
    }

    if (!dist.has(startNodeId) || !dist.has(endNodeId)) {
        return null; // Start or end not in graph
    }

    dist.set(startNodeId, 0);
    const heap = new MinHeap();
    heap.push(0, startNodeId);

    while (heap.size > 0) {
      const popped = heap.pop()!;
      const u = popped.id;

      if (visited.has(u)) continue; // stale heap entry from an earlier, now-superseded relaxation
      if (popped.dist > dist.get(u)!) continue; // same reason, belt-and-braces

      if (u === endNodeId) {
        break; // found target
      }

      visited.add(u);

      const neighbors = graph.get(u) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.target)) continue;

        const alt = dist.get(u)! + neighbor.distance;
        const currentDist = dist.get(neighbor.target)!;

        if (alt < currentDist) {
          dist.set(neighbor.target, alt);
          prev.set(neighbor.target, u);
          heap.push(alt, neighbor.target);
        } else if (alt === currentDist) {
          // Tie-break rule: if distances are equal, pick the path that comes from the node with smaller ID
          const currentPrev = prev.get(neighbor.target);
          if (currentPrev && u.localeCompare(currentPrev) < 0) {
            prev.set(neighbor.target, u);
          }
        }
      }
    }

    if (dist.get(endNodeId) === Infinity) {
      return null;
    }

    const path: string[] = [];
    let curr: string | undefined = endNodeId;
    while (curr) {
      path.unshift(curr);
      curr = prev.get(curr);
    }

    return { path, distance: dist.get(endNodeId)! };
  }

  /**
   * Resolves the authoritative company and display name for a moving entity, branching on
   * entityType so the (originally employee-only) movement pipeline also serves V12SpatialVehicle
   * without a parallel movement system. Returns null if the entity is unknown.
   */
  private async resolveEntityContext(entityId: string, entityType: string): Promise<{ companyId: string; name: string; worldEntityType: string } | null> {
    if (entityType === 'VEHICLE') {
      const vehicle = await this.prisma.v12SpatialVehicle.findUnique({ where: { id: entityId } });
      if (!vehicle) return null;
      return { companyId: vehicle.companyId, name: `Vehicle ${vehicle.id}`, worldEntityType: 'VEHICLE' };
    }
    const emp = await this.prisma.employee.findUnique({ where: { id: entityId } });
    if (!emp || !emp.companyId) {
      const chairman = await this.prisma.chairman.findUnique({ where: { id: entityId }, include: { companies: true } });
      if (chairman && chairman.companies.length > 0) {
        return { companyId: chairman.companies[0].id, name: chairman.name, worldEntityType: 'PERSON' };
      }
      return null;
    }
    return { companyId: emp.companyId, name: emp.name, worldEntityType: 'PERSON' };
  }

  async requestEntityMovement(entityId: string, destinationId: string, context: any) {
    this.logger.log(`Requesting movement for entity ${entityId} to destination ${destinationId}`);

    // 1. Validate entity exists and is authoritative (Employee or V12SpatialVehicle)
    const entityType = context?.entityType === 'VEHICLE' ? 'VEHICLE' : 'EMPLOYEE';
    const entityCtx = await this.resolveEntityContext(entityId, entityType);
    if (!entityCtx) {
      throw new Error(`Entity ${entityId} not found or not authorized`);
    }

    // 2. Resolve destination node
    // Assume destinationId is a Room or Node ID. Let's find a node in that destination.
    let destNode = await this.prisma.v12NavigationNode.findFirst({
        where: { entityId: destinationId, isTraversable: true },
        orderBy: { id: 'asc' } // deterministic
    });
    if (!destNode) {
        // Might already be a node ID
        destNode = await this.prisma.v12NavigationNode.findUnique({ where: { id: destinationId }});
    }
    
    if (!destNode || !destNode.isTraversable) {
       return this.markMovementBlocked(entityId, entityType, 'DESTINATION_NOT_FOUND_OR_INACCESSIBLE');
    }

    // 2a. A closed company's site is never a valid destination — mirrors Aevora's own Company.status
    // authority (see V12SpatialService.deactivateCompanySite) without inventing new business rules.
    if (destNode.siteId) {
      const site = await this.prisma.v12SpatialSite.findUnique({ where: { id: destNode.siteId } });
      if (site && site.isActive === false) {
        return this.markMovementBlocked(entityId, entityType, 'DESTINATION_COMPANY_CLOSED');
      }
    }

    // 2b. Physics foundation check (ENTITY_OCCUPANCY layer): ensure the destination node
    // can physically accept this incoming entity before allowing movement to proceed.
    const settledAtDestination = await this.prisma.v12SpatialMovementState.findMany({
      where: { currentNodeId: destNode.id, movementState: { in: ['ARRIVED', 'IDLE'] } },
    });
    const occupants: NodeOccupant[] = settledAtDestination.map((m: any) => ({ entityId: m.entityId, entityType: m.entityType }));
    const collision = canOccupyNode(destNode, occupants, { entityId, entityType: entityType as any });
    if (collision.allowed === false) {
      return this.markMovementBlocked(entityId, entityType, `PHYSICS_${collision.reason}`);
    }

    // 3. Resolve start node
    const currentState = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId } });
    let startNodeId: string;

    if (currentState && currentState.currentNodeId) {
        startNodeId = currentState.currentNodeId;
    } else {
        // Fallback to current parked/assigned location: employee workspace, or vehicle parking area
        let fallbackEntityId = entityType === 'VEHICLE'
          ? (await this.prisma.v12SpatialVehicle.findUnique({ where: { id: entityId } }))?.parkingAreaId
          : (await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId: entityId } }))?.roomId;
        if (!fallbackEntityId && entityType !== 'VEHICLE') {
          const chairmanOffice = await this.prisma.v12SpatialRoom.findFirst({
            where: {
              type: 'CHAIRMAN_OFFICE',
              floor: { building: { site: { companyId: entityCtx.companyId } } }
            }
          }) || await this.prisma.v12SpatialRoom.findFirst({ where: { type: 'CHAIRMAN_OFFICE' } });
          if (chairmanOffice) fallbackEntityId = chairmanOffice.id;
        }
        if (!fallbackEntityId) {
             return this.markMovementBlocked(entityId, entityType, 'NO_CURRENT_LOCATION');
        }
        const startNode = await this.prisma.v12NavigationNode.findFirst({
            where: { entityId: fallbackEntityId, isTraversable: true },
            orderBy: { id: 'asc' }
        });
        if (!startNode) {
             return this.markMovementBlocked(entityId, entityType, 'NO_START_NODE_AVAILABLE');
        }
        startNodeId = startNode.id;
    }

    // 4. Calculate deterministic path
    const pathResult = await this.findPath(startNodeId, destNode.id);

    if (!pathResult || pathResult.path.length === 0) {
        return this.markMovementBlocked(entityId, entityType, 'NO_PATH_FOUND');
    }

    // 5. Create/update movement state
    const movementMode = entityType === 'VEHICLE' || context?.movementMode === 'VEHICLE' ? 'VEHICLE' : 'WALK';
    const newState = await this.prisma.v12SpatialMovementState.upsert({
        where: { entityId },
        create: {
            entityId,
            entityType,
            currentLocationId: startNodeId,
            currentLocationType: 'NODE',
            currentNodeId: startNodeId,
            destinationNodeId: destNode.id,
            path: pathResult.path,
            totalDistance: pathResult.distance,
            movementState: 'MOVING',
            movementMode,
            progress: 0.0,
            intentSource: context?.intentSource || 'SYSTEM',
            intentId: context?.intentId
        },
        update: {
            currentLocationId: startNodeId,
            currentLocationType: 'NODE',
            currentNodeId: startNodeId,
            destinationNodeId: destNode.id,
            path: pathResult.path,
            totalDistance: pathResult.distance,
            movementState: 'MOVING',
            movementMode,
            progress: 0.0,
            blockedReason: null,
            intentSource: context?.intentSource || 'SYSTEM',
            intentId: context?.intentId,
            timestamp: new Date()
        }
    });

    // 6. Emit V12 world-state movement update
    const envelope = this.eventService.createEventEnvelope(
        V12EventType.MOVEMENT_STARTED,
        entityId,
        entityCtx.worldEntityType as any,
        { movementState: newState },
        entityCtx.companyId,
        context?.intentId,
        context?.correlationId,
        `${entityCtx.name} is now moving to their destination.`
    );
    // Persist-then-broadcast; a SpatialHistoryPersistenceError propagates to the caller.
    await this.eventService.broadcastEvent(entityCtx.companyId, envelope);

    return newState;
  }

  /**
   * Cancels an entity's in-progress movement. Returns null (no-op) if the entity
   * isn't currently MOVING — cancelling a non-existent or already-settled movement
   * is not an error, it's simply nothing to do.
   */
  async cancelMovement(entityId: string) {
    const existing = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId } });
    if (!existing || existing.movementState !== 'MOVING') {
      return null;
    }

    const state = await this.prisma.v12SpatialMovementState.update({
      where: { entityId },
      data: {
        movementState: 'INTERRUPTED',
        destinationNodeId: null,
        path: [],
        totalDistance: 0,
        blockedReason: null,
        timestamp: new Date(),
      },
    });

    const ctx = await this.resolveEntityContext(entityId, existing.entityType);
    if (ctx) {
      const envelope = this.eventService.createEventEnvelope(
        V12EventType.MOVEMENT_CANCELLED,
        entityId,
        ctx.worldEntityType as any,
        { movementState: state },
        ctx.companyId,
        undefined,
        undefined,
        `${ctx.name}'s movement was cancelled.`
      );
      await this.eventService.broadcastEvent(ctx.companyId, envelope);
    }

    return state;
  }

  private async markMovementBlocked(entityId: string, entityType: string, reason: string) {
     this.logger.warn(`Movement blocked for ${entityId}: ${reason}`);

     const existing = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId }});

     const state = existing
       ? await this.prisma.v12SpatialMovementState.update({
           where: { entityId },
           data: { movementState: 'BLOCKED', blockedReason: reason, timestamp: new Date() },
         })
       : await this.prisma.v12SpatialMovementState.upsert({
           where: { entityId },
           create: {
             entityId,
             entityType,
             currentLocationId: 'UNKNOWN',
             currentLocationType: 'NODE',
             movementState: 'BLOCKED',
             blockedReason: reason,
           },
           update: { movementState: 'BLOCKED', blockedReason: reason, timestamp: new Date() },
         });

     const ctx = await this.resolveEntityContext(entityId, entityType);
     if (ctx) {
         const envelope = this.eventService.createEventEnvelope(
            V12EventType.MOVEMENT_BLOCKED,
            entityId,
            ctx.worldEntityType as any,
            { movementState: state },
            ctx.companyId,
            undefined,
            undefined,
            `${ctx.name}'s movement was blocked.`
         );
         await this.eventService.broadcastEvent(ctx.companyId, envelope);
     }

     return state;
  }
}

export const V12NavigationService = NavigationService;
export type V12NavigationService = NavigationService;

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';

@Injectable()
export class V12NavigationService {
  private readonly logger = new Logger(V12NavigationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorldStateEventService) private readonly eventService: WorldStateEventService
  ) {}

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
    const unvisited = new Set<string>();

    for (const node of nodes) {
      dist.set(node.id, Infinity);
      unvisited.add(node.id);
    }
    
    if (!dist.has(startNodeId) || !dist.has(endNodeId)) {
        return null; // Start or end not in graph
    }

    dist.set(startNodeId, 0);

    while (unvisited.size > 0) {
      // Find node in unvisited with smallest distance, tie-break by ID
      let u: string | null = null;
      let minDist = Infinity;
      
      for (const nodeId of unvisited) {
        const d = dist.get(nodeId)!;
        if (d < minDist) {
          minDist = d;
          u = nodeId;
        } else if (d === minDist && u !== null) {
          if (nodeId.localeCompare(u) < 0) {
            u = nodeId;
          }
        }
      }

      if (u === null || minDist === Infinity) {
        break; // remaining nodes are unreachable
      }

      if (u === endNodeId) {
        break; // found target
      }

      unvisited.delete(u);

      const neighbors = graph.get(u) || [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.target)) continue;

        const alt = dist.get(u)! + neighbor.distance;
        const currentDist = dist.get(neighbor.target)!;
        
        if (alt < currentDist) {
          dist.set(neighbor.target, alt);
          prev.set(neighbor.target, u);
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

  async requestEntityMovement(entityId: string, destinationId: string, context: any) {
    this.logger.log(`Requesting movement for entity ${entityId} to destination ${destinationId}`);

    // 1. Validate Entity exists (Employee for now)
    const emp = await this.prisma.employee.findUnique({ where: { id: entityId } });
    if (!emp) {
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
       return this.markMovementBlocked(entityId, 'DESTINATION_NOT_FOUND_OR_INACCESSIBLE');
    }

    // 3. Resolve start node
    let currentState = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId } });
    let startNodeId: string;
    
    if (currentState && currentState.currentNodeId) {
        startNodeId = currentState.currentNodeId;
    } else {
        // Fallback to workspace location
        const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId: entityId }});
        if (!ws) {
             return this.markMovementBlocked(entityId, 'NO_CURRENT_LOCATION');
        }
        const startNode = await this.prisma.v12NavigationNode.findFirst({
            where: { entityId: ws.roomId, isTraversable: true },
            orderBy: { id: 'asc' }
        });
        if (!startNode) {
             return this.markMovementBlocked(entityId, 'NO_START_NODE_AVAILABLE');
        }
        startNodeId = startNode.id;
    }

    // 4. Calculate deterministic path
    const pathResult = await this.findPath(startNodeId, destNode.id);

    if (!pathResult || pathResult.path.length === 0) {
        return this.markMovementBlocked(entityId, 'NO_PATH_FOUND');
    }

    // 5. Create/update movement state
    const newState = await this.prisma.v12SpatialMovementState.upsert({
        where: { entityId },
        create: {
            entityId,
            entityType: 'EMPLOYEE',
            currentLocationId: startNodeId,
            currentLocationType: 'NODE',
            currentNodeId: startNodeId,
            destinationNodeId: destNode.id,
            path: pathResult.path,
            movementState: 'MOVING',
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
            movementState: 'MOVING',
            progress: 0.0,
            blockedReason: null,
            intentSource: context?.intentSource || 'SYSTEM',
            intentId: context?.intentId,
            timestamp: new Date()
        }
    });

    // 6. Emit V12 world-state movement update
    const envelope = this.eventService.createEventEnvelope(
        'MOVEMENT_STARTED',
        entityId,
        'PERSON' as any,
        { movementState: newState },
        emp.companyId
    );
    // Persist-then-broadcast; a SpatialHistoryPersistenceError propagates to the caller.
    await this.eventService.broadcastEvent(emp.companyId, envelope);

    return newState;
  }

  private async markMovementBlocked(entityId: string, reason: string) {
     this.logger.warn(`Movement blocked for ${entityId}: ${reason}`);
     
     const existing = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId }});
     if (!existing) {
        // Can't mark blocked if we don't even have a location, but we can try to create a default one
        return null;
     }

     const state = await this.prisma.v12SpatialMovementState.update({
         where: { entityId },
         data: {
             movementState: 'BLOCKED',
             blockedReason: reason,
             timestamp: new Date()
         }
     });

     const emp = await this.prisma.employee.findUnique({ where: { id: entityId }});
     if (emp && emp.companyId) {
         const envelope = this.eventService.createEventEnvelope(
            'MOVEMENT_BLOCKED',
            entityId,
            'PERSON' as any,
            { movementState: state },
            emp.companyId
         );
         await this.eventService.broadcastEvent(emp.companyId, envelope);
     }

     return state;
  }
}

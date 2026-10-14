import { Test, TestingModule } from '@nestjs/testing';
import { V12NavigationService, computeProgressIncrement } from './navigation.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';

describe('V12NavigationService Determinism', () => {
  let service: V12NavigationService;
  
  const mockPrisma = {
    v12NavigationNode: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    v12SpatialTopologyEdge: {
      findMany: jest.fn(),
    },
    employee: {
        findUnique: jest.fn(),
    },
    v12SpatialMovementState: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
    },
    v12SpatialWorkspace: {
        findFirst: jest.fn(),
    },
    v12SpatialSite: {
        findUnique: jest.fn(),
    },
  };

  const mockEventService = {
      createEventEnvelope: jest.fn().mockReturnValue({ eventType: 'MOCK_EVENT' }),
      broadcastEvent: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12NavigationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService }
      ],
    }).compile();

    service = module.get<V12NavigationService>(V12NavigationService);
    jest.clearAllMocks();
  });

  it('should find deterministic path resolving ties via alphabetic node ID sort', async () => {
    // Setup a graph with two equal-distance paths from A -> D
    // Path 1: A -> B -> D (distance 2)
    // Path 2: A -> C -> D (distance 2)
    // Because 'B' < 'C', Path 1 should be preferred deterministically.

    mockPrisma.v12NavigationNode.findMany.mockResolvedValue([
      { id: 'A', isTraversable: true },
      { id: 'B', isTraversable: true },
      { id: 'C', isTraversable: true },
      { id: 'D', isTraversable: true },
    ]);

    mockPrisma.v12SpatialTopologyEdge.findMany.mockResolvedValue([
      { sourceId: 'A', targetId: 'C', distance: 1 },
      { sourceId: 'C', targetId: 'D', distance: 1 },
      { sourceId: 'A', targetId: 'B', distance: 1 },
      { sourceId: 'B', targetId: 'D', distance: 1 },
    ]);

    const result = await service.findPath('A', 'D');
    expect(result).toBeDefined();
    expect(result?.distance).toBe(2);
    // B should be chosen over C because B < C
    expect(result?.path).toEqual(['A', 'B', 'D']);
  });

  it('should return null if no path exists', async () => {
    mockPrisma.v12NavigationNode.findMany.mockResolvedValue([
      { id: 'A', isTraversable: true },
      { id: 'B', isTraversable: true },
    ]);
    mockPrisma.v12SpatialTopologyEdge.findMany.mockResolvedValue([]);

    const result = await service.findPath('A', 'B');
    expect(result).toBeNull();
  });

  it('should create blocked movement state if path not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', companyId: 'comp-1', name: 'Test Emp' });
      mockPrisma.v12NavigationNode.findFirst.mockResolvedValueOnce({ id: 'dest-node', isTraversable: true });
      mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ entityId: 'emp-1', currentNodeId: 'start-node' });
      mockPrisma.v12NavigationNode.findMany.mockResolvedValue([
        { id: 'start-node', isTraversable: true },
        { id: 'dest-node', isTraversable: true },
      ]);
      mockPrisma.v12SpatialTopologyEdge.findMany.mockResolvedValue([]);
      
      mockPrisma.v12SpatialMovementState.update = jest.fn().mockResolvedValue({ movementState: 'BLOCKED' });

      await service.requestEntityMovement('emp-1', 'dest-node', {});
      
      expect(mockEventService.broadcastEvent).toHaveBeenCalled();
      expect(mockEventService.createEventEnvelope).toHaveBeenCalledWith(
          'MOVEMENT_BLOCKED',
          'emp-1',
          expect.any(String),
          expect.any(Object),
          'comp-1',
          undefined,
          undefined,
          "Test Emp's movement was blocked."
      );
  });

  it('blocks movement into a closed company\'s site (mirrors Aevora\'s Company.status authority)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', companyId: 'comp-1', name: 'Test Emp' });
      mockPrisma.v12NavigationNode.findFirst.mockResolvedValueOnce({ id: 'dest-node', isTraversable: true, siteId: 'site-closed' });
      mockPrisma.v12SpatialSite.findUnique.mockResolvedValue({ id: 'site-closed', isActive: false });
      mockPrisma.v12SpatialMovementState.update = jest.fn().mockResolvedValue({ movementState: 'BLOCKED', blockedReason: 'DESTINATION_COMPANY_CLOSED' });
      mockPrisma.v12SpatialMovementState.upsert = jest.fn().mockResolvedValue({ movementState: 'BLOCKED', blockedReason: 'DESTINATION_COMPANY_CLOSED' });

      const result = await service.requestEntityMovement('emp-1', 'dest-node', {});

      expect(mockPrisma.v12SpatialSite.findUnique).toHaveBeenCalledWith({ where: { id: 'site-closed' } });
      expect(result).toEqual(expect.objectContaining({ movementState: 'BLOCKED' }));
      // Pathfinding must never even be attempted for a closed-company destination.
      expect(mockPrisma.v12NavigationNode.findMany).not.toHaveBeenCalled();
  });

  it('allows movement into a node with no site association (unchanged behavior for most of the existing graph)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', companyId: 'comp-1', name: 'Test Emp' });
      mockPrisma.v12NavigationNode.findFirst.mockResolvedValueOnce({ id: 'dest-node', isTraversable: true }); // no siteId
      mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ entityId: 'emp-1', currentNodeId: 'start-node' });
      mockPrisma.v12NavigationNode.findMany.mockResolvedValue([
        { id: 'start-node', isTraversable: true },
        { id: 'dest-node', isTraversable: true },
      ]);
      mockPrisma.v12SpatialTopologyEdge.findMany.mockResolvedValue([{ sourceId: 'start-node', targetId: 'dest-node', distance: 1 }]);
      mockPrisma.v12SpatialMovementState.upsert = jest.fn().mockResolvedValue({ movementState: 'MOVING' });

      await service.requestEntityMovement('emp-1', 'dest-node', {});

      expect(mockPrisma.v12SpatialSite.findUnique).not.toHaveBeenCalled();
  });

  it('should store totalDistance and movementMode from the resolved path on requestEntityMovement', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-1', companyId: 'comp-1', name: 'Test Emp' });
      mockPrisma.v12NavigationNode.findFirst.mockResolvedValueOnce({ id: 'dest-node', isTraversable: true });
      mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ entityId: 'emp-1', currentNodeId: 'start-node' });
      mockPrisma.v12NavigationNode.findMany.mockResolvedValue([
        { id: 'start-node', isTraversable: true },
        { id: 'dest-node', isTraversable: true },
      ]);
      mockPrisma.v12SpatialTopologyEdge.findMany.mockResolvedValue([
        { sourceId: 'start-node', targetId: 'dest-node', distance: 7 },
      ]);
      mockPrisma.v12SpatialMovementState.upsert = jest.fn().mockResolvedValue({ movementState: 'MOVING' });

      await service.requestEntityMovement('emp-1', 'dest-node', { movementMode: 'VEHICLE' });

      expect(mockPrisma.v12SpatialMovementState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ totalDistance: 7, movementMode: 'VEHICLE' }),
          update: expect.objectContaining({ totalDistance: 7, movementMode: 'VEHICLE' }),
        })
      );
  });
});

describe('computeProgressIncrement', () => {
  it('is deterministic: same distance and mode always yields the same increment', () => {
    expect(computeProgressIncrement(10, 'WALK')).toBe(computeProgressIncrement(10, 'WALK'));
  });

  it('a longer route yields a smaller per-tick increment (more ticks to arrive)', () => {
    const shortRoute = computeProgressIncrement(2, 'WALK');
    const longRoute = computeProgressIncrement(20, 'WALK');
    expect(longRoute).toBeLessThan(shortRoute);
  });

  it('VEHICLE moves faster than WALK over the same distance', () => {
    const walk = computeProgressIncrement(10, 'WALK');
    const vehicle = computeProgressIncrement(10, 'VEHICLE');
    expect(vehicle).toBeGreaterThan(walk);
  });

  it('arrives immediately (progress 1.0) when totalDistance is zero or unset', () => {
    expect(computeProgressIncrement(0, 'WALK')).toBe(1.0);
  });

  it('falls back to WALK speed for an unknown movement mode', () => {
    expect(computeProgressIncrement(10, 'UNKNOWN')).toBe(computeProgressIncrement(10, 'WALK'));
  });
});

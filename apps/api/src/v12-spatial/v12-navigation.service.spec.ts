import { Test, TestingModule } from '@nestjs/testing';
import { V12NavigationService } from './v12-navigation.service';
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
    },
    v12SpatialWorkspace: {
        findFirst: jest.fn(),
    }
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
});

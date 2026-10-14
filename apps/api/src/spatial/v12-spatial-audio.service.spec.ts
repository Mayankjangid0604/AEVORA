import { Test, TestingModule } from '@nestjs/testing';
import { V12SpatialAudioService } from './spatial-audio.service';
import { PrismaService } from '../prisma/prisma.service';

describe('V12SpatialAudioService', () => {
  let service: V12SpatialAudioService;
  const mockPrisma = {
    v12NavigationNode: { findUnique: jest.fn() },
    employee: { findMany: jest.fn() },
    v12SpatialMovementState: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [V12SpatialAudioService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(V12SpatialAudioService);
  });

  it('resolves a real IN_MEETING employee as an audible source, positioned at their real node', async () => {
    mockPrisma.v12NavigationNode.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'listener-node') return { id: 'listener-node', posX: 0, posY: 0, posZ: 0 };
      if (where.id === 'speaker-node') return { id: 'speaker-node', posX: 2, posY: 0, posZ: 0 };
      return null;
    });
    mockPrisma.employee.findMany.mockResolvedValue([{ id: 'emp-1', companyId: 'c1', role: { accessLevel: 'STANDARD' } }]);
    mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ currentNodeId: 'speaker-node' });

    const result = await service.resolveAudibleSourcesForListener('c1', 'listener-node');

    expect(result).toHaveLength(1);
    expect(result[0].source.id).toBe('emp-1');
    expect(result[0].gain).toBeGreaterThan(0);
  });

  it('never invents a source for an employee with no known position (movement record missing)', async () => {
    mockPrisma.v12NavigationNode.findUnique.mockResolvedValue({ id: 'listener-node', posX: 0, posY: 0, posZ: 0 });
    mockPrisma.employee.findMany.mockResolvedValue([{ id: 'emp-1', companyId: 'c1', role: { accessLevel: 'STANDARD' } }]);
    mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue(null);

    const result = await service.resolveAudibleSourcesForListener('c1', 'listener-node');
    expect(result).toEqual([]);
  });

  it('only queries employees in the listener\'s own company (company isolation)', async () => {
    mockPrisma.v12NavigationNode.findUnique.mockResolvedValue({ id: 'listener-node', posX: 0, posY: 0, posZ: 0 });
    mockPrisma.employee.findMany.mockResolvedValue([]);

    await service.resolveAudibleSourcesForListener('c1', 'listener-node');

    expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'c1', activity: 'IN_MEETING' }),
    }));
  });

  it('a Chairman speaker gets higher priority than a standard employee (derived from real Role.accessLevel, never invented)', async () => {
    mockPrisma.v12NavigationNode.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, posX: 1, posY: 0, posZ: 0 }));
    mockPrisma.employee.findMany.mockResolvedValue([
      { id: 'standard-emp', companyId: 'c1', role: { accessLevel: 'STANDARD' } },
      { id: 'chairman-emp', companyId: 'c1', role: { accessLevel: 'CHAIRMAN' } },
    ]);
    mockPrisma.v12SpatialMovementState.findUnique.mockImplementation(async ({ where }: any) => ({ currentNodeId: `node-${where.entityId}` }));

    const result = await service.resolveAudibleSourcesForListener('c1', 'listener-node');
    expect(result[0].source.id).toBe('chairman-emp'); // higher priority sorted first
  });

  it('returns no sources if the listener node itself does not exist', async () => {
    mockPrisma.v12NavigationNode.findUnique.mockResolvedValue(null);
    const result = await service.resolveAudibleSourcesForListener('c1', 'ghost-node');
    expect(result).toEqual([]);
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
  });
});

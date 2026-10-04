import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';

describe('WorldStateGatewayService', () => {
  let service: WorldStateGatewayService;
  let prisma: PrismaService;
  let eventService: WorldStateEventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldStateGatewayService,
        {
          provide: PrismaService,
          useValue: {
            company: { findUnique: jest.fn() },
            v12SpatialRegion: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialCity: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialSite: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialBuilding: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialFloor: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialRoom: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialWorkspace: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialParkingArea: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialTopologyEdge: { findMany: jest.fn().mockResolvedValue([]) },
            v12NavigationNode: { findMany: jest.fn().mockResolvedValue([]) },
            v12SpatialMovementState: { findUnique: jest.fn().mockResolvedValue(null) },
          },
        },
        {
          provide: WorldStateEventService,
          useValue: {
            createEventEnvelope: jest.fn(),
            broadcastEvent: jest.fn(),
            getCurrentSequence: jest.fn().mockReturnValue(100),
          },
        },
      ],
    }).compile();

    service = module.get<WorldStateGatewayService>(WorldStateGatewayService);
    prisma = module.get<PrismaService>(PrismaService);
    eventService = module.get<WorldStateEventService>(WorldStateEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSnapshot', () => {
    it('should generate a snapshot for a given company', async () => {
      const companyId = 'test-company-1';
      const mockCompany = {
        id: companyId,
        name: 'Saahvik Corp',
        employees: [
          { id: 'emp-1', name: 'John Doe', activity: 'IDLE' },
          { id: 'emp-2', name: 'Jane Smith', activity: 'WORKING' }
        ],
        officeLocations: []
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);

      const snapshot = await service.generateSnapshot(companyId);
      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBe('1.0.0');
      
      const companyEntity = snapshot.entities[`v12_company_${companyId}`];
      expect(companyEntity).toBeDefined();
      expect(companyEntity.name).toBe('Saahvik Corp');
      expect(companyEntity.aevoraId).toBe(companyId);

      const emp1Entity = snapshot.entities['v12_person_emp-1'];
      expect(emp1Entity).toBeDefined();
      expect(emp1Entity.name).toBe('John Doe');
      expect(emp1Entity.parentId).toBe(companyEntity.id);
      expect(emp1Entity.aevoraId).toBe('emp-1');
    });

    it('should throw an error if the company does not exist', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.generateSnapshot('non-existent')).rejects.toThrow('Company not found');
    });
  });
});

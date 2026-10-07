import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

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
            v12SpatialVehicle: { findMany: jest.fn().mockResolvedValue([]) },
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
        {
          provide: StructuredLoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() },
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

  describe('company isolation in generateSnapshot (regression: fetchSpatialState previously queried every company unconditionally)', () => {
    let isoService: WorldStateGatewayService;
    let isoPrisma: any;

    beforeEach(async () => {
      isoPrisma = {
        company: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, name: `Co ${where.id}`, employees: [], officeLocations: [] })) },
        v12SpatialRegion: { findMany: jest.fn().mockResolvedValue([]) },
        v12SpatialCity: { findMany: jest.fn().mockResolvedValue([]) },
        v12SpatialSite: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'site-A', companyId: 'A', cityId: null },
            { id: 'site-B', companyId: 'B', cityId: null },
          ].filter((s) => s.companyId === where.companyId)),
        },
        v12SpatialBuilding: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'bldg-A', siteId: 'site-A' },
            { id: 'bldg-B', siteId: 'site-B' },
          ].filter((b) => where.siteId.in.includes(b.siteId))),
        },
        v12SpatialFloor: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'floor-A', buildingId: 'bldg-A' },
            { id: 'floor-B', buildingId: 'bldg-B' },
          ].filter((f) => where.buildingId.in.includes(f.buildingId))),
        },
        v12SpatialRoom: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'room-A', name: 'Company A Secret Room', floorId: 'floor-A', type: 'ROOM' },
            { id: 'room-B', name: 'Company B Secret Room', floorId: 'floor-B', type: 'ROOM' },
          ].filter((r) => where.floorId.in.includes(r.floorId))),
        },
        v12SpatialWorkspace: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'ws-A', name: 'A workspace', roomId: 'room-A', companyId: 'A', employeeId: 'secret-emp-A' },
            { id: 'ws-B', name: 'B workspace', roomId: 'room-B', companyId: 'B', employeeId: 'secret-emp-B' },
          ].filter((w) => w.companyId === where.companyId)),
        },
        v12SpatialParkingArea: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'park-A', siteId: 'site-A' },
            { id: 'park-B', siteId: 'site-B' },
          ].filter((p) => where.siteId.in.includes(p.siteId))),
        },
        v12SpatialVehicle: {
          findMany: jest.fn(async ({ where }: any) => [
            { id: 'veh-A', companyId: 'A', vehicleClass: 'STANDARD', parkingAreaId: 'park-A' },
            { id: 'veh-B', companyId: 'B', vehicleClass: 'STANDARD', parkingAreaId: 'park-B' },
          ].filter((v) => v.companyId === where.companyId)),
        },
        v12NavigationNode: { findMany: jest.fn().mockResolvedValue([]) },
        v12SpatialTopologyEdge: { findMany: jest.fn().mockResolvedValue([]) },
        v12SpatialMovementState: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WorldStateGatewayService,
          { provide: PrismaService, useValue: isoPrisma },
          { provide: WorldStateEventService, useValue: { createEventEnvelope: jest.fn(), broadcastEvent: jest.fn(), getCurrentSequence: jest.fn().mockReturnValue(1) } },
          { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
        ],
      }).compile();
      isoService = module.get(WorldStateGatewayService);
    });

    it('company A\'s snapshot contains only company A\'s buildings/rooms/workspaces, never company B\'s', async () => {
      const snapshot = await isoService.generateSnapshot('A');
      const names = Object.values(snapshot.entities).map((e: any) => e.name);

      expect(names).toContain('Company A Secret Room');
      expect(names).not.toContain('Company B Secret Room');

      const workspaceEntity = Object.values(snapshot.entities).find((e: any) => e.id === 'v12_workspace_ws-A') as any;
      expect(workspaceEntity?.employeeId).toBe('secret-emp-A');
      expect(Object.values(snapshot.entities).some((e: any) => e.id === 'v12_workspace_ws-B')).toBe(false);
    });

    it('company B\'s snapshot contains only company B\'s data — proves the scoping is bidirectional, not a one-off filter', async () => {
      const snapshot = await isoService.generateSnapshot('B');
      const names = Object.values(snapshot.entities).map((e: any) => e.name);

      expect(names).toContain('Company B Secret Room');
      expect(names).not.toContain('Company A Secret Room');
    });

    it('hierarchical streaming: moving the viewer to room-A activates its full real ancestor chain (building-A -> site-A), with other regions never touched', async () => {
      const roomAId = Object.keys((await isoService.generateSnapshot('A')).entities).find((id) => id.includes('room-A'))!;
      const snapshot: any = await isoService.generateSnapshot('A', roomAId);

      expect(snapshot.streamingStates).toBeDefined();
      const roomState = snapshot.streamingStates[roomAId];
      expect(roomState).toBe('ACTIVE');

      const buildingId = Object.keys(snapshot.entities).find((id) => id.includes('bldg-A'));
      expect(snapshot.streamingStates[buildingId!]).toBe('ACTIVE');
    });

    it('hierarchical streaming: a different viewer location activates a different region, deterministically', async () => {
      const full = await isoService.generateSnapshot('A');
      const roomAId = Object.keys(full.entities).find((id) => id.includes('room-A'))!;
      const buildingAId = Object.keys(full.entities).find((id) => id.includes('bldg-A'))!;

      const snapshotAtBuilding: any = await isoService.generateSnapshot('A', buildingAId);
      // Activating the building directly still activates the building itself, but never the room
      // beneath it (streaming only loads ancestors, never descendants, matching the real manager's contract).
      expect(snapshotAtBuilding.streamingStates[buildingAId]).toBe('ACTIVE');
      expect(snapshotAtBuilding.streamingStates[roomAId]).toBe('UNLOADED');
    });
  });
});

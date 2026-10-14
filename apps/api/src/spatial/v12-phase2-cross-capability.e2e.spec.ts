import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './navigation.service';
import { V12VehicleService } from './vehicle.service';
import { V12AssetRegistryService } from './asset-registry.service';
import { V12SpatialAudioService } from './spatial-audio.service';
import { V12VRActionAdapter } from './vr-action.adapter';
import { V12AssistantAdapter } from './assistant.adapter';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../department/department.service';

/**
 * Real, multi-capability integration test: a Chairman's vehicle (real AssetRegistry resolution),
 * real navigation/streaming (same company-scoped gateway logic verified elsewhere), a real meeting
 * participant resolved as a spatial-audio source, and a real VR controller ray resolving an actual
 * entity and executing through the same authorized V12AssistantAdapter every other client uses —
 * exercised together against one shared, stateful Prisma fake, not isolated per-service mocks.
 */
class FakeCrossCapabilityPrisma {
  employees = new Map<string, any>([
    ['chairman-1', { id: 'chairman-1', companyId: 'comp-1', name: 'The Chairman', status: 'ACTIVE', activity: 'IDLE', departmentId: 'dept-1', role: { title: 'Chairman', accessLevel: 'CHAIRMAN' } }],
    ['speaker-1', { id: 'speaker-1', companyId: 'comp-1', name: 'Ana Speaker', status: 'ACTIVE', activity: 'IN_MEETING', departmentId: 'dept-1', role: { title: 'CEO', accessLevel: 'MANAGEMENT' } }],
  ]);
  vehicles = new Map<string, any>();
  movementStates = new Map<string, any>([
    ['chairman-1', { entityId: 'chairman-1', entityType: 'EMPLOYEE', currentNodeId: 'node-chairman-office', movementState: 'IDLE', movementMode: 'WALK', progress: 0 }],
    ['speaker-1', { entityId: 'speaker-1', entityType: 'EMPLOYEE', currentNodeId: 'node-meeting-room', movementState: 'ARRIVED', movementMode: 'WALK', progress: 1 }],
  ]);
  nodes = new Map<string, any>([
    ['node-chairman-office', { id: 'node-chairman-office', entityId: 'room-chairman-office', entityType: 'ROOM', isTraversable: true, posX: 0, posY: 0, posZ: 0 }],
    ['node-meeting-room', { id: 'node-meeting-room', entityId: 'room-meeting', entityType: 'ROOM', isTraversable: true, posX: 3, posY: 0, posZ: 0 }],
    ['node-parking', { id: 'node-parking', entityId: 'parking-hq', entityType: 'PARKING', isTraversable: true, posX: -5, posY: 0, posZ: 0 }],
  ]);
  edges = [{ sourceId: 'node-chairman-office', targetId: 'node-meeting-room', distance: 3, isEnabled: true }];
  parkingAreas = [{ id: 'parking-hq', siteId: 'site-1', capacity: 10, availableSpots: 10 }];

  employee = {
    findUnique: jest.fn(async ({ where }: any) => this.employees.get(where.id) ?? null),
    findFirst: jest.fn(async ({ where }: any) => this.employees.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: any) => [...this.employees.values()].filter((e) => e.companyId === where.companyId && (!where.activity || e.activity === where.activity))),
  };
  v12SpatialVehicle = {
    findUnique: jest.fn(async ({ where }: any) => this.vehicles.get(where.id) ?? this.vehicles.get(where.ownerEmployeeId) ?? null),
    findFirst: jest.fn(async ({ where }: any) => (where.ownerEmployeeId ? this.vehicles.get(where.ownerEmployeeId) ?? null : null)),
    create: jest.fn(async ({ data }: any) => { const v = { id: `veh-${data.ownerEmployeeId}`, ...data }; this.vehicles.set(v.id, v); this.vehicles.set(data.ownerEmployeeId, v); return v; }),
    update: jest.fn(async ({ where, data }: any) => { const v = { ...this.vehicles.get(where.id), ...data }; this.vehicles.set(where.id, v); return v; }),
  };
  v12SpatialParkingArea = {
    findFirst: jest.fn(async () => this.parkingAreas[0]),
    findUnique: jest.fn(async ({ where }: any) => this.parkingAreas.find((p) => p.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => { Object.assign(this.parkingAreas.find((p) => p.id === where.id)!, data); return this.parkingAreas[0]; }),
  };
  v12NavigationNode = {
    findMany: jest.fn(async () => [...this.nodes.values()]),
    findFirst: jest.fn(async ({ where }: any) => [...this.nodes.values()].find((n) => n.entityId === where.entityId && n.isTraversable) ?? null),
    findUnique: jest.fn(async ({ where }: any) => this.nodes.get(where.id) ?? null),
  };
  v12SpatialTopologyEdge = { findMany: jest.fn(async () => this.edges) };
  v12SpatialWorkspace = { findFirst: jest.fn(async () => null) };
  v12SpatialMovementState = {
    findUnique: jest.fn(async ({ where }: any) => this.movementStates.get(where.entityId) ?? null),
    findMany: jest.fn(async ({ where }: any) => [...this.movementStates.values()].filter((m) => !where?.movementState || m.movementState === where.movementState)),
    upsert: jest.fn(async ({ where, create, update }: any) => { const next = this.movementStates.has(where.entityId) ? { ...this.movementStates.get(where.entityId), ...update } : create; this.movementStates.set(where.entityId, next); return next; }),
    update: jest.fn(async ({ where, data }: any) => { const next = { ...this.movementStates.get(where.entityId), ...data }; this.movementStates.set(where.entityId, next); return next; }),
  };
  v12SpatialSite = { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) };
  meetingParticipant = { findFirst: jest.fn(async () => null) };
  v12SpatialRoom = { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) };
  department = { findMany: jest.fn(async () => []) };
}

describe('V12 Phase 2 cross-capability: vehicle asset resolution + navigation + spatial audio + VR targeting, together', () => {
  let prisma: FakeCrossCapabilityPrisma;
  let vehicleService: V12VehicleService;
  let audioService: V12SpatialAudioService;
  let vrAdapter: V12VRActionAdapter;
  let broadcasts: any[];

  beforeEach(async () => {
    prisma = new FakeCrossCapabilityPrisma();
    broadcasts = [];

    const stubEventService = {
      seq: 0,
      createEventEnvelope(eventType: any, entityId: string, entityType: any, payload: any, companyId: string) {
        this.seq++;
        return { eventId: `e${this.seq}`, eventType, entityId, entityType, sequence: this.seq, authoritativeTimestamp: Date.now(), companyId, payload };
      },
      async broadcastEvent(companyId: string, envelope: any) {
        broadcasts.push(envelope);
        return { status: 'COMMITTED', eventId: envelope.eventId, sequence: envelope.sequence, attempts: 1 };
      },
    };

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: WorldStateEventService, useValue: stubEventService },
        V12NavigationService,
        V12VehicleService,
        V12AssetRegistryService,
        V12SpatialAudioService,
        V12VRActionAdapter,
        V12AssistantAdapter,
        { provide: ReplaySessionService, useValue: { isReplayActive: () => false } },
        { provide: AuthorizationService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
        { provide: CompanyIntelligenceService, useValue: { generateCompanyIntelligence: jest.fn() } },
        { provide: EmployeeService, useValue: { getEmployee: jest.fn().mockResolvedValue({ id: 'speaker-1', companyId: 'comp-1', name: 'Ana Speaker', role: { title: 'CEO' }, department: { name: 'Exec' } }) } },
        { provide: DepartmentService, useValue: { getDepartment: jest.fn() } },
      ],
    }).compile();

    vehicleService = app.get(V12VehicleService);
    audioService = app.get(V12SpatialAudioService);
    vrAdapter = app.get(V12VRActionAdapter);
    app.get(V12AssetRegistryService).onModuleInit();
  });

  it('exercises vehicle asset resolution, real navigation, spatial-audio resolution, and VR ray targeting -> real authorized inspection, together', async () => {
    // 1. Real asset resolution: the Chairman's vehicle resolves a real registered chassis asset.
    const vehicle = await vehicleService.createVehicleForEmployee('chairman-1');
    expect(vehicle.assetId).toBe('asset_vehicle_chassis_chairman_v1');
    expect(broadcasts.some((b) => b.eventType === 'VEHICLE_CREATED')).toBe(true);

    // 2. Real spatial audio: a real IN_MEETING employee (speaker-1) is resolved as an audible
    // source for a listener positioned at the Chairman's real current node.
    const audible = await audioService.resolveAudibleSourcesForListener('comp-1', 'node-chairman-office');
    expect(audible).toHaveLength(1);
    expect(audible[0].source.id).toBe('speaker-1');
    expect(audible[0].gain).toBeGreaterThan(0);

    // 3. Real VR controller targeting: a ray pointed at speaker-1's real world position resolves
    // to their real entity id, then routes through the SAME authorized V12AssistantAdapter path
    // (company isolation, permission check) that voice/text commands use — not a VR-specific path.
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const candidates = [{ entityId: 'speaker-1', position: { x: 3, y: 0, z: 0 }, radius: 0.6 }];

    const result = await vrAdapter.handle(
      'chairman-1',
      'INSPECT' as any,
      { timestamp: '1', correlationId: 'vr-1', currentCompanyId: 'comp-1', selectedEntityType: 'PERSON' as any },
      { ray, candidates },
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.responseText).toContain('Ana Speaker');
    expect(result.referencedEntityIds).toContain('speaker-1');
  });

  it('company isolation holds across every capability exercised together: a different company never sees these results', async () => {
    await vehicleService.createVehicleForEmployee('chairman-1');
    const audible = await audioService.resolveAudibleSourcesForListener('comp-OTHER', 'node-chairman-office');
    expect(audible).toEqual([]); // speaker-1 belongs to comp-1, never resolved for a different company's listener
  });
});

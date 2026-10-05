import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './v12-navigation.service';
import { V12VehicleService } from './v12-vehicle.service';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { V12EventType } from '@aevora/shared';

/**
 * Real, stateful in-memory Prisma fake exercising the full vehicle chain end to end: employee + role
 * -> derived vehicle class -> real Dijkstra pathfinding -> real multi-tick VEHICLE-mode progress ->
 * arrival -> cancellation of a second trip. Uses the actual V12VehicleService and
 * V12NavigationService classes together, not isolated mocked calls.
 */
class FakeVehiclePrisma {
  private employees = new Map<string, any>([
    ['chairman-1', { id: 'chairman-1', companyId: 'comp-1', name: 'The Chairman', role: { title: 'Chairman', accessLevel: 'CHAIRMAN' } }],
    ['ceo-1', { id: 'ceo-1', companyId: 'comp-1', name: 'The CEO', role: { title: 'CEO', accessLevel: 'MANAGEMENT' } }],
    ['other-co-emp', { id: 'other-co-emp', companyId: 'comp-2', name: 'Someone Else' }],
  ]);
  private vehicles = new Map<string, any>();
  private parkingAreas = [{ id: 'parking-hq', siteId: 'site-1', capacity: 10, availableSpots: 10 }];
  private sites = new Map<string, any>([['site-1', { id: 'site-1', companyId: 'comp-1' }]]);
  private nodes = new Map<string, any>([
    ['node-parking', { id: 'node-parking', entityId: 'parking-hq', entityType: 'PARKING', isTraversable: true }],
    ['node-other-office', { id: 'node-other-office', entityId: 'room-other-office', entityType: 'ROOM', isTraversable: true }],
  ]);
  private edges = [
    { sourceId: 'node-parking', targetId: 'node-other-office', distance: 2.0, isEnabled: true },
    { sourceId: 'node-other-office', targetId: 'node-parking', distance: 2.0, isEnabled: true },
  ];
  private movementStates = new Map<string, any>();

  employee = { findUnique: jest.fn(async ({ where }: any) => this.employees.get(where.id) ?? null) };
  v12SpatialVehicle = {
    findUnique: jest.fn(async ({ where }: any) => this.vehicles.get(where.id) ?? this.vehicles.get(where.ownerEmployeeId) ?? null),
    findFirst: jest.fn(async ({ where }: any) => (where.ownerEmployeeId ? this.vehicles.get(where.ownerEmployeeId) ?? null : null)),
    create: jest.fn(async ({ data }: any) => {
      const v = { id: `veh-${data.ownerEmployeeId}`, ...data };
      this.vehicles.set(v.id, v);
      this.vehicles.set(data.ownerEmployeeId, v); // also indexable by owner for findUnique-by-id convenience in this fake
      return v;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const v = this.vehicles.get(where.id);
      const next = { ...v, ...data };
      this.vehicles.set(where.id, next);
      this.vehicles.set(v.ownerEmployeeId, next);
      return next;
    }),
  };
  v12SpatialParkingArea = {
    findFirst: jest.fn(async () => this.parkingAreas[0]),
    findUnique: jest.fn(async ({ where }: any) => this.parkingAreas.find((p) => p.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const p = this.parkingAreas.find((pa) => pa.id === where.id)!;
      Object.assign(p, data);
      return p;
    }),
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
    findMany: jest.fn(async ({ where }: any) => [...this.movementStates.values()].filter((m) => {
      if (where?.currentNodeId && m.currentNodeId !== where.currentNodeId) return false;
      if (where?.movementState) {
        if (where.movementState.in) return where.movementState.in.includes(m.movementState);
        if (m.movementState !== where.movementState) return false;
      }
      return true;
    })),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const existing = this.movementStates.get(where.entityId);
      const next = existing ? { ...existing, ...update } : { ...create };
      this.movementStates.set(where.entityId, next);
      return next;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const next = { ...this.movementStates.get(where.entityId), ...data };
      this.movementStates.set(where.entityId, next);
      return next;
    }),
  };
}

describe('V12 end-to-end: authoritative employee/role -> vehicle embodiment -> real navigation -> VEHICLE movement -> arrival -> cancellation', () => {
  let prisma: FakeVehiclePrisma;
  let navigationService: V12NavigationService;
  let vehicleService: V12VehicleService;
  let broadcasts: any[];

  beforeEach(async () => {
    prisma = new FakeVehiclePrisma();
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
        V12AssetRegistryService, // real registry — exercises genuine asset resolution, not a mock
      ],
    }).compile();

    navigationService = app.get(V12NavigationService);
    vehicleService = app.get(V12VehicleService);
    app.get(V12AssetRegistryService).onModuleInit(); // seed the registry (no app.init() in this test)
  });

  it('derives CHAIRMAN vehicle class from authoritative role, drives real VEHICLE-speed pathfinding to arrival, then cancels a second trip', async () => {
    // Vehicle ownership/classification is derived from Employee/Role — never invented.
    const vehicle = await vehicleService.createVehicleForEmployee('chairman-1');
    expect(vehicle.vehicleClass).toBe('CHAIRMAN');
    expect(vehicle.companyId).toBe('comp-1');
    expect(vehicle.parkingAreaId).toBe('parking-hq');
    // Resolved through the real AssetRegistry, not a guessed/hardcoded string.
    expect(vehicle.assetId).toBe('asset_vehicle_chassis_chairman_v1');
    expect(broadcasts.some((b) => b.eventType === 'VEHICLE_CREATED')).toBe(true);

    // Resolve the parking-area node as the vehicle's starting location (fallback path, no prior movement record).
    const state1 = await vehicleService.requestVehicleMovement(vehicle.id, 'room-other-office', {});
    expect(state1.movementState).toBe('MOVING');
    expect(state1.movementMode).toBe('VEHICLE');
    expect(state1.path).toEqual(['node-parking', 'node-other-office']);
    expect(state1.totalDistance).toBe(2.0);

    // VEHICLE speed is 2.0/tick (vs WALK's 0.4) over distance 2.0 -> arrives in exactly 1 tick, deterministically.
    await (navigationService as any).tick();
    const afterTick = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: vehicle.id } });
    expect(afterTick.movementState).toBe('ARRIVED');
    expect(afterTick.progress).toBe(1.0);
    expect(afterTick.currentNodeId).toBe('node-other-office');

    const arrivedEvent = broadcasts.find((b) => b.eventType === V12EventType.MOVEMENT_ARRIVED && b.entityType === 'VEHICLE');
    expect(arrivedEvent).toBeDefined();
    expect(arrivedEvent.payload.movementState.entityId).toBe(vehicle.id);

    // Vehicle is now marked unparked by the successful movement request.
    const vehicleAfterMove = await prisma.v12SpatialVehicle.findUnique({ where: { id: vehicle.id } });
    expect(vehicleAfterMove.isParked).toBe(false);

    // Start a second trip and cancel it mid-flight.
    await vehicleService.requestVehicleMovement(vehicle.id, 'parking-hq', {});
    const cancelled = await navigationService.cancelMovement(vehicle.id);
    expect(cancelled.movementState).toBe('INTERRUPTED');
    expect(broadcasts.some((b) => b.eventType === V12EventType.MOVEMENT_CANCELLED && b.entityId === vehicle.id)).toBe(true);
  });

  it('physics foundation: a second vehicle cannot settle into a node a vehicle already occupies (VEHICLE_ENVELOPE collision)', async () => {
    const vehicleA = await vehicleService.createVehicleForEmployee('chairman-1');
    const vehicleB = await vehicleService.createVehicleForEmployee('ceo-1');

    // Vehicle A travels to the office and arrives (settles there).
    await vehicleService.requestVehicleMovement(vehicleA.id, 'room-other-office', {});
    await (navigationService as any).tick();
    const stateA = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: vehicleA.id } });
    expect(stateA.movementState).toBe('ARRIVED');

    // Vehicle B tries to go to the same now-occupied node — the real production path must block it.
    const resultB = await vehicleService.requestVehicleMovement(vehicleB.id, 'room-other-office', {});
    expect(resultB.movementState).toBe('BLOCKED');
    expect(resultB.blockedReason).toBe('PHYSICS_VEHICLE_COLLISION');

    // Vehicle A is unaffected and remains correctly settled.
    const stateAAfter = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: vehicleA.id } });
    expect(stateAAfter.movementState).toBe('ARRIVED');
  });

  it('never allows a vehicle request for a nonexistent vehicle, and never leaks across companies via assignOccupant', async () => {
    await expect(vehicleService.requestVehicleMovement('ghost-vehicle', 'room-other-office', {})).rejects.toThrow();

    const vehicle = await vehicleService.createVehicleForEmployee('chairman-1');
    await expect(vehicleService.assignOccupant(vehicle.id, 'other-co-emp')).rejects.toThrow();
  });
});

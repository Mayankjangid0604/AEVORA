import { Test, TestingModule } from '@nestjs/testing';
import { V12VehicleService } from './vehicle.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './navigation.service';
import { V12AssetRegistryService } from './asset-registry.service';

describe('V15-D: Vehicle Fleet Reconciliation Performance Benchmark', () => {
  let service: V12VehicleService;
  let vehicles: any[] = [];
  let parkingAreas: any[] = [];
  let sites: any[] = [];

  const mockEventService = {
    createEventEnvelope: jest.fn(() => ({ eventId: 'evt_perf' })),
    broadcastEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockNavService = {
    requestEntityMovement: jest.fn(),
  };

  const mockAssetRegistry = {
    resolveAssetId: jest.fn(() => 'asset_vehicle_standard'),
  };

  const mockPrisma = {
    company: {
      findUnique: jest.fn(async () => ({ id: 'comp-perf', name: 'Perf Fleet Corp' })),
    },
    v12SpatialSite: {
      findFirst: jest.fn(async () => sites[0]),
    },
    v12SpatialParkingArea: {
      findFirst: jest.fn(async ({ where }: any) => {
        return parkingAreas.find((p) => p.availableSpots > (where?.availableSpots?.gt || 0)) || null;
      }),
      findMany: jest.fn(async () => parkingAreas),
      count: jest.fn(async () => parkingAreas.length),
      create: jest.fn(async ({ data }: any) => {
        const item = { id: `p_${parkingAreas.length + 1}`, ...data };
        parkingAreas.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const item = parkingAreas.find((p) => p.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      }),
    },
    v12SpatialVehicle: {
      findMany: jest.fn(async () => vehicles),
      count: jest.fn(async () => vehicles.length),
      create: jest.fn(async ({ data }: any) => {
        const item = { id: `veh_${vehicles.length + 1}`, ...data, createdAt: new Date() };
        vehicles.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const item = vehicles.find((v) => v.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      }),
    },
    v12NavigationNode: {
      findFirst: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 'node_perf' })),
    },
    v12SpatialTopologyEdge: {
      create: jest.fn(async () => ({ id: 'edge_perf' })),
    },
    v12SpatialMovementState: {
      upsert: jest.fn(async () => ({ id: 'ms_perf' })),
    },
  };

  beforeEach(async () => {
    vehicles = [];
    parkingAreas = [];
    sites = [{ id: 'site-perf', companyId: 'comp-perf' }];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12VehicleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService },
        { provide: V12NavigationService, useValue: mockNavService },
        { provide: V12AssetRegistryService, useValue: mockAssetRegistry },
      ],
    }).compile();

    service = module.get<V12VehicleService>(V12VehicleService);
  });

  it('measures small fleet reconciliation (5 vehicles)', async () => {
    const start = performance.now();
    const result = await service.reconcileFleetCapacity('comp-perf', 5);
    const duration = performance.now() - start;

    expect(result.provisionedCount).toBe(5);
    expect(result.currentFleetCount).toBe(5);
    expect(duration).toBeLessThan(100); // Target < 100ms
    // Log measured time
    console.log(`Small Fleet (5 vehicles): ${duration.toFixed(2)} ms`);
  });

  it('measures medium fleet reconciliation (25 vehicles)', async () => {
    const start = performance.now();
    const result = await service.reconcileFleetCapacity('comp-perf', 25);
    const duration = performance.now() - start;

    expect(result.provisionedCount).toBe(25);
    expect(result.currentFleetCount).toBe(25);
    expect(duration).toBeLessThan(250); // Target < 250ms
    console.log(`Medium Fleet (25 vehicles): ${duration.toFixed(2)} ms`);
  });

  it('measures large fleet reconciliation (100 vehicles)', async () => {
    const start = performance.now();
    const result = await service.reconcileFleetCapacity('comp-perf', 100);
    const duration = performance.now() - start;

    expect(result.provisionedCount).toBe(100);
    expect(result.currentFleetCount).toBe(100);
    expect(duration).toBeLessThan(500); // Target < 500ms
    console.log(`Large Fleet (100 vehicles): ${duration.toFixed(2)} ms`);
  });

  it('measures idempotent subsequent run (0 changes)', async () => {
    await service.reconcileFleetCapacity('comp-perf', 50);

    const start = performance.now();
    const result = await service.reconcileFleetCapacity('comp-perf', 50);
    const duration = performance.now() - start;

    expect(result.provisionedCount).toBe(0);
    expect(result.status).toBe('SYNCHRONIZED');
    expect(duration).toBeLessThan(25); // Target < 25ms
    console.log(`Idempotent reconciliation (50 vehicles, 0 changes): ${duration.toFixed(2)} ms`);
  });
});

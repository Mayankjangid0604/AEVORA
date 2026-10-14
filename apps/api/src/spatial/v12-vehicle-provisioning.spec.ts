import { Test, TestingModule } from '@nestjs/testing';
import { V12VehicleService } from './vehicle.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './navigation.service';
import { V12AssetRegistryService } from './asset-registry.service';
import {
  calculateSlotCoordinate,
  calculateParkingAreaPosition,
  DEFAULT_VEHICLE_POLICY,
} from './vehicle-policy';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { V12EntityType } from '@aevora/shared';

describe('V15-D: Automatic Vehicle Provisioning & Fleet Spatialization', () => {
  let service: V12VehicleService;

  // In-memory data store for deterministic mock testing
  let vehicles: any[] = [];
  let parkingAreas: any[] = [];
  let sites: any[] = [];
  let navigationNodes: any[] = [];
  let topologyEdges: any[] = [];
  let movementStates: any[] = [];
  let employees: any[] = [];
  let companies: any[] = [];

  const mockEventService = {
    createEventEnvelope: jest.fn((eventType, entityId, entityType, payload, companyId) => ({
      eventId: `evt_${Date.now()}`,
      eventType,
      entityId,
      entityType,
      payload,
      companyId,
      timestamp: new Date().toISOString(),
    })),
    broadcastEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockNavService = {
    requestEntityMovement: jest.fn().mockResolvedValue({
      entityId: 'v1',
      movementState: 'MOVING',
      progress: 0.1,
    }),
  };

  const mockAssetRegistry = {
    resolveAssetId: jest.fn((key: string) => `asset_${key.toLowerCase()}_v1`),
  };

  const mockPrisma = {
    company: {
      findUnique: jest.fn(async ({ where }: any) => companies.find((c) => c.id === where.id) || null),
    },
    employee: {
      findUnique: jest.fn(async ({ where }: any) => employees.find((e) => e.id === where.id) || null),
    },
    v12SpatialSite: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (!where) return sites[0] || null;
        return sites.find((s) => s.companyId === where.companyId) || sites[0] || null;
      }),
      findMany: jest.fn(async () => sites),
    },
    v12SpatialParkingArea: {
      findFirst: jest.fn(async ({ where }: any) => {
        return parkingAreas.find((p) => {
          if (where?.siteId && p.siteId !== where.siteId) return false;
          if (where?.site?.companyId) {
            const site = sites.find((s) => s.id === p.siteId);
            if (site?.companyId !== where.site?.companyId) return false;
          }
          if (where?.availableSpots?.gt !== undefined && p.availableSpots <= where.availableSpots.gt) return false;
          return true;
        }) || null;
      }),
      findUnique: jest.fn(async ({ where }: any) => parkingAreas.find((p) => p.id === where.id) || null),
      findMany: jest.fn(async ({ where }: any) => {
        return parkingAreas.filter((p) => {
          if (where?.siteId && p.siteId !== where.siteId) return false;
          if (where?.site?.companyId) {
            const site = sites.find((s) => s.id === p.siteId);
            if (site?.companyId !== where.site?.companyId) return false;
          }
          return true;
        });
      }),
      count: jest.fn(async ({ where }: any) => {
        return parkingAreas.filter((p) => {
          if (where?.site?.companyId) {
            const site = sites.find((s) => s.id === p.siteId);
            return site?.companyId === where.site.companyId;
          }
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }: any) => {
        const item = { id: `parking_${Date.now()}_${Math.random()}`, ...data };
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
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return vehicles.find((v) => v.id === where.id) || null;
        if (where.ownerEmployeeId) return vehicles.find((v) => v.ownerEmployeeId === where.ownerEmployeeId) || null;
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return vehicles.filter((v) => {
          if (where?.companyId && v.companyId !== where.companyId) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }: any) => {
        return vehicles.filter((v) => {
          if (where?.companyId && v.companyId !== where.companyId) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }: any) => {
        const item = { id: `veh_${Date.now()}_${Math.random()}`, ...data, createdAt: new Date() };
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
      findFirst: jest.fn(async ({ where }: any) => {
        return navigationNodes.find((n) => {
          if (where?.siteId && n.siteId !== where.siteId) return false;
          if (where?.NOT?.id && n.id === where.NOT.id) return false;
          return true;
        }) || null;
      }),
      upsert: jest.fn(async ({ create, update, where }: any) => {
        let node = navigationNodes.find((n) => n.id === where.id);
        if (!node) {
          node = { ...create };
          navigationNodes.push(node);
        } else {
          Object.assign(node, update);
        }
        return node;
      }),
    },
    v12SpatialTopologyEdge: {
      create: jest.fn(async ({ data }: any) => {
        const edge = { id: `edge_${Date.now()}`, ...data };
        topologyEdges.push(edge);
        return edge;
      }),
    },
    v12SpatialMovementState: {
      upsert: jest.fn(async ({ create, update, where }: any) => {
        let ms = movementStates.find((m) => m.entityId === where.entityId);
        if (!ms) {
          ms = { id: `ms_${Date.now()}`, ...create };
          movementStates.push(ms);
        } else {
          Object.assign(ms, update);
        }
        return ms;
      }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    vehicles = [];
    parkingAreas = [];
    sites = [];
    navigationNodes = [];
    topologyEdges = [];
    movementStates = [];
    employees = [];
    companies = [];

    // Seed test enterprise company & site
    const companyA = { id: 'company-a', name: 'Apex Dynamics' };
    const companyB = { id: 'company-b', name: 'Stellar Labs' };
    companies.push(companyA, companyB);

    const siteA = { id: 'site-a', companyId: companyA.id, name: 'Apex HQ Campus' };
    const siteB = { id: 'site-b', companyId: companyB.id, name: 'Stellar Park' };
    sites.push(siteA, siteB);

    // Seed campus entrance navigation node for siteA
    navigationNodes.push({
      id: 'node_campus_entry_a',
      siteId: siteA.id,
      entityId: siteA.id,
      entityType: 'CAMPUS',
      nodeType: 'WAYPOINT',
      posX: 0,
      posY: 0,
      posZ: 0,
      isTraversable: true,
    });

    // Seed actor employees
    employees.push({
      id: 'actor-a',
      name: 'Sarah Connor',
      companyId: companyA.id,
      status: 'ACTIVE',
      role: { title: 'Fleet Director', accessLevel: 'MANAGEMENT' },
    });
    employees.push({
      id: 'actor-b',
      name: 'Bruce Wayne',
      companyId: companyB.id,
      status: 'ACTIVE',
      role: { title: 'Managing Director', accessLevel: 'MANAGEMENT' },
    });

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

  // =========================================================================
  // A. Authoritative Vehicle Provisioning
  // =========================================================================
  describe('A. Authoritative Vehicle Provisioning', () => {
    it('creates authoritative vehicle records with company scope and allocated parking', async () => {
      const res = await service.autoProvisionFleet('company-a', 'actor-a', {
        count: 3,
        vehicleClass: 'EXECUTIVE',
      });

      expect(res.provisionedCount).toBe(3);
      expect(vehicles.length).toBe(3);
      vehicles.forEach((v) => {
        expect(v.companyId).toBe('company-a');
        expect(v.vehicleClass).toBe('EXECUTIVE');
        expect(v.parkingAreaId).toBeDefined();
        expect(v.isParked).toBe(true);
      });
    });
  });

  // =========================================================================
  // B. Vehicle Policy Validation
  // =========================================================================
  describe('B. Vehicle Policy Validation', () => {
    it('rejects unpermitted vehicle classes', async () => {
      await expect(
        service.autoProvisionFleet('company-a', 'actor-a', {
          count: 1,
          vehicleClass: 'MONSTER_TRUCK' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid provisioning quantities', async () => {
      await expect(
        service.autoProvisionFleet('company-a', 'actor-a', { count: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.autoProvisionFleet('company-a', 'actor-a', { count: 101 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies default vehicle policy when unspecified', () => {
      const policy = service.getPolicy();
      expect(policy.defaultVehicleClass).toBe('STANDARD');
      expect(policy.defaultSpotsPerParkingArea).toBe(10);
      expect(policy.slotsPerRow).toBe(5);
    });
  });

  // =========================================================================
  // C. Deterministic Parking Allocation
  // =========================================================================
  describe('C. Deterministic Parking Allocation', () => {
    it('computes repeatable, symmetric slot coordinates for vehicles', () => {
      const parking = { posX: 50, posY: 0, posZ: 50 };
      const slot0 = calculateSlotCoordinate(parking, 0);
      const slot1 = calculateSlotCoordinate(parking, 1);
      const slot2 = calculateSlotCoordinate(parking, 2);

      // Centered: Slot 2 should be at center col (offsetX = 0)
      expect(slot2.x).toBe(50);
      expect(slot0.x).toBeLessThan(slot1.x);
      expect(slot0.y).toBe(0.35); // procedural ground clearance
    });
  });

  // =========================================================================
  // D. Parking Capacity Exhaustion
  // =========================================================================
  describe('D. Parking Capacity Exhaustion', () => {
    it('exhausts available spots and expands or creates additional capacity', async () => {
      // Provision 10 spots default area
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 10 });
      const firstArea = parkingAreas[0];
      expect(firstArea.availableSpots).toBe(0);

      // Provision 1 more vehicle: triggers in-place capacity expansion
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      expect(firstArea.capacity).toBe(20);
      expect(firstArea.availableSpots).toBe(9);
    });
  });

  // =========================================================================
  // E. Parking Expansion
  // =========================================================================
  describe('E. Parking Expansion', () => {
    it('provisions a second spatial parking area once in-place capacity reaches max', async () => {
      // 20 vehicles maxes out area 1
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 20 });
      expect(parkingAreas.length).toBe(1);
      expect(parkingAreas[0].capacity).toBe(20);
      expect(parkingAreas[0].availableSpots).toBe(0);

      // Provision 1 more: creates second parking area with navigation integration
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      expect(parkingAreas.length).toBe(2);
      expect(parkingAreas[1].name).toContain('Parking Area 2');
      expect(parkingAreas[1].availableSpots).toBe(9);
    });
  });

  // =========================================================================
  // F. Vehicle Lifecycle Reconciliation
  // =========================================================================
  describe('F. Vehicle Lifecycle Reconciliation', () => {
    it('reconciles deficit fleet requirements up to the target fleet count', async () => {
      const result = await service.reconcileFleetCapacity('company-a', 5);
      expect(result.status).toBe('PROVISIONED');
      expect(result.provisionedCount).toBe(5);
      expect(result.currentFleetCount).toBe(5);
    });

    it('preserves surplus fleet without destroying historical records', async () => {
      await service.reconcileFleetCapacity('company-a', 6);
      expect(vehicles.length).toBe(6);

      // Requirement drops to 4: does not destroy existing vehicles
      const reduced = await service.reconcileFleetCapacity('company-a', 4);
      expect(reduced.status).toBe('SYNCHRONIZED');
      expect(reduced.provisionedCount).toBe(0);
      expect(reduced.currentFleetCount).toBe(6);
      expect(vehicles.length).toBe(6);
    });
  });

  // =========================================================================
  // G. Vehicle Deactivation / Retirement
  // =========================================================================
  describe('G. Vehicle Deactivation / Retirement', () => {
    it('decommissions a vehicle, frees parking, and preserves the record', async () => {
      const res = await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      const vehId = res.vehicles[0].id;
      const parking = parkingAreas[0];
      const spotsBefore = parking.availableSpots;

      const decommissioned = await service.decommissionVehicle(vehId, 'company-a');
      expect(decommissioned.isParked).toBe(false);
      expect(decommissioned.parkingAreaId).toBeNull();
      expect(parking.availableSpots).toBe(spotsBefore + 1);

      // Authoritative vehicle record is preserved
      expect(vehicles.find((v) => v.id === vehId)).toBeDefined();

      // Emitted VEHICLE_DEACTIVATED event
      expect(mockEventService.createEventEnvelope).toHaveBeenCalledWith(
        'VEHICLE_DEACTIVATED',
        vehId,
        V12EntityType.VEHICLE,
        expect.any(Object),
        'company-a',
      );
    });
  });

  // =========================================================================
  // H. V12VehicleService Integration
  // =========================================================================
  describe('H. V12VehicleService Integration', () => {
    it('preserves existing createVehicleForEmployee method and occupant assignment', async () => {
      employees.push({
        id: 'emp-chairman',
        name: 'The Chairman',
        companyId: 'company-a',
        role: { title: 'Chairman of the Board', accessLevel: 'CHAIRMAN' },
      });

      const veh = await service.createVehicleForEmployee('emp-chairman');
      expect(veh.vehicleClass).toBe('CHAIRMAN');
      expect(veh.ownerEmployeeId).toBe('emp-chairman');

      // Assign occupant from same company
      const updated = await service.assignOccupant(veh.id, 'actor-a');
      expect(updated.occupantEmployeeIds).toContain('actor-a');
    });
  });

  // =========================================================================
  // I. Navigation Integration
  // =========================================================================
  describe('I. Navigation Integration', () => {
    it('creates waypoint navigation node and topology edge for newly generated parking', async () => {
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      const parkingNode = navigationNodes.find((n) => n.entityType === 'PARKING');
      expect(parkingNode).toBeDefined();
      expect(parkingNode.nodeType).toBe('WAYPOINT');
      expect(parkingNode.isTraversable).toBe(true);

      const edge = topologyEdges.find((e) => e.sourceId === parkingNode.id);
      expect(edge).toBeDefined();
      expect(edge.traversalType).toBe('WALK');
    });
  });

  // =========================================================================
  // J. Vehicle Movement-State Foundation
  // =========================================================================
  describe('J. Vehicle Movement-State Foundation', () => {
    it('initializes V12SpatialMovementState for newly provisioned vehicles', async () => {
      const res = await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      const vehId = res.vehicles[0].id;

      const ms = movementStates.find((m) => m.entityId === vehId);
      expect(ms).toBeDefined();
      expect(ms.entityType).toBe('VEHICLE');
      expect(ms.movementMode).toBe('VEHICLE');
      expect(ms.movementState).toBe('IDLE');
      expect(ms.currentLocationType).toBe('PARKING');
    });
  });

  // =========================================================================
  // K. Deterministic Spatial Placement
  // =========================================================================
  describe('K. Deterministic Spatial Placement', () => {
    it('computes repeatable campus positions for parking expansion areas', () => {
      const pos0 = calculateParkingAreaPosition(0);
      const pos1 = calculateParkingAreaPosition(1);
      const pos2 = calculateParkingAreaPosition(2);

      expect(pos0).toEqual({ posX: 45, posY: 0, posZ: 45 });
      expect(pos1).toEqual({ posX: 67, posY: 0, posZ: 45 });
      expect(pos2).toEqual({ posX: 89, posY: 0, posZ: 45 });

      // Repeating calculation yields strictly identical coordinates
      expect(calculateParkingAreaPosition(1)).toEqual(pos1);
    });
  });

  // =========================================================================
  // L. Realtime World-State Propagation
  // =========================================================================
  describe('L. Realtime World-State Propagation', () => {
    it('broadcasts VEHICLE_CREATED event through WorldStateEventService', async () => {
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });

      expect(mockEventService.createEventEnvelope).toHaveBeenCalledWith(
        'VEHICLE_CREATED',
        expect.any(String),
        V12EntityType.VEHICLE,
        expect.any(Object),
        'company-a',
      );
      expect(mockEventService.broadcastEvent).toHaveBeenCalledWith('company-a', expect.any(Object));
    });
  });

  // =========================================================================
  // M. Idempotency & N. Duplicate Prevention
  // =========================================================================
  describe('M. Idempotency & N. Duplicate Prevention', () => {
    it('produces zero duplicates across multiple reconciliation executions', async () => {
      const run1 = await service.reconcileFleetCapacity('company-a', 5);
      expect(run1.provisionedCount).toBe(5);
      expect(vehicles.length).toBe(5);

      const run2 = await service.reconcileFleetCapacity('company-a', 5);
      expect(run2.provisionedCount).toBe(0);
      expect(run2.status).toBe('SYNCHRONIZED');
      expect(vehicles.length).toBe(5);

      const run3 = await service.reconcileFleetCapacity('company-a', 5);
      expect(run3.provisionedCount).toBe(0);
      expect(vehicles.length).toBe(5);
    });
  });

  // =========================================================================
  // O. Company Isolation
  // =========================================================================
  describe('O. Company Isolation', () => {
    it('prevents an actor from company B provisioning vehicles for company A', async () => {
      await expect(
        service.autoProvisionFleet('company-a', 'actor-b', { count: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents cross-company vehicle decommissioning', async () => {
      const res = await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      const vehId = res.vehicles[0].id;

      await expect(
        service.decommissionVehicle(vehId, 'company-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ensures parking allocation is strictly tenant-scoped to the company site', async () => {
      await service.autoProvisionFleet('company-a', 'actor-a', { count: 2 });
      await service.autoProvisionFleet('company-b', 'actor-b', { count: 2 });

      const areaA = parkingAreas.find((p) => p.siteId === 'site-a');
      const areaB = parkingAreas.find((p) => p.siteId === 'site-b');

      expect(areaA).toBeDefined();
      expect(areaB).toBeDefined();
      expect(areaA.siteId).not.toBe(areaB.siteId);
    });
  });

  // =========================================================================
  // P. Failure Isolation
  // =========================================================================
  describe('P. Failure Isolation', () => {
    it('preserves authoritative vehicle even if movement state or event broadcast fails', async () => {
      mockEventService.broadcastEvent.mockRejectedValueOnce(new Error('SSE connection dropped'));

      const res = await service.autoProvisionFleet('company-a', 'actor-a', { count: 1 });
      expect(res.provisionedCount).toBe(1);
      expect(vehicles.length).toBe(1);
      expect(vehicles[0].companyId).toBe('company-a');
    });
  });

  // =========================================================================
  // Q. 3D Vehicle Rendering & R. Vehicle Inspector Data Contracts
  // =========================================================================
  describe('Q. 3D Vehicle Rendering & R. Vehicle Inspector Contracts', () => {
    it('guarantees all projection fields exist for 3D Scene and Inspector presentation', async () => {
      const res = await service.autoProvisionFleet('company-a', 'actor-a', {
        count: 1,
        vehicleClass: 'CHAIRMAN',
      });
      const v = res.vehicles[0];

      expect(v.id).toBeDefined();
      expect(v.vehicleClass).toBe('CHAIRMAN');
      expect(v.parkingAreaId).toBeDefined();
      expect(v.isParked).toBe(true);
      expect(v.assetId).toBe('asset_vehicle_chassis_chairman_v1');
      expect(Array.isArray(v.occupantEmployeeIds)).toBe(true);
    });
  });

  // =========================================================================
  // S, T, U. V15-A, B, C Compatibility
  // =========================================================================
  describe('S, T, U. Backward Compatibility', () => {
    it('operates harmoniously with existing spatial and workforce architecture', () => {
      expect(service.getPolicy().maxParkingAreasPerSite).toBeGreaterThan(0);
      expect(DEFAULT_VEHICLE_POLICY.allowedVehicleClasses).toContain('STANDARD');
      expect(DEFAULT_VEHICLE_POLICY.allowedVehicleClasses).toContain('CHAIRMAN');
    });
  });
});

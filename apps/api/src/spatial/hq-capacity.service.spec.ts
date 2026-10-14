import { Test, TestingModule } from '@nestjs/testing';
import { HqCapacityService } from './hq-capacity.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './navigation.service';
import { NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';

describe('HqCapacityService (Stage V15-B)', () => {
  let service: HqCapacityService;

  // In-memory relational store to test reconciliation and idempotency accurately
  let store: {
    companies: any[];
    departments: any[];
    employees: any[];
    sites: any[];
    buildings: any[];
    floors: any[];
    rooms: any[];
    workspaces: any[];
    navNodes: any[];
    navEdges: any[];
    cities: any[];
  };

  let emittedEvents: any[] = [];

  const mockEventService = {
    createEventEnvelope: jest.fn((eventType, entityId, entityType, payload, companyId) => {
      return { eventType, entityId, entityType, payload, companyId, authoritativeTimestamp: Date.now() };
    }),
    broadcastEvent: jest.fn(async (companyId, envelope) => {
      emittedEvents.push(envelope);
    }),
    broadcastWorldStateEvent: jest.fn((event) => {
      emittedEvents.push(event);
    }),
    getGlobalStream: jest.fn().mockReturnValue(new Subject()),
  };

  const createMockPrisma = () => ({
    company: {
      findUnique: jest.fn(async ({ where, include: _include }) => {
        const c = store.companies.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees.filter((e) => e.companyId === c.id),
        };
      }),
    },
    v12SpatialSite: {
      findFirst: jest.fn(async ({ where }) => store.sites.find((s) => s.companyId === where.companyId) || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: `site-${Date.now()}-${Math.random()}`, ...data };
        store.sites.push(item);
        return item;
      }),
    },
    v12SpatialCity: {
      findFirst: jest.fn(async () => store.cities[0] || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: `city-1`, ...data };
        store.cities.push(item);
        return item;
      }),
    },
    v12SpatialWorld: {
      findFirst: jest.fn(async () => ({ id: 'world-1', name: 'Saahvik' })),
    },
    v12SpatialRegion: {
      findFirst: jest.fn(async () => ({ id: 'region-1', name: 'Core Region' })),
    },
    v12SpatialCountry: {
      findFirst: jest.fn(async () => ({ id: 'country-1', name: 'Aevora Republic' })),
    },
    v12SpatialBuilding: {
      findFirst: jest.fn(async ({ where }) => {
        return store.buildings.find((b) => {
          if (where.siteId && b.siteId !== where.siteId) return false;
          if (where.name && b.name !== where.name) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.buildings.filter((b) => {
          if (!where) return true;
          if (where.siteId && b.siteId !== where.siteId) return false;
          if (where.id?.in && !where.id.in.includes(b.id)) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `bldg-${store.buildings.length + 1}`, ...data };
        store.buildings.push(item);
        return item;
      }),
    },
    v12SpatialFloor: {
      findFirst: jest.fn(async ({ where }) => {
        return store.floors.find((f) => {
          if (where.buildingId && f.buildingId !== where.buildingId) return false;
          if (where.level !== undefined && f.level !== where.level) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.floors.filter((f) => {
          if (!where) return true;
          if (where.buildingId && typeof where.buildingId === 'string' && f.buildingId !== where.buildingId) return false;
          if (where.buildingId?.in && !where.buildingId.in.includes(f.buildingId)) return false;
          if (where.level?.lt !== undefined && f.level >= where.level.lt) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `floor-${store.floors.length + 1}`, ...data };
        store.floors.push(item);
        return item;
      }),
    },
    v12SpatialRoom: {
      findFirst: jest.fn(async ({ where }) => {
        return store.rooms.find((r) => {
          if (where.departmentId && r.departmentId !== where.departmentId) return false;
          if (where.type && r.type !== where.type) return false;
          if (where.floorId && r.floorId !== where.floorId) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.rooms.filter((r) => {
          if (!where) return true;
          if (where.departmentId && r.departmentId !== where.departmentId) return false;
          if (where.floorId && typeof where.floorId === 'string' && r.floorId !== where.floorId) return false;
          if (where.floorId?.in && !where.floorId.in.includes(r.floorId)) return false;
          if (where.floor?.building?.site?.companyId && r.companyId !== where.floor.building.site.companyId) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }) => {
        return store.rooms.filter((r) => {
          if (where.floorId && r.floorId !== where.floorId) return false;
          if (where.departmentId && r.departmentId !== where.departmentId) return false;
          if (where.type && r.type !== where.type) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `room-${store.rooms.length + 1}`, ...data };
        store.rooms.push(item);
        return item;
      }),
    },
    v12SpatialWorkspace: {
      findFirst: jest.fn(async ({ where }) => {
        return store.workspaces.find((w) => {
          if (where.roomId && w.roomId !== where.roomId) return false;
          if (where.companyId && w.companyId !== where.companyId) return false;
          if (where.employeeId && w.employeeId !== where.employeeId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.workspaces.filter((w) => {
          if (!where) return true;
          if (where.roomId && typeof where.roomId === 'string' && w.roomId !== where.roomId) return false;
          if (where.roomId?.in && !where.roomId.in.includes(w.roomId)) return false;
          if (where.companyId && w.companyId !== where.companyId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }) => {
        return store.workspaces.filter((w) => {
          if (where.roomId && w.roomId !== where.roomId) return false;
          if (where.companyId && w.companyId !== where.companyId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `ws-${store.workspaces.length + 1}`, ...data };
        store.workspaces.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const ws = store.workspaces.find((w) => w.id === where.id);
        if (ws) Object.assign(ws, data);
        return ws;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        store.workspaces.forEach((w) => {
          if (where.companyId && w.companyId !== where.companyId) return;
          if (where.employeeId?.in && !where.employeeId.in.includes(w.employeeId)) return;
          Object.assign(w, data);
          count++;
        });
        return { count };
      }),
    },
    v12NavigationNode: {
      findFirst: jest.fn(async ({ where }) => {
        return store.navNodes.find((n) => {
          if (where.entityId && n.entityId !== where.entityId) return false;
          if (where.entityType && n.entityType !== where.entityType) return false;
          if (where.floorId && n.floorId !== where.floorId) return false;
          if (where.nodeType && n.nodeType !== where.nodeType) return false;
          return true;
        }) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `node-${store.navNodes.length + 1}`, ...data };
        store.navNodes.push(item);
        return item;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.navNodes.filter((n) => {
          if (where?.id?.in && !where.id.in.includes(n.id)) return false;
          return true;
        });
      }),
    },
    v12SpatialTopologyEdge: {
      findFirst: jest.fn(async ({ where }) => {
        return store.navEdges.find((e) => {
          if (where.sourceId && e.sourceId !== where.sourceId) return false;
          if (where.targetId && e.targetId !== where.targetId) return false;
          return true;
        }) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `edge-${store.navEdges.length + 1}`, ...data };
        store.navEdges.push(item);
        return item;
      }),
    },
  });

  beforeEach(async () => {
    store = {
      companies: [],
      departments: [],
      employees: [],
      sites: [],
      buildings: [],
      floors: [],
      rooms: [],
      workspaces: [],
      navNodes: [],
      navEdges: [],
      cities: [{ id: 'city-1', name: 'Genesis City' }],
    };
    emittedEvents = [];

    const mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HqCapacityService,
        V12NavigationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<HqCapacityService>(HqCapacityService);
  });

  describe('Capacity Policy & Evaluation', () => {
    it('initializes with documented capacity policy parameters', () => {
      const policy = service.getPolicy();
      expect(policy.workspacesPerDepartmentRoom).toBe(6);
      expect(policy.maxOperationalRoomsPerFloor).toBe(6);
      expect(policy.maxOperationalFloorsPerBuilding).toBe(4);
      expect(policy.executiveLevelNumber).toBe(100);
    });

    it('A. room capacity reached triggers required expansion calculation', async () => {
      // 14 engineering employees => requires 3 rooms (ceil(14 / 6) = 3 rooms, 18 workspaces)
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      store.departments.push({ id: 'dept-eng', name: 'Engineering', companyId: 'comp-1' });
      for (let i = 1; i <= 14; i++) {
        store.employees.push({
          id: `emp-${i}`,
          firstName: `Engineer`,
          lastName: `${i}`,
          companyId: 'comp-1',
          departmentId: 'dept-eng',
          status: 'ACTIVE',
        });
      }

      const evalResult = await service.evaluateCapacity('comp-1');

      expect(evalResult.departmentMetrics[0].headcount).toBe(14);
      expect(evalResult.departmentMetrics[0].requiredRoomsCount).toBe(3);
      expect(evalResult.departmentMetrics[0].deficitWorkspaces).toBe(18); // 0 provisioned initially
      expect(evalResult.requiresExpansion).toBe(true);
      expect(evalResult.requiredNewFloors).toBe(1); // 3 rooms fits in 1 operational floor (<= 6)
      expect(evalResult.requiredNewBuildings).toBe(1);
    });

    it('D. floor capacity reached triggers automatic additional floor calculation', async () => {
      // 8 departments with 6 employees each = 8 rooms.
      // Max 6 rooms per floor => requires 2 operational floors.
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      for (let d = 1; d <= 8; d++) {
        store.departments.push({ id: `dept-${d}`, name: `Dept ${d}`, companyId: 'comp-1' });
        for (let e = 1; e <= 6; e++) {
          store.employees.push({
            id: `emp-d${d}-e${e}`,
            firstName: `Emp`,
            lastName: `${e}`,
            companyId: 'comp-1',
            departmentId: `dept-${d}`,
            status: 'ACTIVE',
          });
        }
      }

      const evalResult = await service.evaluateCapacity('comp-1');
      expect(evalResult.requiredNewRooms).toBe(8);
      expect(evalResult.requiredNewFloors).toBe(2);
      expect(evalResult.requiredNewBuildings).toBe(1);
    });

    it('J. building/wing threshold triggers additional building calculation', async () => {
      // If required operational rooms exceed 4 floors * 6 rooms = 24 rooms (e.g., 25 rooms)
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      for (let d = 1; d <= 25; d++) {
        store.departments.push({ id: `dept-${d}`, name: `Dept ${d}`, companyId: 'comp-1' });
        store.employees.push({
          id: `emp-${d}`,
          firstName: `Emp`,
          lastName: `${d}`,
          companyId: 'comp-1',
          departmentId: `dept-${d}`,
          status: 'ACTIVE',
        });
      }

      const evalResult = await service.evaluateCapacity('comp-1');
      expect(evalResult.requiredNewRooms).toBe(25);
      expect(evalResult.requiredNewFloors).toBe(5); // ceil(25 / 6) = 5 floors
      expect(evalResult.requiredNewBuildings).toBe(2); // ceil(5 / 4) = 2 buildings
    });
  });

  describe('B. Department Room Expansion & C. Workspace Provisioning', () => {
    it('provisions multiple department rooms retaining the same authoritative department ID', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      store.departments.push({ id: 'dept-eng', name: 'Engineering', companyId: 'comp-1' });
      for (let i = 1; i <= 14; i++) {
        store.employees.push({
          id: `emp-${i}`,
          firstName: `Engineer`,
          lastName: `${i}`,
          companyId: 'comp-1',
          departmentId: 'dept-eng',
          status: 'ACTIVE',
        });
      }

      await service.reconcileCompanyCapacity('comp-1');

      // Verify rooms provisioned for Engineering
      const engRooms = store.rooms.filter((r) => r.departmentId === 'dept-eng');
      expect(engRooms.length).toBe(3);
      expect(engRooms[0].name).toBe('Engineering Space 1');
      expect(engRooms[1].name).toBe('Engineering Space 2');
      expect(engRooms[2].name).toBe('Engineering Space 3');

      // Invariant: All rooms have the same authoritative departmentId
      engRooms.forEach((r) => expect(r.departmentId).toBe('dept-eng'));

      // Invariant: Did NOT create duplicate department records
      expect(store.departments.length).toBe(1);

      // Verify workspaces: 3 rooms * 6 workspaces = 18 workspaces
      const engWorkspaces = store.workspaces.filter((w) => engRooms.some((r) => r.id === w.roomId));
      expect(engWorkspaces.length).toBe(18);

      // Verify employee assignment (14 active employees assigned, 4 remaining empty)
      const occupied = engWorkspaces.filter((w) => w.isOccupied);
      expect(occupied.length).toBe(14);
      const unoccupied = engWorkspaces.filter((w) => !w.isOccupied);
      expect(unoccupied.length).toBe(4);
      expect(unoccupied[0].employeeId).toBeNull();
    });
  });

  describe('E. Automatic Floor Creation & F. Deterministic Floor Numbering', () => {
    it('creates sequential deterministic operational floors when capacity fills Floor 1', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      // 8 departments (8 rooms) -> 6 on Floor 1, 2 on Floor 2, plus Executive Floor 100
      for (let d = 1; d <= 8; d++) {
        store.departments.push({ id: `dept-${d}`, name: `Dept ${d}`, companyId: 'comp-1' });
        store.employees.push({
          id: `emp-${d}`,
          firstName: `Emp`,
          lastName: `${d}`,
          companyId: 'comp-1',
          departmentId: `dept-${d}`,
          status: 'ACTIVE',
        });
      }

      await service.reconcileCompanyCapacity('comp-1');

      const bldg = store.buildings[0];
      const floors = store.floors.filter((f) => f.buildingId === bldg.id);

      // Operational floors: Level 1 and Level 2, plus Executive floor: Level 100
      const floorLevels = floors.map((f) => f.level).sort((a, b) => a - b);
      expect(floorLevels).toEqual([1, 2, 100]);

      const floor1DeptRooms = store.rooms.filter(
        (r) => r.floorId === floors.find((f) => f.level === 1)?.id && r.type === 'DEPARTMENT_SPACE'
      );
      expect(floor1DeptRooms.length).toBe(6);

      const floor2DeptRooms = store.rooms.filter(
        (r) => r.floorId === floors.find((f) => f.level === 2)?.id && r.type === 'DEPARTMENT_SPACE'
      );
      expect(floor2DeptRooms.length).toBe(2);

      const execRooms = store.rooms.filter((r) => r.floorId === floors.find((f) => f.level === 100)?.id);
      expect(execRooms.length).toBeGreaterThan(0);
      expect(execRooms.some((r) => r.type === 'CEO_OFFICE' || r.type === 'CHAIRMAN_OFFICE')).toBe(true);
    });
  });

  describe('G. Navigation Node Generation, H. Topology & I. Floor-to-Floor Navigation', () => {
    it('generates fully connected navigation mesh across rooms, corridors, and floors', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      for (let d = 1; d <= 8; d++) {
        store.departments.push({ id: `dept-${d}`, name: `Dept ${d}`, companyId: 'comp-1' });
        store.employees.push({
          id: `emp-${d}`,
          firstName: `Emp`,
          lastName: `${d}`,
          companyId: 'comp-1',
          departmentId: `dept-${d}`,
          status: 'ACTIVE',
        });
      }

      await service.reconcileCompanyCapacity('comp-1');

      // Check navigation nodes exist for corridors, elevators, and rooms
      const corridorNodes = store.navNodes.filter((n) => n.nodeType === 'CORRIDOR');
      const elevatorNodes = store.navNodes.filter((n) => n.nodeType === 'ELEVATOR');
      const roomNodes = store.navNodes.filter((n) => n.nodeType === 'ROOM');

      expect(corridorNodes.length).toBeGreaterThanOrEqual(2); // Floor 1 and Floor 2
      expect(elevatorNodes.length).toBeGreaterThanOrEqual(2); // Floor 1 and Floor 2
      expect(roomNodes.length).toBe(store.rooms.length);

      // Verify topology edges connect floor 1 elevator to floor 2 elevator
      const fl1Elevator = elevatorNodes.find((e) => e.floorId === store.floors.find((f) => f.level === 1)?.id);
      const fl2Elevator = elevatorNodes.find((e) => e.floorId === store.floors.find((f) => f.level === 2)?.id);

      const verticalEdge = store.navEdges.find(
        (e) =>
          (e.sourceId === fl1Elevator?.id && e.targetId === fl2Elevator?.id) ||
          (e.sourceId === fl2Elevator?.id && e.targetId === fl1Elevator?.id)
      );
      expect(verticalEdge).toBeDefined();
      expect(verticalEdge.traversalType).toBe('ELEVATOR');
    });
  });

  describe('L. Repeated Reconciliation & M. Idempotency (Zero Duplicates)', () => {
    it('N. produces zero duplicate entities on repeated reconciliation runs', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      store.departments.push({ id: 'dept-1', name: 'Product', companyId: 'comp-1' });
      for (let i = 1; i <= 10; i++) {
        store.employees.push({
          id: `emp-${i}`,
          firstName: `Emp`,
          lastName: `${i}`,
          companyId: 'comp-1',
          departmentId: 'dept-1',
          status: 'ACTIVE',
        });
      }

      // First run: provisions required capacity
      const run1 = await service.reconcileCompanyCapacity('comp-1');
      expect(run1.created.rooms).toBeGreaterThan(0);
      expect(run1.created.workspaces).toBeGreaterThan(0);

      const countsAfterRun1 = {
        buildings: store.buildings.length,
        floors: store.floors.length,
        rooms: store.rooms.length,
        workspaces: store.workspaces.length,
        navNodes: store.navNodes.length,
        navEdges: store.navEdges.length,
      };

      // Second run: no authoritative enterprise state changed
      const run2 = await service.reconcileCompanyCapacity('comp-1');
      expect(run2.created.buildings).toBe(0);
      expect(run2.created.floors).toBe(0);
      expect(run2.created.rooms).toBe(0);
      expect(run2.created.workspaces).toBe(0);
      expect(run2.created.navigationNodes).toBe(0);
      expect(run2.created.topologyEdges).toBe(0);

      // Third run: exact same result
      const run3 = await service.reconcileCompanyCapacity('comp-1');
      expect(run3.created.rooms).toBe(0);
      expect(run3.created.workspaces).toBe(0);

      expect(store.buildings.length).toBe(countsAfterRun1.buildings);
      expect(store.floors.length).toBe(countsAfterRun1.floors);
      expect(store.rooms.length).toBe(countsAfterRun1.rooms);
      expect(store.workspaces.length).toBe(countsAfterRun1.workspaces);
      expect(store.navNodes.length).toBe(countsAfterRun1.navNodes);
      expect(store.navEdges.length).toBe(countsAfterRun1.navEdges);
    });
  });

  describe('K. Company Isolation & Multi-Tenant Security', () => {
    it('evaluates and provisions capacity strictly within company boundary', async () => {
      store.companies.push({ id: 'comp-alpha', name: 'Alpha Inc', groupId: null });
      store.companies.push({ id: 'comp-beta', name: 'Beta Ltd', groupId: null });

      store.departments.push({ id: 'dept-alpha', name: 'Alpha Dept', companyId: 'comp-alpha' });
      store.departments.push({ id: 'dept-beta', name: 'Beta Dept', companyId: 'comp-beta' });

      for (let i = 1; i <= 6; i++) {
        store.employees.push({
          id: `emp-a-${i}`,
          firstName: 'A',
          lastName: `${i}`,
          companyId: 'comp-alpha',
          departmentId: 'dept-alpha',
          status: 'ACTIVE',
        });
      }

      await service.reconcileCompanyCapacity('comp-alpha');

      // Alpha has provisioned items
      expect(store.sites.filter((s) => s.companyId === 'comp-alpha').length).toBe(1);
      expect(store.rooms.filter((r) => r.departmentId === 'dept-alpha').length).toBe(1);

      // Beta has zero provisioned items
      expect(store.sites.filter((s) => s.companyId === 'comp-beta').length).toBe(0);
      expect(store.rooms.filter((r) => r.departmentId === 'dept-beta').length).toBe(0);
    });

    it('throws NotFoundException when reconciling an invalid company ID', async () => {
      await expect(service.reconcileCompanyCapacity('comp-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('P. Workforce Reduction & Workspace Retention', () => {
    it('vacates workspaces on employee termination but retains physical room capacity', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      store.departments.push({ id: 'dept-1', name: 'Operations', companyId: 'comp-1' });

      const emp1 = { id: 'emp-1', firstName: 'John', lastName: 'Doe', companyId: 'comp-1', departmentId: 'dept-1', status: 'ACTIVE' };
      const emp2 = { id: 'emp-2', firstName: 'Jane', lastName: 'Smith', companyId: 'comp-1', departmentId: 'dept-1', status: 'ACTIVE' };
      store.employees.push(emp1, emp2);

      // Initial reconciliation: both assigned
      await service.reconcileCompanyCapacity('comp-1');
      const wsEmp1 = store.workspaces.find((w) => w.employeeId === 'emp-1');
      expect(wsEmp1?.isOccupied).toBe(true);

      const initialRoomCount = store.rooms.length;
      const initialWorkspaceCount = store.workspaces.length;

      // Employee 1 is terminated in authoritative state
      emp1.status = 'TERMINATED';

      // Reconcile after reduction
      await service.reconcileCompanyCapacity('comp-1');

      // Workspace is vacated
      const wsVacated = store.workspaces.find((w) => w.id === wsEmp1?.id);
      expect(wsVacated?.isOccupied).toBe(false);
      expect(wsVacated?.employeeId).toBeNull();

      // Physical capacity is NOT aggressively destroyed
      expect(store.rooms.length).toBe(initialRoomCount);
      expect(store.workspaces.length).toBe(initialWorkspaceCount);
    });
  });

  describe('R. Realtime World-State Propagation', () => {
    it('broadcasts world-state events for each provisioned building, floor, room, and workspace', async () => {
      store.companies.push({ id: 'comp-1', name: 'Aevora Corp', groupId: null });
      store.departments.push({ id: 'dept-1', name: 'Engineering', companyId: 'comp-1' });
      store.employees.push({
        id: 'emp-1',
        firstName: 'Lead',
        lastName: 'Dev',
        companyId: 'comp-1',
        departmentId: 'dept-1',
        status: 'ACTIVE',
      });

      await service.reconcileCompanyCapacity('comp-1');

      expect(mockEventService.broadcastEvent).toHaveBeenCalled();
      const entityTypes = emittedEvents.map((e) => e.entityType);
      expect(entityTypes).toContain('BUILDING');
      expect(entityTypes).toContain('FLOOR');
      expect(entityTypes).toContain('DEPARTMENT_SPACE');
      expect(entityTypes).toContain('WORKSPACE');
    });
  });
});

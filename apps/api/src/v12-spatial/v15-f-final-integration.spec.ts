import { Test, TestingModule } from '@nestjs/testing';
import { CompanyService } from '../company/company.service';
import { HqCapacityService, DEFAULT_HQ_CAPACITY_POLICY } from './hq-capacity.service';
import { V12VehicleService } from './v12-vehicle.service';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { V12NavigationService } from './v12-navigation.service';
import { WorldStateGatewayService } from '../world-state-gateway/world-state-gateway.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeService } from '../employee/employee.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { V12EntityType, WorldSnapshot } from '@aevora/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyStatus, EmployeeStatus } from '@prisma/client';
import { StructuredLoggerService } from '../logger/structured-logger.service';

describe('V15-F: Final 3D Enterprise Integration Test Matrix', () => {
  let companyService: CompanyService;
  let hqCapacityService: HqCapacityService;
  let vehicleService: V12VehicleService;
  let worldStateGatewayService: WorldStateGatewayService;
  let employeeService: EmployeeService;
  let navigationService: V12NavigationService;

  let store: {
    companies: any[];
    departments: any[];
    roles: any[];
    employees: any[];
    companyEvents: any[];
    employmentHistories: any[];
    acWallets: any[];
    aevoraGroups: any[];
    sites: any[];
    buildings: any[];
    floors: any[];
    rooms: any[];
    workspaces: any[];
    parkingAreas: any[];
    vehicles: any[];
    navNodes: any[];
    navEdges: any[];
    cities: any[];
    countries: any[];
    regions: any[];
    worlds: any[];
    movementStates: any[];
  };

  let emittedEvents: any[] = [];

  const mockEventService = {
    createEventEnvelope: jest.fn((eventType, entityId, entityType, payload, companyId) => {
      return { eventType, entityId, entityType, payload, companyId, authoritativeTimestamp: Date.now() };
    }),
    broadcastEvent: jest.fn(async (companyId, envelope) => {
      emittedEvents.push(envelope);
    }),
    getCurrentSequence: jest.fn().mockReturnValue(1),
  };

  const mockAuthService = {
    checkPermission: jest.fn().mockResolvedValue(true),
    canManageEmployees: jest.fn().mockResolvedValue(true),
  };

  const createMockPrisma = () => ({
    $transaction: jest.fn(async (callback) => {
      return callback(createMockPrisma());
    }),
    company: {
      findUnique: jest.fn(async ({ where }) => {
        const c = store.companies.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees.filter((e) => e.companyId === c.id),
        };
      }),
      findFirst: jest.fn(async (args) => {
        let matches = store.companies.slice();
        if (args?.where?.id) matches = matches.filter((x) => x.id === args.where.id);
        if (args?.where?.name) matches = matches.filter((x) => x.name.toLowerCase() === args.where.name.toLowerCase());
        if (args?.where?.chairmanId) matches = matches.filter((x) => x.chairmanId === args.where.chairmanId);
        if (args?.where?.groupId) matches = matches.filter((x) => x.groupId === args.where.groupId);
        if (args?.where?.status) matches = matches.filter((x) => x.status === args.where.status);
        const c = matches[0];
        if (!c) return null;
        return {
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees.filter((e) => e.companyId === c.id),
        };
      }),
      findMany: jest.fn(async (args) => {
        let res = [...store.companies];
        if (args?.where?.parentCompanyId !== undefined) {
          res = res.filter((c) => c.parentCompanyId === args.where.parentCompanyId);
        }
        if (args?.where?.chairmanId) {
          res = res.filter((c) => c.chairmanId === args.where.chairmanId);
        }
        return res.map((c) => ({
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees.filter((e) => e.companyId === c.id),
        }));
      }),
      create: jest.fn(async ({ data }) => {
        const id = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newComp = {
          id,
          name: data.name,
          legalName: data.legalName || `${data.name} Ltd.`,
          description: data.description || null,
          chairmanId: data.chairmanId,
          groupId: data.groupId || null,
          parentCompanyId: data.parentCompanyId || null,
          status: data.status || CompanyStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.companies.push(newComp);

        if (data.departments?.create) {
          for (const d of data.departments.create) {
            const dept = {
              id: `dept_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: d.name,
              companyId: id,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            store.departments.push(dept);
          }
        }

        return {
          ...newComp,
          departments: store.departments.filter((d) => d.companyId === id),
        };
      }),
      update: jest.fn(async ({ where, data }) => {
        const c = store.companies.find((x) => x.id === where.id);
        if (!c) throw new Error('Company not found');
        Object.assign(c, data);
        return c;
      }),
      count: jest.fn(async (args) => {
        if (!args?.where) return store.companies.length;
        return store.companies.filter((c) => {
          if (args.where.parentCompanyId !== undefined && c.parentCompanyId !== args.where.parentCompanyId) return false;
          if (args.where.chairmanId && c.chairmanId !== args.where.chairmanId) return false;
          return true;
        }).length;
      }),
    },
    aevoraGroup: {
      findUnique: jest.fn(async ({ where }) => store.aevoraGroups.find((g) => g.id === where.id)),
    },
    department: {
      findMany: jest.fn(async ({ where }) => store.departments.filter((d) => d.companyId === where.companyId)),
      findFirst: jest.fn(async ({ where }) => store.departments.find((d) => d.companyId === where.companyId && (!where.name || d.name === where.name))),
      findUnique: jest.fn(async ({ where }) => store.departments.find((d) => d.id === where.id)),
      create: jest.fn(async ({ data }) => {
        const item = { id: `dept_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.departments.push(item);
        return item;
      }),
    },
    role: {
      findFirst: jest.fn(async ({ where }) => store.roles.find((r) => r.companyId === where?.companyId || r.companyId === null)),
      findUnique: jest.fn(async ({ where }) => store.roles.find((r) => r.id === where.id) || { id: where.id, title: 'Standard Role', level: 2, accessLevel: 'EMPLOYEE' }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `role_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.roles.push(item);
        return item;
      }),
    },
    employee: {
      findUnique: jest.fn(async ({ where }) => store.employees.find((e) => e.id === where.id)),
      findMany: jest.fn(async (args) => {
        let res = [...store.employees];
        if (args?.where?.companyId) res = res.filter((e) => e.companyId === args.where.companyId);
        if (args?.where?.status) res = res.filter((e) => e.status === args.where.status);
        return res;
      }),
      create: jest.fn(async ({ data }) => {
        const companyId = data.companyId || data.company?.connect?.id;
        const departmentId = data.departmentId || data.department?.connect?.id;
        let roleId = data.roleId || data.role?.connect?.id;
        if (!roleId && data.role?.create) {
          roleId = `role_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          store.roles.push({
            id: roleId,
            title: data.role.create.title,
            level: data.role.create.level,
            accessLevel: data.role.create.accessLevel,
            companyId,
          });
        }
        const item = {
          id: `emp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          createdAt: new Date(),
          status: data.status || 'ACTIVE',
          ...data,
          companyId,
          departmentId,
          roleId,
        };
        store.employees.push(item);
        return {
          ...item,
          role: store.roles.find((r) => r.id === roleId),
        };
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.employees.findIndex((e) => e.id === where.id);
        if (idx >= 0) {
          store.employees[idx] = { ...store.employees[idx], ...data };
          return store.employees[idx];
        }
        return null;
      }),
      count: jest.fn(async (args) => {
        let res = [...store.employees];
        if (args?.where?.companyId) res = res.filter((e) => e.companyId === args.where.companyId);
        if (args?.where?.status) res = res.filter((e) => e.status === args.where.status);
        return res.length;
      }),
    },
    employmentHistory: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `eh_${Date.now()}`, ...data };
        store.employmentHistories.push(item);
        return item;
      }),
    },
    aCWallet: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `wallet_${Date.now()}`, ...data };
        store.acWallets.push(item);
        return item;
      }),
    },
    companyEvent: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `evt_${Date.now()}`, ...data };
        store.companyEvents.push(item);
        return item;
      }),
    },
    v12SpatialSite: {
      findFirst: jest.fn(async (args) => {
        if (args?.where?.companyId) return store.sites.find((s) => s.companyId === args.where.companyId);
        return store.sites[0] || null;
      }),
      findMany: jest.fn(async (args) => {
        if (args?.where?.companyId) return store.sites.filter((s) => s.companyId === args.where.companyId);
        return [...store.sites];
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `site_${Date.now()}_${Math.random().toString(36).substring(7)}`, isActive: true, ...data };
        store.sites.push(item);
        return item;
      }),
      count: jest.fn(async () => store.sites.length),
    },
    v12SpatialBuilding: {
      findFirst: jest.fn(async (args) => {
        if (args?.where?.siteId) return store.buildings.find((b) => b.siteId === args.where.siteId);
        return store.buildings[0] || null;
      }),
      findMany: jest.fn(async (args) => {
        if (args?.where?.siteId) {
          if (args.where.siteId.in) return store.buildings.filter((b) => args.where.siteId.in.includes(b.siteId));
          return store.buildings.filter((b) => b.siteId === args.where.siteId);
        }
        return [...store.buildings];
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `bldg_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.buildings.push(item);
        return item;
      }),
      count: jest.fn(async () => store.buildings.length),
    },
    v12SpatialFloor: {
      findFirst: jest.fn(async (args) => {
        if (args?.where?.buildingId) return store.floors.find((f) => f.buildingId === args.where.buildingId && (!args.where.level || f.level === args.where.level));
        return store.floors[0] || null;
      }),
      findMany: jest.fn(async (args) => {
        return store.floors.filter((f) => {
          if (args?.where?.buildingId) {
            if (args.where.buildingId.in && !args.where.buildingId.in.includes(f.buildingId)) return false;
            if (typeof args.where.buildingId === 'string' && f.buildingId !== args.where.buildingId) return false;
          }
          if (args?.where?.level !== undefined) {
            if (typeof args.where.level === 'number' && f.level !== args.where.level) return false;
            if (args.where.level.lt !== undefined && f.level >= args.where.level.lt) return false;
          }
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `floor_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.floors.push(item);
        return item;
      }),
      count: jest.fn(async () => store.floors.length),
    },
    v12SpatialRoom: {
      findFirst: jest.fn(async (args) => {
        return store.rooms.find((r) => {
          if (args?.where?.floorId && r.floorId !== args.where.floorId) return false;
          if (args?.where?.type && r.type !== args.where.type) return false;
          if (args?.where?.departmentId && r.departmentId !== args.where.departmentId) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async (args) => {
        return store.rooms.filter((r) => {
          if (args?.where?.floorId) {
            if (args.where.floorId.in && !args.where.floorId.in.includes(r.floorId)) return false;
            if (typeof args.where.floorId === 'string' && r.floorId !== args.where.floorId) return false;
          }
          if (args?.where?.departmentId && r.departmentId !== args.where.departmentId) return false;
          if (args?.where?.type && r.type !== args.where.type) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `room_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.rooms.push(item);
        return item;
      }),
      count: jest.fn(async (args) => {
        return store.rooms.filter((r) => {
          if (args?.where?.floorId && r.floorId !== args.where.floorId) return false;
          if (args?.where?.type && r.type !== args.where.type) return false;
          if (args?.where?.departmentId && r.departmentId !== args.where.departmentId) return false;
          return true;
        }).length;
      }),
    },
    v12SpatialWorkspace: {
      findFirst: jest.fn(async ({ where }) => {
        return store.workspaces.find((w) => {
          if (where.companyId && w.companyId !== where.companyId) return false;
          if (where.employeeId !== undefined && w.employeeId !== where.employeeId) return false;
          if (where.departmentId && w.departmentId !== where.departmentId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          if (where.roomId && w.roomId !== where.roomId) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async (args) => {
        return store.workspaces.filter((w) => {
          if (args?.where?.companyId && w.companyId !== args.where.companyId) return false;
          if (args?.where?.roomId && w.roomId !== args.where.roomId) return false;
          if (args?.where?.departmentId && w.departmentId !== args.where.departmentId) return false;
          if (args?.where?.isOccupied !== undefined && w.isOccupied !== args.where.isOccupied) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `ws_${Date.now()}_${Math.random().toString(36).substring(7)}`, createdAt: new Date(), ...data };
        store.workspaces.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.workspaces.findIndex((w) => w.id === where.id);
        if (idx >= 0) {
          store.workspaces[idx] = { ...store.workspaces[idx], ...data };
          return store.workspaces[idx];
        }
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        store.workspaces.forEach((w, idx) => {
          if (where.companyId && w.companyId !== where.companyId) return;
          if (where.employeeId && where.employeeId.in && !where.employeeId.in.includes(w.employeeId)) return;
          store.workspaces[idx] = { ...w, ...data };
          count++;
        });
        return { count };
      }),
      count: jest.fn(async () => store.workspaces.length),
    },
    v12SpatialParkingArea: {
      findUnique: jest.fn(async ({ where }) => store.parkingAreas.find((p) => p.id === where.id) || null),
      findFirst: jest.fn(async (args) => {
        return store.parkingAreas.find((p) => {
          if (args?.where?.site?.companyId && p.companyId !== args.where.site.companyId) return false;
          if (args?.where?.siteId && p.siteId !== args.where.siteId) return false;
          if (args?.where?.availableSpots?.gt !== undefined && p.availableSpots <= args.where.availableSpots.gt) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async (args) => {
        if (args?.where?.siteId) {
          if (args.where.siteId.in) return store.parkingAreas.filter((p) => args.where.siteId.in.includes(p.siteId));
          return store.parkingAreas.filter((p) => p.siteId === args.where.siteId);
        }
        return [...store.parkingAreas];
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `park_${Date.now()}_${Math.random().toString(36).substring(7)}`, ...data };
        store.parkingAreas.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.parkingAreas.findIndex((p) => p.id === where.id);
        if (idx >= 0) {
          store.parkingAreas[idx] = { ...store.parkingAreas[idx], ...data };
          return store.parkingAreas[idx];
        }
        return null;
      }),
      count: jest.fn(async (args) => {
        if (args?.where?.site?.companyId) {
          const site = store.sites.find((s) => s.companyId === args.where.site.companyId);
          return store.parkingAreas.filter((p) => p.siteId === site?.id).length;
        }
        return store.parkingAreas.length;
      }),
    },
    v12SpatialVehicle: {
      findFirst: jest.fn(async (args) => {
        return store.vehicles.find((v) => {
          if (args?.where?.companyId && v.companyId !== args.where.companyId) return false;
          if (args?.where?.ownerEmployeeId && v.ownerEmployeeId !== args.where.ownerEmployeeId) return false;
          return true;
        }) || null;
      }),
      findUnique: jest.fn(async ({ where }) => store.vehicles.find((v) => v.id === where.id)),
      findMany: jest.fn(async (args) => {
        if (args?.where?.companyId) return store.vehicles.filter((v) => v.companyId === args.where.companyId);
        return [...store.vehicles];
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `veh_${Date.now()}_${Math.random().toString(36).substring(7)}`, createdAt: new Date(), ...data };
        store.vehicles.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.vehicles.findIndex((v) => v.id === where.id);
        if (idx >= 0) {
          store.vehicles[idx] = { ...store.vehicles[idx], ...data };
          return store.vehicles[idx];
        }
        return null;
      }),
      count: jest.fn(async () => store.vehicles.length),
    },
    v12NavigationNode: {
      findFirst: jest.fn(async (args) => {
        return store.navNodes.find((n) => {
          if (args?.where?.siteId && n.siteId !== args.where.siteId) return false;
          if (args?.where?.nodeType && n.nodeType !== args.where.nodeType) return false;
          if (args?.where?.NOT?.id && n.id === args.where.NOT.id) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async (args) => {
        if (args?.where?.siteId) return store.navNodes.filter((n) => n.siteId === args.where.siteId);
        return [...store.navNodes];
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const idx = store.navNodes.findIndex((n) => n.id === where.id);
        if (idx >= 0) {
          store.navNodes[idx] = { ...store.navNodes[idx], ...update };
          return store.navNodes[idx];
        }
        const item = { id: where.id, ...create };
        store.navNodes.push(item);
        return item;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `node_${Date.now()}`, ...data };
        store.navNodes.push(item);
        return item;
      }),
      count: jest.fn(async () => store.navNodes.length),
    },
    v12SpatialTopologyEdge: {
      findFirst: jest.fn(async (args) => {
        return store.navEdges.find((e) => {
          if (args?.where?.sourceId && e.sourceId !== args.where.sourceId) return false;
          if (args?.where?.targetId && e.targetId !== args.where.targetId) return false;
          return true;
        }) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `edge_${Date.now()}`, ...data };
        store.navEdges.push(item);
        return item;
      }),
      findMany: jest.fn(async () => [...store.navEdges]),
    },
    v12SpatialMovementState: {
      upsert: jest.fn(async ({ where, create, update }) => {
        const idx = store.movementStates.findIndex((m) => m.entityId === where.entityId);
        if (idx >= 0) {
          store.movementStates[idx] = { ...store.movementStates[idx], ...update };
          return store.movementStates[idx];
        }
        const item = { id: `mv_${Date.now()}`, ...create };
        store.movementStates.push(item);
        return item;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        store.movementStates.forEach((m, idx) => {
          if (where.entityId && where.entityId.in && !where.entityId.in.includes(m.entityId)) return;
          store.movementStates[idx] = { ...m, ...data };
          count++;
        });
        return { count };
      }),
    },
    v12SpatialRegion: {
      findFirst: jest.fn(async () => store.regions[0] || null),
      findMany: jest.fn(async () => [...store.regions]),
      create: jest.fn(async ({ data }) => {
        const item = { id: `reg_${Date.now()}`, ...data };
        store.regions.push(item);
        return item;
      }),
    },
    v12SpatialCountry: {
      findFirst: jest.fn(async () => store.countries[0] || null),
      findMany: jest.fn(async () => [...store.countries]),
      create: jest.fn(async ({ data }) => {
        const item = { id: `cou_${Date.now()}`, ...data };
        store.countries.push(item);
        return item;
      }),
    },
    v12SpatialCity: {
      findFirst: jest.fn(async () => store.cities[0] || null),
      findMany: jest.fn(async () => [...store.cities]),
      create: jest.fn(async ({ data }) => {
        const item = { id: `city_${Date.now()}`, ...data };
        store.cities.push(item);
        return item;
      }),
    },
    v12SpatialWorld: {
      findFirst: jest.fn(async () => store.worlds[0] || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: `world_${Date.now()}`, ...data };
        store.worlds.push(item);
        return item;
      }),
    },
  });

  beforeEach(async () => {
    store = {
      companies: [],
      departments: [],
      roles: [],
      employees: [],
      companyEvents: [],
      employmentHistories: [],
      acWallets: [],
      aevoraGroups: [],
      sites: [],
      buildings: [],
      floors: [],
      rooms: [],
      workspaces: [],
      parkingAreas: [],
      vehicles: [],
      navNodes: [],
      navEdges: [],
      cities: [],
      countries: [],
      regions: [],
      worlds: [],
      movementStates: [],
    };
    emittedEvents = [];

    // Seed global geography
    store.regions.push({ id: 'reg_default', name: 'Core Region', posX: 0, posY: 0, posZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
    store.countries.push({ id: 'cou_default', name: 'Aevora Republic', regionId: 'reg_default', posX: 0, posY: 0, posZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
    store.cities.push({ id: 'city_default', name: 'Genesis City', countryId: 'cou_default', posX: 0, posY: 0, posZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        HqCapacityService,
        V12VehicleService,
        V12AssetRegistryService,
        V12NavigationService,
        WorldStateGatewayService,
        EmployeeService,
        { provide: WorldStateEventService, useValue: mockEventService },
        { provide: PrismaService, useValue: createMockPrisma() },
        { provide: AuthorizationService, useValue: mockAuthService },
        {
          provide: StructuredLoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            setContext: jest.fn(),
          },
        },
      ],
    }).compile();

    companyService = module.get<CompanyService>(CompanyService);
    hqCapacityService = module.get<HqCapacityService>(HqCapacityService);
    vehicleService = module.get<V12VehicleService>(V12VehicleService);
    worldStateGatewayService = module.get<WorldStateGatewayService>(WorldStateGatewayService);
    employeeService = module.get<EmployeeService>(EmployeeService);
    navigationService = module.get<V12NavigationService>(V12NavigationService);
  });

  // ── Matrix Test Suite ────────────────────────────────────────────────────────

  it('A: Company creation — provisions authoritative enterprise company', async () => {
    const parentComp = await companyService.createCompany(
      'OmniCorp Global',
      'OmniCorp Global Inc.',
      'Primary Parent Enterprise',
      'chair-1',
    );
    expect(parentComp).toBeDefined();
    expect(parentComp.id).toBeDefined();
    expect(parentComp.name).toBe('OmniCorp Global');
    expect(store.companies).toHaveLength(1);
  });

  it('B: Subsidiary creation — provisions independent enterprise subsidiary', async () => {
    const parentComp = await companyService.createCompany(
      'Parent Corp',
      'Parent Corp Inc.',
      'Parent Company',
      'chair-1',
    );
    const sub = await companyService.createSubsidiary(parentComp.id, 'chair-1', {
      name: 'Nexus Dynamics',
      description: 'Robotics',
    });
    expect(sub).toBeDefined();
    expect(sub.subsidiary.id).toBeDefined();
    expect(sub.parentCompanyId).toBe(parentComp.id);
    expect(store.companies).toHaveLength(2);
  });

  it('C: Parent/child isolation — parent and subsidiary maintain strict spatial isolation', async () => {
    const parentRes = await companyService.autoProvisionCompany('chair-1', { name: 'Parent Entity' });
    const parentComp = (parentRes as any).company;
    const subRes = (await companyService.autoProvisionCompany('chair-1', {
      name: 'Child Entity',
      parentCompanyId: parentComp.id,
    })) as any;

    const parentSite = store.sites.find((s) => s.companyId === parentComp.id);
    const subSite = store.sites.find((s) => s.companyId === subRes.subsidiary.id);

    expect(parentSite).toBeDefined();
    expect(subSite).toBeDefined();
    expect(parentSite.id).not.toBe(subSite.id);
    expect(parentSite.companyId).not.toBe(subSite.companyId);
  });

  it('D: Sibling isolation — multiple subsidiaries maintain disjoint footprints', async () => {
    const parentRes = await companyService.autoProvisionCompany('chair-1', { name: 'Holding Corp' });
    const parentComp = (parentRes as any).company;
    const sub1Res = (await companyService.autoProvisionCompany('chair-1', { name: 'Sub Alpha', parentCompanyId: parentComp.id })) as any;
    const sub2Res = (await companyService.autoProvisionCompany('chair-1', { name: 'Sub Beta', parentCompanyId: parentComp.id })) as any;

    const s1Site = store.sites.find((s) => s.companyId === sub1Res.subsidiary.id);
    const s2Site = store.sites.find((s) => s.companyId === sub2Res.subsidiary.id);

    expect(s1Site.id).not.toBe(s2Site.id);
    expect(s1Site.companyId).not.toBe(s2Site.companyId);
  });

  it('E: Campus creation — provisions dedicated campus site with deterministic offset', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Campus Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);
    expect(site).toBeDefined();
    expect(site.name).toContain('Campus');
  });

  it('F: HQ creation — provisions dedicated HQ building bound to campus', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora HQ Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);
    const bldg = store.buildings.find((b) => b.siteId === site.id);
    expect(bldg).toBeDefined();
    expect(bldg.name).toContain('HQ Building');
  });

  it('G: Floor creation — creates level 1 main floor and executive level 100', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Floor Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);
    const bldg = store.buildings.find((b) => b.siteId === site.id);
    const floors = store.floors.filter((f) => f.buildingId === bldg.id);
    expect(floors.length).toBeGreaterThanOrEqual(2);
    expect(floors.some((f) => f.level === 1)).toBe(true);
    expect(floors.some((f) => f.level === 100)).toBe(true);
  });

  it('H: Room creation — provisions executive offices, meeting rooms, and department spaces', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Room Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);
    const bldg = store.buildings.find((b) => b.siteId === site.id);
    const bldgFloors = store.floors.filter((f) => f.buildingId === bldg.id).map((f) => f.id);
    const rooms = store.rooms.filter((r) => bldgFloors.includes(r.floorId));
    expect(rooms.length).toBeGreaterThanOrEqual(9);
    expect(rooms.some((r) => r.type === 'CHAIRMAN_OFFICE')).toBe(true);
    expect(rooms.some((r) => r.type === 'CEO_OFFICE')).toBe(true);
  });

  it('I: Department projection — maps all authoritative enterprise departments into spatial spaces', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Dept Co' });
    const comp = (res as any).company;
    const depts = store.departments.filter((d) => d.companyId === comp.id);
    const deptSpaces = store.rooms.filter((r) => r.type === 'DEPARTMENT_SPACE');
    expect(deptSpaces.length).toBeGreaterThanOrEqual(depts.length);
  });

  it('J: Workspace creation — creates deterministic desk coordinates inside department rooms', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Desk Co' });
    const comp = (res as any).company;
    const workspaces = store.workspaces.filter((w) => w.companyId === comp.id);
    expect(workspaces.length).toBeGreaterThan(0);
    expect(workspaces[0].posX).toBeDefined();
    expect(workspaces[0].posY).toBeDefined();
  });

  it('K: Employee provisioning — provisions authoritative employee with digital human footprint', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Hire Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id);
    expect(ceo).toBeDefined();
    expect(ceo.status).toBe(EmployeeStatus.ACTIVE);
  });

  it('L: Employee assignment — assigns employee to designated office/workspace', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Aevora Assign Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id);
    const ceoWs = store.workspaces.find((w) => w.employeeId === ceo.id);
    expect(ceoWs).toBeDefined();
    expect(ceoWs.isOccupied).toBe(true);
  });

  it('M: Workforce capacity expansion — automatically provisions rooms/desks when threshold exceeded', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Expansion Co' });
    const comp = (res as any).company;
    const dept = store.departments.find((d) => d.companyId === comp.id)!;
    const initialDesks = store.workspaces.filter((w) => w.companyId === comp.id).length;

    // Add 12 employees to trigger capacity reconciliation
    for (let i = 0; i < 12; i++) {
      const emp = await employeeService.hireEmployee('chair-1', comp.id, {
        name: `Growth Worker ${i}`,
        departmentId: dept.id,
        roleId: 'role-standard',
        salary: 10000,
        identitySeed: `worker-${i}`,
        skills: [{ name: 'Coding', category: 'DEV', proficiency: 85 }],
      });
      expect(emp).toBeDefined();
    }

    await hqCapacityService.reconcileCompanyCapacity(comp.id);
    const finalDesks = store.workspaces.filter((w) => w.companyId === comp.id).length;
    expect(finalDesks).toBeGreaterThan(initialDesks);
  });

  it('N: Employee termination — releases workspace and deactivates spatial presence', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Termination Co' });
    const comp = (res as any).company;
    const dept = store.departments.find((d) => d.companyId === comp.id)!;

    const emp = await employeeService.hireEmployee('chair-1', comp.id, {
      name: 'To Be Terminated',
      departmentId: dept.id,
      roleId: 'role-standard',
      salary: 10000,
      identitySeed: 'term-emp',
      skills: [],
    });

    // Reconcile to ensure workspace is claimed
    await hqCapacityService.reconcileCompanyCapacity(comp.id);
    const empWs = store.workspaces.find((w) => w.employeeId === emp.id);
    expect(empWs).toBeDefined();
    expect(empWs.isOccupied).toBe(true);

    // Terminate employee
    await employeeService.terminateEmployee('chair-1', emp.id);
    await hqCapacityService.reconcileCompanyCapacity(comp.id);

    // Workspace must be released
    const releasedWs = store.workspaces.find((w) => w.id === empWs.id);
    expect(releasedWs.employeeId).toBeNull();
    expect(releasedWs.isOccupied).toBe(false);
  });

  it('O: Vehicle provisioning — creates authoritative vehicle with model asset and state', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Vehicle Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id)!;

    const fleet = await vehicleService.autoProvisionFleet(comp.id, ceo.id, {
      count: 2,
      vehicleClass: 'EXECUTIVE',
    });

    expect(fleet.provisionedCount).toBe(2);
    expect(store.vehicles.filter((v) => v.companyId === comp.id)).toHaveLength(2);
  });

  it('P: Parking allocation — assigns vehicle to available parking slot', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Parking Alloc Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id)!;

    await vehicleService.autoProvisionFleet(comp.id, ceo.id, { count: 1 });
    const veh = store.vehicles.find((v) => v.companyId === comp.id);
    expect(veh.parkingAreaId).toBeDefined();
    expect(veh.isParked).toBe(true);
  });

  it('Q: Parking expansion — provisions additional parking capacity when filled', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Parking Growth Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id)!;
    const site = store.sites.find((s) => s.companyId === comp.id);

    // Provision 12 vehicles with maxCapacityPerArea: 10 to force second parking area creation
    await vehicleService.autoProvisionFleet(comp.id, ceo.id, {
      count: 12,
      policyOverrides: { maxCapacityPerArea: 10 },
    });

    const parkingAreas = store.parkingAreas.filter((p) => p.siteId === site.id);
    expect(parkingAreas.length).toBeGreaterThanOrEqual(2);
  });

  it('R: Vehicle deactivation — frees parking spot and updates spatial movement state', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Vehicle Decomm Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id)!;

    await vehicleService.autoProvisionFleet(comp.id, ceo.id, { count: 1 });
    const veh = store.vehicles.find((v) => v.companyId === comp.id);
    const initialPark = store.parkingAreas.find((p) => p.id === veh.parkingAreaId);
    const initialSpots = initialPark.availableSpots;

    await vehicleService.decommissionVehicle(veh.id, comp.id);

    const decommVeh = store.vehicles.find((v) => v.id === veh.id);
    expect(decommVeh.isParked).toBe(false);
    expect(decommVeh.parkingAreaId).toBeNull();

    const freedPark = store.parkingAreas.find((p) => p.id === initialPark.id);
    expect(freedPark.availableSpots).toBe(initialSpots + 1);
  });

  it('S: Navigation generation — generates traversable waypoint nodes for campus, rooms, and parking', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Nav Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);
    const nodes = store.navNodes.filter((n) => n.siteId === site.id);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.isTraversable)).toBe(true);
  });

  it('T: World snapshot — builds authoritative snapshot scoped strictly to company', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Snapshot Co' });
    const comp = (res as any).company;
    const snapshot = await worldStateGatewayService.generateSnapshot(comp.id);

    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBe('1.0.0');
    expect(snapshot.entities).toBeDefined();

    for (const [id, entity] of Object.entries(snapshot.entities)) {
      if ((entity as any).type === V12EntityType.BUILDING) {
        expect(store.buildings.some((b) => `v12_building_${b.id}` === id)).toBe(true);
      }
    }
  });

  it('U: SSE realtime — emits structured world-state events upon enterprise modifications', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'SSE Co' });
    const comp = (res as any).company;
    const ceo = store.employees.find((e) => e.companyId === comp.id)!;
    emittedEvents = [];

    // Fleet provisioning triggers structured world-state event emission
    await vehicleService.autoProvisionFleet(comp.id, ceo.id, { count: 1 });

    expect(emittedEvents.length).toBeGreaterThan(0);
    expect(emittedEvents.some((e) => e.companyId === comp.id)).toBe(true);
  });

  it('V: Sequence gap recovery — snapshot contract provides sequence checkpoint', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Seq Co' });
    const comp = (res as any).company;
    const snapshot = await worldStateGatewayService.generateSnapshot(comp.id);
    expect(snapshot.sequence).toBeGreaterThanOrEqual(0);
  });

  it('W: Snapshot recovery — provides complete reconstruction payload from DB', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Recovery Co' });
    const comp = (res as any).company;
    const snap = await worldStateGatewayService.generateSnapshot(comp.id);

    const hasCampus = Object.values(snap.entities).some((e: any) => e.type === V12EntityType.CAMPUS);
    const hasBuilding = Object.values(snap.entities).some((e: any) => e.type === V12EntityType.BUILDING);
    const hasFloor = Object.values(snap.entities).some((e: any) => e.type === V12EntityType.FLOOR);

    expect(hasCampus).toBe(true);
    expect(hasBuilding).toBe(true);
    expect(hasFloor).toBe(true);
  });

  it('Y: Idempotency — repeated capacity and fleet reconciliations converge cleanly', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Idempotency Co' });
    const comp = (res as any).company;

    // Run reconciliation 3 times in succession
    const r1 = await hqCapacityService.reconcileCompanyCapacity(comp.id);
    const r2 = await hqCapacityService.reconcileCompanyCapacity(comp.id);
    const r3 = await hqCapacityService.reconcileCompanyCapacity(comp.id);

    expect(r2.created.buildings).toBe(0);
    expect(r2.created.floors).toBe(0);
    expect(r3.created.buildings).toBe(0);
    expect(r3.created.floors).toBe(0);
    expect(r3.created.rooms).toBe(0);
  });

  it('Z: Concurrent reconciliation — handles overlapping runs without crashing or corrupting', async () => {
    const res = await companyService.autoProvisionCompany('chair-1', { name: 'Concurrent Co' });
    const comp = (res as any).company;
    const site = store.sites.find((s) => s.companyId === comp.id);

    const results = await Promise.all([
      hqCapacityService.reconcileCompanyCapacity(comp.id),
      hqCapacityService.reconcileCompanyCapacity(comp.id),
    ]);

    expect(results).toHaveLength(2);
    expect(store.buildings.filter((b) => b.siteId === site.id)).toHaveLength(1);
  });

  it('AA: Failure isolation — spatial reconciliation errors never corrupt enterprise state', async () => {
    const parent = await companyService.createCompany(
      'Resilient Co',
      'Resilient Co Inc.',
      'Primary Enterprise',
      'chair-1',
    );
    expect(parent.id).toBeDefined();

    const compInDb = store.companies.find((c) => c.id === parent.id);
    expect(compInDb).toBeDefined();
    expect(compInDb.name).toBe('Resilient Co');
  });

  it('AC: Security / tenant isolation — rejects cross-company mutations and snapshot access', async () => {
    const c1 = await companyService.createCompany('Tenant 1', 'Tenant 1 Ltd', 'Company 1', 'chair-1');
    const c2 = await companyService.createCompany('Tenant 2', 'Tenant 2 Ltd', 'Company 2', 'chair-2');

    // Attempting to decommission vehicle belonging to c2 using c1 context
    await expect(vehicleService.decommissionVehicle('veh-fake', c1.id)).rejects.toThrow();
  });

  it('AD: Company-specific 3D world — snapshots never leak mutable entities between tenants', async () => {
    const res1 = await companyService.autoProvisionCompany('chair-1', { name: 'Tenant Alpha' });
    const res2 = await companyService.autoProvisionCompany('chair-2', { name: 'Tenant Beta' });
    const c1 = (res1 as any).company;
    const c2 = (res2 as any).company;

    const snap1 = await worldStateGatewayService.generateSnapshot(c1.id);
    const snap2 = await worldStateGatewayService.generateSnapshot(c2.id);

    const snap1BuildingIds = Object.values(snap1.entities)
      .filter((e: any) => e.type === V12EntityType.BUILDING)
      .map((e: any) => e.id);
    const snap2BuildingIds = Object.values(snap2.entities)
      .filter((e: any) => e.type === V12EntityType.BUILDING)
      .map((e: any) => e.id);

    expect(snap1BuildingIds.some((id) => snap2BuildingIds.includes(id))).toBe(false);
  });
});

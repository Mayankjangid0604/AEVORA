import { CompanyService } from './company.service';
import { HqCapacityService } from '../v12-spatial/hq-capacity.service';
import { V12VehicleService } from '../v12-spatial/v12-vehicle.service';
import { V12AssetRegistryService } from '../v12-spatial/v12-asset-registry.service';
import { WorldStateGatewayService } from '../world-state-gateway/world-state-gateway.service';
import { CompanyStatus } from '@prisma/client';

describe('V15-E: Company Provisioning Performance Benchmark', () => {
  let companyService: CompanyService;

  let store: {
    companies: any[];
    departments: any[];
    roles: any[];
    employees: any[];
    companyEvents: any[];
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

  const mockEventService = {
    createEventEnvelope: jest.fn((eventType, entityId, entityType, payload, companyId) => {
      return { eventType, entityId, entityType, payload, companyId, authoritativeTimestamp: Date.now() };
    }),
    broadcastEvent: jest.fn(async () => {}),
    getCurrentSequence: jest.fn().mockReturnValue(1),
  };

  const createMockPrisma = () => ({
    $transaction: jest.fn(async (callback) => {
      const txPrisma = createMockPrisma();
      return callback(txPrisma);
    }),
    company: {
      findUnique: jest.fn(async ({ where }) => {
        const c = store.companies.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees
            .filter((e) => e.companyId === c.id)
            .map((e) => ({
              ...e,
              role: store.roles.find((r) => r.id === e.roleId),
              department: store.departments.find((d) => d.id === e.departmentId),
            })),
          group: store.aevoraGroups.find((g) => g.id === c.groupId),
          officeLocations: [],
        };
      }),
      findFirst: jest.fn(async ({ where }) => {
        let matches = store.companies.slice();
        if (where.name) matches = matches.filter((x) => x.name.toLowerCase() === where.name.toLowerCase());
        if (where.chairmanId) matches = matches.filter((x) => x.chairmanId === where.chairmanId);
        if (where.groupId) matches = matches.filter((x) => x.groupId === where.groupId);
        if (where.status) matches = matches.filter((x) => x.status === where.status);
        const c = matches[0];
        if (!c) return null;
        return {
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees
            .filter((e) => e.companyId === c.id)
            .map((e) => ({
              ...e,
              role: store.roles.find((r) => r.id === e.roleId),
              department: store.departments.find((d) => d.id === e.departmentId),
            })),
        };
      }),
      findMany: jest.fn(async () => store.companies.slice()),
      create: jest.fn(async ({ data }) => {
        const id = `bench_comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newComp = {
          id,
          name: data.name,
          legalName: data.legalName || `${data.name} Ltd.`,
          description: data.description || null,
          chairmanId: data.chairmanId,
          groupId: data.groupId || null,
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
    },
    employee: {
      findUnique: jest.fn(async ({ where }) => {
        const e = store.employees.find((x) => x.id === where.id);
        if (!e) return null;
        return {
          ...e,
          role: store.roles.find((r) => r.id === e.roleId),
          department: store.departments.find((d) => d.id === e.departmentId),
        };
      }),
      findFirst: jest.fn(async ({ where }) => {
        return (
          store.employees.find((e) => {
            if (where.companyId && e.companyId !== where.companyId) return false;
            if (where.status && e.status !== where.status) return false;
            if (where.role?.title) {
              const r = store.roles.find((role) => role.id === e.roleId);
              if (r?.title !== where.role.title) return false;
            }
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let emps = store.employees.slice();
        if (where?.companyId) emps = emps.filter((e) => e.companyId === where.companyId);
        if (where?.status) emps = emps.filter((e) => e.status === where.status);
        return emps.map((e) => ({
          ...e,
          role: store.roles.find((r) => r.id === e.roleId),
          department: store.departments.find((d) => d.id === e.departmentId),
        }));
      }),
      create: jest.fn(async ({ data }) => {
        const id = `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        let roleId = null;
        if (data.role?.create) {
          roleId = `role_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const r = {
            id: roleId,
            title: data.role.create.title,
            level: data.role.create.level,
            accessLevel: data.role.create.accessLevel,
            companyId: data.company.connect.id,
          };
          store.roles.push(r);
        }
        const emp = {
          id,
          name: data.name,
          identitySeed: data.identitySeed,
          status: data.status,
          companyId: data.company.connect.id,
          departmentId: data.department.connect.id,
          roleId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.employees.push(emp);
        return {
          ...emp,
          role: store.roles.find((r) => r.id === roleId),
        };
      }),
      update: jest.fn(async ({ where, data }) => {
        const emp = store.employees.find((e) => e.id === where.id);
        if (!emp) throw new Error('Employee not found');
        Object.assign(emp, data);
        return emp;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const e of store.employees) {
          if (where?.companyId && e.companyId !== where.companyId) continue;
          Object.assign(e, data);
          count++;
        }
        return { count };
      }),
    },
    department: {
      findMany: jest.fn(async ({ where } = {}) => {
        if (where?.companyId) return store.departments.filter((d) => d.companyId === where.companyId);
        return store.departments.slice();
      }),
      findUnique: jest.fn(async ({ where }) => {
        return store.departments.find((d) => d.id === where.id) || null;
      }),
    },
    companyEvent: {
      create: jest.fn(async ({ data }) => {
        const ev = { id: `event_${Date.now()}`, ...data, createdAt: new Date() };
        store.companyEvents.push(ev);
        return ev;
      }),
    },
    v12SpatialSite: {
      findFirst: jest.fn(async ({ where } = {}) => {
        if (!where) return store.sites[0] || null;
        return store.sites.find((s) => (where.companyId ? s.companyId === where.companyId : true)) || null;
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        if (!where || !where.companyId) return store.sites.slice();
        return store.sites.filter((s) => s.companyId === where.companyId);
      }),
      create: jest.fn(async ({ data }) => {
        const s = { id: `site_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.sites.push(s);
        return s;
      }),
    },
    v12SpatialBuilding: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return store.buildings.find((b) => (where?.siteId ? b.siteId === where.siteId : true)) || null;
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        if (where?.siteId?.in) return store.buildings.filter((b) => where.siteId.in.includes(b.siteId));
        return store.buildings.slice();
      }),
      create: jest.fn(async ({ data }) => {
        const b = { id: `bld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.buildings.push(b);
        return b;
      }),
    },
    v12SpatialFloor: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.floors.find((f) => {
            if (where?.buildingId && f.buildingId !== where.buildingId) return false;
            if (where?.level !== undefined && f.level !== where.level) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let flrs = store.floors.slice();
        if (where?.buildingId?.in) flrs = flrs.filter((f) => where.buildingId.in.includes(f.buildingId));
        if (where?.buildingId && typeof where.buildingId === 'string') flrs = flrs.filter((f) => f.buildingId === where.buildingId);
        if (where?.level?.lt !== undefined) flrs = flrs.filter((f) => f.level < where.level.lt);
        return flrs;
      }),
      create: jest.fn(async ({ data }) => {
        const f = { id: `flr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.floors.push(f);
        return f;
      }),
    },
    v12SpatialRoom: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.rooms.find((r) => {
            if (where?.floorId && r.floorId !== where.floorId) return false;
            if (where?.name && r.name !== where.name) return false;
            if (where?.type && r.type !== where.type) return false;
            if (where?.departmentId && r.departmentId !== where.departmentId) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let rms = store.rooms.slice();
        if (where?.floorId?.in) rms = rms.filter((r) => where.floorId.in.includes(r.floorId));
        if (where?.floorId && typeof where.floorId === 'string') rms = rms.filter((r) => r.floorId === where.floorId);
        if (where?.departmentId) rms = rms.filter((r) => r.departmentId === where.departmentId);
        return rms;
      }),
      create: jest.fn(async ({ data }) => {
        const rm = { id: `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.rooms.push(rm);
        return rm;
      }),
      count: jest.fn(async ({ where } = {}) => {
        let rms = store.rooms.slice();
        if (where?.floorId) rms = rms.filter((r) => r.floorId === where.floorId);
        if (where?.type) rms = rms.filter((r) => r.type === where.type);
        if (where?.departmentId) rms = rms.filter((r) => r.departmentId === where.departmentId);
        return rms.length;
      }),
    },
    v12SpatialWorkspace: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.workspaces.find((w) => {
            if (where?.roomId && w.roomId !== where.roomId) return false;
            if (where?.name && w.name !== where.name) return false;
            if (where?.companyId && w.companyId !== where.companyId) return false;
            if (where?.departmentId && w.departmentId !== where.departmentId) return false;
            if (where?.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
            if (where?.employeeId && w.employeeId !== where.employeeId) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let ws = store.workspaces.slice();
        if (where?.companyId) ws = ws.filter((w) => w.companyId === where.companyId);
        if (where?.roomId) ws = ws.filter((w) => w.roomId === where.roomId);
        if (where?.departmentId) ws = ws.filter((w) => w.departmentId === where.departmentId);
        return ws;
      }),
      create: jest.fn(async ({ data }) => {
        const ws = { id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, isOccupied: false, ...data };
        store.workspaces.push(ws);
        return ws;
      }),
      update: jest.fn(async ({ where, data }) => {
        const ws = store.workspaces.find((w) => w.id === where.id);
        if (!ws) throw new Error('Workspace not found');
        Object.assign(ws, data);
        return ws;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const w of store.workspaces) {
          let match = true;
          if (where?.companyId && w.companyId !== where.companyId) match = false;
          if (where?.roomId && w.roomId !== where.roomId) match = false;
          if (match) {
            Object.assign(w, data);
            count++;
          }
        }
        return { count };
      }),
    },
    v12SpatialParkingArea: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.parkingAreas.find((p) => {
            if (where?.siteId && p.siteId !== where.siteId) return false;
            if (where?.availableSpots?.gt !== undefined && p.availableSpots <= where.availableSpots.gt) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        if (where?.siteId) return store.parkingAreas.filter((p) => p.siteId === where.siteId);
        return store.parkingAreas.slice();
      }),
      create: jest.fn(async ({ data }) => {
        const pa = { id: `pa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.parkingAreas.push(pa);
        return pa;
      }),
      update: jest.fn(async ({ where, data }) => {
        const pa = store.parkingAreas.find((p) => p.id === where.id);
        if (!pa) throw new Error('Parking area not found');
        Object.assign(pa, data);
        return pa;
      }),
      count: jest.fn(async ({ where } = {}) => {
        let pas = store.parkingAreas.slice();
        if (where?.siteId) pas = pas.filter((p) => p.siteId === where.siteId);
        return pas.length;
      }),
    },
    v12SpatialVehicle: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.vehicles.find((v) => {
            if (where?.companyId && v.companyId !== where.companyId) return false;
            if (where?.ownerEmployeeId && v.ownerEmployeeId !== where.ownerEmployeeId) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        if (where?.companyId) return store.vehicles.filter((v) => v.companyId === where.companyId);
        return store.vehicles.slice();
      }),
      create: jest.fn(async ({ data }) => {
        const v = { id: `veh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.vehicles.push(v);
        return v;
      }),
    },
    v12NavigationNode: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.navNodes.find((n) => {
            if (where?.siteId && n.siteId !== where.siteId) return false;
            if (where?.nodeType && n.nodeType !== where.nodeType) return false;
            if (where?.floorId && n.floorId !== where.floorId) return false;
            if (where?.entityId && n.entityId !== where.entityId) return false;
            if (where?.entityType && n.entityType !== where.entityType) return false;
            if (where?.NOT?.id && n.id === where.NOT.id) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where } = {}) => {
        let nodes = store.navNodes.slice();
        if (where?.OR) {
          nodes = nodes.filter((n) => {
            return where.OR.some((cond: any) => {
              if (cond.siteId?.in && cond.siteId.in.includes(n.siteId)) return true;
              if (cond.buildingId?.in && cond.buildingId.in.includes(n.buildingId)) return true;
              if (cond.floorId?.in && cond.floorId.in.includes(n.floorId)) return true;
              return false;
            });
          });
        }
        return nodes;
      }),
      create: jest.fn(async ({ data }) => {
        const id = data.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const node = { id, ...data };
        store.navNodes.push(node);
        return node;
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = store.navNodes.find((n) => n.id === where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create };
        store.navNodes.push(created);
        return created;
      }),
    },
    v12SpatialTopologyEdge: {
      findFirst: jest.fn(async ({ where } = {}) => {
        return (
          store.navEdges.find((e) => {
            if (where?.sourceId && e.sourceId !== where.sourceId) return false;
            if (where?.targetId && e.targetId !== where.targetId) return false;
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async () => store.navEdges.slice()),
      create: jest.fn(async ({ data }) => {
        const edge = { id: `edge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...data };
        store.navEdges.push(edge);
        return edge;
      }),
    },
    v12SpatialMovementState: {
      findUnique: jest.fn(async ({ where }) => {
        return store.movementStates?.find((m: any) => m.entityId === where.entityId) || null;
      }),
      findFirst: jest.fn(async ({ where }) => {
        return store.movementStates?.find((m: any) => m.entityId === where.entityId) || null;
      }),
      findMany: jest.fn(async () => store.movementStates.slice()),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = store.movementStates.find((m: any) => m.entityId === where.entityId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...create };
        store.movementStates.push(created);
        return created;
      }),
    },
    v12SpatialWorld: {
      findFirst: jest.fn(async () => store.worlds[0] || null),
      create: jest.fn(async ({ data }) => {
        const w = { id: `world_${Date.now()}`, ...data };
        store.worlds.push(w);
        return w;
      }),
    },
    v12SpatialRegion: {
      findFirst: jest.fn(async () => store.regions[0] || null),
      create: jest.fn(async ({ data }) => {
        const r = { id: `region_${Date.now()}`, ...data };
        store.regions.push(r);
        return r;
      }),
      findMany: jest.fn(async () => store.regions.slice()),
    },
    v12SpatialCountry: {
      findFirst: jest.fn(async () => store.countries[0] || null),
      create: jest.fn(async ({ data }) => {
        const c = { id: `country_${Date.now()}`, ...data };
        store.countries.push(c);
        return c;
      }),
      findMany: jest.fn(async () => store.countries.slice()),
    },
    v12SpatialCity: {
      findFirst: jest.fn(async () => store.cities[0] || null),
      create: jest.fn(async ({ data }) => {
        const ct = { id: `city_${Date.now()}`, ...data };
        store.cities.push(ct);
        return ct;
      }),
      findMany: jest.fn(async () => store.cities.slice()),
    },
  });

  beforeEach(() => {
    store = {
      companies: [],
      departments: [],
      roles: [],
      employees: [],
      companyEvents: [],
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

    const world = { id: 'world_saahvik', name: 'Saahvik' };
    const region = { id: 'reg_core', name: 'Core Region', worldId: world.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const country = { id: 'cntry_rep', name: 'Aevora Republic', regionId: region.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const city = { id: 'city_gen', name: 'Genesis City', countryId: country.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    store.worlds.push(world);
    store.regions.push(region);
    store.countries.push(country);
    store.cities.push(city);

    const mockPrisma = createMockPrisma();
    const hqCapacityService = new HqCapacityService(mockPrisma as any, mockEventService as any);
    const vehicleService = new V12VehicleService(
      mockPrisma as any,
      mockEventService as any,
      { requestEntityMovement: jest.fn() } as any,
      new V12AssetRegistryService(),
    );
    companyService = new CompanyService(
      mockPrisma as any,
      hqCapacityService,
      vehicleService,
      mockEventService as any,
    );
  });

  it('measures baseline small company provisioning latency (< 50ms)', async () => {
    const start = performance.now();
    const company = await companyService.createCompany(
      'SmallBench Co',
      'SmallBench Co Ltd.',
      'Small enterprise',
      'chair_1',
    );
    const elapsed = performance.now() - start;

    expect(company.id).toBeDefined();
    expect(elapsed).toBeLessThan(50);
    console.log(`[Benchmark] Small company provisioning: ${elapsed.toFixed(2)}ms`);
  });

  it('measures multi-department enterprise provisioning latency (< 60ms)', async () => {
    const start = performance.now();
    const company = await companyService.createCompany(
      'EnterpriseBench Co',
      'EnterpriseBench Co Ltd.',
      'Multi-dept enterprise',
      'chair_1',
      undefined,
      { initialDepartments: ['Engineering', 'Product', 'Marketing', 'Sales', 'Legal'] },
    );
    const elapsed = performance.now() - start;

    expect(company.id).toBeDefined();
    expect(elapsed).toBeLessThan(60);
    console.log(`[Benchmark] Multi-department enterprise provisioning: ${elapsed.toFixed(2)}ms`);
  });

  it('measures initial fleet provisioning latency (< 60ms)', async () => {
    const start = performance.now();
    const company = await companyService.createCompany(
      'FleetBench Co',
      'FleetBench Co Ltd.',
      'Fleet enterprise',
      'chair_1',
      undefined,
      { initialFleetCount: 4 },
    );
    const elapsed = performance.now() - start;

    expect(company.id).toBeDefined();
    expect(elapsed).toBeLessThan(60);
    console.log(`[Benchmark] Initial fleet provisioning: ${elapsed.toFixed(2)}ms`);
  });
});

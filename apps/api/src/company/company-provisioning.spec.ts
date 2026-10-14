import { CompanyService } from './company.service';
import { HqCapacityService } from '../spatial/hq-capacity.service';
import { V12VehicleService } from '../spatial/vehicle.service';
import { V12AssetRegistryService } from '../spatial/asset-registry.service';
import { WorldStateGatewayService } from '../world-state-gateway/world-state-gateway.service';
import { V12EntityType } from '@aevora/shared';
import { CompanyStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('V15-E: Automatic Company & Subsidiary Provisioning', () => {
  let companyService: CompanyService;
  let hqCapacityService: HqCapacityService;
  let vehicleService: V12VehicleService;
  let worldStateGatewayService: WorldStateGatewayService;

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


  const createMockPrisma = () => ({
    $transaction: jest.fn(async (callback) => {
      const txPrisma = createMockPrisma();
      return callback(txPrisma);
    }),
    company: {
      findUnique: jest.fn(async ({ where, include: _include }) => {
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
      findFirst: jest.fn(async ({ where, include: _include }) => {
        let matches = store.companies.slice();
        if (where.id) matches = matches.filter((x) => x.id === where.id);
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
          group: store.aevoraGroups.find((g) => g.id === c.groupId),
        };
      }),
      findMany: jest.fn(async ({ where }) => {
        let results = store.companies.slice();
        if (where) {
          if (where.chairmanId) results = results.filter((x) => x.chairmanId === where.chairmanId);
          if (where.groupId) results = results.filter((x) => x.groupId === where.groupId);
          if (where.OR) {
            results = results.filter((c) => {
              return where.OR.some((cond: any) => {
                if (cond.groupId && c.groupId !== cond.groupId) return false;
                if (cond.description?.contains && !c.description?.includes(cond.description.contains)) return false;
                if (cond.NOT?.id && c.id === cond.NOT.id) return false;
                return true;
              });
            });
          }
        }
        return results.map((c) => ({
          ...c,
          departments: store.departments.filter((d) => d.companyId === c.id),
          employees: store.employees.filter((e) => e.companyId === c.id),
        }));
      }),
      create: jest.fn(async ({ data, include: _include }) => {
        const id = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
      update: jest.fn(async ({ where, data }) => {
        const c = store.companies.find((x) => x.id === where.id);
        if (!c) throw new Error('Company not found');
        Object.assign(c, data);
        return c;
      }),
    },
    employee: {
      findUnique: jest.fn(async ({ where, include: _include }) => {
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

    emittedEvents = [];

    // Pre-populate global spatial geography
    const world = { id: 'world_saahvik', name: 'Saahvik' };
    const region = { id: 'reg_core', name: 'Core Region', worldId: world.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const country = { id: 'cntry_rep', name: 'Aevora Republic', regionId: region.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const city = { id: 'city_gen', name: 'Genesis City', countryId: country.id, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    store.worlds.push(world);
    store.regions.push(region);
    store.countries.push(country);
    store.cities.push(city);

    const mockPrisma = createMockPrisma();
    hqCapacityService = new HqCapacityService(mockPrisma as any, mockEventService as any);
    vehicleService = new V12VehicleService(
      mockPrisma as any,
      mockEventService as any,
      { requestEntityMovement: jest.fn() } as any,
      new V12AssetRegistryService(),
    );
    worldStateGatewayService = new WorldStateGatewayService(
      mockPrisma as any,
      mockEventService as any,
      { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } as any,
    );
    companyService = new CompanyService(
      mockPrisma as any,
      hqCapacityService,
      vehicleService,
      mockEventService as any,
    );
  });


  // Scenario A: Authoritative company creation
  it('A. creates authoritative company with departments, executive role, and CEO', async () => {
    const company = await companyService.createCompany(
      'Apex Innovations',
      'Apex Innovations Ltd.',
      'Core technology enterprise',
      'chairman_mayank',
      'grp_aevora',
      { initialDepartments: ['Engineering', 'Product'] },
    );

    expect(company.id).toBeDefined();
    expect(company.name).toBe('Apex Innovations');
    expect(company.legalName).toBe('Apex Innovations Ltd.');

    // Authoritative departments: Executive + initial
    const depts = store.departments.filter((d) => d.companyId === company.id);
    expect(depts.map((d) => d.name)).toEqual(expect.arrayContaining(['Executive', 'Engineering', 'Product']));

    // CEO employee creation
    const employees = store.employees.filter((e) => e.companyId === company.id);
    expect(employees.length).toBe(1);
    expect(employees[0].name).toBe('CEO');

    // Authoritative company event
    const event = store.companyEvents.find((e) => e.companyId === company.id && e.type === 'COMPANY_CREATED');
    expect(event).toBeDefined();
  });

  // Scenario B: Subsidiary creation
  it('B. creates authoritative subsidiary under a parent company', async () => {
    const parent = await companyService.createCompany(
      'Aevora Global',
      'Aevora Global Inc.',
      'Parent Enterprise',
      'chairman_mayank',
      'grp_aevora',
    );

    const subResult = await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Aevora Logistics',
      legalName: 'Aevora Logistics LLC',
      description: 'Regional logistics division',
      initialDepartments: ['Operations', 'Fleet'],
    });

    expect(subResult.subsidiary).toBeDefined();
    expect(subResult.subsidiary.name).toBe('Aevora Logistics');
    expect(subResult.parentCompanyId).toBe(parent.id);
    expect(subResult.spatialCampusProvisioned).toBe(true);

    // Event recorded on parent company
    const parentEvent = store.companyEvents.find(
      (e) => e.companyId === parent.id && e.type === 'SUBSIDIARY_CREATED',
    );
    expect(parentEvent).toBeDefined();
    expect(parentEvent.payload.subsidiaryId).toBe(subResult.subsidiary.id);
  });

  // Scenario C: Parent/subsidiary relationship
  it('C. preserves parent/subsidiary relationship metadata and queries', async () => {
    const parent = await companyService.createCompany(
      'Aevora Aerospace',
      'Aevora Aerospace Corp.',
      'Aerospace HQ',
      'chairman_mayank',
      'grp_aevora',
    );

    await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Aevora Propulsion',
      description: 'Propulsion subsidiary',
    });

    await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Aevora Avionics',
      description: 'Avionics subsidiary',
    });

    const subs = await companyService.getSubsidiaries(parent.id);
    expect(subs.length).toBe(2);
    expect(subs.map((s) => s.name)).toContain('Aevora Propulsion');
    expect(subs.map((s) => s.name)).toContain('Aevora Avionics');
    // Parent company itself is not in the subsidiaries list
    expect(subs.map((s) => s.id)).not.toContain(parent.id);
  });

  // Scenario D: Unauthorized company/subsidiary creation rejection
  it('D. rejects unauthorized actor from creating subsidiaries', async () => {
    const parent = await companyService.createCompany(
      'Aevora Energy',
      'Aevora Energy Inc.',
      'Energy HQ',
      'chairman_mayank',
    );

    // Random unauthorized actor
    await expect(
      companyService.createSubsidiary(parent.id, 'unauthorized_actor_999', {
        name: 'Aevora Solar',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Employee from another company
    const otherComp = await companyService.createCompany(
      'Other Corp',
      'Other Corp Ltd.',
      'Other',
      'other_chairman',
    );
    const otherCeo = store.employees.find((e) => e.companyId === otherComp.id);

    await expect(
      companyService.createSubsidiary(parent.id, otherCeo.id, {
        name: 'Aevora Solar',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // Scenario E: Initial spatial world creation
  it('E. automatically provisions isolated spatial site for new company', async () => {
    const company = await companyService.createCompany(
      'Solaria Corp',
      'Solaria Corp Ltd.',
      'Renewables',
      'chairman_mayank',
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    expect(site).toBeDefined();
    expect(site.name).toBe('Solaria Corp Campus');
    expect(site.cityId).toBe('city_gen');
  });

  // Scenario F: HQ creation
  it('F. provisions initial primary HQ building inside the company site', async () => {
    const company = await companyService.createCompany(
      'Vortex Dynamics',
      'Vortex Dynamics Ltd.',
      'Dynamics',
      'chairman_mayank',
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    const building = store.buildings.find((b) => b.siteId === site.id);
    expect(building).toBeDefined();
    expect(building.name).toBe('Vortex Dynamics HQ Building');
  });

  // Scenario G: Floor creation
  it('G. provisions Main Floor and Executive Level floors in HQ building', async () => {
    const company = await companyService.createCompany(
      'Aevora Robotics',
      'Aevora Robotics Ltd.',
      'Robotics HQ',
      'chairman_mayank',
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    const building = store.buildings.find((b) => b.siteId === site.id);
    const floors = store.floors.filter((f) => f.buildingId === building.id);

    expect(floors.some((f) => f.level === 1 && f.name === 'Main Floor')).toBe(true);
    expect(floors.some((f) => f.level === 100 && f.name === 'Executive Level')).toBe(true);
  });

  // Scenario H: Room creation
  it('H. provisions core executive and common spatial rooms', async () => {
    const company = await companyService.createCompany(
      'Quantum Bio',
      'Quantum Bio Ltd.',
      'Bio research',
      'chairman_mayank',
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    const building = store.buildings.find((b) => b.siteId === site.id);
    const floorIds = store.floors.filter((f) => f.buildingId === building.id).map((f) => f.id);
    const rooms = store.rooms.filter((r) => floorIds.includes(r.floorId));

    const roomTypes = rooms.map((r) => r.type);
    expect(roomTypes).toContain('LOBBY');
    expect(roomTypes).toContain('RECEPTION');
    expect(roomTypes).toContain('CEO_OFFICE');
    expect(roomTypes).toContain('CHAIRMAN_OFFICE');
    expect(roomTypes).toContain('CONFERENCE_ROOM');
    expect(roomTypes).toContain('MEETING_ROOM');
  });

  // Scenario I: Workspace creation
  it('I. provisions initial workspaces with company scoping', async () => {
    const company = await companyService.createCompany(
      'Starlight AI',
      'Starlight AI Ltd.',
      'AI compute',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Research'] },
    );

    const workspaces = store.workspaces.filter((w) => w.companyId === company.id);
    expect(workspaces.length).toBeGreaterThan(0);
    workspaces.forEach((w) => {
      expect(w.companyId).toBe(company.id);
    });
    // At least one workspace is available for future workforce
    expect(workspaces.some((w) => !w.isOccupied)).toBe(true);
  });


  // Scenario J: Department-space projection
  it('J. projects authoritative departments into spatial department rooms and desks', async () => {
    const company = await companyService.createCompany(
      'CyberShield Inc',
      'CyberShield Inc.',
      'Cybersecurity',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Security', 'Infra'] },
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    const building = store.buildings.find((b) => b.siteId === site.id);
    const floorIds = store.floors.filter((f) => f.buildingId === building.id).map((f) => f.id);
    const rooms = store.rooms.filter((r) => floorIds.includes(r.floorId));

    const securityDept = store.departments.find((d) => d.companyId === company.id && d.name === 'Security');
    const infraDept = store.departments.find((d) => d.companyId === company.id && d.name === 'Infra');

    expect(rooms.some((r) => r.departmentId === securityDept.id)).toBe(true);
    expect(rooms.some((r) => r.departmentId === infraDept.id)).toBe(true);
  });

  // Scenario K: Parking creation
  it('K. provisions dedicated campus parking area with waypoint navigation node', async () => {
    const company = await companyService.createCompany(
      'AeroTransport',
      'AeroTransport Ltd.',
      'Transport',
      'chairman_mayank',
    );

    const site = store.sites.find((s) => s.companyId === company.id);
    const parking = store.parkingAreas.find((p) => p.siteId === site.id);
    expect(parking).toBeDefined();
    expect(parking.name).toContain('Parking Area 1');
    expect(parking.capacity).toBe(10);

    // Waypoint navigation node on site
    const navNode = store.navNodes.find((n) => n.entityId === parking.id);
    expect(navNode).toBeDefined();
    expect(navNode.siteId).toBe(site.id);
  });

  // Scenario L: V15-B capacity integration
  it('L. integrates with V15-B capacity evaluation showing zero room/workspace deficit', async () => {
    const company = await companyService.createCompany(
      'Nova Horizon',
      'Nova Horizon Inc.',
      'Nova',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Design', 'Engineering'] },
    );

    const evalResult = await hqCapacityService.evaluateCapacity(company.id);
    expect(evalResult.requiredNewRooms).toBe(0);
    expect(evalResult.requiredNewWorkspaces).toBe(0);
    expect(evalResult.departmentMetrics.length).toBe(3); // Executive, Design, Engineering
  });


  // Scenario M: V15-C workforce compatibility
  it('M. enables authoritative employees in new company to be assigned to its workspaces', async () => {
    const company = await companyService.createCompany(
      'BioGenix',
      'BioGenix Ltd.',
      'Bio',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['R&D'] },
    );

    const rdDept = store.departments.find((d) => d.companyId === company.id && d.name === 'R&D');
    const availableWs = store.workspaces.find(
      (w) => w.companyId === company.id && w.departmentId === rdDept.id && !w.isOccupied,
    );
    expect(availableWs).toBeDefined();

    // Assign new employee to workspace
    availableWs.isOccupied = true;
    availableWs.employeeId = 'emp_scientist_1';

    expect(availableWs.companyId).toBe(company.id);
    expect(availableWs.isOccupied).toBe(true);
  });

  // Scenario N: V15-D vehicle compatibility
  it('N. provisions initial vehicle fleet when fleet requirement is specified', async () => {
    const company = await companyService.createCompany(
      'FleetMasters',
      'FleetMasters Ltd.',
      'Fleet operator',
      'chairman_mayank',
      undefined,
      { initialFleetCount: 2 },
    );

    const companyVehicles = store.vehicles.filter((v) => v.companyId === company.id);
    expect(companyVehicles.length).toBe(2);
    companyVehicles.forEach((v) => {
      expect(v.companyId).toBe(company.id);
      expect(v.isParked).toBe(true);
    });
  });

  // Scenario O: Deterministic coordinates
  it('O. calculates site and building coordinates deterministically without Math.random', async () => {
    const companyA = await companyService.createCompany(
      'Alpha Group',
      'Alpha Group Ltd.',
      'Alpha',
      'chairman_mayank',
    );
    const siteA1 = store.sites.find((s) => s.companyId === companyA.id);

    // Coordinate formula check
    const expectedX = companyA.id.charCodeAt(0) * 10 + companyA.id.charCodeAt(1);
    const expectedZ =
      companyA.id.charCodeAt(companyA.id.length - 1) * 10 +
      companyA.id.charCodeAt(companyA.id.length - 2);

    expect(siteA1.posX).toBe(expectedX);
    expect(siteA1.posZ).toBe(expectedZ);
  });

  // Scenario P: Idempotent provisioning
  it('P. produces zero duplicate sites, buildings, floors, or rooms on repeated provisioning', async () => {
    const company = await companyService.createCompany(
      'Idempotent Corp',
      'Idempotent Corp Ltd.',
      'Testing idempotency',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Legal'] },
    );

    const initialSitesCount = store.sites.length;
    const initialBuildingsCount = store.buildings.length;
    const initialFloorsCount = store.floors.length;
    const initialRoomsCount = store.rooms.length;
    const initialWorkspacesCount = store.workspaces.length;

    // Retry / re-provision
    await companyService.provisionCompanyCampus(company.id, {
      initialDepartments: ['Legal'],
    });

    expect(store.sites.length).toBe(initialSitesCount);
    expect(store.buildings.length).toBe(initialBuildingsCount);
    expect(store.floors.length).toBe(initialFloorsCount);
    expect(store.rooms.length).toBe(initialRoomsCount);
    expect(store.workspaces.length).toBe(initialWorkspacesCount);
  });

  // Scenario Q: Duplicate prevention
  it('Q. prevents duplicate company creation when auto-provisioned with identical name', async () => {
    const first = await companyService.autoProvisionCompany('chairman_mayank', {
      name: 'SingleTenant Systems',
      groupId: 'grp_main',
      initialDepartments: ['Sales'],
    });

    const second = await companyService.autoProvisionCompany('chairman_mayank', {
      name: 'SingleTenant Systems',
      groupId: 'grp_main',
      initialDepartments: ['Sales'],
    });

    const matchingCompanies = store.companies.filter((c) => c.name === 'SingleTenant Systems');
    expect(matchingCompanies.length).toBe(1);
    const firstComp = (first as any).company || (first as any).subsidiary;
    const secondComp = (second as any).company || (second as any).subsidiary;
    expect(firstComp.id).toBe(secondComp.id);
  });


  // Scenario R: Parent / child tenant isolation
  it('R. enforces strict spatial entity isolation between parent and subsidiary', async () => {
    const parent = await companyService.createCompany(
      'Parent Enterprise',
      'Parent Enterprise Inc.',
      'Parent',
      'chairman_mayank',
    );

    const sub = await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Child Enterprise',
      initialDepartments: ['Engineering'],
    });

    // Generate snapshots for both
    const parentSnapshot = await worldStateGatewayService.generateSnapshot(parent.id);
    const childSnapshot = await worldStateGatewayService.generateSnapshot(sub.subsidiary.id);

    const parentSite = store.sites.find((s) => s.companyId === parent.id);
    const childSite = store.sites.find((s) => s.companyId === sub.subsidiary.id);

    // Parent cannot see child's campus
    expect(parentSnapshot.entities[`v12_campus_${childSite.id}`]).toBeUndefined();
    expect(parentSnapshot.entities[`v12_campus_${parentSite.id}`]).toBeDefined();

    // Child cannot see parent's campus
    expect(childSnapshot.entities[`v12_campus_${parentSite.id}`]).toBeUndefined();
    expect(childSnapshot.entities[`v12_campus_${childSite.id}`]).toBeDefined();

    // Child workspaces are not visible to parent
    const childWorkspaces = store.workspaces.filter((w) => w.companyId === sub.subsidiary.id);
    childWorkspaces.forEach((w) => {
      expect(parentSnapshot.entities[`v12_workspace_${w.id}`]).toBeUndefined();
      expect(childSnapshot.entities[`v12_workspace_${w.id}`]).toBeDefined();
    });
  });

  // Scenario S: Sibling tenant isolation
  it('S. enforces strict spatial entity isolation between sibling subsidiaries', async () => {
    const parent = await companyService.createCompany(
      'Holding Corp',
      'Holding Corp Ltd.',
      'Holding',
      'chairman_mayank',
    );

    const sibA = await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Sibling Alpha',
      initialFleetCount: 1,
    });

    const sibB = await companyService.createSubsidiary(parent.id, 'chairman_mayank', {
      name: 'Sibling Beta',
      initialFleetCount: 1,
    });

    const snapA = await worldStateGatewayService.generateSnapshot(sibA.subsidiary.id);
    const snapB = await worldStateGatewayService.generateSnapshot(sibB.subsidiary.id);

    const siteA = store.sites.find((s) => s.companyId === sibA.subsidiary.id);
    const siteB = store.sites.find((s) => s.companyId === sibB.subsidiary.id);

    // Neither sibling sees the other's campus
    expect(snapA.entities[`v12_campus_${siteB.id}`]).toBeUndefined();
    expect(snapB.entities[`v12_campus_${siteA.id}`]).toBeUndefined();

    // Neither sibling sees the other's vehicles
    const vehA = store.vehicles.find((v) => v.companyId === sibA.subsidiary.id);
    const vehB = store.vehicles.find((v) => v.companyId === sibB.subsidiary.id);

    expect(snapA.entities[`v12_vehicle_${vehB.id}`]).toBeUndefined();
    expect(snapB.entities[`v12_vehicle_${vehA.id}`]).toBeUndefined();
  });

  // Scenario T: World-state propagation
  it('T. broadcasts spatial campus provisioned events through WorldStateEventService', async () => {
    const company = await companyService.createCompany(
      'Realtime Dynamics',
      'Realtime Dynamics Ltd.',
      'Realtime',
      'chairman_mayank',
    );

    const campusEvents = emittedEvents.filter(
      (e) => e.companyId === company.id && e.eventType === 'SPATIAL_CAMPUS_PROVISIONED',
    );
    expect(campusEvents.length).toBeGreaterThanOrEqual(1);
    expect(campusEvents[0].entityType).toBe(V12EntityType.CAMPUS);
  });

  // Scenario U: New company 3D viewport contract
  it('U. generates a valid 3D WorldSnapshot conforming to viewport contracts', async () => {
    const company = await companyService.createCompany(
      'Viewport Reality',
      'Viewport Reality Inc.',
      'XR HQ',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Design'] },
    );

    const snapshot = await worldStateGatewayService.generateSnapshot(company.id);

    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBeDefined();
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.entities).toBeDefined();

    // Has region, city, campus, building, floor, rooms, workspaces
    const entityTypes = Object.values(snapshot.entities).map((e) => e.type);
    expect(entityTypes).toContain(V12EntityType.REGION);
    expect(entityTypes).toContain(V12EntityType.CITY);
    expect(entityTypes).toContain(V12EntityType.CAMPUS);
    expect(entityTypes).toContain(V12EntityType.BUILDING);
    expect(entityTypes).toContain(V12EntityType.FLOOR);
    expect(entityTypes).toContain(V12EntityType.ROOM);
    expect(entityTypes).toContain(V12EntityType.WORKSPACE);
  });

  // Scenario V: Failure isolation
  it('V. preserves authoritative company and records if spatial campus provisioning fails', async () => {
    // Inject a failing hqCapacityService
    const failingCapacityService = {
      reconcileCompanyCapacity: jest.fn().mockRejectedValue(new Error('Spatial database timeout glitch')),
    };

    const isolatedCompanyService = new CompanyService(
      createMockPrisma() as any,
      failingCapacityService as any,
      vehicleService,
      mockEventService as any,
    );

    // Company creation should still succeed!
    const company = await isolatedCompanyService.createCompany(
      'Resilient Tech',
      'Resilient Tech Ltd.',
      'High resilience',
      'chairman_mayank',
      undefined,
      { initialDepartments: ['Finance'] },
    );

    expect(company).toBeDefined();
    expect(company.name).toBe('Resilient Tech');

    // Authoritative company exists in store
    const storedCompany = store.companies.find((c) => c.id === company.id);
    expect(storedCompany).toBeDefined();

    // Departments and CEO were created and not rolled back
    const storedDepts = store.departments.filter((d) => d.companyId === company.id);
    expect(storedDepts.length).toBeGreaterThanOrEqual(1);

    const storedEvents = store.companyEvents.filter(
      (e) => e.companyId === company.id && e.type === 'COMPANY_CREATED',
    );
    expect(storedEvents.length).toBe(1);
  });
});

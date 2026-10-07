import { Test, TestingModule } from '@nestjs/testing';
import { HiringService } from './hiring.service';
import { HqCapacityService, DEFAULT_HQ_CAPACITY_POLICY } from '../v12-spatial/hq-capacity.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { WorkerType, EmployeeStatus, HiringRequestStatus } from '@prisma/client';
import { V12EntityType, V12EventType } from '@aevora/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Workforce Auto-Provisioning & Spatial Employees (Stage V15-C)', () => {
  let hiringService: HiringService;
  let hqCapacityService: HqCapacityService;

  // In-memory data store for deterministic state validation
  let store: {
    companies: any[];
    departments: any[];
    roles: any[];
    employees: any[];
    workerProfiles: any[];
    acWallets: any[];
    hiringRequests: any[];
    companyEvents: any[];
    audits: any[];
    sites: any[];
    buildings: any[];
    floors: any[];
    rooms: any[];
    workspaces: any[];
    movementStates: any[];
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
              role: store.roles.find((r) => r.id === e.roleId) || null,
              department: store.departments.find((d) => d.id === e.departmentId) || null,
            })),
        };
      }),
    },
    department: {
      findUnique: jest.fn(async ({ where }) => store.departments.find((d) => d.id === where.id) || null),
      findFirst: jest.fn(async ({ where }) => store.departments.find((d) => d.companyId === where.companyId) || null),
    },
    role: {
      findUnique: jest.fn(async ({ where }) => store.roles.find((r) => r.id === where.id) || null),
      findFirst: jest.fn(async ({ where }) => {
        return store.roles.find((r) => {
          if (where.companyId && r.companyId !== where.companyId) return false;
          return true;
        }) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `role-${Date.now()}-${Math.random()}`, ...data };
        store.roles.push(item);
        return item;
      }),
    },
    employee: {
      findUnique: jest.fn(async ({ where }) => store.employees.find((e) => e.id === where.id) || null),
      findFirst: jest.fn(async ({ where }) => store.employees.find((e) => e.companyId === where.companyId) || null),
      findMany: jest.fn(async ({ where }) => store.employees.filter((e) => !where || e.companyId === where.companyId)),
      create: jest.fn(async ({ data }) => {
        const item = {
          id: `emp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          status: EmployeeStatus.ACTIVE,
          activity: 'WORKING',
          ...data,
        };
        store.employees.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.employees.findIndex((e) => e.id === where.id);
        if (idx >= 0) {
          store.employees[idx] = { ...store.employees[idx], ...data };
          return store.employees[idx];
        }
        return null;
      }),
    },
    workerProfile: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `profile-${Date.now()}`, ...data };
        store.workerProfiles.push(item);
        return item;
      }),
      findUnique: jest.fn(async ({ where }) => store.workerProfiles.find((p) => p.employeeId === where.employeeId) || null),
    },
    aCWallet: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `wallet-${Date.now()}`, balance: 0, ...data };
        store.acWallets.push(item);
        return item;
      }),
    },
    hiringRequest: {
      findUnique: jest.fn(async ({ where }) => store.hiringRequests.find((r) => r.id === where.id) || null),
      findMany: jest.fn(async ({ where }) => store.hiringRequests.filter((r) => !where || r.companyId === where.companyId)),
      create: jest.fn(async ({ data }) => {
        const item = { id: `hire-req-${Date.now()}-${Math.random()}`, status: HiringRequestStatus.ONBOARDING, ...data };
        store.hiringRequests.push(item);
        return item;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = store.hiringRequests.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          store.hiringRequests[idx] = { ...store.hiringRequests[idx], ...data };
          return store.hiringRequests[idx];
        }
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        store.hiringRequests.forEach((r, idx) => {
          if (r.id === where.id && (where.status === undefined || r.status === where.status)) {
            store.hiringRequests[idx] = { ...r, ...data };
            count++;
          }
        });
        return { count };
      }),
    },
    companyEvent: {
      create: jest.fn(async ({ data }) => {
        const item = { id: `event-${Date.now()}-${Math.random()}`, ...data };
        store.companyEvents.push(item);
        return item;
      }),
    },
    // V12 Spatial Models
    v12SpatialSite: {
      findFirst: jest.fn(async ({ where }) => store.sites.find((s) => s.companyId === where.companyId) || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: `site-${Date.now()}`, ...data };
        store.sites.push(item);
        return item;
      }),
    },
    v12SpatialCity: {
      findFirst: jest.fn(async () => store.cities[0] || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: 'city-1', ...data };
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
      findFirst: jest.fn(async ({ where }) => store.buildings.find((b) => b.siteId === where.siteId) || null),
      findMany: jest.fn(async ({ where }) => {
        return store.buildings.filter((b) => {
          if (!where) return true;
          if (where.siteId && typeof where.siteId === 'string' && b.siteId !== where.siteId) return false;
          if (where.siteId?.in && !where.siteId.in.includes(b.siteId)) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }) => {
        return store.buildings.filter((b) => {
          if (!where) return true;
          if (where.siteId && b.siteId !== where.siteId) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `bldg-${store.buildings.length + 1}`, ...data };
        store.buildings.push(item);
        return item;
      }),
    },
    v12SpatialFloor: {
      findFirst: jest.fn(async ({ where }) => store.floors.find((f) => f.buildingId === where.buildingId && (where.level === undefined || f.level === where.level)) || null),
      findMany: jest.fn(async ({ where }) => {
        return store.floors.filter((f) => {
          if (!where) return true;
          if (where.buildingId && typeof where.buildingId === 'string' && f.buildingId !== where.buildingId) return false;
          if (where.buildingId?.in && !where.buildingId.in.includes(f.buildingId)) return false;
          if (where.level?.lt !== undefined && f.level >= where.level.lt) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }) => {
        return store.floors.filter((f) => {
          if (!where) return true;
          if (where.buildingId && f.buildingId !== where.buildingId) return false;
          return true;
        }).length;
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
          if (where.floorId && r.floorId !== where.floorId) return false;
          if (where.departmentId && r.departmentId !== where.departmentId) return false;
          if (where.type && r.type !== where.type) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.rooms.filter((r) => {
          if (!where) return true;
          if (where.floorId && typeof where.floorId === 'string' && r.floorId !== where.floorId) return false;
          if (where.floorId?.in && !where.floorId.in.includes(r.floorId)) return false;
          if (where.departmentId && r.departmentId !== where.departmentId) return false;
          if (where.type && r.type !== where.type) return false;
          return true;
        });
      }),
      count: jest.fn(async ({ where }) => {
        return store.rooms.filter((r) => {
          if (!where) return true;
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
          if (where.departmentId && w.departmentId !== where.departmentId) return false;
          if (where.employeeId && w.employeeId !== where.employeeId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          return true;
        }) || null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return store.workspaces.filter((w) => {
          if (!where) return true;
          if (where.companyId && w.companyId !== where.companyId) return false;
          if (where.roomId && w.roomId !== where.roomId) return false;
          if (where.roomId?.in && !where.roomId.in.includes(w.roomId)) return false;
          if (where.departmentId && w.departmentId !== where.departmentId) return false;
          if (where.isOccupied !== undefined && w.isOccupied !== where.isOccupied) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const item = { id: `ws-${store.workspaces.length + 1}`, ...data };
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
          if (where.employeeId?.in && where.employeeId.in.includes(w.employeeId)) {
            store.workspaces[idx] = { ...w, ...data };
            count++;
          }
        });
        return { count };
      }),
    },
    v12SpatialMovementState: {
      findUnique: jest.fn(async ({ where }) => store.movementStates.find((m) => m.entityId === where.entityId) || null),
      findMany: jest.fn(async () => store.movementStates),
      create: jest.fn(async ({ data }) => {
        const item = { id: `mov-${Date.now()}`, ...data };
        store.movementStates.push(item);
        return item;
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const idx = store.movementStates.findIndex((m) => m.entityId === where.entityId);
        if (idx >= 0) {
          store.movementStates[idx] = { ...store.movementStates[idx], ...update };
          return store.movementStates[idx];
        }
        const item = { id: `mov-${Date.now()}`, ...create };
        store.movementStates.push(item);
        return item;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        store.movementStates.forEach((m, idx) => {
          if (where.entityId?.in && where.entityId.in.includes(m.entityId)) {
            store.movementStates[idx] = { ...m, ...data };
            count++;
          }
        });
        return { count };
      }),
    },
    v12NavigationNode: {
      findFirst: jest.fn(async ({ where }) => store.navNodes.find((n) => n.entityId === where.entityId) || null),
      findMany: jest.fn(async () => store.navNodes),
      create: jest.fn(async ({ data }) => {
        const item = { id: `node-${store.navNodes.length + 1}`, ...data };
        store.navNodes.push(item);
        return item;
      }),
    },
    v12SpatialTopologyEdge: {
      findFirst: jest.fn(async ({ where }) => store.navEdges.find((e) => e.sourceId === where.sourceId && e.targetId === where.targetId) || null),
      create: jest.fn(async ({ data }) => {
        const item = { id: `edge-${store.navEdges.length + 1}`, ...data };
        store.navEdges.push(item);
        return item;
      }),
    },
  });

  const mockAudit = {
    record: jest.fn(async (data) => {
      store.audits.push(data);
      return data;
    }),
  };

  const mockProfileSvc = {
    listProfiles: jest.fn(),
  };

  const mockApprovalSvc = {
    validateAndConsumeApproval: jest.fn(async () => true),
  };

  beforeEach(async () => {
    store = {
      companies: [],
      departments: [],
      roles: [],
      employees: [],
      workerProfiles: [],
      acWallets: [],
      hiringRequests: [],
      companyEvents: [],
      audits: [],
      sites: [],
      buildings: [],
      floors: [],
      rooms: [],
      workspaces: [],
      movementStates: [],
      navNodes: [],
      navEdges: [],
      cities: [{ id: 'city-1', name: 'Genesis City' }],
    };
    emittedEvents = [];

    const mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HiringService,
        HqCapacityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorkforceAuditService, useValue: mockAudit },
        { provide: WorkerProfileService, useValue: mockProfileSvc },
        { provide: ApprovalValidationService, useValue: mockApprovalSvc },
        { provide: WorldStateEventService, useValue: mockEventService },
      ],
    }).compile();

    hiringService = module.get<HiringService>(HiringService);
    hqCapacityService = module.get<HqCapacityService>(HqCapacityService);
  });

  // Helper to seed a valid authoritative enterprise baseline
  const seedCompany = (companyId: string, name: string) => {
    const company = { id: companyId, name, groupId: null, status: 'ACTIVE' };
    store.companies.push(company);

    const adminRole = { id: `role-admin-${companyId}`, title: 'CHAIRMAN', companyId, level: 5 };
    const devRole = { id: `role-eng-${companyId}`, title: 'Senior Software Engineer', companyId, level: 3 };
    store.roles.push(adminRole, devRole);

    const engDept = { id: `dept-eng-${companyId}`, name: 'Engineering', companyId, status: 'ACTIVE' };
    const opsDept = { id: `dept-ops-${companyId}`, name: 'Operations', companyId, status: 'ACTIVE' };
    store.departments.push(engDept, opsDept);

    const actor = {
      id: `actor-${companyId}`,
      name: 'System Chairman',
      companyId,
      departmentId: null,
      roleId: adminRole.id,
      status: EmployeeStatus.ACTIVE,
      salary: 250000,
    };
    store.employees.push(actor);

    return { company, adminRole, devRole, engDept, opsDept, actor };
  };

  describe('A & B. Authoritative Employee Provisioning Pipeline', () => {
    it('creates real Employee records, ACWallet, WorkerProfile, and EMPLOYEE_HIRED companyEvent', async () => {
      const { company, actor, engDept, devRole } = seedCompany('comp-alpha', 'AlphaCorp');

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 3,
        roleId: devRole.id,
        workerType: WorkerType.HUMAN,
        titlePrefix: 'Frontend Specialist',
      });

      expect(result.success).toBe(true);
      expect(result.provisionedCount).toBe(3);
      expect(result.employees.length).toBe(3);

      // Verify real Employee records in database
      const provisioned = store.employees.filter((e) => e.departmentId === engDept.id);
      expect(provisioned.length).toBe(3);
      for (const emp of provisioned) {
        expect(emp.companyId).toBe(company.id);
        expect(emp.status).toBe(EmployeeStatus.ACTIVE);
        expect(emp.salary).toBeGreaterThan(0);

        // WorkerProfile verification
        const profile = store.workerProfiles.find((p) => p.employeeId === emp.id);
        expect(profile).toBeDefined();
        expect(profile.workerType).toBe(WorkerType.HUMAN);

        // ACWallet verification
        const wallet = store.acWallets.find((w) => w.employeeId === emp.id);
        expect(wallet).toBeDefined();
        expect(wallet.balance).toBe(0);
      }

      // Verify authoritative EMPLOYEE_HIRED company events
      const hiredEvents = store.companyEvents.filter((ev) => ev.type === 'EMPLOYEE_HIRED');
      expect(hiredEvents.length).toBe(3);
    });

    it('rejects provisioning when count is invalid or non-integer', async () => {
      const { company, actor, engDept } = seedCompany('comp-alpha', 'AlphaCorp');

      await expect(
        hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
          departmentId: engDept.id,
          count: 0,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
          departmentId: engDept.id,
          count: 100, // Exceeds batch ceiling of 50
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('C, D, E. Department, Role, and WorkerProfile Integration', () => {
    it('supports provisioning AI workers with WorkerType.AI profile', async () => {
      const { company, actor, opsDept } = seedCompany('comp-alpha', 'AlphaCorp');

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: opsDept.id,
        count: 2,
        workerType: WorkerType.AI,
        titlePrefix: 'Autonomous Ops Agent',
      });

      expect(result.provisionedCount).toBe(2);
      const opsEmployees = store.employees.filter((e) => e.departmentId === opsDept.id);
      expect(opsEmployees.length).toBe(2);

      for (const emp of opsEmployees) {
        const profile = store.workerProfiles.find((p) => p.employeeId === emp.id);
        expect(profile.workerType).toBe(WorkerType.AI);
      }
    });

    it('creates a default role when no specific roleId is provided', async () => {
      const { company, actor, opsDept } = seedCompany('comp-alpha', 'AlphaCorp');

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: opsDept.id,
        count: 1,
      });

      expect(result.roleTitle).toBeDefined();
      const emp = store.employees.find((e) => e.id === result.employees[0].id);
      expect(emp.roleId).toBe(result.roleId);
    });
  });

  describe('F, G, H. V15-B Capacity Expansion & Workspace Assignment', () => {
    it('integrates with V15-B capacity reconciliation and assigns employees to workspaces', async () => {
      const { company, actor, engDept, devRole } = seedCompany('comp-alpha', 'AlphaCorp');

      // Request 10 employees for engineering (requires expanding rooms & desks)
      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 10,
        roleId: devRole.id,
      });

      expect(result.provisionedCount).toBe(10);

      // Verify that physical workspaces were created to accommodate all 10 employees
      const companyWorkspaces = store.workspaces.filter((w) => w.companyId === company.id);
      expect(companyWorkspaces.length).toBeGreaterThanOrEqual(10);

      // Verify each provisioned employee is assigned to an active occupied workspace
      for (const empSummary of result.employees) {
        const ws = store.workspaces.find((w) => w.employeeId === empSummary.id);
        expect(ws).toBeDefined();
        expect(ws.isOccupied).toBe(true);
        expect(ws.departmentId).toBe(engDept.id);
      }
    });
  });

  describe('I & N. Deterministic Placement & Movement State Creation', () => {
    it('anchors employees deterministically at workspace coordinates and creates V12SpatialMovementState', async () => {
      const { company, actor, engDept, devRole } = seedCompany('comp-alpha', 'AlphaCorp');

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 2,
        roleId: devRole.id,
      });

      for (const empSummary of result.employees) {
        const ws = store.workspaces.find((w) => w.employeeId === empSummary.id);
        expect(ws).toBeDefined();

        // Verify V12SpatialMovementState was created and anchored to the workspace
        const mov = store.movementStates.find((m) => m.entityId === empSummary.id);
        expect(mov).toBeDefined();
        expect(mov.entityType).toBe('EMPLOYEE');
        expect(mov.currentLocationId).toBe(ws.id);
        expect(mov.currentLocationType).toBe('WORKSPACE');
        expect(mov.movementState).toBe('IDLE');
        expect(mov.movementMode).toBe('WALK');

        // Verify broadcasted person event anchored to desk coordinates
        const personEvent = emittedEvents.find(
          (ev) => ev.entityId === `v12_person_${empSummary.id}` && ev.entityType === V12EntityType.PERSON,
        );
        expect(personEvent).toBeDefined();
        expect(personEvent.payload.transform.position.x).toBe(ws.posX);
        expect(personEvent.payload.transform.position.y).toBe(ws.posY + 1.0);
        expect(personEvent.payload.transform.position.z).toBe(ws.posZ);
        expect(personEvent.payload.spatialState).toBe('AT_WORKSPACE');
      }
    });
  });

  describe('J & K. Employee Termination & Workspace Vacating', () => {
    it('vacates workspace, resets movement state, and emits UNAVAILABLE event when employee is deactivated', async () => {
      const { company, actor, engDept, devRole } = seedCompany('comp-alpha', 'AlphaCorp');

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 1,
        roleId: devRole.id,
      });

      const empId = result.employees[0].id;
      const wsBefore = store.workspaces.find((w) => w.employeeId === empId);
      expect(wsBefore.isOccupied).toBe(true);

      // Deactivate employee in authoritative database
      const empIdx = store.employees.findIndex((e) => e.id === empId);
      store.employees[empIdx].status = EmployeeStatus.TERMINATED;

      // Reconcile spatial capacity
      await hqCapacityService.reconcileCompanyCapacity(company.id);

      // Workspace should now be vacated (retained in physical layout)
      const wsAfter = store.workspaces.find((w) => w.id === wsBefore.id);
      expect(wsAfter.isOccupied).toBe(false);
      expect(wsAfter.employeeId).toBeNull();

      // Movement state should be reset
      const movAfter = store.movementStates.find((m) => m.entityId === empId);
      expect(movAfter.currentLocationId).toBe('NONE');
      expect(movAfter.movementState).toBe('IDLE');

      // Deactivation event emitted
      const termEvent = emittedEvents.find(
        (ev) => ev.entityId === `v12_person_${empId}` && ev.payload.statusChanged === 'TERMINATED',
      );
      expect(termEvent).toBeDefined();
      expect(termEvent.payload.spatialState).toBe('UNAVAILABLE');
    });
  });

  describe('L & M. Spatial Employee Idempotency & Zero Duplication', () => {
    it('produces identical state with zero duplicate workspaces, movement states, or employees across repeated runs', async () => {
      const { company, actor, engDept, devRole } = seedCompany('comp-alpha', 'AlphaCorp');

      await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 4,
        roleId: devRole.id,
      });

      const employeesCount1 = store.employees.length;
      const workspacesCount1 = store.workspaces.length;
      const movementStatesCount1 = store.movementStates.length;

      // Re-run spatial reconciliation 3 times
      await hqCapacityService.reconcileCompanyCapacity(company.id);
      await hqCapacityService.reconcileCompanyCapacity(company.id);
      await hqCapacityService.reconcileCompanyCapacity(company.id);

      expect(store.employees.length).toBe(employeesCount1);
      expect(store.workspaces.length).toBe(workspacesCount1);
      expect(store.movementStates.length).toBe(movementStatesCount1);
    });
  });

  describe('P. Multi-Tenant Company Isolation', () => {
    it('prevents Company A actor from provisioning employees in Company B', async () => {
      const compA = seedCompany('comp-a', 'AlphaCorp');
      const compB = seedCompany('comp-b', 'BetaCorp');

      // Actor from Comp A tries to provision in Comp B's department
      await expect(
        hiringService.autoProvisionDepartmentWorkforce(compA.company.id, compA.actor.id, {
          departmentId: compB.engDept.id,
          count: 1,
        }),
      ).rejects.toThrow(NotFoundException);

      // Actor from Comp A tries to use Comp B's companyId
      await expect(
        hiringService.autoProvisionDepartmentWorkforce(compB.company.id, compA.actor.id, {
          departmentId: compB.engDept.id,
          count: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ensures workspaces and movement states are strictly company-scoped', async () => {
      const compA = seedCompany('comp-a', 'AlphaCorp');
      const compB = seedCompany('comp-b', 'BetaCorp');

      await hiringService.autoProvisionDepartmentWorkforce(compA.company.id, compA.actor.id, {
        departmentId: compA.engDept.id,
        count: 2,
      });

      await hiringService.autoProvisionDepartmentWorkforce(compB.company.id, compB.actor.id, {
        departmentId: compB.engDept.id,
        count: 2,
      });

      const compAWorkspaces = store.workspaces.filter((w) => w.companyId === compA.company.id);
      const compBWorkspaces = store.workspaces.filter((w) => w.companyId === compB.company.id);

      for (const wsA of compAWorkspaces) {
        expect(compBWorkspaces.map((w) => w.id)).not.toContain(wsA.id);
      }
    });
  });

  describe('Q. Sensitive-Data Protection Invariant', () => {
    it('never leaks employee salary, identitySeed, or financial credentials into spatial events', async () => {
      const { company, actor, engDept } = seedCompany('comp-alpha', 'AlphaCorp');

      await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 2,
      });

      const personEvents = emittedEvents.filter((ev) => ev.entityType === V12EntityType.PERSON);
      expect(personEvents.length).toBeGreaterThan(0);

      for (const ev of personEvents) {
        expect(ev.payload.salary).toBeUndefined();
        expect(ev.payload.identitySeed).toBeUndefined();
        expect(ev.payload.walletBalance).toBeUndefined();
        expect(ev.payload.bankAccount).toBeUndefined();
        expect(ev.payload.credentials).toBeUndefined();
      }
    });
  });

  describe('R. Failure Isolation Invariant', () => {
    it('preserves authoritative Employee records even if spatial reconciliation throws an error', async () => {
      const { company, actor, engDept } = seedCompany('comp-alpha', 'AlphaCorp');

      // Mock spatial reconciliation failure
      jest.spyOn(hqCapacityService, 'reconcileCompanyCapacity').mockRejectedValueOnce(
        new Error('Spatial Mesh Crash Simulator'),
      );

      const result = await hiringService.autoProvisionDepartmentWorkforce(company.id, actor.id, {
        departmentId: engDept.id,
        count: 2,
      });

      // Employee creation succeeded authoritatively
      expect(result.success).toBe(true);
      expect(result.provisionedCount).toBe(2);

      // Verify employees exist and are intact in database
      const emps = store.employees.filter((e) => e.departmentId === engDept.id);
      expect(emps.length).toBe(2);
      expect(emps[0].status).toBe(EmployeeStatus.ACTIVE);
    });
  });
});

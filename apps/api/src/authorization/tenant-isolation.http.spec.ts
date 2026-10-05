import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthorizationService } from './authorization.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyController } from '../company/company.controller';
import { CompanyService } from '../company/company.service';
import { DepartmentController } from '../department/department.controller';
import { DepartmentService } from '../department/department.service';
import { EmployeeController } from '../employee/employee.controller';
import { EmployeeService } from '../employee/employee.service';
import { TaskController } from '../task/task.controller';
import { TaskService } from '../task/task.service';
import { GoalController } from '../goal/goal.controller';
import { GoalService } from '../goal/goal.service';
import { ContinuousImprovementController } from '../continuous-improvement/continuous-improvement.controller';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { GroupController } from '../group/group.controller';
import { GroupService } from '../group/group.service';
import { OperatingLoopController } from '../operating-loop/operating-loop.controller';
import { OperatingLoopService } from '../operating-loop/operating-loop.service';
import { OpportunitySignalService } from '../operating-loop/opportunity-signal.service';
import { MemoryIntegrationService } from '../operating-loop/memory-integration.service';
import { PerformanceAggregationService } from '../operating-loop/performance-aggregation.service';
import { ItlErrorPoolService } from '../operating-loop/itl-error-pool.service';

/**
 * V14 authorization foundation: real JwtAuthGuard + RolesGuard + AuthorizationService over an in-memory
 * tenant fixture. Company A (chair-A, emp-A) must never reach company B through URL, body or X-Company-Id.
 */
describe('V14 tenant isolation over HTTP (legacy controllers + /auth/*)', () => {
  const SECRET = 'v14-tenant-test-secret';
  let app: any;
  let jwt: JwtService;

  const rows: Record<string, any[]> = {
    company: [
      { id: 'A', name: 'Alpha', status: 'ACTIVE', chairmanId: 'chair-A', groupId: null, createdAt: 1 },
      { id: 'B', name: 'Beta', status: 'ACTIVE', chairmanId: 'chair-B', groupId: null, createdAt: 2 },
    ],
    chairman: [{ id: 'chair-A', name: 'Chair A', email: 'a@test.local', credentialHash: 'SECRET-HASH' }],
    employee: [
      { id: 'emp-A', name: 'Emp A', companyId: 'A', status: 'ACTIVE', role: { accessLevel: 'STANDARD', permissions: ['VIEW_TASKS'] } },
      { id: 'emp-B', name: 'Emp B', companyId: 'B', status: 'ACTIVE', role: { accessLevel: 'STANDARD', permissions: [] } },
    ],
    department: [{ id: 'dep-A', companyId: 'A' }, { id: 'dep-B', companyId: 'B' }],
    task: [{ id: 'task-A', companyId: 'A' }, { id: 'task-B', companyId: 'B' }],
    goal: [{ id: 'goal-A', companyId: 'A' }, { id: 'goal-B', companyId: 'B' }],
    improvementProposal: [{ id: 'imp-A', companyId: 'A' }, { id: 'imp-B', companyId: 'B' }],
    operatingLoopCycle: [{ id: 'cyc-A', companyId: 'A' }, { id: 'cyc-B', companyId: 'B' }],
    role: [{ id: 'role-A', companyId: 'A' }, { id: 'role-B', companyId: 'B' }, { id: 'role-global', companyId: null }],
    aevoraGroup: [{ id: 'grp-A', chairmanId: 'chair-A' }, { id: 'grp-B', chairmanId: 'chair-B' }],
  };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
  const table = (name: string) => ({
    findUnique: jest.fn(async ({ where }: any) => rows[name].find(r => matches(r, where)) ?? null),
    findFirst: jest.fn(async ({ where }: any) => rows[name].find(r => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => rows[name].filter(r => matches(r, where))),
  });
  const prisma: any = Object.fromEntries(Object.keys(rows).map(n => [n, table(n)]));

  // Domain services are stubs: these tests prove the request never reaches them across tenants.
  const stub = (...methods: string[]) => Object.fromEntries(methods.map(m => [m, jest.fn(async (...a: any[]) => ({ ok: m, args: a }))]));
  const services = {
    company: stub('getCompany', 'createCompany', 'updateCompany', 'pauseCompany', 'resumeCompany', 'closeCompany'),
    department: stub('listDepartments', 'createDepartment', 'updateDepartment'),
    employee: stub('listEmployees', 'getEmployee', 'getHistory', 'getSkills', 'hireEmployee', 'holdEmployee', 'reactivateEmployee', 'suspendEmployee', 'terminateEmployee', 'rehireEmployee', 'transferEmployee', 'promoteEmployee'),
    task: stub('listEmployeeTasks', 'getTask', 'createTask', 'assignTask', 'updateTaskPriority', 'startTask', 'blockTask', 'completeTask', 'cancelTask'),
    goal: stub('listEmployeeGoals', 'createGoal', 'updateProgress', 'completeGoal', 'pauseGoal'),
    ci: stub('detectImprovementOpportunities', 'listProposals', 'createProposal', 'getProposal', 'approveProposal', 'rejectProposal', 'rollbackProposal', 'recordOutcome'),
    loop: stub('runFullCycle', 'listCycles', 'getCycle', 'getPendingApprovals', 'recordChairmanVerdict', 'execute', 'measure', 'learn'),
    perf: stub('getCompanyPerformance', 'getAgentPerformance'),
    memory: stub('getCompanyContext', 'search'),
    signals: stub('scan', 'listIdentified'),
    group: stub('listGroups', 'getGroup', 'getGroupReport', 'createGroup', 'updateGroup'),
    pool: stub('getPoolSnapshot', 'processPool', 'forceRetry', 'dismiss'),
  };

  const bearer = (p: any) => `Bearer ${jwt.sign(p)}`;
  const chairA = () => bearer({ actorId: 'chair-A', actorRole: 'CHAIRMAN' });
  const empA = () => bearer({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } })],
      controllers: [AuthController, CompanyController, DepartmentController, EmployeeController, TaskController, GoalController, ContinuousImprovementController, OperatingLoopController, GroupController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        RolesGuard, AuthorizationService, AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: CompanyService, useValue: services.company },
        { provide: DepartmentService, useValue: services.department },
        { provide: EmployeeService, useValue: services.employee },
        { provide: TaskService, useValue: services.task },
        { provide: GoalService, useValue: services.goal },
        { provide: ContinuousImprovementService, useValue: services.ci },
        { provide: OperatingLoopService, useValue: services.loop },
        { provide: PerformanceAggregationService, useValue: services.perf },
        { provide: MemoryIntegrationService, useValue: services.memory },
        { provide: OpportunitySignalService, useValue: services.signals },
        { provide: ItlErrorPoolService, useValue: services.pool },
        { provide: GroupService, useValue: services.group },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app?.close());
  beforeEach(() => Object.values(services).forEach(s => Object.values(s).forEach((f: any) => f.mockClear())));

  describe('authentication', () => {
    it('rejects requests without a token (401)', () => http().get('/companies').expect(401));
    it('rejects a forged token (401)', () => http().get('/companies').set('Authorization', 'Bearer not.a.jwt').expect(401));
    it('rejects an expired token (401)', async () => {
      const expired = jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' }, { expiresIn: -10 });
      await http().get('/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });
  });

  describe('/auth/me, /auth/companies, /auth/capabilities', () => {
    it('/auth/me returns identity without secrets', async () => {
      const res = await http().get('/auth/me').set('Authorization', chairA()).expect(200);
      expect(res.body).toMatchObject({ actorId: 'chair-A', actorRole: 'CHAIRMAN', name: 'Chair A', companyId: 'A' });
      expect(JSON.stringify(res.body)).not.toContain('SECRET-HASH');
    });
    it('/auth/companies lists only owned companies', async () => {
      const res = await http().get('/auth/companies').set('Authorization', chairA()).expect(200);
      expect(res.body.map((c: any) => c.id)).toEqual(['A']);
    });
    it('/auth/companies for an employee is only their company', async () => {
      const res = await http().get('/auth/companies').set('Authorization', empA()).expect(200);
      expect(res.body.map((c: any) => c.id)).toEqual(['A']);
    });
    it('/auth/capabilities reflects role permissions', async () => {
      const res = await http().get('/auth/capabilities').set('Authorization', empA()).expect(200);
      expect(res.body).toMatchObject({ actorRole: 'EMPLOYEE', permissions: ['VIEW_TASKS'], allPermissionsInOwnedCompanies: false });
    });
  });

  describe('X-Company-Id manipulation', () => {
    it('chairman A claiming company B is 403 (not a session failure)', () =>
      http().get('/auth/me').set('Authorization', chairA()).set('x-company-id', 'B').expect(403));
    it('employee A claiming company B is 403', () =>
      http().get('/auth/me').set('Authorization', empA()).set('x-company-id', 'B').expect(403));
    it('chairman A selecting own company A is accepted', async () => {
      const res = await http().get('/auth/me').set('Authorization', chairA()).set('x-company-id', 'A').expect(200);
      expect(res.body.companyId).toBe('A');
    });
  });

  describe('companies', () => {
    it('GET /companies no longer returns other tenants', async () => {
      const res = await http().get('/companies').set('Authorization', chairA()).expect(200);
      expect(res.body.map((c: any) => c.id)).toEqual(['A']);
    });
    it.each(['get', 'patch', 'post:pause', 'post:resume', 'post:close'])('%s on company B is 403', async (op) => {
      const [method, action] = op.split(':');
      const path = action ? `/companies/B/${action}` : '/companies/B';
      await (http() as any)[method === 'get' ? 'get' : method](path).set('Authorization', chairA()).send({}).expect(403);
      expect(Object.values(services.company).every((f: any) => f.mock.calls.length === 0)).toBe(true);
    });
    it('POST /companies ignores a body chairmanId and owns by the token actor', async () => {
      await http().post('/companies').set('Authorization', chairA()).send({ name: 'n', legalName: 'l', description: 'd', chairmanId: 'chair-B' }).expect(201);
      expect(services.company.createCompany).toHaveBeenCalledWith('n', 'l', 'd', 'chair-A', undefined);
    });
    it('POST /companies into another chairman\'s group is 403', () =>
      http().post('/companies').set('Authorization', chairA()).send({ name: 'n', groupId: 'grp-B' }).expect(403));
    it('non-chairman cannot create or pause companies (role restriction)', async () => {
      await http().post('/companies').set('Authorization', empA()).send({ name: 'n' }).expect(403);
      await http().post('/companies/A/pause').set('Authorization', empA()).expect(403);
    });
    it('chairman A can read company A', () => http().get('/companies/A').set('Authorization', chairA()).expect(200));
  });

  describe('groups', () => {
    it('GET/PATCH another chairman group is 403 and never reaches the service', async () => {
      await http().get('/groups/grp-B').set('Authorization', chairA()).expect(403);
      await http().patch('/groups/grp-B').set('Authorization', chairA()).send({ name: 'x' }).expect(403);
      expect(services.group.getGroup).not.toHaveBeenCalled();
      expect(services.group.updateGroup).not.toHaveBeenCalled();
    });
    it('own group is readable; POST ignores body chairmanId', async () => {
      await http().get('/groups/grp-A').set('Authorization', chairA()).expect(200);
      await http().post('/groups').set('Authorization', chairA()).send({ name: 'g', description: 'd', chairmanId: 'chair-B' }).expect(201);
      expect(services.group.createGroup).toHaveBeenCalledWith('g', 'd', 'chair-A');
    });
    it('employees cannot use group routes', () => http().get('/groups').set('Authorization', empA()).expect(403));
  });

  describe('departments / employees / tasks / goals / improvement / operating loop', () => {
    const forbidden: [string, string][] = [
      ['get', '/companies/B/departments'],
      ['post', '/companies/B/departments'],
      ['get', '/companies/B/employees'],
      ['post', '/companies/B/employees'],
      ['get', '/continuous-improvement/company/B/proposals'],
      ['get', '/continuous-improvement/company/B/detect'],
      ['post', '/continuous-improvement/proposals'],
      ['get', '/operating-loop/B/cycles'],
      ['get', '/operating-loop/B/dashboard'],
      ['post', '/operating-loop/B/cycle'],
      ['post', '/tasks'],
    ];
    it.each(forbidden)('%s %s → 403 for company A actors', async (method, path) => {
      for (const auth of [chairA(), empA()]) {
        await (http() as any)[method](path).set('Authorization', auth).send({ companyId: 'B', name: 'x' }).expect(403);
      }
    });

    const hidden: [string, string][] = [
      ['patch', '/departments/dep-B'],
      ['get', '/employees/emp-B'],
      ['get', '/employees/emp-B/history'],
      ['post', '/employees/emp-B/terminate'],
      ['post', '/employees/emp-B/transfer'],
      ['post', '/employees/emp-B/promote'],
      ['get', '/employees/emp-B/tasks'],
      ['get', '/tasks/task-B'],
      ['post', '/tasks/task-B/complete'],
      ['get', '/employees/emp-B/goals'],
      ['post', '/employees/emp-B/goals'],
      ['patch', '/goals/goal-B'],
      ['get', '/continuous-improvement/proposals/imp-B'],
      ['post', '/continuous-improvement/proposals/imp-B/approve'],
      ['get', '/operating-loop/cycle/cyc-B'],
      ['post', '/operating-loop/cycle/cyc-B/verdict'],
      ['post', '/operating-loop/error-pool/retry/cyc-B'],
      ['get', '/operating-loop/performance/agent/emp-B'],
      ['get', '/employees/does-not-exist'],
    ];
    it.each(hidden)('%s %s → 404 (other tenant row is invisible)', async (method, path) => {
      await (http() as any)[method](path).set('Authorization', chairA()).send({ companyId: 'A' }).expect(404);
    });

    it('no domain service was reached by any cross-tenant request', async () => {
      for (const [m, p] of [...forbidden, ...hidden]) await (http() as any)[m](p).set('Authorization', chairA()).send({ companyId: 'B' });
      const called = Object.entries(services).flatMap(([s, fns]) => Object.entries(fns).filter(([, f]: any) => f.mock.calls.length).map(([n]) => `${s}.${n}`));
      expect(called).toEqual([]);
    });

    it('own-company access still works and the actor is the token principal (x-actor-id ignored)', async () => {
      await http().get('/companies/A/departments').set('Authorization', empA()).expect(200);
      await http().get('/tasks/task-A').set('Authorization', chairA()).expect(200);
      await http().post('/employees/emp-A/hold').set('Authorization', chairA()).set('x-actor-id', 'chair-B').expect(201);
      expect(services.employee.holdEmployee).toHaveBeenCalledWith('chair-A', 'emp-A');
    });

    it('goal creation cannot be redirected to another company via body', async () => {
      await http().post('/employees/emp-A/goals').set('Authorization', chairA()).send({ companyId: 'B', title: 't' }).expect(201);
      expect(services.goal.createGoal).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'A', employeeId: 'emp-A' }));
    });

    it('task creation rejects cross-company references', async () => {
      await http().post('/tasks').set('Authorization', chairA()).send({ companyId: 'A', title: 't', assignedEmployeeId: 'emp-B' }).expect(404);
      expect(services.task.createTask).not.toHaveBeenCalled();
    });

    it('promotion rejects another company\'s role', async () => {
      await http().post('/employees/emp-A/promote').set('Authorization', chairA()).send({ roleId: 'role-B' }).expect(400);
      await http().post('/employees/emp-A/promote').set('Authorization', chairA()).send({ roleId: 'role-global' }).expect(201);
    });

    it('improvement approval records the token actor, and employees cannot approve', async () => {
      await http().post('/continuous-improvement/proposals/imp-A/approve').set('Authorization', empA()).expect(403);
      await http().post('/continuous-improvement/proposals/imp-A/approve').set('Authorization', chairA()).send({}).expect(201);
      expect(services.ci.approveProposal).toHaveBeenCalledWith('imp-A', 'chair-A');
    });
  });
});

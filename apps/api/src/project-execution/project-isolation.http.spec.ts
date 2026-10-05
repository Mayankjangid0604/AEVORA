import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectExecutionController } from './project-execution.controller';
import { ProjectExecutionService } from './project-execution.service';
import { DeliveryController } from '../delivery/delivery.controller';
import { DeliveryAgentWorker } from '../delivery/delivery-agent.worker';
import { InvoiceAndPaymentService } from '../delivery/invoice-payment.service';
import { FormalDeliveryService } from '../delivery/formal-delivery.service';

/** V14 slice 4: /projects/* and /delivery/formal/* were reachable for any company's project by id. */
describe('Project isolation over HTTP', () => {
  const SECRET = 'v14-project-secret';
  let app: any;
  let jwt: JwtService;
  const rows: Record<string, Record<string, any>> = {
    project: { 'prj-A': { companyId: 'A' }, 'prj-B': { companyId: 'B' } },
    projectRequirement: { 'req-B': { projectId: 'prj-B' }, 'req-A': { projectId: 'prj-A' } },
    projectPlan: { 'plan-B': { projectId: 'prj-B' }, 'plan-A': { projectId: 'prj-A' } },
    projectAssignment: { 'asg-B': { projectId: 'prj-B' }, 'asg-A': { projectId: 'prj-A' } },
    projectDelivery: { 'dlv-B': { projectId: 'prj-B' }, 'dlv-A': { projectId: 'prj-A' } },
  };
  const table = (n: string) => ({ findUnique: jest.fn(async ({ where }: any) => rows[n]![where.id] ?? null) });
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.chairmanId === 'chair-A' && (!where.id || where.id === 'A') ? { id: 'A' } : null)) },
    ...Object.fromEntries(Object.keys(rows).map((n) => [n, table(n)])),
  };
  const stub = (...m: string[]) => Object.fromEntries(m.map((k) => [k, jest.fn(async (...a: any[]) => ({ ok: k, a }))]));
  const svc = stub('getRequirements', 'createRequirement', 'updateRequirement', 'getPlans', 'createPlan', 'approvePlan', 'getMilestones', 'createMilestone', 'getRisks', 'createRisk', 'getTeam', 'proposeStaffing', 'activateAssignment');
  const formal = stub('packageDelivery', 'acceptDelivery', 'requestRevision');

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [ProjectExecutionController, DeliveryController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectExecutionService, useValue: svc },
        { provide: DeliveryAgentWorker, useValue: {} },
        { provide: InvoiceAndPaymentService, useValue: {} },
        { provide: FormalDeliveryService, useValue: formal },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const http = () => request(app.getHttpServer());
  const chairA = () => `Bearer ${jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' })}`;
  const empA = () => `Bearer ${jwt.sign({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' })}`;
  const reached = () => [...Object.values(svc), ...Object.values(formal)].some((f: any) => f.mock.calls.length > 0);

  const foreign: [string, string][] = [
    ['get', '/projects/prj-B/requirements'], ['post', '/projects/prj-B/requirements'], ['patch', '/projects/requirements/req-B'],
    ['get', '/projects/prj-B/plans'], ['post', '/projects/prj-B/plans'], ['post', '/projects/plans/plan-B/approve'],
    ['get', '/projects/prj-B/milestones'], ['post', '/projects/prj-B/milestones'],
    ['get', '/projects/prj-B/risks'], ['post', '/projects/prj-B/risks'],
    ['get', '/projects/prj-B/team'], ['post', '/projects/prj-B/team/propose'], ['post', '/projects/project-assignments/asg-B/activate'],
    ['post', '/delivery/formal/prj-B/package'], ['post', '/delivery/formal/deliveries/dlv-B/accept'], ['post', '/delivery/formal/deliveries/dlv-B/revise'],
    ['get', '/projects/missing/requirements'], ['post', '/projects/plans/missing/approve'],
  ];
  it.each(foreign)('%s %s on another company (or missing) is 404 and never reaches the service', async (method, path) => {
    await (http() as any)[method](path).set('Authorization', chairA()).send({ companyId: 'A' }).expect(404);
    expect(reached()).toBe(false);
  });

  it('own-company project routes still work', async () => {
    await http().get('/projects/prj-A/milestones').set('Authorization', empA()).expect(200);
    await http().post('/projects/prj-A/team/propose').set('Authorization', empA()).send({ employeeId: 'e' }).expect(201);
    expect(svc.getMilestones).toHaveBeenCalledWith('prj-A');
  });

  it('approving a plan and activating an assignment need CHAIRMAN or MANAGEMENT', async () => {
    await http().post('/projects/plans/plan-A/approve').set('Authorization', empA()).expect(403);
    await http().post('/projects/project-assignments/asg-A/activate').set('Authorization', empA()).expect(403);
    expect(reached()).toBe(false);
    await http().post('/projects/plans/plan-A/approve').set('Authorization', chairA()).expect(201);
    expect(svc.approvePlan).toHaveBeenCalledWith('plan-A');
  });

  it('formal delivery records the authenticated actor, not "system" or a company id', async () => {
    await http().post('/delivery/formal/prj-A/package').set('Authorization', chairA()).send({ summary: 's', deliverables: 'd' }).expect(201);
    expect(formal.packageDelivery).toHaveBeenCalledWith('prj-A', 'chair-A', 's', 'd');
    await http().post('/delivery/formal/deliveries/dlv-A/accept').set('Authorization', chairA()).expect(201);
    expect(formal.acceptDelivery).toHaveBeenCalledWith('dlv-A', 'chair-A');
  });
});

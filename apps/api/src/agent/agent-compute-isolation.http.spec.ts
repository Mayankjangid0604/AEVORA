import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentController } from './agent.controller';
import { AgentRuntimeService } from './agent-runtime.service';
import { WorkCycleService } from './work-cycle.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { ComputeController } from '../compute/compute.controller';
import { ComputeWorkerService } from '../compute/compute-worker.service';
import { TrainingJobService } from '../compute/training-job.service';

/** V14 slice 6: /agents and /compute were unscoped (cross-company reads, AI agent runs, job cancellation). */
describe('Agent and compute isolation over HTTP', () => {
  const SECRET = 'v14-agent-secret';
  let app: any;
  let jwt: JwtService;
  const agents: Record<string, { id: string; employee: { companyId: string } }> = {
    'ag-A': { id: 'ag-A', employee: { companyId: 'A' } }, 'ag-B': { id: 'ag-B', employee: { companyId: 'B' } },
  };
  const workers: Record<string, { id: string; companyId: string | null }> = {
    'w-A': { id: 'w-A', companyId: 'A' }, 'w-B': { id: 'w-B', companyId: 'B' }, 'w-shared': { id: 'w-shared', companyId: null },
  };
  const jobs: Record<string, { id: string; trainingRunId: string; trainingRun: { companyId: string } }> = {
    'j-A': { id: 'j-A', trainingRunId: 'run-A', trainingRun: { companyId: 'A' } }, 'j-B': { id: 'j-B', trainingRunId: 'run-B', trainingRun: { companyId: 'B' } },
  };
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.chairmanId === 'chair-A' && (!where.id || where.id === 'A') ? { id: 'A' } : null)) },
    agent: {
      findUnique: jest.fn(async ({ where }: any) => agents[where.id] ?? null),
      findMany: jest.fn(async ({ where }: any) => Object.values(agents).filter((a) => a.employee.companyId === where.employee.companyId)),
    },
    agentExecution: { findMany: jest.fn(async () => [{ id: 'exec-A' }]) },
    simulationEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    computeWorker: { findUnique: jest.fn(async ({ where }: any) => workers[where.id] ?? null) },
    trainingJob: { findUnique: jest.fn(async ({ where }: any) => jobs[where.id] ?? null) },
    trainingRun: { findMany: jest.fn(async ({ where }: any) => (where.companyId === 'A' ? [{ id: 'run-A' }] : [])) },
  };
  const runtime = { runAgent: jest.fn(async () => ({ ran: true })) };
  const cycles = { runWorkCycle: jest.fn(async () => ({ cycle: true })) };
  const scheduler = { getEligibleAgents: jest.fn(async () => Object.values(agents)) };
  const workerSvc = { getWorkers: jest.fn(async () => Object.values(workers)), getWorker: jest.fn(async (id: string) => workers[id]), heartbeat: jest.fn(async () => ({})), drain: jest.fn(async () => ({})), registerWorker: jest.fn(async (d: any) => d) };
  const jobSvc = { getJobs: jest.fn(async () => Object.values(jobs)), getJob: jest.fn(async (id: string) => jobs[id]), cancelJob: jest.fn(async () => ({})), getLogs: jest.fn(async () => ['log']) };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [AgentController, ComputeController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentRuntimeService, useValue: runtime },
        { provide: WorkCycleService, useValue: cycles },
        { provide: AgentSchedulerService, useValue: scheduler },
        { provide: ComputeWorkerService, useValue: workerSvc },
        { provide: TrainingJobService, useValue: jobSvc },
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
  const chairNone = () => `Bearer ${jwt.sign({ actorId: 'chair-none', actorRole: 'CHAIRMAN' })}`;

  it('agent list is company-scoped', async () => {
    const res = await http().get('/agents').set('Authorization', empA()).expect(200);
    expect(res.body.map((a: any) => a.id)).toEqual(['ag-A']);
  });

  it.each([['get', '/agents/ag-B'], ['get', '/agents/ag-B/executions'], ['post', '/agents/ag-B/run'], ['post', '/agents/ag-B/work-cycle'], ['get', '/agents/missing']])(
    '%s %s on another company (or missing) is 404 and runs nothing', async (method, path) => {
      await (http() as any)[method](path).set('Authorization', chairA()).expect(404);
      expect(runtime.runAgent).not.toHaveBeenCalled();
      expect(cycles.runWorkCycle).not.toHaveBeenCalled();
    });

  it('running an agent or a work cycle requires CHAIRMAN', async () => {
    await http().post('/agents/ag-A/run').set('Authorization', empA()).expect(403);
    await http().post('/agents/ag-A/work-cycle').set('Authorization', empA()).expect(403);
    await http().post('/agents/schedule-work-cycles').set('Authorization', empA()).send({}).expect(403);
    expect(runtime.runAgent).not.toHaveBeenCalled();
    await http().post('/agents/ag-A/run').set('Authorization', chairA()).expect(201);
    expect(runtime.runAgent).toHaveBeenCalledWith('ag-A');
  });

  it('schedule-work-cycles only schedules the caller company\'s agents', async () => {
    const res = await http().post('/agents/schedule-work-cycles').set('Authorization', chairA()).send({}).expect(201);
    expect(res.body).toEqual({ scheduled: 1 });
    expect(prisma.simulationEvent.create.mock.calls.map((c: any) => c[0].data.payload.agentId)).toEqual(['ag-A']);
  });

  it('a chairman with no company schedules nothing', async () => {
    await http().post('/agents/schedule-work-cycles').set('Authorization', chairNone()).send({}).expect(403);
    expect(prisma.simulationEvent.create).not.toHaveBeenCalled();
  });

  it('compute worker and job lists are company-scoped (shared workers hidden)', async () => {
    const w = await http().get('/compute/workers').set('Authorization', empA()).expect(200);
    expect(w.body.map((x: any) => x.id)).toEqual(['w-A']);
    const j = await http().get('/compute/jobs').set('Authorization', empA()).expect(200);
    expect(j.body.map((x: any) => x.id)).toEqual(['j-A']);
  });

  it.each([
    ['get', '/compute/workers/w-B'], ['get', '/compute/workers/w-shared'], ['post', '/compute/workers/w-B/drain'], ['post', '/compute/workers/w-B/heartbeat'],
    ['get', '/compute/jobs/j-B'], ['post', '/compute/jobs/j-B/cancel'], ['get', '/compute/jobs/j-B/logs'],
  ])('%s %s for another company is 404 and mutates nothing', async (method, path) => {
    await (http() as any)[method](path).set('Authorization', chairA()).send({}).expect(404);
    expect(workerSvc.drain).not.toHaveBeenCalled();
    expect(jobSvc.cancelJob).not.toHaveBeenCalled();
  });

  it('compute mutations need CHAIRMAN or SYSTEM; registration ignores a body companyId', async () => {
    await http().post('/compute/jobs/j-A/cancel').set('Authorization', empA()).expect(403);
    await http().post('/compute/workers/register').set('Authorization', chairA()).send({ type: 'gpu', companyId: 'B' }).expect(201);
    expect(workerSvc.registerWorker).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'A' }));
  });
});

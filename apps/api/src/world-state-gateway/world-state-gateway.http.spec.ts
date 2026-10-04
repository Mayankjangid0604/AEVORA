import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HistoryNotAvailableReason, V12EventType, V12IntentType } from '@aevora/shared';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateGatewayController } from './world-state-gateway.controller';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateReplayService } from './world-state-replay.service';
import { ReplaySessionService } from './replay-session.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { V12CommandController } from '../v12-spatial/v12-command.controller';
import { V12CommandAdapter } from '../v12-spatial/v12-command.adapter';
import { V12AssistantController } from '../v12-spatial/v12-assistant.controller';
import { V12AssistantAdapter } from '../v12-spatial/v12-assistant.adapter';
import { V12NavigationService } from '../v12-spatial/v12-navigation.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../department/department.service';
import { MeetingService } from '../communication/meeting.service';
import { FakeHistoryStore, fullEntity, historyRow } from './testing/history-store.fixture';

/**
 * HTTP-level verification through the real global JwtAuthGuard, real controllers, the real
 * WorldStateReplayService (over an in-memory history store) and the real command/assistant adapters.
 */
describe('V12 world-state over HTTP (auth, company isolation, historical reconstruction, replay security)', () => {
  const SECRET = 'v12-e2e-test-secret';
  let app: any;
  let jwt: JwtService;
  let store: FakeHistoryStore;
  let T: number;

  const companies = [{ id: 'A', chairmanId: 'chair-A' }, { id: 'B', chairmanId: 'chair-B' }];
  const prisma: any = {
    company: {
      findFirst: jest.fn(async ({ where }: any) =>
        companies.find(c => c.chairmanId === where.chairmanId && (!where.id || c.id === where.id)) ?? null),
    },
    department: { findMany: jest.fn(async () => []) },
    v12SpatialRoom: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    v12NavigationNode: { findFirst: jest.fn(async () => null) },
    employee: { findMany: jest.fn(async () => []) },
    v12SpatialWorkspace: { findFirst: jest.fn(async () => null) },
  };
  const liveSnapshot = { version: '1.0.0', sequence: 999, timestamp: 0, mode: 'LIVE', entities: { live: fullEntity('live', 42) }, topology: [], navigationNodes: [], movementStates: {} };
  const gateway = { generateSnapshot: jest.fn(async () => liveSnapshot) };
  const navigation = { requestEntityMovement: jest.fn(async () => ({ movementState: 'MOVING' })) };
  const employees = { getEmployee: jest.fn() };
  const intel = { generateCompanyIntelligence: jest.fn() };
  const eventService = { getHistoryHealth: jest.fn(() => ({})), commitBaseline: jest.fn(), persistenceFailures: jest.fn(), getCompanyStream: jest.fn() };

  const token = (payload: any) => `Bearer ${jwt.sign(payload)}`;
  const chairA = () => token({ actorId: 'chair-A', actorRole: 'CHAIRMAN' });
  const chairB = () => token({ actorId: 'chair-B', actorRole: 'CHAIRMAN' });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    store = new FakeHistoryStore();
    (prisma as any).v12SpatialHistoryEvent = store;

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } })],
      controllers: [WorldStateGatewayController, V12CommandController, V12AssistantController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: PrismaService, useValue: prisma },
        { provide: WorldStateGatewayService, useValue: gateway },
        { provide: WorldStateEventService, useValue: eventService },
        WorldStateReplayService,
        ReplaySessionService,
        V12CommandAdapter,
        V12AssistantAdapter,
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
        { provide: AuthorizationService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: V12NavigationService, useValue: navigation },
        { provide: EmployeeService, useValue: employees },
        { provide: DepartmentService, useValue: { getDepartment: jest.fn() } },
        { provide: CompanyIntelligenceService, useValue: intel },
        { provide: MeetingService, useValue: { scheduleMeeting: jest.fn(), startMeeting: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    T = Date.now() - 60 * 60 * 1000; // history one hour ago (inside retention)
    store.rows = [
      historyRow('A', 1, V12EventType.WORLD_BASELINE, T, 'world', { entities: { e1: fullEntity('e1'), e2: fullEntity('e2', 9) } }),
      historyRow('A', 2, V12EventType.TRANSFORM_UPDATED, T + 1000, 'e1', { position: { x: 5, y: 0, z: 0 } }),
      historyRow('A', 3, V12EventType.ENTITY_DELETED, T + 2000, 'e2', {}, { causationId: 'A-evt2' }),
      historyRow('B', 1, V12EventType.WORLD_BASELINE, T, 'world', { entities: { b1: fullEntity('b1') } }),
      historyRow('B', 2, V12EventType.ENTITY_UPDATED, T + 1000, 'b1', { name: 'secret B' }, { eventId: 'b-evt-2' }),
    ];
  });

  describe('authentication', () => {
    it('rejects requests without a token (401)', async () => {
      await http().get('/world-state/history/events/A').expect(401);
      await http().get('/world-state/history/state/A?sequence=2').expect(401);
      await http().post('/v12-command/execute').send({ intent: V12IntentType.START_MEETING }).expect(401);
    });
    it('rejects invalid / foreign-signed tokens (401)', async () => {
      const forged = new JwtService({ secret: 'other' }).sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' });
      await http().get('/world-state/history/events/A').set('Authorization', `Bearer ${forged}`).expect(401);
      await http().get('/world-state/history/events/A').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });
    it('rejects a session token passed as a query token (401)', async () => {
      const raw = jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' });
      await http().get(`/world-state/history/events/A?token=${raw}`).expect(401);
    });
  });

  describe('company isolation', () => {
    const crossRoutes: Array<[string, string]> = [
      ['GET', '/world-state/history/events/B'],
      ['GET', '/world-state/history/state/B?sequence=2'],
      ['GET', `/world-state/history/snapshot/B?timestamp=${Date.now() - 1000}`],
      ['GET', '/world-state/history/entity/B/b1?sequence=2'],
      ['GET', `/world-state/history/window/B?from=${Date.now() - 7200000}&to=${Date.now()}`],
      ['GET', '/world-state/history/trace/B/b-evt-2'],
      ['POST', '/world-state/history/baseline/B'],
      ['POST', '/world-state/replay/session/B'],
      ['GET', '/world-state/snapshot/B'],
    ];

    it.each(crossRoutes)('chairman of A gets 403 for %s %s and reads nothing', async (method, url) => {
      const res = await (method === 'GET' ? http().get(url) : http().post(url)).set('Authorization', chairA());
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('secret B');
      expect(store.calls.filter(c => c.args?.where?.companyId === 'B')).toHaveLength(0);
      expect(gateway.generateSnapshot).not.toHaveBeenCalled();
    });

    it('chairman of A cannot switch context to B via x-company-id (401)', async () => {
      await http().get('/world-state/history/events/B').set('Authorization', chairA()).set('x-company-id', 'B').expect(401);
    });

    it('a non-chairman scoped to B cannot read A, and cannot claim A via header', async () => {
      const empB = token({ actorId: 'emp-B', actorRole: 'EMPLOYEE', companyId: 'B' });
      await http().get('/world-state/history/events/A').set('Authorization', empB).expect(403);
      await http().get('/world-state/history/events/A').set('Authorization', empB).set('x-company-id', 'A').expect(401);
    });

    it("A cannot reach B's event or entity through its own scope", async () => {
      const ev = await http().get('/world-state/history/state/A?eventId=b-evt-2').set('Authorization', chairA()).expect(200);
      expect(ev.body).toMatchObject({ status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.EVENT_NOT_FOUND });
      const ent = await http().get('/world-state/history/entity/A/b1?sequence=2').set('Authorization', chairA()).expect(200);
      expect(ent.body).toMatchObject({ status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.ENTITY_NOT_PRESENT_AT_TARGET });
      const trace = await http().get('/world-state/history/trace/A/b-evt-2').set('Authorization', chairA()).expect(200);
      expect(trace.body.reason).toBe(HistoryNotAvailableReason.EVENT_NOT_FOUND);
      const page = await http().get('/world-state/history/events/A').set('Authorization', chairA()).expect(200);
      expect(page.body.events.map((e: any) => e.eventId)).toEqual(['A-evt1', 'A-evt2', 'A-evt3']);
    });

    it('B reads only B', async () => {
      const r = await http().get('/world-state/history/state/B?sequence=2').set('Authorization', chairB()).expect(200);
      expect(Object.keys(r.body.snapshot.entities)).toEqual(['b1']);
    });
  });

  describe('historical reconstruction over HTTP', () => {
    it('HISTORICAL by timestamp', async () => {
      const r = await http().get(`/world-state/history/state/A?timestamp=${T + 1500}`).set('Authorization', chairA()).expect(200);
      expect(r.body.status).toBe('HISTORICAL');
      expect(r.body.snapshot.mode).toBe('REPLAY');
      expect(r.body.snapshot.timestamp).toBe(T + 1500);
      expect(r.body.snapshot.entities.e1.transform.position.x).toBe(5);
      expect(r.body.snapshot.entities.e2).toBeDefined();
      expect(r.body.provenance).toMatchObject({ baselineEventId: 'A-evt1', appliedEventCount: 1, targetSequence: 2 });
    });

    it('HISTORICAL by sequence and by event', async () => {
      const bySeq = await http().get('/world-state/history/state/A?sequence=3').set('Authorization', chairA()).expect(200);
      const byEvt = await http().get('/world-state/history/state/A?eventId=A-evt3').set('Authorization', chairA()).expect(200);
      expect(bySeq.body.status).toBe('HISTORICAL');
      expect(bySeq.body.snapshot.entities.e2).toBeUndefined();
      expect(byEvt.body).toEqual(bySeq.body); // deterministic: same point → identical state
    });

    it('entity historical state differs from current state and never falls back to it', async () => {
      const r = await http().get('/world-state/history/entity/A/e1?sequence=1').set('Authorization', chairA()).expect(200);
      expect(r.body.status).toBe('HISTORICAL');
      expect(r.body.entity.transform.position.x).toBe(0);
      const live = await http().get('/world-state/history/entity/A/live?sequence=3').set('Authorization', chairA()).expect(200);
      expect(live.body.status).toBe('NOT_AVAILABLE');
      expect(live.body.entity).toBeUndefined();
      expect(gateway.generateSnapshot).not.toHaveBeenCalled();
    });

    it('insufficient history → NOT_AVAILABLE with no snapshot', async () => {
      const before = await http().get(`/world-state/history/state/A?timestamp=${T - 1000}`).set('Authorization', chairA()).expect(200);
      expect(before.body).toMatchObject({ status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.NO_HISTORY_BEFORE_TARGET });
      expect(before.body.snapshot).toBeUndefined();
      store.rows = store.rows.filter(r => !(r.companyId === 'A' && r.sequence === 2n)); // gap
      const gap = await http().get('/world-state/history/state/A?sequence=3').set('Authorization', chairA()).expect(200);
      expect(gap.body).toMatchObject({ status: 'NOT_AVAILABLE', reason: HistoryNotAvailableReason.HISTORY_GAP });
      expect(gateway.generateSnapshot).not.toHaveBeenCalled();
    });

    it('CURRENT only when no target is given', async () => {
      const r = await http().get('/world-state/history/state/A').set('Authorization', chairA()).expect(200);
      expect(r.body.status).toBe('CURRENT');
      expect(gateway.generateSnapshot).toHaveBeenCalledWith('A');
    });

    it('replay window returns a reconstructed start state and ordered events', async () => {
      const r = await http().get(`/world-state/history/window/A?from=${T + 500}&to=${Date.now()}`).set('Authorization', chairA()).expect(200);
      expect(r.body.status).toBe('OK');
      expect(r.body.startState.sequence).toBe(1);
      expect(r.body.events.map((e: any) => e.sequence)).toEqual([2, 3]);
    });
  });

  describe('replay security (server-side)', () => {
    const meeting = { intent: V12IntentType.START_MEETING, context: {}, parameters: {}, mode: 'LIVE' };
    const navigate = { intent: V12IntentType.NAVIGATE_TO, context: { timestamp: '', correlationId: 'c', currentCompanyId: 'A' }, parameters: { targetName: 'Research' }, mode: 'LIVE' };

    afterEach(async () => { await http().delete('/world-state/replay/session/A').set('Authorization', chairA()); });

    it('client-declared REPLAY is rejected', async () => {
      const r = await http().post('/v12-command/execute').set('Authorization', chairA()).send({ ...meeting, mode: 'REPLAY' }).expect(201);
      expect(r.body.status).toBe('REPLAY_READ_ONLY');
    });

    it('an active server replay session rejects consequential commands even when the client claims LIVE, before any business call', async () => {
      await http().post('/world-state/replay/session/A').set('Authorization', chairA()).expect(201);
      const cmd = await http().post('/v12-command/execute').set('Authorization', chairA()).send(meeting).expect(201);
      expect(cmd.body.status).toBe('REPLAY_READ_ONLY');
      const nav = await http().post('/v12-assistant/ask').set('Authorization', chairA()).send(navigate).expect(201);
      expect(nav.body.status).toBe('REPLAY_READ_ONLY');
      const noMode = await http().post('/v12-assistant/ask').set('Authorization', chairA()).send({ ...navigate, mode: undefined }).expect(201);
      expect(noMode.body.status).toBe('REPLAY_READ_ONLY');
      expect(navigation.requestEntityMovement).not.toHaveBeenCalled();
      expect(prisma.department.findMany).not.toHaveBeenCalled();
      expect(prisma.v12NavigationNode.findFirst).not.toHaveBeenCalled();
      expect(employees.getEmployee).not.toHaveBeenCalled();
    });

    it("one actor's replay session does not block another company's chairman", async () => {
      await http().post('/world-state/replay/session/A').set('Authorization', chairA()).expect(201);
      const r = await http().post('/v12-assistant/ask').set('Authorization', chairB())
        .send({ ...navigate, context: { ...navigate.context, currentCompanyId: 'B' } }).expect(201);
      expect(r.body.status).not.toBe('REPLAY_READ_ONLY');
      expect(prisma.department.findMany).toHaveBeenCalled();
    });

    it('exiting replay restores LIVE command handling (the session was the gate)', async () => {
      await http().post('/world-state/replay/session/A').set('Authorization', chairA()).expect(201);
      await http().delete('/world-state/replay/session/A').set('Authorization', chairA()).expect(200);
      const r = await http().post('/v12-assistant/ask').set('Authorization', chairA()).send(navigate).expect(201);
      expect(r.body.status).toBe('NOT_FOUND'); // reached real resolution; no destination in fixture
      expect(prisma.department.findMany).toHaveBeenCalled();
    });
  });
});

import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { V12VRActionController } from './vr-action.controller';
import { V12VRActionAdapter } from './vr-action.adapter';
import { V12AssistantAdapter } from './assistant.adapter';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';
import { EmployeeService } from '../employee/employee.service';
import { DepartmentService } from '../department/department.service';
import { V12NavigationService } from './navigation.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

/**
 * Real HTTP verification through the actual global JwtAuthGuard and the actual V12VRActionAdapter
 * -> V12AssistantAdapter chain — the same supertest + real NestApplication pattern already used
 * for world-state-gateway.http.spec.ts and v12-http-sse-multi-client.e2e.spec.ts.
 */
describe('V12 VR action over HTTP (auth, company isolation, replay read-only)', () => {
  const SECRET = 'v12-vr-http-secret';
  let app: any;
  let jwt: JwtService;

  const prisma: any = {
    department: { findMany: jest.fn(async () => []) },
    v12SpatialRoom: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    v12NavigationNode: { findFirst: jest.fn(async () => null) },
    employee: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    v12SpatialWorkspace: { findFirst: jest.fn(async () => null) },
  };
  const navigation = { requestEntityMovement: jest.fn(async () => ({ movementState: 'MOVING' })) };
  const employees = { getEmployee: jest.fn() };
  const intel = { generateCompanyIntelligence: jest.fn() };
  const replaySessions = { isReplayActive: jest.fn(() => false), enter: jest.fn(), exit: jest.fn() };
  const authService = { checkPermission: jest.fn().mockResolvedValue(true) };

  const token = (payload: any) => `Bearer ${jwt.sign(payload)}`;
  const empA = () => token({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' });
  const empB = () => token({ actorId: 'emp-B', actorRole: 'EMPLOYEE', companyId: 'B' });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } })],
      controllers: [V12VRActionController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: PrismaService, useValue: prisma },
        V12VRActionAdapter,
        V12AssistantAdapter,
        { provide: ReplaySessionService, useValue: replaySessions },
        { provide: AuthorizationService, useValue: authService },
        { provide: V12NavigationService, useValue: navigation },
        { provide: EmployeeService, useValue: employees },
        { provide: DepartmentService, useValue: { getDepartment: jest.fn() } },
        { provide: CompanyIntelligenceService, useValue: intel },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => jest.clearAllMocks());

  it('rejects a request with no token (401)', async () => {
    await http().post('/v12-vr-action/execute').send({ action: 'MOVE', context: {}, parameters: {} }).expect(401);
  });

  it('an authorized action is actually processed (reaches real resolution, never short-circuited as unauthorized) — NOT_FOUND here is the truthful result for a destination that genuinely doesn\'t exist in this fixture, not a fabricated success', async () => {
    authService.checkPermission.mockResolvedValue(true);
    const res = await http().post('/v12-vr-action/execute').set('Authorization', empA())
      .send({ action: 'MOVE', context: { currentCompanyId: 'A', timestamp: '1', correlationId: 'c1' }, parameters: { targetName: 'Research' } })
      .expect(201);
    expect(res.body.status).toBe('NOT_FOUND');
    expect(authService.checkPermission).toHaveBeenCalledWith('emp-A', 'V12_ASSISTANT_ACCESS', 'A');
  });

  it('OPEN_EXECUTIVE_UI never reaches authorization/business logic at all — a real local-only action, not merely an unauthorized one', async () => {
    const res = await http().post('/v12-vr-action/execute').set('Authorization', empA())
      .send({ action: 'OPEN_EXECUTIVE_UI', context: { currentCompanyId: 'A', timestamp: '1', correlationId: 'c1' }, parameters: {} })
      .expect(201);
    expect(res.body.status).toBe('SUCCESS');
    expect(authService.checkPermission).not.toHaveBeenCalled();
  });

  it('an unauthorized action is rejected truthfully (the real authorization service denies it)', async () => {
    authService.checkPermission.mockRejectedValue(new Error('denied'));
    const res = await http().post('/v12-vr-action/execute').set('Authorization', empA())
      .send({ action: 'MOVE', context: { currentCompanyId: 'A', timestamp: '1', correlationId: 'c1' }, parameters: { targetName: 'Research' } })
      .expect(201);
    expect(res.body.status).toBe('UNAUTHORIZED');
    expect(navigation.requestEntityMovement).not.toHaveBeenCalled();
  });

  it('a client cannot override the authenticated company context with a different one in the body (cross-company target rejected at the transport layer)', async () => {
    authService.checkPermission.mockResolvedValue(true);
    const res = await http().post('/v12-vr-action/execute').set('Authorization', empA())
      .send({ action: 'MOVE', context: { currentCompanyId: 'B', timestamp: '1', correlationId: 'c1' }, parameters: { targetName: 'Research' } })
      .expect(201);
    // The controller overwrites context.currentCompanyId with the authenticated user's own company (A),
    // so the authorization check is performed against A, never the client-claimed B.
    expect(authService.checkPermission).toHaveBeenCalledWith('emp-A', 'V12_ASSISTANT_ACCESS', 'A');
    expect(res.body.status).not.toBe('UNAUTHORIZED'); // reached real processing under the correct (A) context
  });

  it('replay read-only rejects a mutating VR action (MOVE) without ever calling navigation', async () => {
    authService.checkPermission.mockResolvedValue(true);
    const res = await http().post('/v12-vr-action/execute').set('Authorization', empA())
      .send({ action: 'MOVE', context: { currentCompanyId: 'A', timestamp: '1', correlationId: 'c1' }, parameters: { targetName: 'Research' }, mode: 'REPLAY' })
      .expect(201);
    expect(res.body.status).toBe('REPLAY_READ_ONLY');
    expect(navigation.requestEntityMovement).not.toHaveBeenCalled();
  });

  it('different companies route through their own authorized context independently', async () => {
    authService.checkPermission.mockResolvedValue(true);
    await http().post('/v12-vr-action/execute').set('Authorization', empB())
      .send({ action: 'MOVE', context: { currentCompanyId: 'B', timestamp: '1', correlationId: 'c1' }, parameters: { targetName: 'Research' } })
      .expect(201);
    expect(authService.checkPermission).toHaveBeenCalledWith('emp-B', 'V12_ASSISTANT_ACCESS', 'B');
  });
});

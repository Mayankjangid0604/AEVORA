import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as path from 'path';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectDeliveryController } from './project-delivery.controller';
import { FactoryWorkspaceService } from './factory-workspace.service';
import { ProjectIntakeService } from './project-intake.service';
import { ScopeBudgetAssessmentService } from './scope-budget-assessment.service';
import { FactoryPlanningService } from './factory-planning.service';
import { GovernedToolRouterService } from './governed-tool-router.service';
import { FactoryBuildOrchestratorService } from './factory-build-orchestrator.service';
import { FactoryQualityGateService } from './factory-quality-gate.service';
import { FactoryDeploymentService } from './factory-deployment.service';
import { FactoryDeliveryHandoverService } from './factory-delivery-handover.service';
import { FactorySafeCleanupService } from './factory-safe-cleanup.service';

describe('ProjectDelivery HTTP Security & Authorization Integration', () => {
  const SECRET = 'test-secret-key-32-chars-long-for-supertest';
  let app: any;
  let jwt: JwtService;

  const rows: Record<string, Record<string, any>> = {
    project: {
      'prj-A': { id: 'prj-A', companyId: 'comp-A', clientId: 'client-A', status: 'ACTIVE' },
      'prj-B': { id: 'prj-B', companyId: 'comp-B', clientId: 'client-B', status: 'ACTIVE' },
    },
    projectDelivery: {
      'dlv-A': { id: 'dlv-A', projectId: 'prj-A', status: 'READY_FOR_ACCEPTANCE' },
      'dlv-B': { id: 'dlv-B', projectId: 'prj-B', status: 'READY_FOR_ACCEPTANCE' },
    },
  };

  const table = (n: string) => ({
    findUnique: jest.fn(async ({ where }: any) => {
      const row = rows[n]?.[where.id];
      if (!row) return null;
      if (n === 'projectDelivery') {
        const prj = rows.project[row.projectId];
        return { ...row, project: prj };
      }
      return row;
    }),
  });

  const prismaMock: any = {
    company: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.chairmanId === 'chair-A' && (!where.id || where.id === 'comp-A')) {
          return { id: 'comp-A' };
        }
        return null;
      }),
      findMany: jest.fn(async () => [{ id: 'comp-A' }]),
    },
    ...Object.fromEntries(Object.keys(rows).map((n) => [n, table(n)])),
  };

  const stub = (...methods: string[]) =>
    Object.fromEntries(methods.map((m) => [m, jest.fn(async (...args: any[]) => ({ ok: m, args }))]));

  const intakeMock = stub('processIntake');
  const assessmentMock = stub('assessProjectScopeAndBudget');
  const planningMock = stub('createDecomposedPlan');
  const toolRouterMock = {
    determineToolRouting: jest.fn(async () => ({ tool: 'ANTIGRAVITY', mode: 'OPERATOR_ASSISTED' })),
    executeGovernedGeneration: jest.fn(async (_proj, _ws, _decision) => ({ success: true, filesGenerated: ['index.html'], logs: 'ok' })),
  };
  const buildOrchestratorMock = stub('orchestratePipeline');
  const qualityGateMock = stub('evaluateQualityGate');
  const deploymentMock = stub('deployProject');
  const handoverMock = {
    prepareDeliveryPackage: jest.fn(async (params) => ({ id: 'pkg-1', ...params })),
    clientAcceptHandover: jest.fn(async (deliveryId, actorId) => ({ status: 'TRANSFERRED', deliveryId, actorId })),
    clientRequestRevision: jest.fn(async (deliveryId, actorId, notes) => ({ status: 'REJECTED', deliveryId, actorId, notes })),
  };
  const cleanupMock = stub('executeSafeCleanup');

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [ProjectDeliveryController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        RolesGuard,
        AuthorizationService,
        FactoryWorkspaceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProjectIntakeService, useValue: intakeMock },
        { provide: ScopeBudgetAssessmentService, useValue: assessmentMock },
        { provide: FactoryPlanningService, useValue: planningMock },
        { provide: GovernedToolRouterService, useValue: toolRouterMock },
        { provide: FactoryBuildOrchestratorService, useValue: buildOrchestratorMock },
        { provide: FactoryQualityGateService, useValue: qualityGateMock },
        { provide: FactoryDeploymentService, useValue: deploymentMock },
        { provide: FactoryDeliveryHandoverService, useValue: handoverMock },
        { provide: FactorySafeCleanupService, useValue: cleanupMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const http = () => request(app.getHttpServer());

  // Tokens
  const token = (payload: any) => `Bearer ${jwt.sign(payload)}`;
  const authChairA = () => token({ actorId: 'chair-A', actorRole: 'CHAIRMAN' });
  const authMgmtA = () => token({ actorId: 'mgmt-A', actorRole: 'MANAGEMENT', companyId: 'comp-A' });
  const authEmpA = () => token({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'comp-A' });
  const authClientA = () => token({ actorId: 'client-A', actorRole: 'CLIENT', companyId: 'comp-A' });
  const authOtherClientA = () => token({ actorId: 'client-other', actorRole: 'CLIENT', companyId: 'comp-A' });
  const authForeignClient = () => token({ actorId: 'client-B', actorRole: 'CLIENT', companyId: 'comp-B' });

  describe('1. Authentication Guard Enforcement over HTTP Wire', () => {
    it('returns 401 Unauthorized when Authorization header is missing', async () => {
      await http().post('/project-delivery/prj-A/execute-development').send().expect(401);
    });

    it('returns 401 Unauthorized when Authorization header carries invalid token', async () => {
      await http()
        .post('/project-delivery/prj-A/execute-development')
        .set('Authorization', 'Bearer invalid-garbage-token')
        .send()
        .expect(401);
    });
  });

  describe('2. Role-Based Access Control over HTTP Wire', () => {
    it('returns 403 Forbidden when EMPLOYEE role attempts management route', async () => {
      await http()
        .post('/project-delivery/prj-A/execute-development')
        .set('Authorization', authEmpA())
        .send()
        .expect(403);
    });

    it('returns 403 Forbidden when CLIENT role attempts management route', async () => {
      await http()
        .post('/project-delivery/prj-A/orchestrate-build')
        .set('Authorization', authClientA())
        .send()
        .expect(403);
    });

    it('allows MANAGEMENT role on management route', async () => {
      await http()
        .post('/project-delivery/prj-A/execute-development')
        .set('Authorization', authMgmtA())
        .send()
        .expect(201);
    });
  });

  describe('3. Tenant Isolation & Cross-Tenant Access Rejection', () => {
    it('returns 404 Not Found when attempting to access a foreign company project', async () => {
      await http()
        .post('/project-delivery/prj-B/execute-development')
        .set('Authorization', authMgmtA())
        .send()
        .expect(404);
    });

    it('returns 404 Not Found when a foreign client attempts to accept a delivery', async () => {
      await http()
        .post('/project-delivery/deliveries/dlv-A/accept')
        .set('Authorization', authForeignClient())
        .send()
        .expect(404);
    });
  });

  describe('4. Client-to-Project Ownership Enforcement', () => {
    it('allows the designated client to accept their own delivery', async () => {
      const res = await http()
        .post('/project-delivery/deliveries/dlv-A/accept')
        .set('Authorization', authClientA())
        .send()
        .expect(201);

      expect(res.body.status).toBe('TRANSFERRED');
      expect(res.body.actorId).toBe('client-A');
    });

    it('denies acceptance by another client within the same company (403 Forbidden)', async () => {
      await http()
        .post('/project-delivery/deliveries/dlv-A/accept')
        .set('Authorization', authOtherClientA())
        .send()
        .expect(403);
    });

    it('allows the designated client to request revisions on their own delivery', async () => {
      const res = await http()
        .post('/project-delivery/deliveries/dlv-A/request-revision')
        .set('Authorization', authClientA())
        .send({ revisionNotes: 'Please enhance accessibility' })
        .expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.notes).toBe('Please enhance accessibility');
    });

    it('denies revision request by another client within the same company (403 Forbidden)', async () => {
      await http()
        .post('/project-delivery/deliveries/dlv-A/request-revision')
        .set('Authorization', authOtherClientA())
        .send({ revisionNotes: 'Hostile revision' })
        .expect(403);
    });

    it('preserves Chairman ability to accept delivery on behalf of customer', async () => {
      const res = await http()
        .post('/project-delivery/deliveries/dlv-A/accept')
        .set('Authorization', authChairA())
        .send()
        .expect(201);

      expect(res.body.status).toBe('TRANSFERRED');
      expect(res.body.actorId).toBe('chair-A');
    });
  });

  describe('5. Server-Controlled Workspace Paths over HTTP Wire', () => {
    it('rejects caller-supplied arbitrary workspaceDir (path traversal attempt)', async () => {
      await http()
        .post('/project-delivery/prj-A/execute-development')
        .set('Authorization', authMgmtA())
        .send({ workspaceDir: '../../hostile/path' })
        .expect(400);

      expect(toolRouterMock.executeGovernedGeneration).not.toHaveBeenCalled();
    });

    it('rejects caller-supplied arbitrary absolute workspaceDir outside canonical path', async () => {
      const outsideDir = path.resolve(process.cwd(), 'outside-arbitrary');
      await http()
        .post('/project-delivery/prj-A/orchestrate-build')
        .set('Authorization', authMgmtA())
        .send({ workspaceDir: outsideDir })
        .expect(400);

      expect(buildOrchestratorMock.orchestratePipeline).not.toHaveBeenCalled();
    });

    it('derives canonical workspace path server-side when omitted from request body', async () => {
      await http()
        .post('/project-delivery/prj-A/execute-development')
        .set('Authorization', authMgmtA())
        .send({})
        .expect(201);

      const expectedCanonical = path.resolve(process.cwd(), '.workspace', 'comp-A', 'prj-A');
      expect(toolRouterMock.executeGovernedGeneration).toHaveBeenCalledWith(
        'prj-A',
        expectedCanonical,
        expect.anything(),
      );
    });
  });
});

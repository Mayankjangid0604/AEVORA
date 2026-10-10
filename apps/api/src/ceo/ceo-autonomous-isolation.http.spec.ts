import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoController } from './ceo.controller';
import { CeoAutonomousService } from './ceo-autonomous.service';
import { CeoReviewService } from './ceo-review.service';
import { WeeklyReportService } from './weekly-report.service';
import { CeoDialogueService } from './ceo-dialogue.service';
import { ProjectStaffingService } from './project-staffing.service';
import { CeoOperatingService } from './ceo-operating.service';
import { CeoBudgetService } from './ceo-budget.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { CeoStrategicPlanningService } from './ceo-strategic-planning.service';
import { CeoPerformanceService } from './ceo-performance.service';
import { CeoSuccessionService } from './ceo-succession.service';

describe('Autonomous CEO HTTP & Tenant Isolation (V16 Slice 2)', () => {
  const SECRET = 'v16-ceo-isolation-secret';
  let app: any;
  let jwt: JwtService;

  const mockAutonomousService = {
    assembleContext: jest.fn(async (companyId: string) => ({
      companyId,
      resources: { headcount: companyId === 'comp-A' ? 25 : 5 },
      uncertaintyContext: { hasDiscrepancy: false, unresolvedDiscrepancies: [] },
    })),
    detectProactiveSignals: jest.fn(async (companyId: string) => [
      {
        id: `sig_${companyId}`,
        companyId,
        dimension: 'PROBLEMS',
        title: `Signals for ${companyId}`,
        severity: 'MEDIUM',
      },
    ]),
    runV16AutonomousLoop: jest.fn(async (companyId: string, ceoId: string) => ({
      companyId,
      ceoId,
      signalsDetected: 2,
      formulatedDecisions: [],
    })),
    traceObjectiveLineage: jest.fn(async (companyId: string, taskId: string) => {
      if (companyId === 'comp-A' && taskId === 'task-A') {
        return { taskId, isAlignedToStrategy: true, chain: [{ level: 'TASK', id: 'task-A' }] };
      }
      return null;
    }),
    replanObjective: jest.fn(async (companyId: string, ceoId: string, objectiveId: string) => ({
      objectiveId,
      replanRequired: true,
      newStatus: 'AT_RISK',
    })),
    reviewDecisionOutcome: jest.fn(async (companyId: string, decisionId: string) => ({
      decisionId,
      success: true,
      memoryRecorded: true,
    })),
    evaluateChairmanDirective: jest.fn(async (companyId: string, ceoId: string, directive: string) => ({
      directive,
      decisionAuthority: 'CHAIRMAN',
      requiresCommandDecision: true,
    })),
    analyzeConsequences: jest.fn(async (params: any) => ({
      companyId: params.companyId,
      overallSeverity: 'MEDIUM',
      directConsequences: [{ dimension: 'FINANCIAL_IMPACT' }],
    })),
    generateChairmanDecisionBrief: jest.fn(async (companyId: string, decisionId: string) => ({
      decisionId,
      companyId,
      briefTitle: `Executive Brief: ${decisionId}`,
    })),
    compareDisagreementConsequences: jest.fn(async (companyId: string, ceoId: string, directive: string, alternative: string) => ({
      companyId,
      directive,
      decisionAuthority: 'CHAIRMAN',
    })),
  };

  const mockPrisma = {
    company: {
      findFirst: jest.fn(async ({ where }) => ({
        id: where.id,
        chairmanId: where.chairmanId,
        name: 'Company Corp',
      })),
    },
    employee: {
      findFirst: jest.fn(async ({ where }) => ({
        id: `ceo_${where.companyId}`,
        companyId: where.companyId,
        name: 'CEO',
        role: { title: 'CEO' },
      })),
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    jwt = new JwtService({ secret: SECRET });

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [CeoController],
      providers: [
        { provide: CeoAutonomousService, useValue: mockAutonomousService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CeoReviewService, useValue: {} },
        { provide: WeeklyReportService, useValue: {} },
        { provide: CeoDialogueService, useValue: {} },
        { provide: ProjectStaffingService, useValue: {} },
        { provide: CeoOperatingService, useValue: {} },
        { provide: CeoBudgetService, useValue: {} },
        { provide: CeoFinancialAuthorityService, useValue: {} },
        { provide: CeoStrategicPlanningService, useValue: {} },
        { provide: CeoPerformanceService, useValue: {} },
        { provide: CeoSuccessionService, useValue: {} },
        { provide: AuthorizationService, useValue: { assertResourceAccess: jest.fn() } },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function token(companyId: string, actorRole: string, actorId = 'actor-1') {
    return jwt.sign({ companyId, actorRole, role: actorRole, actorId, sub: actorId });
  }


  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer()).get('/ceo/context').expect(401);
  });

  it('rejects standard EMPLOYEE role with 403 Forbidden', async () => {
    const t = token('comp-A', 'EMPLOYEE');
    await request(app.getHttpServer())
      .get('/ceo/context')
      .set('Authorization', `Bearer ${t}`)
      .set('x-company-id', 'comp-A')
      .expect(403);
  });

  it('permits MANAGEMENT / CHAIRMAN of Company A to retrieve Company A context', async () => {
    const t = token('comp-A', 'MANAGEMENT');
    const res = await request(app.getHttpServer())
      .get('/ceo/context')
      .set('Authorization', `Bearer ${t}`)
      .set('x-company-id', 'comp-A')
      .expect(200);

    expect(res.body.companyId).toBe('comp-A');
    expect(res.body.resources.headcount).toBe(25);
    expect(mockAutonomousService.assembleContext).toHaveBeenCalledWith('comp-A');
  });

  it('strictly scopes proactive signals to authenticated company', async () => {
    const tB = token('comp-B', 'CHAIRMAN');
    const res = await request(app.getHttpServer())
      .get('/ceo/proactive-signals')
      .set('Authorization', `Bearer ${tB}`)
      .set('x-company-id', 'comp-B')
      .expect(200);

    expect(res.body[0].companyId).toBe('comp-B');
    expect(mockAutonomousService.detectProactiveSignals).toHaveBeenCalledWith('comp-B');
  });

  it('executes V16 autonomous loop for the authenticated company CEO', async () => {
    const t = token('comp-A', 'CHAIRMAN');
    const res = await request(app.getHttpServer())
      .post('/ceo/run-autonomous-loop')
      .set('Authorization', `Bearer ${t}`)
      .set('x-company-id', 'comp-A')
      .expect(201);

    expect(res.body.companyId).toBe('comp-A');
    expect(mockAutonomousService.runV16AutonomousLoop).toHaveBeenCalledWith('comp-A', 'ceo_comp-A');
  });

  it('traces objective lineage within the authenticated company boundary', async () => {
    const tA = token('comp-A', 'MANAGEMENT');
    const resA = await request(app.getHttpServer())
      .get('/ceo/objective-lineage/task-A')
      .set('Authorization', `Bearer ${tA}`)
      .set('x-company-id', 'comp-A')
      .expect(200);

    expect(resA.body.taskId).toBe('task-A');
    expect(resA.body.isAlignedToStrategy).toBe(true);
  });

  it('runs consequence analysis scoped to authenticated company', async () => {
    const tA = token('comp-A', 'CHAIRMAN');
    const res = await request(app.getHttpServer())
      .post('/ceo/consequence-analysis')
      .set('Authorization', `Bearer ${tA}`)
      .set('x-company-id', 'comp-A')
      .send({ proposedAction: 'Test action', estimatedCost: 10000 })
      .expect(201);

    expect(res.body.companyId).toBe('comp-A');
    expect(res.body.overallSeverity).toBe('MEDIUM');
    expect(mockAutonomousService.analyzeConsequences).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'comp-A', ceoId: 'ceo_comp-A' })
    );
  });

  it('retrieves Chairman decision brief consuming consequence analysis', async () => {
    const tA = token('comp-A', 'CHAIRMAN');
    const res = await request(app.getHttpServer())
      .get('/ceo/decision-brief/dec-123')
      .set('Authorization', `Bearer ${tA}`)
      .set('x-company-id', 'comp-A')
      .expect(200);

    expect(res.body.decisionId).toBe('dec-123');
    expect(res.body.companyId).toBe('comp-A');
    expect(mockAutonomousService.generateChairmanDecisionBrief).toHaveBeenCalledWith('comp-A', 'dec-123');
  });

  it('runs disagreement consequence comparison scoped to company', async () => {
    const tA = token('comp-A', 'CHAIRMAN');
    const res = await request(app.getHttpServer())
      .post('/ceo/disagreement-consequences')
      .set('Authorization', `Bearer ${tA}`)
      .set('x-company-id', 'comp-A')
      .send({ directive: 'Directive A', alternative: 'Alternative A' })
      .expect(201);

    expect(res.body.companyId).toBe('comp-A');
    expect(res.body.decisionAuthority).toBe('CHAIRMAN');
    expect(mockAutonomousService.compareDisagreementConsequences).toHaveBeenCalledWith(
      'comp-A',
      'ceo_comp-A',
      'Directive A',
      'Alternative A'
    );
  });
});

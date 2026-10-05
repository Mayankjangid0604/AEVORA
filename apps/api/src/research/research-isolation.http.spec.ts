import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchController } from './controllers/research.controller';
import { ResearchProposalService } from './services/research-proposal.service';
import { ResearchProjectService } from './services/research-project.service';
import { DatasetService } from './services/dataset.service';
import { ModelRegistryService } from './services/model-registry.service';
import { ExperimentService } from './services/experiment.service';
import { EvaluationService } from './services/evaluation.service';
import { SafetyEvaluationService } from './services/safety-evaluation.service';
import { InferenceService } from './services/inference.service';
import { ImprovementObservationService } from './services/improvement-observation.service';
import { ResearchPlanningService } from './services/research-planning.service';
import { EvaluationComparisonService } from './services/evaluation-comparison.service';

/** V14 closure: research improvement steps and inference are bound to the caller's company. */
describe('Research isolation (V14 closure)', () => {
  const SECRET = 'v14-research-secret';
  let app: any;
  let jwt: JwtService;
  const rows: Record<string, Record<string, { companyId: string | null }>> = {
    improvementSignal: { 'sig-A': { companyId: 'A' }, 'sig-B': { companyId: 'B' } },
    researchHypothesis: { 'hyp-A': { companyId: 'A' }, 'hyp-B': { companyId: 'B' } },
    experimentPlan: { 'plan-A': { companyId: 'A' }, 'plan-B': { companyId: 'B' }, 'plan-null': { companyId: null } },
  };
  const table = (n: string) => ({ findUnique: jest.fn(async ({ where }: any) => rows[n]![where.id] ?? null) });
  const deployments: Record<string, any> = {
    'dep-B': { id: 'dep-B', status: 'ACTIVE', modelVersion: { id: 'mv-B', companyId: 'B', status: 'PRODUCTION', artifactRef: 'x' } },
  };
  const prisma: any = {
    company: { findFirst: jest.fn(async () => null) },
    improvementSignal: table('improvementSignal'),
    researchHypothesis: table('researchHypothesis'),
    experimentPlan: table('experimentPlan'),
    limitedDeployment: { findUnique: jest.fn(async ({ where }: any) => deployments[where.id] ?? null) },
    inferenceLog: { create: jest.fn(async () => ({})) },
  };
  const planning = { createHypothesisFromSignal: jest.fn(async () => ({})), createProposalFromHypothesis: jest.fn(async () => ({})) };
  const comparison = { compareCandidateToBaseline: jest.fn(async () => ({})) };
  const runtime = { executeInference: jest.fn(async () => ['secret-B-prediction']) };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const stubs = [ResearchProposalService, ResearchProjectService, DatasetService, ModelRegistryService, ExperimentService,
      EvaluationService, SafetyEvaluationService, ImprovementObservationService].map(t => ({ provide: t, useValue: {} }));
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [ResearchController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResearchPlanningService, useValue: planning },
        { provide: EvaluationComparisonService, useValue: comparison },
        { provide: InferenceService, useFactory: () => new InferenceService(prisma, runtime as any, {} as any) },
        ...stubs,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const http = () => request(app.getHttpServer());
  const empA = () => `Bearer ${jwt.sign({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' })}`;

  it.each([
    ['improvement/hypotheses/sig-B'],
    ['improvement/proposals/hyp-B'],
    ['improvement/comparisons/plan-B'],
    ['improvement/comparisons/plan-null'],
    ['improvement/hypotheses/does-not-exist'],
  ])('POST /chairman/research/%s on another company (or unowned row) is 404', async (route) => {
    await http().post(`/chairman/research/${route}`).set('Authorization', empA()).expect(404);
    expect(planning.createHypothesisFromSignal).not.toHaveBeenCalled();
    expect(planning.createProposalFromHypothesis).not.toHaveBeenCalled();
    expect(comparison.compareCandidateToBaseline).not.toHaveBeenCalled();
  });

  it('own-company improvement steps keep the existing research roles (EMPLOYEE allowed, as before)', async () => {
    await http().post('/chairman/research/improvement/hypotheses/sig-A').set('Authorization', empA()).expect(201);
    expect(planning.createHypothesisFromSignal).toHaveBeenCalledWith('sig-A', 'emp-A');
    await http().post('/chairman/research/improvement/proposals/hyp-A').set('Authorization', empA()).expect(201);
    await http().post('/chairman/research/improvement/comparisons/plan-A').set('Authorization', empA()).expect(201);
  });

  it('inference on another company deployment is indistinguishable from a missing one and never runs', async () => {
    const foreign = await http().post('/chairman/research/inference').set('Authorization', empA()).send({ deploymentId: 'dep-B', payload: {} });
    const missing = await http().post('/chairman/research/inference').set('Authorization', empA()).send({ deploymentId: 'nope', payload: {} });
    expect(foreign.status).toBe(400);
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body.message).toBe(missing.body.message);
    expect(runtime.executeInference).not.toHaveBeenCalled();
    expect(prisma.inferenceLog.create).not.toHaveBeenCalled();
  });
});

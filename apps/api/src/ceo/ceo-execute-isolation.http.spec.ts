import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoController } from './ceo.controller';
import { CeoReviewService } from './ceo-review.service';
import { WeeklyReportService } from './weekly-report.service';
import { CeoDialogueService } from './ceo-dialogue.service';
import { ProjectStaffingService } from './project-staffing.service';
import { CeoOperatingService } from './ceo-operating.service';
import { CeoAutonomousService } from './ceo-autonomous.service';
import { CeoBudgetService } from './ceo-budget.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { CeoStrategicPlanningService } from './ceo-strategic-planning.service';
import { CeoPerformanceService } from './ceo-performance.service';
import { CeoSuccessionService } from './ceo-succession.service';

/** V14 closure: CEO execution is company-bound and Chairman-only; routes acting as the AI CEO exclude EMPLOYEE. */
describe('CEO route authorization (V14 closure)', () => {
  const SECRET = 'v14-ceo-exec-secret';
  let app: any;
  let jwt: JwtService;
  const decisions = [{ id: 'dec-A', companyId: 'A' }, { id: 'dec-B', companyId: 'B' }];
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.chairmanId === 'chair-A' && (!where.id || where.id === 'A') ? { id: 'A' } : null)) },
    employee: { findFirst: jest.fn(async () => ({ id: 'ceo-A' })) },
    ceoAutonomousDecision: { findUnique: jest.fn(async ({ where }: any) => decisions.find(d => d.id === where.id) ?? null) },
  };
  const autonomous = { executeDecision: jest.fn(async (id: string) => ({ executed: id })) };
  const strategic = { createPlan: jest.fn(async () => ({})), createObjective: jest.fn(async () => ({})), createStrategicRisk: jest.fn(async () => ({})) };
  const budget = { createReservation: jest.fn(async () => ({})) };
  const financeAuth = { checkFinancialAuthority: jest.fn(async () => ({ allowed: false })) };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const stubs = [CeoReviewService, WeeklyReportService, CeoDialogueService, ProjectStaffingService, CeoOperatingService,
      CeoPerformanceService, CeoSuccessionService].map(t => ({ provide: t, useValue: {} }));
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [CeoController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CeoAutonomousService, useValue: autonomous },
        { provide: CeoStrategicPlanningService, useValue: strategic },
        { provide: CeoBudgetService, useValue: budget },
        { provide: CeoFinancialAuthorityService, useValue: financeAuth },
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
  const chairA = () => `Bearer ${jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' })}`;
  const mgmtA = () => `Bearer ${jwt.sign({ actorId: 'mgr-A', actorRole: 'MANAGEMENT', companyId: 'A' })}`;
  const empA = () => `Bearer ${jwt.sign({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' })}`;

  it("another company's decision is invisible (404) and never executed", async () => {
    await http().post('/ceo/autonomous-decisions/dec-B/execute').set('Authorization', chairA()).expect(404);
    expect(autonomous.executeDecision).not.toHaveBeenCalled();
  });

  it('only the Chairman may execute an autonomous decision (same gate as approve/reject/run)', async () => {
    await http().post('/ceo/autonomous-decisions/dec-A/execute').set('Authorization', empA()).expect(403);
    await http().post('/ceo/autonomous-decisions/dec-A/execute').set('Authorization', mgmtA()).expect(403);
    expect(autonomous.executeDecision).not.toHaveBeenCalled();
    await http().post('/ceo/autonomous-decisions/dec-A/execute').set('Authorization', chairA()).expect(201);
    expect(autonomous.executeDecision).toHaveBeenCalledWith('dec-A', false);
  });

  it.each([
    ['strategy/plans', () => strategic.createPlan],
    ['strategy/objectives', () => strategic.createObjective],
    ['strategy/risks', () => strategic.createStrategicRisk],
    ['budgets/department/dep-A/reservation', () => budget.createReservation],
  ])('POST /ceo/%s records the AI CEO as actor: EMPLOYEE 403, MANAGEMENT and CHAIRMAN pass', async (route, fn) => {
    await http().post(`/ceo/${route}`).set('Authorization', empA()).send({}).expect(403);
    expect(fn()).not.toHaveBeenCalled();
    await http().post(`/ceo/${route}`).set('Authorization', mgmtA()).send({}).expect(201);
    await http().post(`/ceo/${route}`).set('Authorization', chairA()).send({}).expect(201);
  });

  it('read-only financial-authority/check stays open to company members', async () => {
    await http().post('/ceo/financial-authority/check').set('Authorization', empA()).send({}).expect(201);
    expect(financeAuth.checkFinancialAuthority).toHaveBeenCalled();
  });
});

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

/** V14 closure: POST /ceo/autonomous-decisions/:id/execute must not execute another company's decision. */
describe('CEO autonomous-decision execute isolation', () => {
  const SECRET = 'v14-ceo-exec-secret';
  let app: any;
  let jwt: JwtService;
  const decisions = [{ id: 'dec-A', companyId: 'A' }, { id: 'dec-B', companyId: 'B' }];
  const prisma: any = {
    company: { findFirst: jest.fn(async ({ where }: any) => (where.chairmanId === 'chair-A' && (!where.id || where.id === 'A') ? { id: 'A' } : null)) },
    ceoAutonomousDecision: { findUnique: jest.fn(async ({ where }: any) => decisions.find(d => d.id === where.id) ?? null) },
  };
  const autonomous = { executeDecision: jest.fn(async (id: string) => ({ executed: id })) };

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const stubs = [CeoReviewService, WeeklyReportService, CeoDialogueService, ProjectStaffingService, CeoOperatingService, CeoBudgetService,
      CeoFinancialAuthorityService, CeoStrategicPlanningService, CeoPerformanceService, CeoSuccessionService].map(t => ({ provide: t, useValue: {} }));
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [CeoController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard }, RolesGuard, AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CeoAutonomousService, useValue: autonomous },
        ...stubs,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app?.close());

  const chairA = () => `Bearer ${jwt.sign({ actorId: 'chair-A', actorRole: 'CHAIRMAN' })}`;
  const empA = () => `Bearer ${jwt.sign({ actorId: 'emp-A', actorRole: 'EMPLOYEE', companyId: 'A' })}`;

  it('another company\'s decision is invisible (404) and never executed', async () => {
    for (const auth of [chairA(), empA()]) {
      await request(app.getHttpServer()).post('/ceo/autonomous-decisions/dec-B/execute').set('Authorization', auth).expect(404);
    }
    expect(autonomous.executeDecision).not.toHaveBeenCalled();
  });

  it('own company decision still reaches the service', async () => {
    await request(app.getHttpServer()).post('/ceo/autonomous-decisions/dec-A/execute').set('Authorization', chairA()).expect(201);
    expect(autonomous.executeDecision).toHaveBeenCalledWith('dec-A', false);
  });
});

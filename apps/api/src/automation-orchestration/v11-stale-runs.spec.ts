import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';
import { AeObjectiveStatus } from '@prisma/client';

describe('V11 Enterprise Orchestrator - Stale Runs (e2e)', () => {
  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseOrchestratorService,
        {
          provide: PrismaService,
          useValue: {
            escalationRecord: { create: jest.fn() },
            aeAuditEvent: { create: jest.fn() },
            $transaction: jest.fn(async function(arg) { if (Array.isArray(arg)) return Promise.all(arg); return arg(this); }),
            aeEnterpriseObjective: { findMany: jest.fn(), update: jest.fn() },
            employee: { findFirst: jest.fn().mockResolvedValue({ id: "ceo-1", companyId: "comp-1" }) },
            goal: { findFirst: jest.fn() },
          },
        },
        {
          provide: CeoStrategicPlanningService,
          useValue: { createPlan: jest.fn(), createObjective: jest.fn() },
        },
        {
          provide: ContinuousImprovementService,
          useValue: { detectImprovementOpportunities: jest.fn() },
        },
        {
          provide: OutcomeService,
          useValue: { recordOutcome: jest.fn() }
        }
      ],
    }).compile();

    service = module.get<EnterpriseOrchestratorService>(EnterpriseOrchestratorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should timeout stale objective runs and fail them permanently', async () => {
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', status: AeObjectiveStatus.RUNNING, domainRefs: { goalId: 'goal-1' } } as any
    ]);

    jest.spyOn(prisma.goal, 'findFirst').mockResolvedValue({
      id: 'goal-1', companyId: 'comp-1', status: 'IN_PROGRESS', updatedAt: oldDate
    } as any);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: {
        status: AeObjectiveStatus.FAILED,
        failureClass: 'PERMANENT_FAILURE',
        failureReason: 'STALE_RUN_TIMEOUT'
      }
    });
  });
});

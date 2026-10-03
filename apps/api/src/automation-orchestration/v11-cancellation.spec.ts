import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';
import { AeObjectiveStatus } from '@prisma/client';

describe('V11 Enterprise Orchestrator - Cancellation (e2e)', () => {
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
            $transaction: jest.fn(async function(arg) { if (Array.isArray(arg)) return Promise.all(arg); return arg(this); }),
            aeEnterpriseObjective: { findMany: jest.fn(), update: jest.fn() },
            employee: { findFirst: jest.fn().mockResolvedValue({ id: "ceo-1", companyId: "comp-1" }) },
            goal: { findFirst: jest.fn(), updateMany: jest.fn() },
            aeAuditEvent: { create: jest.fn() }
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

  it('should abort active goals when an objective is cancelled', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', status: AeObjectiveStatus.CANCELLED, domainRefs: { goalId: 'goal-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', companyId: 'comp-1', status: { not: 'COMPLETED' } },
      data: { status: 'FAILED' }
    });

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { domainRefs: {} }
    });
  });
});

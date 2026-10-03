import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - Multi-Company Isolation (e2e)', () => {
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
            goal: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
            companyObjective: { updateMany: jest.fn() },
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

  it('should not allow Company A objective to update Company B goal in verification', async () => {
    // Maliciously injected goalId from Company B into Company A's refs
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-A', companyId: 'comp-A', title: 'Test Obj', status: AeObjectiveStatus.VERIFYING, domainRefs: { companyObjectiveId: 'comp-obj-B' } } as any
    ]);

    // We must ensure the service verifies companyId. Since we didn't add it yet, this test will fail if we expect it to throw or not call.
    // Wait, the orchestrator directly updates `refs.companyObjectiveId` without checking if it belongs to comp-A.
    // We need to fix the service first.

    await service.handleEnterpriseLoop();

    // With isolation, it should either fail to update or include companyId in the where clause
    expect(prisma.companyObjective.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'comp-obj-B', companyId: 'comp-A' })
      })
    );
  });

  it('should not allow Company A objective to read Company B goal in running', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-A', companyId: 'comp-A', title: 'Test Obj', status: AeObjectiveStatus.RUNNING, domainRefs: { goalId: 'goal-B' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.goal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'goal-B', companyId: 'comp-A' })
      })
    );
  });
});

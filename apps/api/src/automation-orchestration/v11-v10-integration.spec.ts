import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - V10 Integration (e2e)', () => {
  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;
  let continuousImprovement: ContinuousImprovementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseOrchestratorService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(async function(arg) { if (Array.isArray(arg)) return Promise.all(arg); return arg(this); }),
            aeEnterpriseObjective: { findMany: jest.fn(), update: jest.fn() },
            employee: { findFirst: jest.fn().mockResolvedValue({ id: "ceo-1", companyId: "comp-1" }) },
            goal: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
            companyObjective: { updateMany: jest.fn() },
            escalationRecord: { create: jest.fn() },
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
    continuousImprovement = module.get<ContinuousImprovementService>(ContinuousImprovementService);

    jest.spyOn(service as any, 'getCeo').mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger V10 improvement when objective successfully completes', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.VERIFYING, domainRefs: { companyObjectiveId: 'comp-obj-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(continuousImprovement.detectImprovementOpportunities).toHaveBeenCalledWith('comp-1');
  });

  it('should trigger V10 improvement when objective fails', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.FAILED, recoveryAttempts: 0, failureClass: 'PERMANENT_FAILURE', domainRefs: { goalId: 'goal-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(continuousImprovement.detectImprovementOpportunities).toHaveBeenCalledWith('comp-1');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - Outcome Measurement (e2e)', () => {
  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;
  let outcomeService: OutcomeService;

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
    outcomeService = module.get<OutcomeService>(OutcomeService);

    jest.spyOn(service as any, 'getCeo').mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should record outcome when objective completes', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', description: 'Expected Desc', status: AeObjectiveStatus.VERIFYING, domainRefs: { companyObjectiveId: 'comp-obj-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(outcomeService.recordOutcome).toHaveBeenCalledWith('obj-1', expect.objectContaining({
      result: 'COMPLETED',
      success: true,
      expectedOutcome: 'Expected Desc'
    }));
  });

  it('should record outcome when objective fails unrecoverably', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', description: 'Expected Desc', failureClass: 'AUTHORIZATION_FAILURE', status: AeObjectiveStatus.FAILED, recoveryAttempts: 0, domainRefs: {} } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(outcomeService.recordOutcome).toHaveBeenCalledWith('obj-1', expect.objectContaining({
      result: 'FAILED',
      success: false,
      expectedOutcome: 'Expected Desc'
    }));
  });
});

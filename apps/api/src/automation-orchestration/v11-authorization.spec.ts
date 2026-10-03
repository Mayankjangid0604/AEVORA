import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - Authorization Boundaries (e2e)', () => {
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
            goal: { create: jest.fn() },
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

  it('should not transition PLANNED to AUTHORIZED if not approvedBy', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.PLANNED, approvedBy: null } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).not.toHaveBeenCalled();
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });

  it('should transition PLANNED to AUTHORIZED if approvedBy is set', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.PLANNED, approvedBy: 'chairman' } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: expect.objectContaining({ status: AeObjectiveStatus.AUTHORIZED })
    });
  });
});

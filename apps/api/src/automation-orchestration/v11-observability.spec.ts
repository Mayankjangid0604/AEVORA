import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';
import { AeObjectiveStatus } from '@prisma/client';

describe('V11 Enterprise Orchestrator - Observability (e2e)', () => {
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
            goal: { findFirst: jest.fn() },
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

  it('should create an audit log when transitioning an objective', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', status: AeObjectiveStatus.PLANNED, approvedBy: 'ceo-1', domainRefs: {} } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'comp-1',
        actorId: 'V11_ORCHESTRATOR',
        action: 'AUTHORIZE_OBJECTIVE',
        objectType: 'AeEnterpriseObjective',
        objectId: 'obj-1'
      })
    });
  });
});

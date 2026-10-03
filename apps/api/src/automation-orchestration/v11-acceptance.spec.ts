import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus, GoalStatus } from '@prisma/client';

describe('V11 Enterprise Orchestrator (e2e)', () => {
  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;
  let ceoPlanning: CeoStrategicPlanningService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseOrchestratorService,
        {
          provide: PrismaService,
          useValue: {
            aeAuditEvent: { create: jest.fn() },
            aeEnterpriseObjective: {
              findMany: jest.fn(),
              update: jest.fn(),
            },
            goal: {
              findFirst: jest.fn(),
              updateMany: jest.fn(),
              create: jest.fn().mockResolvedValue({ id: 'goal-1' }),
              findMany: jest.fn(),
            },
            escalationRecord: {
              create: jest.fn(),
            },
            employee: {
              findFirst: jest.fn().mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' }),
            },
            companyObjective: {
              updateMany: jest.fn(),
            },
            $transaction: jest.fn(async function(arg) {
              if (Array.isArray(arg)) return Promise.all(arg);
              return arg(this);
            })
          },
        },
        {
          provide: ContinuousImprovementService,
          useValue: {
            detectImprovementOpportunities: jest.fn(),
          },
        },
        {
          provide: CeoStrategicPlanningService,
          useValue: {
            createPlan: jest.fn().mockResolvedValue({ id: 'plan-1' }),
            createObjective: jest.fn().mockResolvedValue({ id: 'comp-obj-1' }),
          },
        },
        {
          provide: OutcomeService,
          useValue: { recordOutcome: jest.fn() }
        }
      ],
    }).compile();

    service = module.get<EnterpriseOrchestratorService>(EnterpriseOrchestratorService);
    prisma = module.get<PrismaService>(PrismaService);
    ceoPlanning = module.get<CeoStrategicPlanningService>(CeoStrategicPlanningService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should transition DISCOVERED objective to PLANNED and create V3 CEO Plan', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.DISCOVERED, domainRefs: {} } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(ceoPlanning.createPlan).toHaveBeenCalled();
    expect(ceoPlanning.createObjective).toHaveBeenCalled();
    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { 
        status: AeObjectiveStatus.PLANNED, 
        domainRefs: expect.objectContaining({ strategicPlanId: 'plan-1', companyObjectiveId: 'comp-obj-1' }) 
      }
    });
  });

  it('should transition PLANNED objective to AUTHORIZED if approved', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.PLANNED, approvedBy: 'chairman-1', domainRefs: { companyObjectiveId: 'comp-obj-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: expect.objectContaining({ status: AeObjectiveStatus.AUTHORIZED })
    });
  });

  it('should transition AUTHORIZED objective to DISPATCHED', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.AUTHORIZED, domainRefs: { companyObjectiveId: 'comp-obj-1' } } as any
    ]);
    jest.spyOn(prisma.goal, 'create').mockResolvedValue({ id: 'goal-1' } as any);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: expect.objectContaining({ status: AeObjectiveStatus.DISPATCHED })
    });
  });

  it('should mark objective as VERIFYING if all goals are COMPLETED', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.RUNNING, domainRefs: { companyObjectiveId: 'comp-obj-1', goalId: 'goal-1' } } as any
    ]);
    jest.spyOn(prisma.goal, 'findFirst').mockResolvedValue({ id: 'goal-1', status: 'COMPLETED' } as any);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.VERIFYING }
    });
  });

  it('should mark objective as COMPLETED if it is VERIFYING', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.VERIFYING, domainRefs: { companyObjectiveId: 'comp-obj-1', goalId: 'goal-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.companyObjective.updateMany).toHaveBeenCalledWith({
      where: { id: 'comp-obj-1', companyId: 'comp-1' },
      data: { status: 'COMPLETED', progress: 100 }
    });
    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.COMPLETED }
    });
  });

  it('should escalate and mark as FAILED if goal failed', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.RUNNING, domainRefs: { goalId: 'goal-1' } } as any
    ]);
    jest.spyOn(prisma.goal, 'findFirst').mockResolvedValue({ id: 'goal-1', status: 'FAILED' } as any);
    jest.spyOn(prisma.employee, 'findFirst').mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' } as any);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: expect.objectContaining({ status: AeObjectiveStatus.FAILED })
    });
  });
});

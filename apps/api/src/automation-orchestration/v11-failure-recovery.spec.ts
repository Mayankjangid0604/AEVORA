import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { AeObjectiveStatus, EscalationStatus } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - Failure Recovery (e2e)', () => {
  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;
  let ceoPlanning: CeoStrategicPlanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseOrchestratorService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(async function(arg) { if (Array.isArray(arg)) return Promise.all(arg); return arg(this); }),
            aeEnterpriseObjective: { findMany: jest.fn(), update: jest.fn() },
            employee: { findFirst: jest.fn().mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' }) },
            goal: { findFirst: jest.fn(), updateMany: jest.fn() },
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
    ceoPlanning = module.get<CeoStrategicPlanningService>(CeoStrategicPlanningService);

    jest.spyOn(service as any, 'getCeo').mockResolvedValue({ id: 'ceo-1', companyId: 'comp-1' } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should transition to RECOVERY_PENDING when goal fails and under max recovery attempts', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.FAILED, recoveryAttempts: 0, replanningAttempts: 0, failureClass: 'TRANSIENT_FAILURE' } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.RECOVERY_PENDING }
    });
  });

  it('should escalate to chairman on PERMANENT_FAILURE', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.FAILED, recoveryAttempts: 0, replanningAttempts: 0, failureClass: 'PERMANENT_FAILURE' } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.ESCALATED }
    });
    expect(prisma.escalationRecord.create).toHaveBeenCalled();
  });

  it('should transition to REPLANNING when recovery attempts exhausted', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.FAILED, recoveryAttempts: 3, replanningAttempts: 0, failureClass: 'TRANSIENT_FAILURE' } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.REPLANNING }
    });
  });

  it('should restart goal on RECOVERY_PENDING', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.RECOVERY_PENDING, recoveryAttempts: 0, domainRefs: { goalId: 'goal-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', companyId: 'comp-1' },
      data: { status: 'ACTIVE' }
    });
    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.RUNNING, recoveryAttempts: { increment: 1 } }
    });
    expect(prisma.aeAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RECOVERY_ATTEMPT' })
    }));
  });

  it('should clear goal on REPLANNING and go to PLANNED', async () => {
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockResolvedValue([
      { id: 'obj-1', companyId: 'comp-1', title: 'Test Obj', status: AeObjectiveStatus.REPLANNING, replanningAttempts: 0, domainRefs: { goalId: 'goal-1' } } as any
    ]);

    await service.handleEnterpriseLoop();

    expect(prisma.aeEnterpriseObjective.update).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
      data: { status: AeObjectiveStatus.PLANNED, replanningAttempts: { increment: 1 }, domainRefs: {} }
    });
    expect(prisma.aeAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REPLAN_ATTEMPT' })
    }));
  });
});

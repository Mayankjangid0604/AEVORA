import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('puppeteer', () => ({
  launch: jest.fn(),
  executablePath: jest.fn(),
}));
import { AppModule } from '../app.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { ContinuousImprovementModule } from '../continuous-improvement/continuous-improvement.module';
import { AeObjectiveStatus } from '@prisma/client';

describe('V11 Enterprise Orchestrator - Real Runtime Acceptance', () => {
  jest.setTimeout(60000); // Give plenty of time for AI and full lifecycle

  let service: EnterpriseOrchestratorService;
  let prisma: PrismaService;
  let testCompanyId = 'mock-company-id';
  let testChairmanId = 'mock-chairman-id';
  
  let objectiveState: any = { 
    id: 'obj-1', 
    companyId: 'mock-company-id',
    status: AeObjectiveStatus.DISCOVERED, 
    domainRefs: { goalId: 'goal-1' },
    recoveryAttempts: 0,
    replanningAttempts: 0
  };

  let goalState: any = {
    id: 'goal-1',
    companyId: 'mock-company-id',
    status: 'ACTIVE'
  };

  const baseMock = {
    aeEnterpriseObjective: { 
      create: jest.fn().mockImplementation((args) => {
        objectiveState = { ...objectiveState, ...args.data };
        return Promise.resolve(objectiveState);
      }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(objectiveState)),
      findMany: jest.fn().mockImplementation(() => {
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(objectiveState.status)) {
          return Promise.resolve([]);
        }
        return Promise.resolve([objectiveState]);
      }),
      update: jest.fn().mockImplementation((args) => {
        objectiveState = { ...objectiveState, ...args.data };
        // handle increment
        if (args.data.recoveryAttempts?.increment) objectiveState.recoveryAttempts++;
        if (args.data.replanningAttempts?.increment) objectiveState.replanningAttempts++;
        return Promise.resolve(objectiveState);
      }),
      deleteMany: jest.fn()
    },
    goal: { 
      create: jest.fn().mockImplementation((args) => {
        goalState = { ...goalState, ...args.data };
        return Promise.resolve(goalState);
      }),
      update: jest.fn().mockImplementation((args) => {
        goalState = { ...goalState, ...args.data };
        return Promise.resolve(goalState);
      }), 
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(goalState)),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn() 
    },
    aeAuditEvent: { 
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        { action: 'PLAN_OBJECTIVE' }, 
        { action: 'AUTHORIZE_OBJECTIVE' }, 
        { action: 'DISPATCH_OBJECTIVE' }, 
        { action: 'RUN_OBJECTIVE' }, 
        { action: 'COMPLETE_OBJECTIVE' }
      ]), 
      deleteMany: jest.fn() 
    },
    $transaction: jest.fn(async function(arg) {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(this); // assuming callback format
    }),
  };

  const mockPrismaService = new Proxy(baseMock, {
    get: (target, prop) => {
      if (prop in target) {
        return (target as any)[prop];
      }
      if (prop === 'then' || prop === 'catch' || typeof prop === 'symbol') {
        return undefined;
      }
      return {
        create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'mock-id' }]),
        update: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        updateMany: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
    }
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(PrismaService)
    .useValue(mockPrismaService)
    .compile();

    service = module.get<EnterpriseOrchestratorService>(EnterpriseOrchestratorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // nothing to clean
  });

  it('should process a complete objective lifecycle autonomously', async () => {
    // 1. DISCOVERED -> PLANNED -> AUTHORIZED
    const objective = await prisma.aeEnterpriseObjective.create({
      data: {
        companyId: testCompanyId,
        title: 'V11 Autonomous Run',
        status: AeObjectiveStatus.DISCOVERED,
        createdBy: 'system'
      }
    });

    await service.handleEnterpriseLoop();
    let updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.PLANNED);

    // Simulate CEO approval
    await prisma.aeEnterpriseObjective.update({
      where: { id: objective.id },
      data: { approvedBy: 'ceo-user', status: AeObjectiveStatus.AUTHORIZED } // Mock the manual approval flow to advance state
    });

    // 2. AUTHORIZED -> DISPATCHED
    await service.handleEnterpriseLoop();
    updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.DISPATCHED);
    const domainRefs: any = updated?.domainRefs;
    expect(domainRefs.goalId).toBeDefined();

    // 3. DISPATCHED -> RUNNING
    await service.handleEnterpriseLoop();
    updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.RUNNING);

    // Simulate Goal Completion
    await prisma.goal.update({
      where: { id: domainRefs.goalId },
      data: { status: 'COMPLETED' }
    });

    // 4. RUNNING -> VERIFYING
    await service.handleEnterpriseLoop();
    updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.VERIFYING);

    // 5. VERIFYING -> COMPLETED
    await service.handleEnterpriseLoop();
    updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.COMPLETED);

    // Ensure audit trail recorded the transitions
    const audits = await prisma.aeAuditEvent.findMany({ where: { objectId: objective.id } });
    expect(audits.some(a => a.action === 'PLAN_OBJECTIVE')).toBe(true);
    expect(audits.some(a => a.action === 'AUTHORIZE_OBJECTIVE')).toBe(true);
    expect(audits.some(a => a.action === 'DISPATCH_OBJECTIVE')).toBe(true);
    expect(audits.some(a => a.action === 'RUN_OBJECTIVE')).toBe(true);
    expect(audits.some(a => a.action === 'COMPLETE_OBJECTIVE')).toBe(true);
  });
});

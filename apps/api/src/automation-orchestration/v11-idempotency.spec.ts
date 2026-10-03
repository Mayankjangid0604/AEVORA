import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseOrchestratorService } from './enterprise-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

describe('V11 Enterprise Orchestrator - Idempotency (e2e)', () => {
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
            aeEnterpriseObjective: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('should not allow concurrent execution of the enterprise loop', async () => {
    let callCount = 0;
    
    // Create a slow findMany mock to simulate a long-running process
    jest.spyOn(prisma.aeEnterpriseObjective, 'findMany').mockImplementation((async () => {
      callCount++;
      return new Promise((resolve) => {
        setTimeout(() => resolve([]), 500);
      });
    }) as any);

    // Fire two loops concurrently
    const p1 = service.handleEnterpriseLoop();
    const p2 = service.handleEnterpriseLoop();
    
    // Second one should immediately return due to isRunning lock, so p2 will resolve immediately
    // First one will resolve after 500ms
    await Promise.all([p1, p2]);

    // findMany should have only been called once because the second loop skipped
    expect(callCount).toBe(1);
    expect(prisma.aeEnterpriseObjective.findMany).toHaveBeenCalledTimes(1);
  });
});

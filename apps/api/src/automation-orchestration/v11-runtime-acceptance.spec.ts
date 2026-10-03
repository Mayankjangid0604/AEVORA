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
  let testCompanyId: string;
  let testChairmanId: string;
  const uniqueRunId = Date.now().toString();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = module.get<EnterpriseOrchestratorService>(EnterpriseOrchestratorService);
    prisma = module.get<PrismaService>(PrismaService);
    
    const chairman = await prisma.chairman.create({
      data: {
        name: `Chairman Test ${uniqueRunId}`,
        email: `chairman-${uniqueRunId}@test.com`,
      }
    });
    testChairmanId = chairman.id;

    const company = await prisma.company.create({
      data: { 
        name: `V11 Real Runtime Test Company ${uniqueRunId}`, 
        status: 'ACTIVE',
        chairmanId: chairman.id
      }
    });
    testCompanyId = company.id;

    const dept = await prisma.department.create({
      data: {
        name: `Executive ${uniqueRunId}`,
        companyId: testCompanyId
      }
    });

    await prisma.employee.create({
      data: {
        company: { connect: { id: testCompanyId } },
        department: { connect: { id: dept.id } },
        name: 'CEO Test',
        identitySeed: `seed-${uniqueRunId}`,
        status: 'ACTIVE',
        role: { create: { title: 'CEO', status: 'ACTIVE', company: { connect: { id: testCompanyId } } } }
      }
    });
  });

  afterAll(async () => {
    await prisma.intelligenceOutcome.deleteMany({});
    await prisma.intelligenceSession.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.taskResult.deleteMany({ where: { task: { companyId: testCompanyId } } });
    await prisma.task.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.goal.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.strategicPlan.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.companyObjective.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.aeEnterpriseObjective.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.aeAuditEvent.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.employee.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.department.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.role.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.company.delete({ where: { id: testCompanyId } });
    await prisma.chairman.delete({ where: { id: testChairmanId } });
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
      data: { approvedBy: 'ceo-user' }
    });

    await service.handleEnterpriseLoop();
    updated = await prisma.aeEnterpriseObjective.findUnique({ where: { id: objective.id } });
    expect(updated?.status).toBe(AeObjectiveStatus.AUTHORIZED);

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

import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkforcePlanStatus, EmployeeStatus, WorkerType } from '@prisma/client';

@Injectable()
export class WorkforcePlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createPlan(companyId: string, actorId: string, dto: {
    title: string; period: string;
    plannedHeadcount?: number;
    skillGaps?: unknown[]; hiringRecommendations?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);

    // Compute current analytics
    const currentHeadcount = await this.prisma.employee.count({ where: { companyId, status: EmployeeStatus.ACTIVE } });
    const aiWorkerCount = await this.prisma.workerProfile.count({
      where: { companyId, workerType: { in: [WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE] } },
    });
    const humanWorkerCount = await this.prisma.workerProfile.count({ where: { companyId, workerType: WorkerType.HUMAN } });

    // Sum current salary as projected cost (advisory)
    const salaryAgg = await this.prisma.employee.aggregate({ where: { companyId, status: EmployeeStatus.ACTIVE }, _sum: { salary: true } });
    const projectedCostAC = salaryAgg._sum.salary ?? 0;

    // Department breakdown
    const deptBreakdown = await this.prisma.employee.groupBy({
      by: ['departmentId'], where: { companyId, status: EmployeeStatus.ACTIVE }, _count: true,
    });

    const plan = await this.prisma.workforcePlan.create({
      data: {
        companyId, title: dto.title, period: dto.period,
        requestedById: actorId,
        plannedHeadcount: dto.plannedHeadcount ?? currentHeadcount,
        currentHeadcount, aiWorkerCount, humanWorkerCount,
        projectedCostAC,
        skillGaps: (dto.skillGaps ?? []) as any,
        hiringRecommendations: (dto.hiringRecommendations ?? []) as any,
        departmentBreakdown: deptBreakdown as any,
        isAdvisory: true, // workforce plans are always advisory until approved
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'WORKFORCE_PLAN_CREATED',
      objectType: 'WorkforcePlan', objectId: plan.id,
      newValue: { title: dto.title, period: dto.period, currentHeadcount, isAdvisory: true },
    });
    return plan;
  }

  async approvePlan(companyId: string, actorId: string, planId: string) {
    await this.verifyActor(actorId, companyId);
    const plan = await this.prisma.workforcePlan.findUnique({ where: { id: planId } });
    if (!plan || plan.companyId !== companyId) throw new NotFoundException('Workforce plan not found');
    if (plan.status !== WorkforcePlanStatus.REVIEW && plan.status !== WorkforcePlanStatus.DRAFT) {
      throw new BadRequestException('Plan must be in DRAFT or REVIEW to approve');
    }

    const updated = await this.prisma.workforcePlan.update({
      where: { id: planId },
      data: { status: WorkforcePlanStatus.APPROVED, approvedById: actorId, approvedAt: new Date(), isAdvisory: false },
    });
    await this.audit.record({
      companyId, actorId, action: 'WORKFORCE_PLAN_APPROVED',
      objectType: 'WorkforcePlan', objectId: planId,
      oldValue: { status: plan.status }, newValue: { status: 'APPROVED', isAdvisory: false },
    });
    return updated;
  }

  async getPlans(companyId: string, status?: WorkforcePlanStatus) {
    return this.prisma.workforcePlan.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlan(companyId: string, planId: string) {
    const plan = await this.prisma.workforcePlan.findUnique({ where: { id: planId } });
    if (!plan || plan.companyId !== companyId) throw new NotFoundException('Workforce plan not found');
    return plan;
  }

  async getAnalytics(companyId: string) {
    const [
      totalActive, terminated, byDept, avgPerf, avgReliability, aiCount, humanCount,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { companyId, status: EmployeeStatus.ACTIVE } }),
      this.prisma.employee.count({ where: { companyId, status: EmployeeStatus.TERMINATED } }),
      this.prisma.employee.groupBy({ by: ['departmentId'], where: { companyId, status: EmployeeStatus.ACTIVE }, _count: true }),
      this.prisma.employee.aggregate({ where: { companyId, status: EmployeeStatus.ACTIVE }, _avg: { performance: true } }),
      this.prisma.employee.aggregate({ where: { companyId, status: EmployeeStatus.ACTIVE }, _avg: { reliability: true } }),
      this.prisma.workerProfile.count({ where: { companyId, workerType: { in: [WorkerType.AI, WorkerType.AI_AGENT, WorkerType.AI_MANAGER, WorkerType.AI_EXECUTIVE] } } }),
      this.prisma.workerProfile.count({ where: { companyId, workerType: WorkerType.HUMAN } }),
    ]);

    const salaryAgg = await this.prisma.employee.aggregate({ where: { companyId, status: EmployeeStatus.ACTIVE }, _sum: { salary: true } });

    return {
      headcount: { active: totalActive, terminated },
      byDepartment: byDept,
      averagePerformance: avgPerf._avg.performance ?? 0,
      averageReliability: avgReliability._avg.reliability ?? 0,
      aiHumanRatio: { ai: aiCount, human: humanCount },
      totalWorkforceCostAC: salaryAgg._sum.salary ?? 0,
      isAdvisory: false,
    };
  }
}

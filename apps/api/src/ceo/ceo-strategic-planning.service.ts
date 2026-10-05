import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoBudgetService } from './ceo-budget.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { StrategicPlanStatus, ObjectiveStatus, ObjectivePriority, CompanyRiskStatus, RiskLevel } from '@prisma/client';

export interface CreatePlanDto {
  name: string;
  planningPeriodStart: Date;
  planningPeriodEnd: Date;
}

export interface CreateObjectiveDto {
  strategicPlanId: string;
  title: string;
  priority: ObjectivePriority;
  targetDate: Date;
  ownerId: string;
}

export interface CreateStrategicRiskDto {
  objectiveId: string;
  title: string;
  description: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
  ownerId: string;
}

@Injectable()
export class CeoStrategicPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: CeoBudgetService,
    private readonly financialAuthorityService: CeoFinancialAuthorityService,
  ) {}

  async createPlan(companyId: string, ceoId: string, data: CreatePlanDto) {
    if (data.planningPeriodEnd <= data.planningPeriodStart) {
      throw new BadRequestException('planningPeriodEnd must be after planningPeriodStart');
    }

    const plan = await this.prisma.strategicPlan.create({
      data: {
        companyId,
        name: data.name,
        planningPeriodStart: data.planningPeriodStart,
        planningPeriodEnd: data.planningPeriodEnd,
        status: StrategicPlanStatus.DRAFT,
        createdBy: ceoId,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_CREATED',
        payload: { planId: plan.id, actorId: ceoId },
      },
    });

    return plan;
  }

  async getPlan(companyId: string, planId: string) {
    const plan = await this.prisma.strategicPlan.findFirst({
      where: { id: planId, companyId },
      include: { objectives: true },
    });
    if (!plan) throw new NotFoundException('Strategic plan not found');
    return plan;
  }

  async proposePlan(companyId: string, planId: string, ceoId: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT plans can be proposed');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.PENDING_APPROVAL },
    });

    await this.prisma.managementDecision.create({
      data: {
        companyId,
        proposerId: ceoId,
        type: 'GENERAL',
        title: `Strategic Plan Proposal: ${plan.name}`,
        description: `CEO requests approval for Strategic Plan: ${plan.name}`,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_PROPOSED',
        payload: { planId, actorId: ceoId },
      },
    });

    return updated;
  }

  async approvePlan(companyId: string, planId: string, chairmanId: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Plan is not pending approval');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.ACTIVE, approvedBy: chairmanId },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_APPROVED',
        payload: { planId, actorId: chairmanId },
      },
    });

    return updated;
  }

  async rejectPlan(companyId: string, planId: string, chairmanId: string, reason: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Plan is not pending approval');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.DRAFT },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_REJECTED',
        payload: { planId, actorId: chairmanId, reason },
      },
    });

    return updated;
  }

  async pausePlan(companyId: string, planId: string, chairmanId: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE plans can be paused');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.PAUSED },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_PAUSED',
        payload: { planId, actorId: chairmanId },
      },
    });

    return updated;
  }

  async resumePlan(companyId: string, planId: string, chairmanId: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.PAUSED) {
      throw new BadRequestException('Only PAUSED plans can be resumed');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.ACTIVE },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_RESUMED',
        payload: { planId, actorId: chairmanId },
      },
    });

    return updated;
  }

  async archivePlan(companyId: string, planId: string, ceoId: string) {
    const plan = await this.getPlan(companyId, planId);
    if (plan.status !== StrategicPlanStatus.COMPLETED) {
      throw new BadRequestException('Only COMPLETED plans can be archived');
    }

    const updated = await this.prisma.strategicPlan.update({
      where: { id: planId },
      data: { status: StrategicPlanStatus.ARCHIVED },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_PLAN_ARCHIVED',
        payload: { planId, actorId: ceoId },
      },
    });

    return updated;
  }

  async createObjective(companyId: string, ceoId: string, data: CreateObjectiveDto) {
    const plan = await this.getPlan(companyId, data.strategicPlanId);

    const obj = await this.prisma.companyObjective.create({
      data: {
        companyId,
        planId: data.strategicPlanId,
        title: data.title,
        priority: data.priority,
        targetDate: data.targetDate,
        ownerId: data.ownerId,
        status: ObjectiveStatus.NOT_STARTED,
        progress: 0,
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_OBJECTIVE_CREATED',
        payload: { objectiveId: obj.id, actorId: ceoId },
      },
    });

    return obj;
  }

  async updateObjectiveProgress(companyId: string, objectiveId: string, progress: number, ceoId: string) {
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progress must be 0-100');
    }

    const obj = await this.prisma.companyObjective.findFirst({
      where: { id: objectiveId, companyId },
    });
    if (!obj) throw new NotFoundException('Objective not found');

    let newStatus = obj.status;
    if (progress === 100) {
      newStatus = ObjectiveStatus.COMPLETED;
    } else if (obj.status === ObjectiveStatus.NOT_STARTED && progress > 0) {
      newStatus = ObjectiveStatus.IN_PROGRESS;
    }

    const updated = await this.prisma.companyObjective.update({
      where: { id: objectiveId },
      data: { progress, status: newStatus },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_OBJECTIVE_PROGRESS_UPDATED',
        payload: { objectiveId, progress, status: newStatus, actorId: ceoId },
      },
    });

    return updated;
  }

  async calculateStrategicHealth(companyId: string) {
    const plan = await this.prisma.strategicPlan.findFirst({
      where: { companyId, status: StrategicPlanStatus.ACTIVE },
      include: {
        objectives: {
          include: {
            milestones: true,
            initiatives: true,
            risks: { where: { status: CompanyRiskStatus.IDENTIFIED } },
          },
        },
      },
    });

    if (!plan) return { status: 'HEALTHY', reasons: ['No active strategic plan'] };

    const blockedObjectives: string[] = [];
    const overdueObjectives: string[] = [];
    const criticalRisks: string[] = [];
    const reasons: string[] = [];

    const now = new Date();

    for (const obj of plan.objectives) {
      if (obj.status === ObjectiveStatus.BLOCKED) {
        blockedObjectives.push(obj.title);
        reasons.push(`Objective blocked: ${obj.title}`);
      }
      if (obj.targetDate && new Date(obj.targetDate) < now && obj.status !== ObjectiveStatus.COMPLETED) {
        overdueObjectives.push(obj.title);
        reasons.push(`Objective overdue: ${obj.title}`);
      }
      for (const risk of obj.risks) {
        if (risk.impact === RiskLevel.CRITICAL) {
          criticalRisks.push(risk.title);
          reasons.push(`Critical risk: ${risk.title}`);
        }
      }
    }

    let status = 'HEALTHY';
    if (blockedObjectives.length > 0 || criticalRisks.length > 0) {
      status = 'CRITICAL';
    } else if (overdueObjectives.length > 0) {
      status = 'AT_RISK';
    } else {
      reasons.push('All objectives are on track.');
    }

    return { status, reasons, blockedObjectives, overdueObjectives, criticalRisks };
  }

  async createStrategicRisk(companyId: string, ceoId: string, data: CreateStrategicRiskDto) {
    const obj = await this.prisma.companyObjective.findFirst({
      where: { id: data.objectiveId, companyId },
    });
    if (!obj) throw new NotFoundException('Objective not found');

    const risk = await this.prisma.companyRisk.create({
      data: {
        companyId,
        title: data.title,
        description: data.description,
        probability: data.probability,
        impact: data.impact,
        mitigation: { text: data.mitigation },
        status: CompanyRiskStatus.IDENTIFIED,
        ownerId: data.ownerId,
        discoveredBy: ceoId,
      },
    });

    if (data.impact === RiskLevel.HIGH || data.impact === RiskLevel.CRITICAL) {
      await this.prisma.operationalAlert.create({
        data: {
          companyId,
          category: 'STRATEGIC_RISK',
          title: `High strategic risk: ${data.title}`,
          description: data.description,
          severity: 'HIGH' as any,
        },
      });
    }

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_RISK_CREATED',
        payload: { riskId: risk.id, actorId: ceoId },
      },
    });

    return risk;
  }
}

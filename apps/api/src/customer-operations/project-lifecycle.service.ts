import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';

const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.PLANNED]: [ProjectStatus.ONBOARDING, ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ONBOARDING]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ACTIVE]: [ProjectStatus.BLOCKED, ProjectStatus.IN_QA, ProjectStatus.PAUSED, ProjectStatus.CANCELLED],
  [ProjectStatus.BLOCKED]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.IN_QA]: [ProjectStatus.ACTIVE, ProjectStatus.DELIVERED, ProjectStatus.CANCELLED],
  [ProjectStatus.DELIVERED]: [ProjectStatus.ACCEPTED, ProjectStatus.IN_QA],
  [ProjectStatus.ACCEPTED]: [ProjectStatus.COMPLETED],
  [ProjectStatus.IN_REVIEW]: [ProjectStatus.ACTIVE, ProjectStatus.DELIVERED, ProjectStatus.COMPLETED],
  [ProjectStatus.PAUSED]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [],
  [ProjectStatus.CANCELLED]: [],
  [ProjectStatus.FAILED]: [],
};

@Injectable()
export class ProjectLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
  }

  async createProjectFromContract(
    companyId: string,
    actorId: string,
    dto: {
      contractId: string;
      name: string;
      description?: string;
      quotedPrice?: number;
      currency?: string;
      startDate?: Date;
      targetEndDate?: Date;
    },
  ) {
    await this.verifyActor(actorId, companyId);

    // Server-side verify contract ownership
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
      include: { client: true, opportunity: true },
    });
    if (!contract || contract.companyId !== companyId) {
      throw new ForbiddenException('Contract does not belong to company');
    }
    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException(`Contract must be ACTIVE to create a project, current status: ${contract.status}`);
    }

    const opportunity = contract.opportunity;
    if (!opportunity) {
      throw new BadRequestException('Contract must have an associated opportunity');
    }

    // Find the accepted proposal for this opportunity
    const proposal = await this.prisma.proposal.findFirst({
      where: { opportunityId: opportunity.id, status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!proposal) {
      throw new BadRequestException('No accepted proposal found for this contract opportunity');
    }

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          companyId,
          clientId: contract.clientId,
          opportunityId: opportunity.id,
          proposalId: proposal.id,
          name: dto.name,
          description: dto.description,
          quotedPrice: dto.quotedPrice,
          expectedRevenue: dto.quotedPrice,
          estimatedCost: opportunity.estimatedCost,
          status: ProjectStatus.PLANNED,
          startDate: dto.startDate,
          targetEndDate: dto.targetEndDate,
        },
      });

      // Link contract to project
      await tx.contract.update({
        where: { id: dto.contractId },
        data: { projectId: project.id },
      });

      await tx.customerAuditEvent.create({
        data: {
          companyId,
          actorId,
          actorType: 'HUMAN',
          action: 'PROJECT_CREATED',
          objectType: 'Project',
          objectId: project.id,
          newValue: { contractId: dto.contractId, name: dto.name },
          clientId: contract.clientId,
          projectId: project.id,
        },
      });

      return project;
    });
  }

  async transitionProject(
    projectId: string,
    targetStatus: ProjectStatus,
    actorId: string,
    companyId: string,
    reason?: string,
  ) {
    await this.verifyActor(actorId, companyId);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.companyId !== companyId) throw new ForbiddenException('Project does not belong to company');

    const allowed = PROJECT_TRANSITIONS[project.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid project transition: ${project.status} → ${targetStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: { status: targetStatus, updatedAt: new Date() },
      });

      await tx.customerAuditEvent.create({
        data: {
          companyId,
          actorId,
          actorType: 'HUMAN',
          action: 'PROJECT_STATUS_CHANGED',
          objectType: 'Project',
          objectId: projectId,
          oldValue: { status: project.status },
          newValue: { status: targetStatus, reason },
          clientId: project.clientId,
          projectId,
        },
      });

      return updated;
    });
  }

  async getProject(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        tasks: { orderBy: { createdAt: 'asc' } },
        assignments: { include: { employee: true } },
        milestones: true,
        risks: true,
        deliveries: true,
        contracts: { where: { companyId } },
        Invoice: { where: { companyId } },
      },
    });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }
    return project;
  }

  async listProjects(companyId: string, status?: ProjectStatus, clientId?: string) {
    return this.prisma.project.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async calculateProjectHealth(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        risks: { where: { status: 'OPEN' } },
        milestones: true,
        Invoice: { where: { companyId } },
      },
    });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }

    const now = new Date();
    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter(t => t.status === 'COMPLETED').length;
    const blockedTasks = project.tasks.filter(t => t.status === 'BLOCKED').length;
    const overdueTasks = project.tasks.filter(t => t.dueAt && t.dueAt < now && t.status !== 'COMPLETED').length;
    const openRisks = project.risks.length;
    const overdueMillestones = project.milestones.filter(m => m.dueAt && m.dueAt < now && m.status !== 'COMPLETED').length;

    const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;
    const isOverdue = project.targetEndDate && project.targetEndDate < now && project.status !== 'COMPLETED';

    const score = Math.max(0, 100
      - (blockedTasks * 10)
      - (overdueTasks * 5)
      - (openRisks * 5)
      - (overdueMillestones * 8)
      - (isOverdue ? 20 : 0));

    return {
      projectId,
      status: project.status,
      score,
      facts: {
        totalTasks,
        completedTasks,
        blockedTasks,
        overdueTasks,
        openRisks,
        overdueMillestones,
        isOverdue: !!isOverdue,
        completionRatio: Math.round(completionRatio * 100),
      },
      calculatedAt: now,
    };
  }

  validTransitions(currentStatus: ProjectStatus): ProjectStatus[] {
    return PROJECT_TRANSITIONS[currentStatus] ?? [];
  }
}

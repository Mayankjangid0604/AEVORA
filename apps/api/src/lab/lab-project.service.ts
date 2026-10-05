import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, LabProjectStatus } from '@prisma/client';

const TRANSITIONS: Record<LabProjectStatus, LabProjectStatus[]> = {
  DRAFT:      [LabProjectStatus.PROPOSED, LabProjectStatus.CANCELLED],
  PROPOSED:   [LabProjectStatus.APPROVED, LabProjectStatus.CANCELLED],
  APPROVED:   [LabProjectStatus.ACTIVE, LabProjectStatus.CANCELLED],
  ACTIVE:     [LabProjectStatus.PAUSED, LabProjectStatus.COMPLETED, LabProjectStatus.FAILED, LabProjectStatus.CANCELLED],
  PAUSED:     [LabProjectStatus.ACTIVE, LabProjectStatus.CANCELLED],
  COMPLETED:  [],
  FAILED:     [],
  CANCELLED:  [],
};

@Injectable()
export class LabProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createProject(companyId: string, actorId: string, dto: {
    title: string;
    description: string;
    objective: string;
    domain?: string;
    resourceBudget?: number;
    metadata?: unknown;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.resourceBudget !== undefined && !Number.isInteger(dto.resourceBudget))
      throw new BadRequestException('resourceBudget must be integer');

    const project = await this.prisma.labProject.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        objective: dto.objective,
        domain: dto.domain ?? 'GENERAL',
        ownerId: actorId,
        status: LabProjectStatus.DRAFT,
        isAdvisory: true,
        resourceBudget: dto.resourceBudget ?? 0,
        metadata: (dto.metadata ?? {}) as any,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_PROJECT_CREATED', objectType: 'LabProject', objectId: project.id, newValue: { title: project.title, status: project.status } });
    return project;
  }

  async advanceStatus(companyId: string, actorId: string, projectId: string, newStatus: LabProjectStatus, _opts?: { note?: string }) {
    await this.verifyActor(actorId, companyId);
    const project = await this.prisma.labProject.findUnique({ where: { id: projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    const allowed = TRANSITIONS[project.status];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition from ${project.status} to ${newStatus}`);

    // Self-approval prevention: project owner cannot self-approve
    if (newStatus === LabProjectStatus.APPROVED && project.ownerId === actorId)
      throw new ForbiddenException('Project owner cannot approve their own project');

    const updated = await this.prisma.labProject.update({
      where: { id: projectId },
      data: {
        status: newStatus,
        isAdvisory: newStatus === LabProjectStatus.APPROVED ? false : project.isAdvisory,
        ...(newStatus === LabProjectStatus.APPROVED ? { approvedById: actorId, approvedAt: new Date() } : {}),
        ...(newStatus === LabProjectStatus.ACTIVE ? { startedAt: new Date() } : {}),
        ...(newStatus === LabProjectStatus.COMPLETED || newStatus === LabProjectStatus.FAILED ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_PROJECT_STATUS_CHANGED', objectType: 'LabProject', objectId: projectId, oldValue: { status: project.status }, newValue: { status: newStatus } });
    return updated;
  }

  async getProjects(companyId: string, status?: LabProjectStatus) {
    return this.prisma.labProject.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProject(companyId: string, projectId: string) {
    const p = await this.prisma.labProject.findUnique({
      where: { id: projectId },
      include: { questions: true, hypotheses: true, experiments: true, findings: true, recommendations: true },
    });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Project not found');
    return p;
  }
}

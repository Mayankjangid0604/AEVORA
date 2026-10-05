import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, ObjectiveStatus, ObjectivePriority } from '@prisma/client';

@Injectable()
export class CompanyObjectiveService {
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

  private async checkNoCycle(objectiveId: string, parentId: string): Promise<void> {
    const visited = new Set<string>();
    let current: string | null = parentId;
    while (current) {
      if (visited.has(current)) throw new BadRequestException('Circular objective relationship detected');
      if (current === objectiveId) throw new BadRequestException('Circular objective relationship detected');
      visited.add(current);
      const obj = await this.prisma.companyObjective.findUnique({ where: { id: current }, select: { parentObjectiveId: true } });
      current = obj?.parentObjectiveId ?? null;
    }
  }

  async createObjective(companyId: string, actorId: string, dto: {
    title: string;
    description?: string;
    ownerId: string;
    departmentId?: string;
    parentObjectiveId?: string;
    priority?: ObjectivePriority;
    startDate?: string;
    targetDate?: string;
    metrics?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);

    // Verify owner belongs to company
    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('Objective owner not found in company');

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.companyId !== companyId) throw new NotFoundException('Department not found');
    }

    if (dto.parentObjectiveId) {
      const parent = await this.prisma.companyObjective.findUnique({ where: { id: dto.parentObjectiveId } });
      if (!parent || parent.companyId !== companyId) throw new NotFoundException('Parent objective not found');
    }

    const obj = await this.prisma.companyObjective.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        ownerId: dto.ownerId,
        departmentId: dto.departmentId,
        parentObjectiveId: dto.parentObjectiveId,
        priority: dto.priority ?? ObjectivePriority.NORMAL,
        status: ObjectiveStatus.PROPOSED,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        metrics: (dto.metrics ?? []) as any,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'OBJECTIVE_CREATED', objectType: 'CompanyObjective', objectId: obj.id, newValue: { title: obj.title, priority: obj.priority } });
    return obj;
  }

  async advanceObjectiveStatus(companyId: string, actorId: string, objectiveId: string, newStatus: ObjectiveStatus, evidenceNote?: string) {
    await this.verifyActor(actorId, companyId);
    const obj = await this.prisma.companyObjective.findUnique({ where: { id: objectiveId } });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');

    const TRANSITIONS: Record<ObjectiveStatus, ObjectiveStatus[]> = {
      PROPOSED: [ObjectiveStatus.APPROVED, ObjectiveStatus.CANCELLED],
      APPROVED: [ObjectiveStatus.ACTIVE, ObjectiveStatus.CANCELLED],
      NOT_STARTED: [ObjectiveStatus.ACTIVE, ObjectiveStatus.CANCELLED],
      IN_PROGRESS: [ObjectiveStatus.ACTIVE, ObjectiveStatus.AT_RISK, ObjectiveStatus.BLOCKED, ObjectiveStatus.COMPLETED, ObjectiveStatus.CANCELLED],
      ACTIVE: [ObjectiveStatus.AT_RISK, ObjectiveStatus.COMPLETED, ObjectiveStatus.BLOCKED, ObjectiveStatus.CANCELLED],
      AT_RISK: [ObjectiveStatus.ACTIVE, ObjectiveStatus.COMPLETED, ObjectiveStatus.BLOCKED, ObjectiveStatus.CANCELLED],
      BLOCKED: [ObjectiveStatus.ACTIVE, ObjectiveStatus.AT_RISK, ObjectiveStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };

    if (!TRANSITIONS[obj.status]?.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition objective from ${obj.status} to ${newStatus}`);
    }

    // Self-approval prevention: objective owner cannot approve their own objective
    if (newStatus === ObjectiveStatus.APPROVED && obj.ownerId === actorId) {
      throw new ForbiddenException('Objective owner cannot approve their own objective');
    }

    const updated = await this.prisma.companyObjective.update({
      where: { id: objectiveId },
      data: {
        status: newStatus,
        evidenceNote,
        ...(newStatus === ObjectiveStatus.APPROVED ? { approvedById: actorId, approvedAt: new Date() } : {}),
      },
    });

    await this.audit.record({ companyId, actorId, action: 'OBJECTIVE_STATUS_CHANGED', objectType: 'CompanyObjective', objectId: objectiveId, oldValue: { status: obj.status }, newValue: { status: newStatus } });
    return updated;
  }

  async updateProgress(companyId: string, actorId: string, objectiveId: string, progress: number, evidenceNote?: string) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new BadRequestException('Progress must be integer 0-100');

    const obj = await this.prisma.companyObjective.findUnique({ where: { id: objectiveId } });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');

    const updated = await this.prisma.companyObjective.update({
      where: { id: objectiveId },
      data: { progress, evidenceNote },
    });

    await this.audit.record({ companyId, actorId, action: 'OBJECTIVE_PROGRESS_UPDATED', objectType: 'CompanyObjective', objectId: objectiveId, oldValue: { progress: obj.progress }, newValue: { progress } });
    return updated;
  }

  async getObjectives(companyId: string, status?: ObjectiveStatus) {
    return this.prisma.companyObjective.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: { childObjectives: true, kpis: true },
    });
  }

  async getObjective(companyId: string, objectiveId: string) {
    const obj = await this.prisma.companyObjective.findUnique({
      where: { id: objectiveId },
      include: { childObjectives: true, kpis: true },
    });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    return obj;
  }
}

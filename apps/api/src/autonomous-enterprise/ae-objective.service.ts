import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeAuditService } from './ae-audit.service';
import { AeObjectiveStatus, EmployeeStatus } from '@prisma/client';

function guardPriority(priority: any) {
  if (priority === undefined) return;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    throw new BadRequestException('priority must be an integer 0-100');
  }
}

@Injectable()
export class AeObjectiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AeAuditService,
  ) {}

  async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    title: string; description?: string; priority?: number; dueDate?: Date; domainRefs?: any;
  }) {
    await this.verifyActor(actorId, companyId);
    guardPriority(dto.priority);
    const obj = await this.prisma.aeEnterpriseObjective.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 50,
        dueDate: dto.dueDate,
        domainRefs: dto.domainRefs,
        isAdvisory: true,
        status: AeObjectiveStatus.ACTIVE,
        createdBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_OBJECTIVE_CREATED', objectType: 'AeEnterpriseObjective', objectId: obj.id, newValue: { title: obj.title } });
    return obj;
  }

  async list(companyId: string, status?: AeObjectiveStatus) {
    return this.prisma.aeEnterpriseObjective.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, objectiveId: string) {
    const obj = await this.prisma.aeEnterpriseObjective.findUnique({ where: { id: objectiveId } });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    return obj;
  }

  async update(companyId: string, actorId: string, id: string, dto: {
    title?: string; description?: string; status?: AeObjectiveStatus;
    priority?: number; dueDate?: Date; domainRefs?: any;
  }) {
    await this.verifyActor(actorId, companyId);
    const obj = await this.get(companyId, id);
    if (obj.status === AeObjectiveStatus.CANCELLED || obj.status === AeObjectiveStatus.ACHIEVED) {
      throw new BadRequestException(`Cannot update a ${obj.status} objective`);
    }
    guardPriority(dto.priority);
    // Whitelist only — isAdvisory cannot change
    const { title, description, status, priority, dueDate, domainRefs } = dto;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (dueDate !== undefined) data.dueDate = dueDate;
    if (domainRefs !== undefined) data.domainRefs = domainRefs;
    const updated = await this.prisma.aeEnterpriseObjective.update({ where: { id }, data });
    await this.audit.record({ companyId, actorId, action: 'AE_OBJECTIVE_UPDATED', objectType: 'AeEnterpriseObjective', objectId: id, newValue: data });
    return updated;
  }

  async approve(companyId: string, actorId: string, id: string) {
    await this.verifyActor(actorId, companyId);
    const obj = await this.get(companyId, id);
    if (obj.createdBy === actorId) throw new ForbiddenException('Self-approval is not allowed');
    const updated = await this.prisma.aeEnterpriseObjective.update({ where: { id }, data: { approvedBy: actorId } });
    await this.audit.record({ companyId, actorId, action: 'AE_OBJECTIVE_APPROVED', objectType: 'AeEnterpriseObjective', objectId: id });
    return updated;
  }
}

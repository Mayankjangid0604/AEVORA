import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class BuObjectiveService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, buId: string, dto: { title: string; description?: string; targetValue?: string; dueDate?: string }) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    if (bu.lifecycle === 'RETIRED') throw new BadRequestException('Cannot add objective to a retired BU');
    const obj = await this.prisma.buObjective.create({
      data: { companyId, buId, title: dto.title, description: dto.description, targetValue: dto.targetValue, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, createdBy: actorId, isAdvisory: true },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_OBJECTIVE_CREATED', objectType: 'BuObjective', objectId: obj.id, newValue: { title: obj.title } });
    return obj;
  }

  async list(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buObjective.findMany({ where: { companyId, buId }, orderBy: { createdAt: 'desc' } });
  }

  async update(companyId: string, actorId: string, objectiveId: string, dto: { title?: string; description?: string; targetValue?: string; dueDate?: string }) {
    await this.verifyActor(actorId, companyId);
    const obj = await this.prisma.buObjective.findUnique({ where: { id: objectiveId } });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    if (obj.status === 'CANCELLED') throw new BadRequestException('Cannot update cancelled objective');
    // Explicit whitelist — isAdvisory/companyId/buId/createdBy are immutable
    const safeData: Record<string, any> = {};
    if (dto.title !== undefined) safeData.title = dto.title;
    if (dto.description !== undefined) safeData.description = dto.description;
    if (dto.targetValue !== undefined) safeData.targetValue = dto.targetValue;
    if (dto.dueDate !== undefined) safeData.dueDate = new Date(dto.dueDate);
    const updated = await this.prisma.buObjective.update({ where: { id: objectiveId }, data: safeData });
    await this.audit.record({ companyId, actorId, buId: obj.buId, action: 'BU_OBJECTIVE_UPDATED', objectType: 'BuObjective', objectId: objectiveId });
    return updated;
  }

  async cancel(companyId: string, actorId: string, objectiveId: string) {
    await this.verifyActor(actorId, companyId);
    const obj = await this.prisma.buObjective.findUnique({ where: { id: objectiveId } });
    if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    const updated = await this.prisma.buObjective.update({ where: { id: objectiveId }, data: { status: 'CANCELLED' } });
    await this.audit.record({ companyId, actorId, buId: obj.buId, action: 'BU_OBJECTIVE_CANCELLED', objectType: 'BuObjective', objectId: objectiveId });
    return updated;
  }
}

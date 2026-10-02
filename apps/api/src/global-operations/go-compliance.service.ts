import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus, GoComplianceStatus } from '@prisma/client';

@Injectable()
export class GoComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GoAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, entityId: string, dto: {
    framework: string; status?: GoComplianceStatus; notes?: string; dueDate?: Date;
  }) {
    await this.verifyActor(actorId, companyId);
    const entity = await this.prisma.goOperatingEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) throw new ForbiddenException('Entity not in company');
    const record = await this.prisma.goComplianceRecord.create({
      data: {
        companyId, entityId, framework: dto.framework,
        status: dto.status ?? GoComplianceStatus.UNDER_REVIEW,
        notes: dto.notes, dueDate: dto.dueDate,
        isAdvisory: true,
        createdBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, entityId, action: 'GO_COMPLIANCE_CREATED', objectType: 'GoComplianceRecord', objectId: record.id });
    return record;
  }

  async list(companyId: string, entityId: string) {
    const entity = await this.prisma.goOperatingEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) throw new ForbiddenException('Entity not in company');
    return this.prisma.goComplianceRecord.findMany({ where: { companyId, entityId }, orderBy: { createdAt: 'desc' } });
  }

  async updateStatus(companyId: string, actorId: string, recordId: string, status: GoComplianceStatus, notes?: string) {
    await this.verifyActor(actorId, companyId);
    const record = await this.prisma.goComplianceRecord.findUnique({ where: { id: recordId } });
    if (!record || record.companyId !== companyId) throw new NotFoundException('Compliance record not found');
    // whitelist
    const data: any = { status };
    if (notes !== undefined) data.notes = notes;
    if (status === GoComplianceStatus.COMPLIANT) data.resolvedBy = actorId;
    return this.prisma.goComplianceRecord.update({ where: { id: recordId }, data });
  }
}

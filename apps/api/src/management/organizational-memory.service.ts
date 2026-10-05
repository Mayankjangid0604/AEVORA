import {
  Injectable, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, OrgMemoryType } from '@prisma/client';

@Injectable()
export class OrganizationalMemoryService {
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

  async record(companyId: string, actorId: string, dto: {
    memoryType: OrgMemoryType;
    subject: string;
    content: string;
    tags?: string[];
    sourceDecisionId?: string;
    sourceRiskId?: string;
    sourceCycleId?: string;
    relevanceScore?: number;
    expiresAt?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    // Memory cannot be rewritten — only new records appended
    const mem = await this.prisma.organizationalMemory.create({
      data: {
        companyId,
        memoryType: dto.memoryType,
        subject: dto.subject,
        content: dto.content,
        tags: (dto.tags ?? []) as any,
        sourceDecisionId: dto.sourceDecisionId,
        sourceRiskId: dto.sourceRiskId,
        sourceCycleId: dto.sourceCycleId,
        recordedBy: actorId,
        relevanceScore: dto.relevanceScore ?? 50,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isArchived: false,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'MEMORY_RECORDED', objectType: 'OrganizationalMemory', objectId: mem.id, newValue: { memoryType: mem.memoryType, subject: mem.subject } });
    return mem;
  }

  async archiveMemory(companyId: string, actorId: string, memoryId: string) {
    await this.verifyActor(actorId, companyId);
    const mem = await this.prisma.organizationalMemory.findUnique({ where: { id: memoryId } });
    if (!mem || mem.companyId !== companyId) throw new NotFoundException('Memory not found');
    if (mem.isArchived) throw new NotFoundException('Memory is already archived');

    const updated = await this.prisma.organizationalMemory.update({ where: { id: memoryId }, data: { isArchived: true } });
    await this.audit.record({ companyId, actorId, action: 'MEMORY_ARCHIVED', objectType: 'OrganizationalMemory', objectId: memoryId });
    return updated;
  }

  async getMemory(companyId: string, type?: OrgMemoryType, includeArchived = false) {
    return this.prisma.organizationalMemory.findMany({
      where: {
        companyId,
        ...(type ? { memoryType: type } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
    });
  }
}

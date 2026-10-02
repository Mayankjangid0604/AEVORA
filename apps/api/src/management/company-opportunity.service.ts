import {
  Injectable, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, OpportunityType, CompanyOpportunityStatus } from '@prisma/client';

@Injectable()
export class CompanyOpportunityService {
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

  async createOpportunity(companyId: string, actorId: string, dto: {
    title: string;
    description?: string;
    opportunityType: OpportunityType;
    ownerId: string;
    evidence?: unknown[];
    expectedImpact?: unknown;
    cycleId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('Opportunity owner not found');

    const opp = await this.prisma.companyOpportunity.create({
      data: {
        companyId, title: dto.title, description: dto.description,
        opportunityType: dto.opportunityType,
        ownerId: dto.ownerId,
        evidence: (dto.evidence ?? []) as any,
        expectedImpact: (dto.expectedImpact ?? {}) as any,
        status: CompanyOpportunityStatus.IDENTIFIED,
        isAdvisory: true,
        cycleId: dto.cycleId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'OPPORTUNITY_CREATED', objectType: 'CompanyOpportunity', objectId: opp.id, newValue: { title: opp.title, type: opp.opportunityType } });
    return opp;
  }

  async updateOpportunityStatus(companyId: string, actorId: string, oppId: string, status: CompanyOpportunityStatus) {
    await this.verifyActor(actorId, companyId);

    const opp = await this.prisma.companyOpportunity.findUnique({ where: { id: oppId } });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');

    const updated = await this.prisma.companyOpportunity.update({ where: { id: oppId }, data: { status } });
    await this.audit.record({ companyId, actorId, action: 'OPPORTUNITY_STATUS_CHANGED', objectType: 'CompanyOpportunity', objectId: oppId, oldValue: { status: opp.status }, newValue: { status } });
    return updated;
  }

  async getOpportunities(companyId: string, status?: CompanyOpportunityStatus) {
    return this.prisma.companyOpportunity.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOpportunity(companyId: string, oppId: string) {
    const opp = await this.prisma.companyOpportunity.findUnique({ where: { id: oppId } });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');
    return opp;
  }
}

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesLeadStatus } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';

export interface CreateLeadDto {
  name: string;
  organizationName?: string;
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  source?: string;
  industry?: string;
  geography?: string;
  companySize?: string;
  notes?: string;
  targetAccountId?: string;
  metadata?: Record<string, any>;
}

const ALLOWED_TRANSITIONS: Record<SalesLeadStatus, SalesLeadStatus[]> = {
  [SalesLeadStatus.NEW]: [SalesLeadStatus.CONTACTED, SalesLeadStatus.DISQUALIFIED],
  [SalesLeadStatus.CONTACTED]: [SalesLeadStatus.QUALIFIED, SalesLeadStatus.DISQUALIFIED],
  [SalesLeadStatus.QUALIFIED]: [SalesLeadStatus.CONVERTED, SalesLeadStatus.DISQUALIFIED],
  [SalesLeadStatus.DISQUALIFIED]: [],
  [SalesLeadStatus.CONVERTED]: [],
};

@Injectable()
export class SalesLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }
  }

  async createLead(companyId: string, actorId: string, dto: CreateLeadDto) {
    await this.verifyActor(actorId, companyId);

    if (dto.targetAccountId) {
      const account = await this.prisma.targetAccount.findUnique({ where: { id: dto.targetAccountId } });
      if (!account || account.companyId !== companyId) {
        throw new ForbiddenException('Target account does not belong to company');
      }
    }

    const lead = await this.prisma.salesLead.create({
      data: {
        companyId,
        name: dto.name,
        organizationName: dto.organizationName,
        contactName: dto.contactName,
        contactRole: dto.contactRole,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        source: dto.source,
        industry: dto.industry,
        geography: dto.geography,
        companySize: dto.companySize,
        notes: dto.notes,
        targetAccountId: dto.targetAccountId,
        metadata: dto.metadata ?? {},
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'LEAD_CREATED',
      objectType: 'SalesLead', objectId: lead.id,
      newValue: { status: lead.status }, salesLeadId: lead.id,
    });

    return lead;
  }

  async getLead(companyId: string, leadId: string) {
    const lead = await this.prisma.salesLead.findUnique({
      where: { id: leadId },
      include: { activities: true, qualifications: true, targetAccount: true },
    });
    if (!lead || lead.companyId !== companyId) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async listLeads(companyId: string) {
    return this.prisma.salesLead.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async advanceLeadStatus(
    companyId: string,
    actorId: string,
    leadId: string,
    targetStatus: SalesLeadStatus,
  ) {
    await this.verifyActor(actorId, companyId);

    const lead = await this.prisma.salesLead.findUnique({ where: { id: leadId } });
    if (!lead || lead.companyId !== companyId) {
      throw new NotFoundException('Lead not found');
    }

    const allowed = ALLOWED_TRANSITIONS[lead.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition lead from ${lead.status} to ${targetStatus}`,
      );
    }

    const updated = await this.prisma.salesLead.update({
      where: { id: leadId },
      data: { status: targetStatus },
    });

    await this.audit.record({
      companyId, actorId, action: 'LEAD_STATUS_CHANGED',
      objectType: 'SalesLead', objectId: leadId,
      oldValue: { status: lead.status },
      newValue: { status: targetStatus },
      salesLeadId: leadId,
    });

    return updated;
  }

  async assignLead(companyId: string, actorId: string, leadId: string, assigneeId: string) {
    await this.verifyActor(actorId, companyId);

    const assignee = await this.prisma.employee.findUnique({ where: { id: assigneeId } });
    if (!assignee || assignee.companyId !== companyId) {
      throw new ForbiddenException('Assignee does not belong to company');
    }

    const lead = await this.prisma.salesLead.findUnique({ where: { id: leadId } });
    if (!lead || lead.companyId !== companyId) throw new NotFoundException('Lead not found');

    const updated = await this.prisma.salesLead.update({
      where: { id: leadId },
      data: { assignedToId: assigneeId },
    });

    await this.audit.record({
      companyId, actorId, action: 'LEAD_ASSIGNED',
      objectType: 'SalesLead', objectId: leadId,
      oldValue: { assignedToId: lead.assignedToId },
      newValue: { assignedToId: assigneeId },
      salesLeadId: leadId,
    });

    return updated;
  }

  async convertLeadToOpportunity(
    companyId: string,
    actorId: string,
    leadId: string,
    opportunityData: {
      title: string;
      clientId: string;
      description?: string;
      estimatedValue?: number;
      expectedCloseDate?: Date;
      currency?: string;
    },
  ) {
    await this.verifyActor(actorId, companyId);

    const lead = await this.prisma.salesLead.findUnique({ where: { id: leadId } });
    if (!lead || lead.companyId !== companyId) throw new NotFoundException('Lead not found');

    if (lead.status !== SalesLeadStatus.QUALIFIED) {
      throw new BadRequestException('Only QUALIFIED leads can be converted to opportunities');
    }

    const client = await this.prisma.client.findUnique({ where: { id: opportunityData.clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client does not belong to company');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({
        data: {
          companyId,
          clientId: opportunityData.clientId,
          title: opportunityData.title,
          description: opportunityData.description,
          estimatedValue: opportunityData.estimatedValue,
          expectedCloseDate: opportunityData.expectedCloseDate,
          currency: opportunityData.currency ?? 'INR',
          salesLeadId: leadId,
          source: lead.source ?? 'LEAD_CONVERSION',
          ownerId: actorId,
        },
      });

      const updatedLead = await tx.salesLead.update({
        where: { id: leadId },
        data: {
          status: SalesLeadStatus.CONVERTED,
          convertedOpportunityId: opportunity.id,
        },
      });

      return { opportunity, lead: updatedLead };
    });

    await this.audit.record({
      companyId, actorId, action: 'LEAD_CONVERTED',
      objectType: 'SalesLead', objectId: leadId,
      newValue: { opportunityId: result.opportunity.id },
      salesLeadId: leadId, opportunityId: result.opportunity.id,
    });

    return result;
  }
}

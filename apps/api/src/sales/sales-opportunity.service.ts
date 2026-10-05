import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesStage, ExecutionEnvironment } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';

export interface CreateOpportunityDto {
  title: string;
  clientId: string;
  description?: string;
  estimatedValue?: number;
  currency?: string;
  expectedCloseDate?: Date;
  source?: string;
  inquiryId?: string;
  salesLeadId?: string;
}

const STAGE_TRANSITIONS: Record<SalesStage, SalesStage[]> = {
  [SalesStage.NEW]: [SalesStage.QUALIFICATION, SalesStage.DISQUALIFIED],
  [SalesStage.QUALIFICATION]: [SalesStage.DISCOVERY, SalesStage.DISQUALIFIED, SalesStage.LOST],
  [SalesStage.DISCOVERY]: [SalesStage.SOLUTION, SalesStage.DISQUALIFIED, SalesStage.LOST],
  [SalesStage.SOLUTION]: [SalesStage.PROPOSAL, SalesStage.DISQUALIFIED, SalesStage.LOST],
  [SalesStage.PROPOSAL]: [SalesStage.NEGOTIATION, SalesStage.LOST, SalesStage.DISQUALIFIED],
  [SalesStage.NEGOTIATION]: [SalesStage.WON, SalesStage.LOST],
  // Terminal states
  [SalesStage.WON]: [],
  [SalesStage.LOST]: [],
  [SalesStage.DISQUALIFIED]: [],
};

// WON transition requires chairman-approved ApprovalRequest
const WON_REQUIRES_APPROVAL = true;

@Injectable()
export class SalesOpportunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
    private readonly approvalValidation: ApprovalValidationService,
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

  async createOpportunity(companyId: string, actorId: string, dto: CreateOpportunityDto) {
    await this.verifyActor(actorId, companyId);

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client does not belong to company');
    }

    if (dto.salesLeadId) {
      const lead = await this.prisma.salesLead.findUnique({ where: { id: dto.salesLeadId } });
      if (!lead || lead.companyId !== companyId) {
        throw new ForbiddenException('SalesLead does not belong to company');
      }
    }

    const opp = await this.prisma.opportunity.create({
      data: {
        companyId,
        clientId: dto.clientId,
        title: dto.title,
        description: dto.description,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency ?? 'INR',
        expectedCloseDate: dto.expectedCloseDate,
        source: dto.source,
        inquiryId: dto.inquiryId,
        salesLeadId: dto.salesLeadId,
        ownerId: actorId,
        lastActivityAt: new Date(),
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'OPPORTUNITY_CREATED',
      objectType: 'Opportunity', objectId: opp.id,
      newValue: { salesStage: opp.salesStage, title: opp.title },
      opportunityId: opp.id,
    });

    return opp;
  }

  async getOpportunity(companyId: string, opportunityId: string) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        proposals: true,
        contracts: true,
        client: true,
        inquiry: true,
        salesActivities: { orderBy: { createdAt: 'desc' }, take: 10 },
        scores: { orderBy: { createdAt: 'desc' }, take: 1 },
        qualifications: { orderBy: { createdAt: 'desc' }, take: 1 },
        owner: { select: { id: true, name: true } },
      },
    });
    if (!opp || opp.companyId !== companyId) {
      throw new NotFoundException('Opportunity not found');
    }
    return opp;
  }

  async listOpportunities(companyId: string) {
    return this.prisma.opportunity.findMany({
      where: { companyId },
      include: { client: true, owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async advanceSalesStage(
    companyId: string,
    actorId: string,
    opportunityId: string,
    targetStage: SalesStage,
    approvalId?: string,
  ) {
    await this.verifyActor(actorId, companyId);

    const opp = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');

    const allowed = STAGE_TRANSITIONS[opp.salesStage] ?? [];
    if (!allowed.includes(targetStage)) {
      throw new BadRequestException(
        `Cannot transition opportunity from ${opp.salesStage} to ${targetStage}`,
      );
    }

    // WON requires an approved ApprovalRequest — validated, target-bound, and consumed atomically.
    // Uses the authoritative ApprovalValidationService established in Phase 22/23/24.
    // This prevents replay, concurrent replay, TOCTOU, and expired-approval attacks.
    if (targetStage === SalesStage.WON && WON_REQUIRES_APPROVAL) {
      if (!approvalId) {
        throw new BadRequestException('Transitioning to WON requires an approvalId');
      }
      await this.approvalValidation.validateAndConsumeApproval(approvalId, {
        companyId,
        action: 'MARK_OPPORTUNITY_WON',
        targetType: 'Opportunity',
        targetId: opportunityId,
        environment: ExecutionEnvironment.PRODUCTION,
        params: { opportunityId },
      });
    }

    const updated = await this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: { salesStage: targetStage, lastActivityAt: new Date() },
    });

    await this.audit.record({
      companyId, actorId, action: 'OPPORTUNITY_STAGE_CHANGED',
      objectType: 'Opportunity', objectId: opportunityId,
      oldValue: { salesStage: opp.salesStage },
      newValue: { salesStage: targetStage },
      opportunityId,
    });

    return updated;
  }

  async assignOwner(companyId: string, actorId: string, opportunityId: string, ownerId: string) {
    await this.verifyActor(actorId, companyId);

    const owner = await this.prisma.employee.findUnique({ where: { id: ownerId } });
    if (!owner || owner.companyId !== companyId) {
      throw new ForbiddenException('Owner does not belong to company');
    }

    const opp = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');

    return this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: { ownerId },
    });
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalStatus, ExecutionEnvironment } from '@prisma/client';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';

@Injectable()
export class ProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionGate: ProductionExecutionGateService,
    private readonly approvalValidation: ApprovalValidationService
  ) {}

  generateCommercialHash(data: any): string {
    const { hashMaterialParams } = require('../approval/parameter-binding.util');
    const commercialTerms = {
      customerId: data.customerId,
      title: data.title,
      description: data.description,
      lineItems: data.lineItems,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      currency: data.currency,
      discount: data.discount,
      tax: data.tax,
      total: data.total,
      paymentTerms: data.paymentTerms,
      effectiveDate: data.effectiveDate,
    };
    return hashMaterialParams(commercialTerms);
  }

  async createProposal(opportunityId: string, data: any) {
    const opp = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opp) throw new BadRequestException('Opportunity not found');

    const unitPrice = data.unitPrice || 0;
    const quantity = data.quantity || 1;
    const tax = data.tax || 0;
    const discount = data.discount || 0;
    const total = (unitPrice * quantity) + tax - discount;

    return this.prisma.proposal.create({
      data: {
        opportunityId,
        customerId: opp.clientId,
        title: data.title || 'Standard Proposal',
        lineItems: data.lineItems || [],
        quantity,
        unitPrice,
        currency: data.currency || 'INR',
        discount,
        tax,
        total,
        scope: data.scope || '',
        deliverables: data.deliverables || '',
        assumptions: data.assumptions,
        exclusions: data.exclusions,
        estimatedTimeline: data.estimatedTimeline,
        proposedPrice: data.proposedPrice || total,
        internalEstimatedCost: data.internalEstimatedCost,
      },
    });
  }

  async getProposal(id: string) {
    return this.prisma.proposal.findUnique({
      where: { id },
      include: { opportunity: true, approvals: true, customer: true },
    });
  }

  async updateProposalStatus(id: string, status: ProposalStatus) {
    return this.prisma.proposal.update({
      where: { id },
      data: { status },
    });
  }

  async approveProposal(id: string, actorId: string, companyId: string, approvalId: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new BadRequestException('Proposal not found');
    
    if (proposal.status !== 'DRAFT' && proposal.status !== 'INTERNAL_REVIEW') {
      throw new BadRequestException('Proposal is not in a valid state for approval');
    }

    const commercialHash = this.generateCommercialHash({
      customerId: proposal.customerId,
      title: proposal.title,
      description: proposal.scope, // description mapped from scope
      lineItems: proposal.lineItems,
      quantity: proposal.quantity,
      unitPrice: proposal.unitPrice,
      currency: proposal.currency,
      discount: proposal.discount,
      tax: proposal.tax,
      total: proposal.total,
      paymentTerms: null,
      effectiveDate: null,
    });

    await this.executionGate.authorizeProductionAction({
      actorId,
      companyId,
      environment: ExecutionEnvironment.PRODUCTION,
      capability: 'APPROVE_PROPOSAL',
      action: 'APPROVE',
      resourceId: id,
      approvalId,
      parameters: {
        commercialHash,
        clientId: proposal.customerId,
      },
    });

    await this.prisma.proposalApproval.create({
      data: {
        proposalId: id,
        actorId,
        decision: 'APPROVE',
      },
    });

    return this.updateProposalStatus(id, 'ACCEPTED');
  }
}

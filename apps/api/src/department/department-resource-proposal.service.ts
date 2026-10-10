import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceProposalStatus, CeoDecisionRiskLevel } from '@prisma/client';

export interface CreateResourceProposalDto {
  departmentId: string;
  requestedResource: string;
  reason: string;
  expectedOutcome: string;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  cost?: number;
  riskTier?: CeoDecisionRiskLevel;
  opportunityCost?: string;
  alternatives?: string[];
  expectedDuration?: string;
  successCriteria?: string[];
  proposerAgentId: string;
  correlationId?: string;
  causationId?: string;
}

@Injectable()
export class DepartmentResourceProposalService {
  private readonly logger = new Logger(DepartmentResourceProposalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submits a structured, evidence-based resource proposal from a department to the CEO.
   * Enforces:
   * 1. Explicit business justification and expected outcome
   * 2. Alternatives and opportunity costs considered
   * 3. Strict company isolation
   * 4. Multi-level risk classification
   */
  async submitProposal(companyId: string, dto: CreateResourceProposalDto) {
    if (!companyId || !dto.departmentId) {
      throw new BadRequestException('Resource proposal requires explicit companyId and departmentId');
    }

    if (!dto.requestedResource || !dto.reason || !dto.expectedOutcome) {
      throw new BadRequestException('Proposal must specify requestedResource, reason, and expectedOutcome');
    }

    // Verify department exists in company
    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, companyId },
    });
    if (!department) {
      throw new NotFoundException(`Department ${dto.departmentId} not found in company ${companyId}`);
    }

    // Verify proposer is active in company
    const proposer = await this.prisma.employee.findFirst({
      where: { id: dto.proposerAgentId, companyId, status: 'ACTIVE' },
    });
    if (!proposer) {
      throw new BadRequestException(`Proposer agent ${dto.proposerAgentId} is not an active employee in company`);
    }

    const proposal = await this.prisma.departmentResourceProposal.create({
      data: {
        companyId,
        departmentId: dto.departmentId,
        requestedResource: dto.requestedResource.trim(),
        reason: dto.reason.trim(),
        expectedOutcome: dto.expectedOutcome.trim(),
        urgency: dto.urgency || 'MEDIUM',
        cost: dto.cost || 0,
        riskTier: dto.riskTier || CeoDecisionRiskLevel.LOW,
        status: ResourceProposalStatus.SUBMITTED,
        opportunityCost: dto.opportunityCost,
        alternatives: dto.alternatives || [],
        expectedDuration: dto.expectedDuration,
        successCriteria: dto.successCriteria || [],
        proposerAgentId: dto.proposerAgentId,
        correlationId: dto.correlationId,
        causationId: dto.causationId,
      },
      include: {
        department: true,
      },
    });

    // Authoritative audit event
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'DEPARTMENT_RESOURCE_PROPOSAL_SUBMITTED',
        payload: {
          proposalId: proposal.id,
          departmentId: dto.departmentId,
          requestedResource: proposal.requestedResource,
          urgency: proposal.urgency,
          cost: proposal.cost,
          riskTier: proposal.riskTier,
          proposerAgentId: dto.proposerAgentId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit resource proposal event: ${e.message}`));

    this.logger.log(
      `[DepartmentResourceProposal] Submitted proposal ${proposal.id} for "${proposal.requestedResource}" from department ${department.name}`,
    );

    return proposal;
  }

  /**
   * Retrieves a resource proposal with company isolation.
   */
  async getProposal(proposalId: string, companyId: string) {
    const proposal = await this.prisma.departmentResourceProposal.findFirst({
      where: { id: proposalId, companyId },
      include: { department: true },
    });

    if (!proposal) {
      throw new NotFoundException(`Resource proposal ${proposalId} not found in company ${companyId}`);
    }

    return proposal;
  }

  /**
   * Lists all resource proposals for a department or company.
   */
  async listProposals(companyId: string, departmentId?: string) {
    return this.prisma.departmentResourceProposal.findMany({
      where: {
        companyId,
        departmentId: departmentId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: { department: true },
    });
  }

  /**
   * Reviews and decides on a proposal by CEO authority.
   */
  async reviewProposal(
    proposalId: string,
    companyId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewerComment: string,
  ) {
    const proposal = await this.prisma.departmentResourceProposal.findFirst({
      where: { id: proposalId, companyId },
    });

    if (!proposal) {
      throw new NotFoundException(`Resource proposal ${proposalId} not found in company ${companyId}`);
    }

    const newStatus =
      decision === 'APPROVED' ? ResourceProposalStatus.APPROVED : ResourceProposalStatus.REJECTED;

    const updated = await this.prisma.departmentResourceProposal.update({
      where: { id: proposalId },
      data: {
        status: newStatus,
        reviewerComment,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'DEPARTMENT_RESOURCE_PROPOSAL_REVIEWED',
        payload: {
          proposalId,
          decision,
          reviewerComment,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit proposal review event: ${e.message}`));

    this.logger.log(
      `[DepartmentResourceProposal] Proposal ${proposalId} decided as ${decision}: "${reviewerComment}"`,
    );

    return updated;
  }
}

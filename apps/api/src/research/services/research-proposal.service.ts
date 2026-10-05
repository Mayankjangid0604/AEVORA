import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResearchProjectStatus } from '@prisma/client';

@Injectable()
export class ResearchProposalService {
  constructor(private readonly prisma: PrismaService) {}

  async createProposal(companyId: string, proposerId: string, data: {
    title: string;
    description: string;
    researchQuestion: string;
    hypothesis: string;
    objectives: string;
    requestedBudget?: number;
    requestedCompute?: number;
    riskLevel?: string;
  }) {
    return this.prisma.researchProposal.create({
      data: {
        companyId,
        proposerId,
        title: data.title,
        description: data.description,
        researchQuestion: data.researchQuestion,
        hypothesis: data.hypothesis,
        objectives: data.objectives,
        requestedBudget: data.requestedBudget || 0,
        requestedCompute: data.requestedCompute || 0,
        riskLevel: data.riskLevel || 'LOW',
        status: 'DRAFT',
      },
    });
  }

  async submitProposal(proposalId: string, employeeId: string) {
    const proposal = await this.prisma.researchProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.proposerId !== employeeId) {
      throw new ForbiddenException('Only the proposer can submit the proposal');
    }
    return this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { status: 'SUBMITTED' },
    });
  }

  async reviewProposal(companyId: string, proposalId: string, reviewerId: string, decision: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', approvalMetadata?: any) {
    const originalProposal = await this.prisma.researchProposal.findUnique({ where: { id: proposalId } });
    if (!originalProposal) {
      throw new ForbiddenException('Proposal not found');
    }
    if (originalProposal.companyId !== companyId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    let isAuthorized = false;
    
    // Check if reviewer is a Chairman
    const chairman = await this.prisma.chairman.findUnique({ where: { id: reviewerId } });
    if (chairman) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company && company.chairmanId === reviewerId) {
        isAuthorized = true;
      }
    } else {
      // Check if reviewer is an Employee with CHAIRMAN or MANAGEMENT role
      const employee = await this.prisma.employee.findUnique({
        where: { id: reviewerId },
        include: { role: true }
      });
      if (employee && employee.companyId === companyId && employee.role) {
        if (employee.role.title === 'CHAIRMAN' || employee.role.title === 'MANAGEMENT') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('Reviewer lacks required roles (CHAIRMAN, MANAGEMENT) or does not belong to company');
    }

    const proposal = await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { 
        status: decision, 
        reviewerId,
        approvalMetadata: approvalMetadata || {}
      },
    });

    if (decision === 'APPROVED') {
      // Auto-create the ResearchProject when approved
      await this.prisma.researchProject.create({
        data: {
          companyId: proposal.companyId,
          proposalId: proposal.id,
          name: proposal.title,
          description: proposal.description,
          objectives: proposal.objectives,
          ownerId: proposal.proposerId,
          budget: proposal.requestedBudget,
          status: ResearchProjectStatus.PLANNED,
        }
      });
    }

    return proposal;
  }
}

import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionGate: ProductionExecutionGateService
  ) {}

  async createProjectFromProposal(companyId: string, proposalId: string, actorId: string, approvalId?: string) {
    await this.executionGate.authorizeProductionAction({
      actorId,
      companyId,
      environment: ExecutionEnvironment.PRODUCTION,
      capability: 'CREATE_PROJECT',
      action: 'CREATE',
      resourceId: proposalId,
      approvalId,
      parameters: {},
    });

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { opportunity: true, approvals: true },
    });

    if (!proposal) {
      throw new BadRequestException('Proposal not found');
    }

    if (proposal.status !== 'ACCEPTED') {
      throw new BadRequestException('Proposal must be ACCEPTED before creating a project.');
    }

    const hasApproval = proposal.approvals.some(a => a.decision === 'APPROVE');
    if (!hasApproval) {
      throw new ForbiddenException('Proposal lacks formal Chairman approval ledger entry.');
    }

    const approvedContract = await this.prisma.contract.findFirst({
      where: { opportunityId: proposal.opportunityId, status: 'APPROVED' }
    });

    if (!approvedContract) {
      throw new BadRequestException('Project creation rejected: no approved/committed contract found for the opportunity.');
    }

    return this.prisma.project.create({
      data: {
        companyId,
        clientId: proposal.opportunity.clientId,
        opportunityId: proposal.opportunityId,
        proposalId: proposal.id,
        name: proposal.opportunity.title,
        description: proposal.scope,
      },
    });
  }

  async getProject(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: { tasks: true, client: true },
    });
  }
}


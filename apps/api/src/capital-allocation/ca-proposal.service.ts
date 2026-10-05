import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { CaProposalStatus, CaInvestmentCategory, CaRiskLevel, EmployeeStatus } from '@prisma/client';

// ponytail: env kill switch — swap for DB config if dynamic control needed
const proposalApprovalEnabled = () => process.env.CA_PROPOSAL_APPROVAL === 'enabled';

const PROPOSAL_TRANSITIONS: Record<CaProposalStatus, CaProposalStatus[]> = {
  DRAFT:      [CaProposalStatus.SUBMITTED],
  SUBMITTED:  [CaProposalStatus.ANALYZING],
  ANALYZING:  [CaProposalStatus.APPROVED, CaProposalStatus.REJECTED],
  APPROVED:   [],
  REJECTED:   [],
  WITHDRAWN:  [],
};

@Injectable()
export class CaProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CaAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  private assertTransition(current: CaProposalStatus, next: CaProposalStatus) {
    if (!PROPOSAL_TRANSITIONS[current].includes(next)) {
      throw new BadRequestException(`Cannot transition proposal from ${current} to ${next}`);
    }
  }

  async create(companyId: string, actorId: string, poolId: string, dto: {
    title: string; description?: string; category?: CaInvestmentCategory;
    targetBuId?: string; targetProductId?: string; targetStrategyId?: string;
    requestedMc: number; currency?: string; justification?: string;
    expectedRoiPct?: number; riskLevel?: CaRiskLevel; idempotencyKey: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.requestedMc)) throw new BadRequestException('requestedMc must be an integer');
    if (dto.expectedRoiPct !== undefined && !Number.isInteger(dto.expectedRoiPct)) throw new BadRequestException('expectedRoiPct must be an integer');
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    try {
      const proposal = await this.prisma.caAllocationProposal.create({
        data: {
          companyId, poolId,
          title: dto.title, description: dto.description,
          category: dto.category ?? CaInvestmentCategory.OTHER,
          targetBuId: dto.targetBuId, targetProductId: dto.targetProductId, targetStrategyId: dto.targetStrategyId,
          requestedMc: dto.requestedMc, currency: dto.currency ?? 'USD',
          justification: dto.justification, expectedRoiPct: dto.expectedRoiPct,
          riskLevel: dto.riskLevel ?? CaRiskLevel.MEDIUM,
          proposedBy: actorId,
          status: CaProposalStatus.DRAFT,
          idempotencyKey: dto.idempotencyKey,
          isAdvisory: true,
        },
      });
      await this.audit.record({ companyId, actorId, poolId, action: 'CA_PROPOSAL_CREATED', objectType: 'CaAllocationProposal', objectId: proposal.id });
      return proposal;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await this.prisma.caAllocationProposal.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!existing || existing.companyId !== companyId) throw new ForbiddenException('Idempotency key collision across tenants');
        return existing;
      }
      throw e;
    }
  }

  async submit(companyId: string, actorId: string, proposalId: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    this.assertTransition(p.status, CaProposalStatus.SUBMITTED);
    return this.prisma.caAllocationProposal.update({ where: { id: proposalId }, data: { status: CaProposalStatus.SUBMITTED } });
  }

  async review(companyId: string, actorId: string, proposalId: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    this.assertTransition(p.status, CaProposalStatus.ANALYZING);
    return this.prisma.caAllocationProposal.update({ where: { id: proposalId }, data: { status: CaProposalStatus.ANALYZING, reviewedBy: actorId } });
  }

  async approve(companyId: string, actorId: string, proposalId: string) {
    if (!proposalApprovalEnabled()) throw new ForbiddenException('CA_PROPOSAL_APPROVAL feature is disabled');
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    if (p.proposedBy === actorId) throw new ForbiddenException('Self-approval blocked');
    this.assertTransition(p.status, CaProposalStatus.APPROVED);
    const updated = await this.prisma.caAllocationProposal.update({ where: { id: proposalId }, data: { status: CaProposalStatus.APPROVED, approvedBy: actorId, approvedAt: new Date() } });
    await this.audit.record({ companyId, actorId, poolId: p.poolId, action: 'CA_PROPOSAL_APPROVED', objectType: 'CaAllocationProposal', objectId: proposalId });
    return updated;
  }

  async reject(companyId: string, actorId: string, proposalId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    this.assertTransition(p.status, CaProposalStatus.REJECTED);
    return this.prisma.caAllocationProposal.update({ where: { id: proposalId }, data: { status: CaProposalStatus.REJECTED, rejectedBy: actorId, rejectionReason: reason } });
  }

  async withdraw(companyId: string, actorId: string, proposalId: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    if (p.proposedBy !== actorId) throw new ForbiddenException('Only the proposer can withdraw');
    if (!([CaProposalStatus.DRAFT, CaProposalStatus.SUBMITTED] as string[]).includes(p.status)) {
      throw new BadRequestException('Can only withdraw DRAFT or SUBMITTED proposals');
    }
    return this.prisma.caAllocationProposal.update({ where: { id: proposalId }, data: { status: CaProposalStatus.WITHDRAWN } });
  }

  async list(companyId: string, poolId?: string, status?: CaProposalStatus) {
    return this.prisma.caAllocationProposal.findMany({
      where: { companyId, ...(poolId ? { poolId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, proposalId: string) {
    const p = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId }, include: { scenarios: true } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Proposal not found');
    return p;
  }
}

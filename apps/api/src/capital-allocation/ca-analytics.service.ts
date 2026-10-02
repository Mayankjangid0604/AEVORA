import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaProposalStatus, CaAllocationStatus } from '@prisma/client';

// Read-only advisory analytics — NEVER writes to Finance models
@Injectable()
export class CaAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async portfolioSummary(companyId: string) {
    const proposals = await this.prisma.caAllocationProposal.findMany({ where: { companyId } });
    const allocations = await this.prisma.caAuthorizedAllocation.findMany({ where: { companyId } });

    const approvedMc = allocations
      .filter(a => a.status === CaAllocationStatus.APPROVED)
      .reduce((s, a) => s + a.amountMc, 0);
    const executingMc = allocations
      .filter(a => a.status === CaAllocationStatus.EXECUTING)
      .reduce((s, a) => s + a.amountMc, 0);
    const completedMc = allocations
      .filter(a => a.status === CaAllocationStatus.COMPLETE)
      .reduce((s, a) => s + a.amountMc, 0);

    return {
      isAdvisory: true,
      totalProposals: proposals.length,
      draftProposals: proposals.filter(p => p.status === CaProposalStatus.DRAFT).length,
      submittedProposals: proposals.filter(p => p.status === CaProposalStatus.SUBMITTED).length,
      approvedProposals: proposals.filter(p => p.status === CaProposalStatus.APPROVED).length,
      rejectedProposals: proposals.filter(p => p.status === CaProposalStatus.REJECTED).length,
      totalAllocations: allocations.length,
      approvedMc,
      executingMc,
      completedMc,
    };
  }

  async concentrationAnalysis(companyId: string, poolId: string) {
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    const proposals = await this.prisma.caAllocationProposal.findMany({
      where: { companyId, poolId },
    });
    const byCategory: Record<string, number> = {};
    for (const p of proposals) {
      byCategory[p.category] = (byCategory[p.category] ?? 0) + p.requestedMc;
    }
    return {
      isAdvisory: true,
      poolId,
      totalRequestedMc: proposals.reduce((s, p) => s + p.requestedMc, 0),
      byCategory,
    };
  }
}

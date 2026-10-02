import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DecisionProposalService {
  constructor(private readonly prisma: PrismaService) {}

  async createProposal(companyId: string, employeeId: string, data: { sessionId?: string; title: string; problem: string; recommendation: string; rationale: string; confidence?: number; impactLevel?: any; options?: { title: string; description: string; advantages?: any[]; disadvantages?: any[]; risks?: any[]; estimatedEffort?: string; estimatedImpact?: string; evidenceSummary?: string }[] }) {
    const proposal = await this.prisma.decisionProposal.create({
      data: {
        companyId,
        employeeId,
        sessionId: data.sessionId,
        title: data.title,
        problem: data.problem,
        recommendation: data.recommendation,
        rationale: data.rationale,
        confidence: data.confidence?.toString() || 'MEDIUM',
        impactLevel: data.impactLevel || 'NORMAL',
        status: 'PROPOSED',
      },
    });

    if (data.options && data.options.length > 0) {
      for (const opt of data.options) {
        await this.prisma.decisionOption.create({
          data: {
            proposalId: proposal.id,
            title: opt.title,
            description: opt.description,
            advantages: (opt.advantages ?? []) as any,
            disadvantages: (opt.disadvantages ?? []) as any,
            risks: (opt.risks ?? []) as any,
            estimatedEffort: opt.estimatedEffort,
            estimatedImpact: opt.estimatedImpact,
          },
        });
      }
    }

    return proposal;
  }

  async reviewProposal(proposalId: string, reviewerId: string, result: 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFORMATION', feedback?: string) {
    const review = await this.prisma.decisionReview.create({
      data: {
        proposalId,
        reviewerId,
        result,
        feedback,
      },
    });

    if (result === 'APPROVE') {
      await this.prisma.decisionProposal.update({
        where: { id: proposalId },
        data: { status: 'APPROVED' },
      });
    } else if (result === 'REJECT') {
      await this.prisma.decisionProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' },
      });
    }

    return review;
  }
}

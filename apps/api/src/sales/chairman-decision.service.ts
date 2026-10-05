import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesStage, ApprovalRiskLevel } from '@prisma/client';

export interface ChairmanDecisionItem {
  type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  recommendation: string;
  evidence: string[];
  financialImpact?: number;
  riskLevel: string;
  objectType: string;
  objectId: string;
  requestedDecision: string;
  alternatives?: string[];
}

@Injectable()
export class ChairmanDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async getDecisionQueue(companyId: string): Promise<ChairmanDecisionItem[]> {
    const items: ChairmanDecisionItem[] = [];

    // 1. Opportunities pending WON approval
    const pendingWonApprovals = await this.prisma.approvalRequest.findMany({
      where: {
        companyId,
        action: 'MARK_OPPORTUNITY_WON',
        status: 'PENDING',
      },
    });
    for (const approval of pendingWonApprovals) {
      items.push({
        type: 'OPPORTUNITY_WON_APPROVAL',
        priority: 'HIGH',
        title: 'Opportunity Win Approval Required',
        description: `An opportunity has been progressed to WON stage and requires Chairman approval.`,
        recommendation: 'Review the opportunity details and approve or reject.',
        evidence: [`ApprovalRequest: ${approval.id}`, `Financial impact: ${approval.financialImpact ?? 'unknown'}`],
        financialImpact: approval.financialImpact ?? undefined,
        riskLevel: approval.riskLevel,
        objectType: 'ApprovalRequest',
        objectId: approval.id,
        requestedDecision: 'APPROVE or REJECT the WON transition',
        alternatives: ['Request more information', 'Reject with reason'],
      });
    }

    // 2. High-value opportunities in NEGOTIATION
    const highValueNegotiation = await this.prisma.opportunity.findMany({
      where: {
        companyId,
        salesStage: SalesStage.NEGOTIATION,
        estimatedValue: { gte: 500000 },
      },
      include: { client: true },
    });
    for (const opp of highValueNegotiation) {
      items.push({
        type: 'HIGH_VALUE_NEGOTIATION',
        priority: 'HIGH',
        title: `High-Value Negotiation: ${opp.title}`,
        description: `Opportunity with estimated value ${opp.estimatedValue} is in NEGOTIATION stage.`,
        recommendation: 'Review negotiation terms and provide guidance.',
        evidence: [`Client: ${opp.client.name}`, `Value: ${opp.estimatedValue} ${opp.currency}`],
        financialImpact: opp.estimatedValue ?? undefined,
        riskLevel: 'HIGH',
        objectType: 'Opportunity',
        objectId: opp.id,
        requestedDecision: 'Review and provide negotiation guidance or approve final terms',
      });
    }

    // 3. Pending high-risk approval requests (any)
    const highRiskApprovals = await this.prisma.approvalRequest.findMany({
      where: {
        companyId,
        status: 'PENDING',
        riskLevel: { in: [ApprovalRiskLevel.HIGH, ApprovalRiskLevel.CRITICAL] },
      },
    });
    for (const approval of highRiskApprovals) {
      if (approval.action === 'MARK_OPPORTUNITY_WON') continue; // already included above
      items.push({
        type: 'HIGH_RISK_APPROVAL',
        priority: 'HIGH',
        title: `High-Risk Approval: ${approval.action}`,
        description: approval.reasoning ?? 'A high-risk action requires Chairman review.',
        recommendation: 'Review the proposed action and approve or reject.',
        evidence: [`Action: ${approval.action}`, `Risk: ${approval.riskLevel}`],
        financialImpact: approval.financialImpact ?? undefined,
        riskLevel: approval.riskLevel,
        objectType: 'ApprovalRequest',
        objectId: approval.id,
        requestedDecision: 'APPROVE or REJECT',
      });
    }

    return items.sort((a, _b) => (a.priority === 'HIGH' ? -1 : 1));
  }
}

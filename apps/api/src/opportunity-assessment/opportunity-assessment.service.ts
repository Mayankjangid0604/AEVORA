import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunityService } from '../opportunity/opportunity.service';

@Injectable()
export class OpportunityAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opportunityService: OpportunityService,
  ) {}

  async assessOpportunity(opportunityId: string) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { inquiry: true }
    });

    if (!opp || !opp.inquiry) {
      throw new Error('Opportunity or Inquiry not found');
    }

    // Deterministic matching: look at the budget, requirements, and assign cost
    // For demo purposes, we can hardcode this deterministic logic.
    let estimatedCost = 50000;
    let expectedDuration = 30; // days
    let confidence = 75;

    if (opp.inquiry.budget) {
      if (opp.inquiry.budget > 100000) {
         estimatedCost = 80000;
         expectedDuration = 60;
         confidence = 90;
      } else {
         estimatedCost = Math.round(opp.inquiry.budget / 2);
      }
    }

    const estimatedProfit = opp.inquiry.budget ? (opp.inquiry.budget - estimatedCost) : 10000;

    return this.opportunityService.updateOpportunityAssessments(opportunityId, {
       estimatedCost: Math.floor(estimatedCost),
       estimatedProfit: Math.floor(estimatedProfit),
       expectedDuration,
       confidence
    });
  }
}


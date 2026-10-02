import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QualificationRecommendation, SalesActorType } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';

export interface QualificationInput {
  customerFitScore?: number;
  problemClarityScore?: number;
  budgetSignalScore?: number;
  urgencyScore?: number;
  authorityScore?: number;
  technicalFeasibilityScore?: number;
  strategicRelevanceScore?: number;
  deliveryFeasibilityScore?: number;
  riskScore?: number;
  reasoning: string;
  evidence?: any[];
  opportunityId?: string;
  salesLeadId?: string;
  evaluatorType?: SalesActorType;
}

function validateScore(value: number | undefined, field: string): void {
  if (value !== undefined && (value < 0 || value > 100 || !Number.isInteger(value))) {
    throw new BadRequestException(`${field} must be an integer between 0 and 100`);
  }
}

function computeOverallScore(input: QualificationInput): number {
  const scores = [
    input.customerFitScore,
    input.problemClarityScore,
    input.budgetSignalScore,
    input.urgencyScore,
    input.authorityScore,
    input.technicalFeasibilityScore,
    input.strategicRelevanceScore,
    input.deliveryFeasibilityScore,
  ].filter((s): s is number => s !== undefined);

  if (scores.length === 0) return 50;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function deriveRecommendation(overall: number, riskScore?: number): QualificationRecommendation {
  if (riskScore !== undefined && riskScore > 75) return QualificationRecommendation.DISQUALIFIED;
  if (overall >= 65) return QualificationRecommendation.QUALIFIED;
  if (overall >= 40) return QualificationRecommendation.NEEDS_MORE_INFO;
  return QualificationRecommendation.DISQUALIFIED;
}

@Injectable()
export class QualificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  async evaluateQualification(companyId: string, evaluatorId: string, input: QualificationInput) {
    const evaluator = await this.prisma.employee.findUnique({ where: { id: evaluatorId } });
    if (!evaluator || evaluator.companyId !== companyId) {
      throw new ForbiddenException('Evaluator does not belong to company');
    }
    if (evaluator.status !== 'ACTIVE') {
      throw new ForbiddenException('Evaluator is not an active employee');
    }

    if (!input.opportunityId && !input.salesLeadId) {
      throw new BadRequestException('Must provide opportunityId or salesLeadId');
    }

    // Validate all score fields
    validateScore(input.customerFitScore, 'customerFitScore');
    validateScore(input.problemClarityScore, 'problemClarityScore');
    validateScore(input.budgetSignalScore, 'budgetSignalScore');
    validateScore(input.urgencyScore, 'urgencyScore');
    validateScore(input.authorityScore, 'authorityScore');
    validateScore(input.technicalFeasibilityScore, 'technicalFeasibilityScore');
    validateScore(input.strategicRelevanceScore, 'strategicRelevanceScore');
    validateScore(input.deliveryFeasibilityScore, 'deliveryFeasibilityScore');
    validateScore(input.riskScore, 'riskScore');

    if (input.opportunityId) {
      const opp = await this.prisma.opportunity.findUnique({ where: { id: input.opportunityId } });
      if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');
    }

    if (input.salesLeadId) {
      const lead = await this.prisma.salesLead.findUnique({ where: { id: input.salesLeadId } });
      if (!lead || lead.companyId !== companyId) throw new NotFoundException('Lead not found');
    }

    const overallScore = computeOverallScore(input);
    const recommendation = deriveRecommendation(overallScore, input.riskScore);

    const record = await this.prisma.qualificationRecord.create({
      data: {
        companyId,
        evaluatorId,
        evaluatorType: input.evaluatorType ?? SalesActorType.HUMAN,
        opportunityId: input.opportunityId,
        salesLeadId: input.salesLeadId,
        customerFitScore: input.customerFitScore,
        problemClarityScore: input.problemClarityScore,
        budgetSignalScore: input.budgetSignalScore,
        urgencyScore: input.urgencyScore,
        authorityScore: input.authorityScore,
        technicalFeasibilityScore: input.technicalFeasibilityScore,
        strategicRelevanceScore: input.strategicRelevanceScore,
        deliveryFeasibilityScore: input.deliveryFeasibilityScore,
        riskScore: input.riskScore,
        overallScore,
        recommendation,
        reasoning: input.reasoning,
        evidence: input.evidence ?? [],
      },
    });

    await this.audit.record({
      companyId, actorId: evaluatorId, actorType: input.evaluatorType,
      action: 'QUALIFICATION_EVALUATED',
      objectType: 'QualificationRecord', objectId: record.id,
      newValue: { overallScore, recommendation },
      opportunityId: input.opportunityId, salesLeadId: input.salesLeadId,
    });

    return record;
  }

  async getQualifications(companyId: string, filters: { opportunityId?: string; salesLeadId?: string }) {
    return this.prisma.qualificationRecord.findMany({
      where: { companyId, ...filters },
      orderBy: { createdAt: 'desc' },
    });
  }
}

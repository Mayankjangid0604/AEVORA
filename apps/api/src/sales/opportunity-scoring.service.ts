import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesActorType } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';

export interface ScoreInput {
  opportunityId: string;
  humanInputs?: {
    estimatedValue?: number;
    probability?: number;
    customerRelationshipStrength?: number;
    competitivePosition?: number;
  };
  modelEstimates?: {
    marketFit?: number;
    deliveryConfidence?: number;
    strategicValue?: number;
    source?: string;
    modelId?: string;
  };
  reasoning: string;
  scoredByType?: SalesActorType;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

@Injectable()
export class OpportunityScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  async scoreOpportunity(companyId: string, scoredById: string, input: ScoreInput) {
    const actor = await this.prisma.employee.findUnique({ where: { id: scoredById } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }

    const opp = await this.prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      include: { qualifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');

    const humanInputs = input.humanInputs ?? {};
    const modelEstimates = input.modelEstimates ?? {};

    // Compute score components deterministically from explicit inputs
    const components: Record<string, number> = {};

    // Human-provided components
    if (humanInputs.probability !== undefined) {
      if (humanInputs.probability < 0 || humanInputs.probability > 100) {
        throw new BadRequestException('probability must be 0-100');
      }
      components.probability = clamp(humanInputs.probability);
    }

    if (humanInputs.customerRelationshipStrength !== undefined) {
      components.customerRelationship = clamp(humanInputs.customerRelationshipStrength);
    }

    if (humanInputs.competitivePosition !== undefined) {
      components.competitive = clamp(humanInputs.competitivePosition);
    }

    // AI/model-derived components — clearly labeled
    if (modelEstimates.marketFit !== undefined) {
      components['model:marketFit'] = clamp(modelEstimates.marketFit);
    }
    if (modelEstimates.deliveryConfidence !== undefined) {
      components['model:deliveryConfidence'] = clamp(modelEstimates.deliveryConfidence);
    }
    if (modelEstimates.strategicValue !== undefined) {
      components['model:strategicValue'] = clamp(modelEstimates.strategicValue);
    }

    // Latest qualification record contributes if present
    const latestQual = opp.qualifications[0];
    if (latestQual) {
      components['qualification:overallScore'] = clamp(latestQual.overallScore);
    }

    const rawValues = Object.values(components);
    const scoreValue = rawValues.length > 0
      ? clamp(rawValues.reduce((a, b) => a + b, 0) / rawValues.length)
      : clamp(opp.confidence);

    const confidence = rawValues.length > 0
      ? clamp(40 + rawValues.length * 5)
      : 30;

    const explanations = Object.entries(components).map(
      ([key, val]) => `${key}: ${val}`
    );
    if (latestQual) {
      explanations.push(`qualification recommendation: ${latestQual.recommendation}`);
    }

    const score = await this.prisma.opportunityScore.create({
      data: {
        companyId,
        opportunityId: input.opportunityId,
        scoreValue,
        inputs: { humanInputs, modelEstimates } as any,
        components: components as any,
        modelEstimates: (modelEstimates ?? {}) as any,
        humanInputs: (humanInputs ?? {}) as any,
        confidence,
        reasoning: input.reasoning,
        explanations: explanations as any,
        scoredById,
        scoredByType: input.scoredByType ?? SalesActorType.HUMAN,
      },
    });

    await this.prisma.opportunity.update({
      where: { id: input.opportunityId },
      data: { confidence: scoreValue },
    });

    await this.audit.record({
      companyId, actorId: scoredById, actorType: input.scoredByType,
      action: 'OPPORTUNITY_SCORED',
      objectType: 'OpportunityScore', objectId: score.id,
      newValue: { scoreValue, confidence },
      opportunityId: input.opportunityId,
    });

    return score;
  }

  async getScores(companyId: string, opportunityId: string) {
    const opp = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opp || opp.companyId !== companyId) throw new NotFoundException('Opportunity not found');

    return this.prisma.opportunityScore.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

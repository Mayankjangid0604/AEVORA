import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';

export interface BrandEvaluationResult {
  contentId: string;
  overallScore: number;  // 0-100, advisory only
  findings: Array<{
    category: string;
    finding: string;
    severity: 'INFO' | 'WARNING' | 'VIOLATION';
  }>;
  recommendations: string[];
  disclaimer: string;
  evaluatedAt: Date;
}

@Injectable()
export class BrandConsistencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not an active employee');
    return actor;
  }

  async evaluateContentBrandFit(companyId: string, actorId: string, contentId: string): Promise<BrandEvaluationResult> {
    await this.verifyActor(actorId, companyId);
    const content = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!content || content.companyId !== companyId) throw new NotFoundException('Content not found');

    const profile = await this.prisma.brandProfile.findUnique({
      where: { companyId },
      include: { guidelines: { where: { isActive: true } } },
    });

    const findings: BrandEvaluationResult['findings'] = [];
    const recommendations: string[] = [];
    let score = 70; // base score

    if (!profile) {
      findings.push({ category: 'BRAND', finding: 'No brand profile configured', severity: 'WARNING' });
      recommendations.push('Create a brand profile to enable brand consistency checks');
      score = 50;
    } else {
      // Check tone
      if (profile.tone && !content.body.toLowerCase().includes(profile.tone.toLowerCase().split(' ')[0])) {
        findings.push({ category: 'TONE', finding: `Content may not align with ${profile.tone} tone`, severity: 'INFO' });
        recommendations.push(`Review content tone against brand guideline: ${profile.tone}`);
      }

      // Check prohibited messaging
      const prohibited = (profile.prohibitedMessaging as string[]) ?? [];
      for (const msg of prohibited) {
        if (content.body.toLowerCase().includes(msg.toLowerCase())) {
          findings.push({ category: 'MESSAGING', finding: `Contains prohibited messaging: "${msg}"`, severity: 'VIOLATION' });
          score -= 20;
        }
      }

      // Check guidelines
      for (const g of profile.guidelines) {
        if (g.category === 'PROHIBITION' && content.body.toLowerCase().includes(g.title.toLowerCase())) {
          findings.push({ category: 'GUIDELINE', finding: `Violates guideline: ${g.title}`, severity: 'VIOLATION' });
          score -= 10;
        }
      }
    }

    score = Math.max(0, Math.min(100, score));

    await this.audit.record({
      companyId, actorId, action: 'BRAND_CONSISTENCY_EVALUATED',
      objectType: 'MarketingContent', objectId: contentId,
      newValue: { score, findingCount: findings.length },
      contentId,
    });

    return {
      contentId,
      overallScore: score,
      findings,
      recommendations,
      disclaimer: 'ADVISORY ONLY. This brand score is an AI recommendation and does NOT constitute content approval. Human review is required before publication.',
      evaluatedAt: new Date(),
    };
  }

  async generateOptimizationRecommendations(companyId: string, actorId: string, _campaignId?: string) {
    await this.verifyActor(actorId, companyId);

    const contentCount = await this.prisma.marketingContent.count({ where: { companyId } });
    const publishedCount = await this.prisma.marketingContent.count({ where: { companyId, status: 'PUBLISHED' } });
    const draftCount = await this.prisma.marketingContent.count({ where: { companyId, status: 'DRAFT' } });

    const recommendations = [];
    if (draftCount > publishedCount * 2) {
      recommendations.push({ type: 'WORKFLOW', recommendation: 'High draft-to-publish ratio — review approval workflow throughput', priority: 'MEDIUM' });
    }
    if (contentCount === 0) {
      recommendations.push({ type: 'CONTENT', recommendation: 'No content created yet — start with brand guidelines and persona development', priority: 'HIGH' });
    }

    return {
      recommendations,
      disclaimer: 'ADVISORY ONLY. These recommendations are AI-generated suggestions. They do NOT authorize financial expenditure, publishing, or campaign changes.',
      generatedAt: new Date(),
    };
  }
}

import {
  Injectable, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingActorType } from '@prisma/client';

export const MARKETING_AGENT_ROLES = [
  'MARKET_RESEARCH_AGENT',
  'AUDIENCE_INTELLIGENCE_AGENT',
  'BRAND_STRATEGY_AGENT',
  'CAMPAIGN_PLANNING_AGENT',
  'CONTENT_STRATEGY_AGENT',
  'CONTENT_CREATION_AGENT',
  'BRAND_REVIEW_AGENT',
  'MARKETING_ANALYTICS_AGENT',
  'CAMPAIGN_OPTIMIZATION_AGENT',
] as const;
export type MarketingAgentRole = typeof MARKETING_AGENT_ROLES[number];

// Advisory actions only
const ROLE_DEFAULT_PERMISSIONS: Record<MarketingAgentRole, string[]> = {
  MARKET_RESEARCH_AGENT: ['RESEARCH_MARKET', 'ANALYZE_AUDIENCE', 'VIEW_ANALYTICS'],
  AUDIENCE_INTELLIGENCE_AGENT: ['ANALYZE_AUDIENCE', 'VIEW_ANALYTICS', 'RESEARCH_MARKET'],
  BRAND_STRATEGY_AGENT: ['VIEW_BRAND', 'RESEARCH_MARKET', 'ANALYZE_AUDIENCE'],
  CAMPAIGN_PLANNING_AGENT: ['DRAFT_CAMPAIGN', 'VIEW_ANALYTICS', 'ANALYZE_AUDIENCE'],
  CONTENT_STRATEGY_AGENT: ['GENERATE_CONTENT', 'VIEW_BRAND', 'DRAFT_CAMPAIGN'],
  CONTENT_CREATION_AGENT: ['GENERATE_CONTENT', 'SCORE_CONTENT', 'RECOMMEND_CHANNEL'],
  BRAND_REVIEW_AGENT: ['SCORE_CONTENT', 'VIEW_BRAND', 'RECOMMEND_TIMING'],
  MARKETING_ANALYTICS_AGENT: ['VIEW_ANALYTICS', 'ANALYZE_CAMPAIGN', 'RECOMMEND_OPTIMIZATION'],
  CAMPAIGN_OPTIMIZATION_AGENT: ['ANALYZE_CAMPAIGN', 'RECOMMEND_OPTIMIZATION', 'VIEW_ANALYTICS'],
};

// Permissions that NO marketing agent can ever have
export const FORBIDDEN_MARKETING_AGENT_PERMISSIONS = [
  'APPROVE_CAMPAIGN',
  'APPROVE_CONTENT',
  'PUBLISH_CONTENT',
  'AUTHORIZE_SPEND',
  'APPROVE_PAYMENT',
  'ISSUE_INVOICE',
  'MODIFY_FINANCIAL_AUTHORITY',
  'BYPASS_APPROVAL',
  'IMPERSONATE_CHAIRMAN',
  'GRANT_PERMISSIONS',
  'OVERRIDE_GOVERNANCE',
  'FABRICATE_TESTIMONIAL',
  'FABRICATE_CUSTOMER_CLAIM',
];

export interface GenerateContentDto {
  title: string;
  contentType: string;
  channel?: string;
  targetAudience?: string;
  campaignId?: string;
  brandContext?: string;
  instructions?: string;
}

@Injectable()
export class MarketingAgentService {
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

  async configureMarketingAgent(
    companyId: string,
    grantedById: string,
    employeeId: string,
    agentRole: MarketingAgentRole,
    customPermissions?: string[],
  ) {
    const grantor = await this.prisma.employee.findUnique({ where: { id: grantedById } });
    if (!grantor || grantor.companyId !== companyId) throw new ForbiddenException('Grantor does not belong to company');
    if (grantor.status !== 'ACTIVE') throw new ForbiddenException('Grantor is not an active employee');

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target || target.companyId !== companyId) throw new ForbiddenException('Target employee does not belong to company');

    if (!MARKETING_AGENT_ROLES.includes(agentRole)) throw new BadRequestException(`Unknown agent role: ${agentRole}`);

    const permissions = customPermissions ?? ROLE_DEFAULT_PERMISSIONS[agentRole];
    for (const p of permissions) {
      if (FORBIDDEN_MARKETING_AGENT_PERMISSIONS.includes(p)) {
        throw new ForbiddenException(`Permission ${p} cannot be granted to any marketing AI agent`);
      }
    }

    const config = await this.prisma.marketingAgentConfig.upsert({
      where: { employeeId },
      create: { companyId, employeeId, agentRole, permissions, grantedById, isActive: true },
      update: { agentRole, permissions, grantedById, isActive: true },
    });

    await this.audit.record({
      companyId, actorId: grantedById, action: 'MARKETING_AGENT_CONFIG_GRANTED',
      objectType: 'MarketingAgentConfig', objectId: config.id,
      newValue: { agentRole, permissions },
    });
    return config;
  }

  async checkAgentPermission(companyId: string, employeeId: string, requiredPermission: string): Promise<void> {
    const config = await this.prisma.marketingAgentConfig.findUnique({ where: { employeeId } });
    if (!config || !config.isActive || config.companyId !== companyId) {
      throw new ForbiddenException('No active marketing agent configuration found');
    }
    if (FORBIDDEN_MARKETING_AGENT_PERMISSIONS.includes(requiredPermission)) {
      throw new ForbiddenException(`Permission ${requiredPermission} is never available to marketing AI agents`);
    }
    const perms = Array.isArray(config.permissions) ? (config.permissions as string[]) : [];
    if (!perms.includes(requiredPermission)) {
      throw new ForbiddenException(`Marketing agent lacks required permission: ${requiredPermission}`);
    }
  }

  async generateContentDraft(companyId: string, actorId: string, dto: GenerateContentDto) {
    await this.verifyActor(actorId, companyId);

    const brandProfile = await this.prisma.brandProfile.findUnique({ where: { companyId } });
    const tone = brandProfile?.tone ?? 'professional';
    const voice = brandProfile?.voice ?? 'informative';

    // AI draft — clearly labeled, stays DRAFT, NOT approved
    const draftBody = [
      `[AI GENERATED DRAFT — NOT APPROVED — REQUIRES HUMAN REVIEW]`,
      ``,
      `[Channel: ${dto.channel ?? 'unspecified'} | Audience: ${dto.targetAudience ?? 'general'} | Tone: ${tone} | Voice: ${voice}]`,
      ``,
      dto.instructions
        ? `Based on instructions: "${dto.instructions}"`
        : `Content draft for: ${dto.title}`,
      ``,
      `[This is a placeholder draft generated by an AI agent. The actual body must be written, reviewed, and approved by a human before publication.]`,
      `[Brand guidelines version: ${brandProfile?.version ?? 'N/A'} | Generated: ${new Date().toISOString()}]`,
    ].join('\n');

    const record = {
      title: dto.title,
      body: draftBody,
      contentType: dto.contentType,
      channel: dto.channel,
      campaignId: dto.campaignId,
      generatedByAI: true,
      aiModelId: 'marketing-agent-v1',
      aiGeneratedAt: new Date(),
      brandGuidelineVersion: brandProfile?.version,
    };

    await this.audit.record({
      companyId, actorId, action: 'AI_CONTENT_DRAFT_GENERATED',
      objectType: 'ContentDraft', objectId: 'draft-' + Date.now(),
      newValue: { title: dto.title, contentType: dto.contentType },
      actorType: MarketingActorType.AI_AGENT,
    });

    return {
      draft: record,
      disclaimer: 'AI-generated draft. Status is DRAFT. Requires human review and explicit approval before publication.',
    };
  }

  async generateCampaignIdeas(companyId: string, actorId: string, objective: string) {
    await this.verifyActor(actorId, companyId);
    const persona = await this.prisma.marketPersona.findFirst({ where: { companyId } });
    const brand = await this.prisma.brandProfile.findUnique({ where: { companyId } });

    return {
      ideas: [
        { name: `${objective} Awareness Campaign`, objective, suggestedChannels: ['BLOG', 'SOCIAL_LINKEDIN'], budgetRecommendation: null, isAdvisory: true },
        { name: `${objective} Education Series`, objective, suggestedChannels: ['EMAIL', 'WEBSITE'], budgetRecommendation: null, isAdvisory: true },
      ],
      brandContext: brand?.brandName ?? 'N/A',
      audienceContext: persona?.name ?? 'No personas configured',
      disclaimer: 'ADVISORY ONLY. Campaign ideas require human review, strategy approval, and budget authorization before execution. These are NOT spending commitments.',
      generatedAt: new Date(),
    };
  }
}

import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrandService } from './brand.service';
import { BrandConsistencyService } from './brand-consistency.service';
import { ModelGateway } from '@aevora/model-gateway';
import {
  MultiChannelCopyRequestDto,
  MultiChannelCopyResponse,
  TargetPlatform,
} from './marketing.types';

@Injectable()
export class MultiChannelCopyService {
  private readonly logger = new Logger(MultiChannelCopyService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandService: BrandService,
    private readonly brandConsistencyService: BrandConsistencyService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }
    return actor;
  }

  /**
   * Generates structured, platform-optimized marketing copy adhering to company brand guardrails.
   */
  async generateMultiChannelCopy(
    companyId: string,
    actorId: string,
    dto: MultiChannelCopyRequestDto,
  ): Promise<MultiChannelCopyResponse> {
    return this.generateCopy(companyId, actorId, dto);
  }

  async generateCopy(
    companyId: string,
    actorId: string,
    dto: MultiChannelCopyRequestDto,
  ): Promise<MultiChannelCopyResponse> {
    await this.verifyActor(actorId, companyId);

    if (!dto.topic || dto.topic.trim().length === 0) {
      throw new BadRequestException('Topic is required for copy generation');
    }

    const brand = await this.brandService.getBrandProfile(companyId);
    const brandName = brand?.brandName || 'Our Enterprise';
    const tone = dto.toneOverride || brand?.tone || 'Professional, authoritative, yet approachable';
    const voice = brand?.voice || 'Empowering and insight-driven';
    const audience = dto.targetAudience || brand?.targetAudience || 'B2B Business Decision Makers and Founders';

    let offerContext = '';
    if (dto.includeOfferPromotion) {
      offerContext = 'Special Offer: Special introductory enterprise promotion available. Contact team for tailored consultation and high-impact digital solutions.';
    }

    const prompt = this.buildPrompt(dto, brandName, tone, voice, audience, offerContext);

    let rawOutput: string | null = null;
    let isSimulated = false;

    try {
      const response = await this.gateway.generate({
        prompt,
        systemMessage: `You are an elite marketing copywriter for ${brandName}. You write high-converting, authentic, platform-native content that strictly complies with brand tone (${tone}) and audience context (${audience}). Do not make unsubstantiated or false claims. Return valid, well-structured text.`,
        temperature: 0.7,
        maxTokens: 1200,
        tier: 'local',
      });
      rawOutput = response.text;
    } catch (err: any) {
      this.logger.warn(`Model gateway generation failed: ${err.message}. Falling back to deterministic structured generator.`);
      rawOutput = null;
      isSimulated = true;
    }

    const parsedCopy = this.parseOrGenerateFallback(dto, rawOutput, brandName, tone, audience, offerContext);

    // Evaluate brand consistency findings
    const findings: Array<{ category: string; finding: string; severity: 'INFO' | 'WARNING' | 'VIOLATION' }> = [];
    let score = 95;

    const guideline = await this.prisma.brandGuideline.findFirst({
      where: { companyId },
      orderBy: { version: 'desc' },
    });
    const rules = ((guideline as any)?.rules as Record<string, any>) || {};
    const bannedWords: string[] = rules.bannedWords || (brand?.prohibitedMessaging as string[]) || [];

    for (const phrase of bannedWords) {
      if (
        parsedCopy.body.toLowerCase().includes(phrase.toLowerCase()) ||
        dto.topic.toLowerCase().includes(phrase.toLowerCase())
      ) {
        findings.push({
          category: 'MESSAGING',
          finding: `Content contains prohibited brand term: "${phrase}"`,
          severity: 'VIOLATION',
        });
        score -= 35;
      }
    }

    if (score < 0) score = 0;

    return {
      platform: dto.platform,
      headline: parsedCopy.headline,
      body: parsedCopy.body,
      characterCount: parsedCopy.body.length,
      hashtags: parsedCopy.hashtags,
      metadata: {
        suggestedImagePrompt: parsedCopy.suggestedImagePrompt,
        targetAudience: audience,
        readingTimeSeconds: Math.ceil(parsedCopy.body.split(/\s+/).length / 3.5),
        threadParts: parsedCopy.threadParts,
        callToAction: parsedCopy.callToAction,
      },
      brandFitScore: score,
      brandConsistencyFindings: findings,
      isSimulated,
      generatedAt: new Date(),
    };
  }

  private buildPrompt(
    dto: MultiChannelCopyRequestDto,
    brandName: string,
    tone: string,
    voice: string,
    audience: string,
    offerContext: string,
  ): string {
    return `Generate marketing content for ${dto.platform}.
Brand: ${brandName}
Tone: ${tone}
Voice: ${voice}
Target Audience: ${audience}
Topic: ${dto.topic}
Key Points: ${dto.keyPoints?.join(', ') || 'Industry insights, practical execution, strategic advantage'}
CTA: ${dto.callToAction || 'Learn more or schedule a session'}
${offerContext ? `Offer context: ${offerContext}` : ''}

Format rules for ${dto.platform}:
- LINKEDIN: Professional headline, 3-4 structured insight paragraphs with bullet points, strong hook, professional hashtags.
- TWITTER_X: A compelling main tweet under 280 characters, plus a 4-part thread breakdown.
- BLOG: SEO headline, meta description, introduction, 3 section headings (H2), conclusion, and call to action.
- NEWSLETTER: Email subject line, preview snippet, opening personal greeting, core value story, strategic takeaway, clear CTA.
- ADVERTISEMENT: Ad headline, primary text, punchy description, and call to action button copy.`;
  }

  private parseOrGenerateFallback(
    dto: MultiChannelCopyRequestDto,
    rawText: string | null,
    brandName: string,
    tone: string,
    audience: string,
    offerContext: string,
  ) {
    if (rawText && rawText.length > 50) {
      const lines = rawText.split('\n').filter(l => l.trim().length > 0);
      const headline = lines[0].replace(/^[#*\s]+/, '').slice(0, 150);
      const body = lines.slice(1).join('\n\n');
      const hashtags = (rawText.match(/#[A-Za-z0-9_]+/g) || ['#Aevora', '#Growth', '#Enterprise']).slice(0, 10);

      return {
        headline,
        body: body.length > 0 ? body : rawText,
        hashtags,
        suggestedImagePrompt: `Clean, modern editorial visual representing ${dto.topic} in ${brandName}'s sleek dark mode brand identity.`,
        threadParts: dto.platform === TargetPlatform.TWITTER_X ? this.extractThreadParts(rawText) : undefined,
        callToAction: dto.callToAction || `Discover how ${brandName} accelerates your business today.`,
      };
    }

    // Deterministic platform-specific fallback generator
    switch (dto.platform) {
      case TargetPlatform.LINKEDIN:
        return {
          headline: `How ${brandName} is Transforming ${dto.topic} for Modern Enterprises`,
          body: `In today's fast-moving business climate, mastering ${dto.topic} is no longer optional—it's a core competitive differentiator for ${audience}.\n\nHere are three strategic principles we recommend:\n\n1. Autonomous Governance: Build systems with built-in guardrails and verification.\n2. Closed-Loop Execution: Ensure every initiative directly ties to business ROI.\n3. Operational Resilience: Design for failure isolation and continuous improvement.\n\n${offerContext ? offerContext + '\n\n' : ''}What strategies have worked best in your organization?`,
          hashtags: ['#B2BStrategy', '#EnterpriseGrowth', '#Leadership', '#Innovation'],
          suggestedImagePrompt: `Executive boardroom presentation showing high-tech strategic data graph on glass screen.`,
          callToAction: dto.callToAction || (offerContext ? `Claim exclusive consultation with ${brandName}.` : `Connect with ${brandName} to scale your operations.`),
        };

      case TargetPlatform.TWITTER_X:
        const mainTweet = `Mastering ${dto.topic} is the #1 leverage point for forward-thinking enterprises right now. Quick breakdown: 🧵👇 #Aevora`;
        const threadParts = [
          mainTweet,
          `2/4 The biggest pitfall? Running campaigns without closed-loop attribution. If you can't verify ROI, you're flying blind.`,
          `3/4 At ${brandName}, we prioritize deterministic governance and evidence-backed execution over hype.`,
          `4/4 Automate the repetitive groundwork so your leadership can focus on high-impact strategic breakthroughs: https://aevora.local/growth`,
        ];
        return {
          headline: `Mastering ${dto.topic}: Critical Lessons`,
          body: mainTweet,
          hashtags: ['#Aevora', '#Growth', '#Business'],
          suggestedImagePrompt: `Minimalist graphic card summarizing 5 principles of ${dto.topic}.`,
          threadParts,
          callToAction: dto.callToAction || `Follow ${brandName} for daily enterprise insights.`,
        };

      case TargetPlatform.BLOG:
        return {
          headline: `The Complete Guide to ${dto.topic}: Strategies, Execution, and Proven Attribution`,
          body: `## Executive Summary\nAs organizations scale, understanding ${dto.topic} becomes paramount for sustained market leadership.\n\n## 1. Establishing Core Foundations\nBefore deploying resources, enterprises must establish clear baseline metrics and boundary conditions.\n\n## 2. Omnichannel Execution and Scaling\nDeploying across diverse touchpoints requires unified brand consistency and rigorous quality gates.\n\n## 3. Measuring Closed-Loop Revenue Impact\nEvery campaign touchpoint must reconcile against verified revenue ledgers.\n\n## Conclusion\nBy combining governed automation with strategic oversight, teams can unlock predictable growth.\n\n${offerContext}`,
          hashtags: ['#Guide', '#TechTrends', '#DigitalTransformation'],
          suggestedImagePrompt: `High-resolution panoramic header image showing futuristic interconnected digital landscape.`,
          callToAction: dto.callToAction || `Read the full case study at ${brandName}.`,
        };

      case TargetPlatform.NEWSLETTER:
        return {
          headline: `Executive Briefing: Navigating ${dto.topic} with Confidence`,
          body: `Dear Innovators,\n\nWelcome to this week's edition of the ${brandName} Executive Briefing.\n\nThis week, our engineering and strategy teams took a deep dive into ${dto.topic}.\n\n### The Core Insight:\nOrganizations that fail to reconcile their marketing touches with actual CRM revenue lose up to 40% of their advertising efficiency.\n\n### Actionable Next Steps:\n1. Audit your current attribution channels.\n2. Eliminate unverified vanity metrics.\n3. Implement deterministic UTM parameters across every customer link.\n\n${offerContext}\n\nUntil next week,\nThe ${brandName} Strategy Team`,
          hashtags: ['#Newsletter', '#WeeklyBrief', '#ExecutiveInsights'],
          suggestedImagePrompt: `Editorial newsletter banner illustration featuring crisp modern typography.`,
          callToAction: dto.callToAction || `Reply to this email or schedule a discovery briefing.`,
        };

      case TargetPlatform.ADVERTISEMENT:
      default:
        return {
          headline: `Scale ${dto.topic} with Uncompromising Precision`,
          body: `Stop guessing on campaign performance. ${brandName} provides enterprise-grade governance, closed-loop attribution, and multi-channel acceleration designed specifically for ${audience}.\n\n${offerContext}`,
          hashtags: ['#Enterprise', '#ROI', '#Performance'],
          suggestedImagePrompt: `Clean modern ad creative displaying verified growth performance card.`,
          callToAction: dto.callToAction || `Claim Your Strategic Consultation Today`,
        };
    }
  }

  private extractThreadParts(text: string): string[] {
    const parts = text.split(/(?=\d+\/|\n\n)/).map(p => p.trim()).filter(p => p.length > 0);
    return parts.length > 1 ? parts : [text];
  }
}

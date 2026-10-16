import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, SalesActorType, QualificationRecommendation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClientService } from './ollama-client.service';
import { OpportunityScoringEngine } from './opportunity-scoring.engine';
import { WebsiteExtractorService } from './website-extractor.service';
import {
  ExtractedBusinessFacts,
  IcpConfig,
  ResearchBatchSummary,
  ResearchBrief,
  ResearchEvidenceSource,
  SalesResearchResult,
} from './automation.types';

@Injectable()
export class SalesResearchService {
  private readonly logger = new Logger(SalesResearchService.name);
  private readonly automationId = 'automation-3-sales-research';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollamaClient: OllamaClientService,
    private readonly scoringEngine: OpportunityScoringEngine,
    private readonly websiteExtractor: WebsiteExtractorService
  ) {}

  /**
   * Evaluates if a lead satisfies the default eligibility criteria for Automation #3:
   * Status 'QUALIFIED' or 'ENRICHED', or qualityScore >= 60.
   */
  isLeadEligible(lead: { status: string; qualityScore?: number | null }): boolean {
    const status = String(lead.status).toUpperCase();
    const score = lead.qualityScore ?? 0;

    // Eligible if marked QUALIFIED or ENRICHED with solid baseline score
    if ((status === 'QUALIFIED' || status === 'ENRICHED') && score >= 50) {
      return true;
    }
    // Also eligible if quality score is at or above threshold 60
    return score >= 60;
  }

  /**
   * Researches and scores a single sales lead for an authorized company.
   * Strictly enforces tenant isolation and idempotency.
   */
  async researchLead(
    companyId: string,
    leadId: string,
    options: {
      forceRefresh?: boolean;
      actorId?: string;
      icpConfig?: IcpConfig;
    } = {}
  ): Promise<SalesResearchResult> {
    if (!companyId || !leadId) {
      throw new BadRequestException('companyId and leadId are required');
    }

    // 1. Retrieve lead with tenant isolation
    const lead = await this.prisma.salesLead.findFirst({
      where: { id: leadId, companyId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead "${leadId}" not found for company "${companyId}"`);
    }

    const currentMetadata = (lead.metadata || {}) as Record<string, any>;

    // 2. Idempotency Check: return existing brief if already researched and forceRefresh is false
    if (!options.forceRefresh && (currentMetadata.research || currentMetadata.researchBrief)) {
      const existingBrief = (currentMetadata.researchBrief || currentMetadata.research) as ResearchBrief;
      this.logger.log(`Idempotency hit: Lead "${lead.name}" (${lead.id}) already researched. Returning cached brief.`);
      return {
        leadId: lead.id,
        companyId,
        status: 'SKIPPED',
        opportunityScore: existingBrief.opportunityScore,
        confidence: existingBrief.confidence,
        priority: existingBrief.priority,
        recommendation: existingBrief.recommendation,
        brief: existingBrief,
      };
    }

    // 3. Eligibility Check
    if (!options.forceRefresh && !this.isLeadEligible(lead)) {
      this.logger.warn(`Lead "${lead.name}" (${lead.id}) is ineligible for opportunity research (status: ${lead.status}, score: ${lead.qualityScore})`);
      return {
        leadId: lead.id,
        companyId,
        status: 'INELIGIBLE',
        error: `Lead is not eligible (status: ${lead.status}, score: ${lead.qualityScore || 0} < 60)`,
      };
    }

    // 4. Synthesize Evidence Package from Auto #1 and Auto #2
    const enrichment = currentMetadata.enrichment;
    const extractedFacts: ExtractedBusinessFacts | null = enrichment?.extracted || null;
    const reachability = enrichment?.reachability || null;
    const emailVerification = enrichment?.emailVerification || null;

    // Collect concrete evidence sources
    const evidenceSources: ResearchEvidenceSource[] = [];

    if (lead.googlePlaceId || currentMetadata.rawPlaceId) {
      evidenceSources.push({
        type: 'GOOGLE_PLACES',
        snippet: `Place ID: ${lead.googlePlaceId || currentMetadata.rawPlaceId}. Location: ${lead.geography || 'Local'}. Rating/Reviews recorded.`,
        timestamp: currentMetadata.ingestedAt || lead.createdAt.toISOString(),
      });
    }

    let websiteSnippet = '';
    if (lead.website) {
      evidenceSources.push({
        url: lead.website,
        type: 'WEBSITE_SCRAPE',
        snippet: extractedFacts?.businessDescription || `Website verified reachable (HTTP ${reachability?.statusCode || 200})`,
        timestamp: enrichment?.enrichedAt || new Date().toISOString(),
      });
      websiteSnippet = extractedFacts?.businessDescription || '';
    }

    if (emailVerification) {
      evidenceSources.push({
        type: 'DNS_MX',
        snippet: `Email ${emailVerification.email} verified: status ${emailVerification.status}, MX records found: ${emailVerification.mxFound}`,
        timestamp: emailVerification.verifiedAt,
      });
    }

    if (extractedFacts?.socialLinks) {
      for (const [platform, url] of Object.entries(extractedFacts.socialLinks)) {
        if (url) {
          evidenceSources.push({
            url,
            type: 'SOCIAL_PROFILE',
            snippet: `Active ${platform} profile linked from verified website`,
            timestamp: enrichment?.enrichedAt || new Date().toISOString(),
          });
        }
      }
    }

    // 5. Generate AI Research Insights via Local Ollama
    let ollamaResult;
    try {
      ollamaResult = await this.ollamaClient.generateResearchInsights({
        businessName: lead.name,
        industry: lead.industry,
        facts: extractedFacts,
        websiteSnippet,
        location: lead.geography || undefined,
      });
    } catch (err: any) {
      this.logger.error(`Opportunity research failed for lead ${lead.id}: ${err?.message}`);
      return {
        leadId: lead.id,
        companyId,
        status: 'FAILED',
        error: `Ollama inference failed: ${err?.message || err}`,
      };
    }

    // 6. Invoke Deterministic Opportunity Scoring Engine
    const scoreResult = this.scoringEngine.calculateOpportunityScore({
      leadName: lead.name,
      industry: lead.industry,
      website: lead.website,
      contactPhone: lead.contactPhone,
      contactEmail: lead.contactEmail,
      emailVerification,
      extractedFacts,
      reachability,
      placeScoreFactors: currentMetadata.scoreFactors,
      icpConfig: options.icpConfig,
    });

    const recommendation = this.scoringEngine.classifyRecommendation(
      scoreResult.opportunityScore,
      scoreResult.confidence
    );

    // 7. Assemble Structured Research Brief
    const brief: ResearchBrief = {
      leadId: lead.id,
      companyId,
      opportunityScore: scoreResult.opportunityScore,
      confidence: scoreResult.confidence,
      priority: scoreResult.priority,
      recommendation,
      executiveSummary: ollamaResult.insights.executiveSummary,
      identifiedPains: ollamaResult.insights.identifiedPains,
      identifiedOpportunities: ollamaResult.insights.identifiedOpportunities,
      buyingSignals: ollamaResult.insights.buyingSignals,
      recommendedPitch: ollamaResult.insights.recommendedPitch,
      recommendedNextAction: ollamaResult.insights.recommendedNextAction,
      evidenceSources,
      missingEvidence: ollamaResult.insights.missingEvidence,
      researchedAt: new Date().toISOString(),
      model: ollamaResult.model,
      scoringVersion: scoreResult.scoringVersion,
      components: scoreResult.components,
    };

    // 8. Resolve Evaluator Employee for QualificationRecord
    let evaluatorId: string | null = null;
    if (options.actorId) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { id: options.actorId, companyId },
        select: { id: true },
      });
      if (actorEmployee) {
        evaluatorId = actorEmployee.id;
      }
    }

    if (!evaluatorId) {
      const companyEmployee = await this.prisma.employee.findFirst({
        where: { companyId },
        select: { id: true },
      });
      if (companyEmployee) {
        evaluatorId = companyEmployee.id;
      }
    }

    // 9. Persist into SalesLead, QualificationRecord, and LeadGenAudit
    const newQualityScore = Math.max(lead.qualityScore || 0, scoreResult.opportunityScore);

    let qualificationRecordId: string | undefined;

    // Execute within transaction or safe sequential operations
    await this.prisma.$transaction(async (tx) => {
      // Create QualificationRecord if employee is present
      if (evaluatorId) {
        const qual = await tx.qualificationRecord.create({
          data: {
            companyId,
            salesLeadId: lead.id,
            evaluatorId,
            evaluatorType: SalesActorType.AI_AGENT,
            customerFitScore: brief.components.commercialFit.score,
            problemClarityScore: brief.components.digitalModernization.score,
            budgetSignalScore: brief.components.operationalMaturity.score,
            authorityScore: brief.components.contactability.score,
            strategicRelevanceScore: brief.components.serviceExpansion.score,
            overallScore: brief.opportunityScore,
            recommendation: brief.recommendation as QualificationRecommendation,
            reasoning: brief.executiveSummary,
            evidence: brief.evidenceSources as any,
            scoringVersion: brief.scoringVersion,
          },
        });
        qualificationRecordId = qual.id;
      }

      // Update SalesLead metadata & quality score
      await tx.salesLead.update({
        where: { id: lead.id },
        data: {
          qualityScore: newQualityScore,
          metadata: {
            ...currentMetadata,
            research: brief as any,
            researchBrief: brief as any,
          } as Prisma.InputJsonObject,
        },
      });

      // Append LeadGenAudit event
      await tx.leadGenAudit.create({
        data: {
          leadId: lead.id,
          event: 'OPPORTUNITY_RESEARCH_COMPLETED',
          detail: {
            opportunityScore: brief.opportunityScore,
            priority: brief.priority,
            confidence: brief.confidence,
            recommendation: brief.recommendation,
            model: brief.model,
            automationId: this.automationId,
            qualificationRecordId,
          } as any,
          actorId: options.actorId || 'system',
        },
      });
    });

    this.logger.log(
      `Opportunity research completed for lead "${lead.name}" (${lead.id}): score ${scoreResult.opportunityScore}/100, priority ${scoreResult.priority}`
    );

    return {
      leadId: lead.id,
      companyId,
      status: 'RESEARCHED',
      opportunityScore: scoreResult.opportunityScore,
      confidence: scoreResult.confidence,
      priority: scoreResult.priority,
      recommendation: brief.recommendation,
      brief,
      qualificationRecordId,
    };
  }

  /**
   * Researches a batch of eligible leads for a company with bounded concurrency.
   */
  async researchCompanyLeads(
    companyId: string,
    options: {
      leadIds?: string[];
      limit?: number;
      forceRefresh?: boolean;
      actorId?: string;
      icpConfig?: IcpConfig;
    } = {}
  ): Promise<ResearchBatchSummary> {
    const limit = Math.max(1, Math.min(options.limit || 10, 50));

    let candidateLeads;
    if (options.leadIds && options.leadIds.length > 0) {
      candidateLeads = await this.prisma.salesLead.findMany({
        where: {
          companyId,
          id: { in: options.leadIds },
        },
        take: limit,
      });
    } else {
      // Find leads that are either QUALIFIED, ENRICHED, or qualityScore >= 60
      candidateLeads = await this.prisma.salesLead.findMany({
        where: {
          companyId,
          OR: [
            { status: 'QUALIFIED' },
            { qualityScore: { gte: 60 } },
          ],
        },
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });
    }

    const summary: ResearchBatchSummary = {
      companyId,
      totalRequested: candidateLeads.length,
      processed: 0,
      researched: 0,
      skipped: 0,
      ineligible: 0,
      failed: 0,
      leads: [],
    };

    // Sequential execution to keep local Ollama stable and bounded
    for (const lead of candidateLeads) {
      try {
        const result = await this.researchLead(companyId, lead.id, {
          forceRefresh: options.forceRefresh,
          actorId: options.actorId,
          icpConfig: options.icpConfig,
        });

        summary.processed++;
        if (result.status === 'RESEARCHED') summary.researched++;
        else if (result.status === 'SKIPPED') summary.skipped++;
        else if (result.status === 'INELIGIBLE') summary.ineligible++;
        else if (result.status === 'FAILED') summary.failed++;

        summary.leads.push(result);
      } catch (err: any) {
        this.logger.error(`Error researching lead ${lead.id}: ${err?.message}`);
        summary.processed++;
        summary.failed++;
        summary.leads.push({
          leadId: lead.id,
          companyId,
          status: 'FAILED',
          error: err?.message || String(err),
        });
      }
    }

    return summary;
  }

  /**
   * Retrieves summary counts of research status across all company leads.
   */
  async getResearchStatus(companyId: string) {
    const totalLeads = await this.prisma.salesLead.count({ where: { companyId } });
    const eligibleLeads = await this.prisma.salesLead.count({
      where: {
        companyId,
        OR: [
          { status: 'QUALIFIED' },
          { qualityScore: { gte: 60 } },
        ],
      },
    });

    const leadsWithResearch = await this.prisma.salesLead.findMany({
      where: { companyId },
      select: { metadata: true },
    });

    let researched = 0;
    let highPriority = 0;
    let mediumPriority = 0;
    let lowPriority = 0;

    for (const l of leadsWithResearch) {
      const meta = (l.metadata || {}) as Record<string, any>;
      const brief = (meta.researchBrief || meta.research) as ResearchBrief | undefined;
      if (brief?.opportunityScore !== undefined) {
        researched++;
        if (brief.priority === 'HIGH') highPriority++;
        else if (brief.priority === 'MEDIUM') mediumPriority++;
        else if (brief.priority === 'LOW') lowPriority++;
      }
    }

    return {
      companyId,
      totalLeads,
      eligibleLeads,
      researched,
      pendingResearch: Math.max(0, eligibleLeads - researched),
      priorityBreakdown: {
        high: highPriority,
        medium: mediumPriority,
        low: lowPriority,
      },
    };
  }
}

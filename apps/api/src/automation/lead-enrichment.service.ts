import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, SalesLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteExtractorService } from './website-extractor.service';
import { EmailVerifierService } from './email-verifier.service';
import { OllamaClientService } from './ollama-client.service';
import {
  EmailVerificationResult,
  EnrichmentBatchSummary,
  EnrichmentScoreResult,
  EnrichmentStatus,
  LeadEnrichmentMetadata,
  LeadEnrichmentResult,
} from './automation.types';

@Injectable()
export class LeadEnrichmentService {
  private readonly logger = new Logger(LeadEnrichmentService.name);
  private readonly automationId = 'automation-2-lead-enrichment';

  constructor(
    private readonly prisma: PrismaService,
    private readonly websiteExtractor: WebsiteExtractorService,
    private readonly emailVerifier: EmailVerifierService,
    private readonly ollamaClient: OllamaClientService
  ) {}

  /**
   * Computes a deterministic qualification / enrichment score (0-100) with detailed explanation.
   */
  calculateScore(params: {
    websiteReachable: boolean;
    hasFacts: boolean;
    emailVerification?: EmailVerificationResult | null;
    phonePresent: boolean;
    socialCount: number;
  }): EnrichmentScoreResult {
    const factors = {
      websiteReachable: 0,
      businessFactsExtracted: 0,
      emailVerified: 0,
      phoneVerified: 0,
      socialPresence: 0,
    };

    const reasons: string[] = [];

    // Factor 1: Website Reachability (20 pts)
    if (params.websiteReachable) {
      factors.websiteReachable = 20;
      reasons.push('Live responsive website confirmed (+20)');
    } else {
      reasons.push('Website unreachable or absent (0/20)');
    }

    // Factor 2: Business Facts (25 pts)
    if (params.hasFacts) {
      factors.businessFactsExtracted = 25;
      reasons.push('Structured business description & services extracted (+25)');
    } else {
      reasons.push('Insufficient business service facts (0/25)');
    }

    // Factor 3: Email Verification (25 pts)
    if (params.emailVerification?.status === 'VALID_SYNTAX_MX') {
      factors.emailVerified = 25;
      reasons.push(`Business email syntax and domain MX verified (+25)`);
    } else if (params.emailVerification?.syntaxValid) {
      factors.emailVerified = 10;
      reasons.push('Email syntax valid but MX unverified (+10)');
    } else {
      reasons.push('No verified business email (0/25)');
    }

    // Factor 4: Phone (15 pts)
    if (params.phonePresent) {
      factors.phoneVerified = 15;
      reasons.push('Direct business contact phone present (+15)');
    } else {
      reasons.push('Missing contact phone (0/15)');
    }

    // Factor 5: Social Presence (15 pts)
    if (params.socialCount >= 2) {
      factors.socialPresence = 15;
      reasons.push(`Multiple active social profiles found [${params.socialCount}] (+15)`);
    } else if (params.socialCount === 1) {
      factors.socialPresence = 10;
      reasons.push('Single social profile found (+10)');
    } else {
      reasons.push('No social profiles detected (0/15)');
    }

    const enrichmentScore =
      factors.websiteReachable +
      factors.businessFactsExtracted +
      factors.emailVerified +
      factors.phoneVerified +
      factors.socialPresence;

    return {
      enrichmentScore,
      factors,
      explanation: reasons.join('. '),
    };
  }

  /**
   * Enriches a single company lead with full provenance and company-scoping isolation.
   */
  async enrichLead(
    companyId: string,
    leadId: string,
    options: { forceRefresh?: boolean; actorId?: string } = {}
  ): Promise<LeadEnrichmentResult> {
    if (!companyId) throw new BadRequestException('companyId is required');
    if (!leadId) throw new BadRequestException('leadId is required');

    // 1. Fetch lead ensuring tenant ownership
    const lead = await this.prisma.salesLead.findFirst({
      where: { id: leadId, companyId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found in company ${companyId}`);
    }

    const currentMetadata = (lead.metadata as Record<string, any>) || {};
    const existingEnrichment = currentMetadata.enrichment as LeadEnrichmentMetadata | undefined;

    // Idempotency: skip already enriched unless forceRefresh
    if (existingEnrichment?.status === 'ENRICHED' && !options.forceRefresh) {
      this.logger.log(`Lead ${leadId} (${lead.name}) already enriched. Skipping duplicate work.`);
      return {
        leadId: lead.id,
        companyId,
        status: existingEnrichment.status,
        enrichmentScore: existingEnrichment.score?.enrichmentScore || lead.qualityScore || 0,
        metadata: existingEnrichment,
        updatedFields: {},
      };
    }

    const originalWebsite = lead.website;
    const originalPhone = lead.contactPhone;
    const originalEmail = lead.contactEmail;

    const conflicts: LeadEnrichmentMetadata['provenance']['conflicts'] = [];
    const updatedFields: LeadEnrichmentResult['updatedFields'] = {};

    // 2. Case: Lead has no website
    if (!lead.website || lead.website.trim() === '') {
      let emailVerif: EmailVerificationResult | null = null;
      if (lead.contactEmail) {
        emailVerif = await this.emailVerifier.verifyEmail(lead.contactEmail);
      }

      const scoreResult = this.calculateScore({
        websiteReachable: false,
        hasFacts: false,
        emailVerification: emailVerif,
        phonePresent: !!lead.contactPhone,
        socialCount: 0,
      });

      const enrichmentMeta: LeadEnrichmentMetadata = {
        automationId: this.automationId,
        status: 'NO_WEBSITE',
        enrichedAt: new Date().toISOString(),
        reachability: {
          checked: false,
          reachable: false,
          error: 'No website URL recorded for business.',
        },
        emailVerification: emailVerif,
        provenance: {
          originalWebsite: null,
          originalPhone,
          originalEmail,
          conflicts: [],
        },
        score: scoreResult,
        modelMetadata: {
          provider: 'none',
          model: 'none',
          durationMs: 0,
        },
      };

      await this.prisma.salesLead.update({
        where: { id: lead.id },
        data: {
          metadata: {
            ...currentMetadata,
            enrichment: enrichmentMeta as any,
          } as Prisma.InputJsonObject,
          leadGenAudits: {
            create: {
              event: 'ENRICHMENT_FAILED',
              detail: {
                status: 'NO_WEBSITE',
                enrichmentScore: scoreResult.enrichmentScore,
                automationId: this.automationId,
              } as any,
              actorId: options.actorId,
            },
          },
        },
      });

      return {
        leadId: lead.id,
        companyId,
        status: 'NO_WEBSITE',
        enrichmentScore: scoreResult.enrichmentScore,
        metadata: enrichmentMeta,
        updatedFields: {},
      };
    }

    // 3. Crawl Website
    this.logger.log(`Crawling website for lead "${lead.name}": ${lead.website}`);
    const crawlResult = await this.websiteExtractor.crawlWebsite(lead.website);

    if (!crawlResult.reachable) {
      let emailVerif: EmailVerificationResult | null = null;
      if (lead.contactEmail) {
        emailVerif = await this.emailVerifier.verifyEmail(lead.contactEmail);
      }

      const scoreResult = this.calculateScore({
        websiteReachable: false,
        hasFacts: false,
        emailVerification: emailVerif,
        phonePresent: !!lead.contactPhone,
        socialCount: 0,
      });

      const enrichmentMeta: LeadEnrichmentMetadata = {
        automationId: this.automationId,
        status: 'UNREACHABLE',
        enrichedAt: new Date().toISOString(),
        reachability: {
          checked: true,
          reachable: false,
          statusCode: crawlResult.statusCode,
          responseTimeMs: crawlResult.responseTimeMs,
          error: crawlResult.error || 'Website unreachable or returned HTTP error status.',
        },
        emailVerification: emailVerif,
        provenance: {
          originalWebsite,
          originalPhone,
          originalEmail,
          conflicts: [],
        },
        score: scoreResult,
        modelMetadata: {
          provider: 'none',
          model: 'none',
          durationMs: 0,
        },
      };

      await this.prisma.salesLead.update({
        where: { id: lead.id },
        data: {
          metadata: {
            ...currentMetadata,
            enrichment: enrichmentMeta as any,
          } as Prisma.InputJsonObject,
          leadGenAudits: {
            create: {
              event: 'ENRICHMENT_FAILED',
              detail: {
                status: 'UNREACHABLE',
                error: crawlResult.error,
                automationId: this.automationId,
              } as any,
              actorId: options.actorId,
            },
          },
        },
      });

      return {
        leadId: lead.id,
        companyId,
        status: 'UNREACHABLE',
        enrichmentScore: scoreResult.enrichmentScore,
        metadata: enrichmentMeta,
        updatedFields: {},
      };
    }

    // 4. LLM Business Facts Extraction via Ollama
    const extractionResult = await this.ollamaClient.extractBusinessFacts(
      lead.name,
      lead.industry || 'general',
      crawlResult.aggregatedText,
      crawlResult.emailsFound,
      crawlResult.phonesFound,
      crawlResult.socialLinks
    );

    // 5. Email Verification on detected & existing emails
    const candidateEmails = Array.from(
      new Set([lead.contactEmail, ...extractionResult.facts.contactEmails].filter(Boolean) as string[])
    );

    let bestEmailVerif: EmailVerificationResult | null = null;
    let selectedContactEmail: string | null = lead.contactEmail;

    for (const emailCandidate of candidateEmails) {
      const verif = await this.emailVerifier.verifyEmail(emailCandidate);
      if (!bestEmailVerif || verif.status === 'VALID_SYNTAX_MX') {
        bestEmailVerif = verif;
      }
      // If lead had no email and this candidate is MX-verified, select it
      if (!selectedContactEmail && verif.status === 'VALID_SYNTAX_MX') {
        selectedContactEmail = verif.email;
        updatedFields.contactEmail = selectedContactEmail;
        conflicts.push({
          field: 'contactEmail',
          existing: null,
          extracted: selectedContactEmail,
          resolution: 'UPDATED_MISSING',
        });
      } else if (
        selectedContactEmail &&
        emailCandidate.toLowerCase() !== selectedContactEmail.toLowerCase() &&
        verif.status === 'VALID_SYNTAX_MX'
      ) {
        // Discovered different email on website: keep existing and record conflict
        conflicts.push({
          field: 'contactEmail',
          existing: selectedContactEmail,
          extracted: emailCandidate,
          resolution: 'PRESERVED_EXISTING',
        });
      }
    }

    // Check phone conflicts
    if (extractionResult.facts.contactPhones.length > 0) {
      const extractedPhone = extractionResult.facts.contactPhones[0];
      if (!lead.contactPhone) {
        updatedFields.notes = `Website Phone: ${extractedPhone}`;
      } else if (lead.contactPhone !== extractedPhone) {
        conflicts.push({
          field: 'contactPhone',
          existing: lead.contactPhone,
          extracted: extractedPhone,
          resolution: 'PRESERVED_EXISTING',
        });
      }
    }

    // 6. Score Computation
    const socialCount = Object.keys(extractionResult.facts.socialLinks || {}).length;
    const scoreResult = this.calculateScore({
      websiteReachable: true,
      hasFacts: !!extractionResult.facts.businessDescription,
      emailVerification: bestEmailVerif,
      phonePresent: !!(lead.contactPhone || extractionResult.facts.contactPhones.length > 0),
      socialCount,
    });

    // 7. Assemble Metadata
    const enrichmentMeta: LeadEnrichmentMetadata = {
      automationId: this.automationId,
      status: 'ENRICHED',
      enrichedAt: new Date().toISOString(),
      reachability: {
        checked: true,
        reachable: true,
        statusCode: crawlResult.statusCode,
        responseTimeMs: crawlResult.responseTimeMs,
        finalUrl: crawlResult.finalUrl,
      },
      extracted: extractionResult.facts,
      emailVerification: bestEmailVerif,
      provenance: {
        originalWebsite,
        originalPhone,
        originalEmail,
        conflicts,
      },
      score: scoreResult,
      modelMetadata: {
        provider: extractionResult.provider,
        model: extractionResult.model,
        durationMs: extractionResult.durationMs,
        usedFallback: extractionResult.usedFallback,
      },
    };

    // 8. Update CRM SalesLead
    const newQualityScore = Math.max(lead.qualityScore || 0, scoreResult.enrichmentScore);
    updatedFields.qualityScore = newQualityScore;

    // Transition status to QUALIFIED if score is high and status was NEW
    const nextStatus =
      lead.status === SalesLeadStatus.NEW && scoreResult.enrichmentScore >= 60
        ? SalesLeadStatus.QUALIFIED
        : lead.status;

    await this.prisma.salesLead.update({
      where: { id: lead.id },
      data: {
        contactEmail: selectedContactEmail || lead.contactEmail,
        qualityScore: newQualityScore,
        status: nextStatus,
        metadata: {
          ...currentMetadata,
          enrichment: enrichmentMeta as any,
        } as Prisma.InputJsonObject,
        leadGenAudits: {
          create: {
            event: 'ENRICHMENT_COMPLETED',
            detail: {
              status: 'ENRICHED',
              enrichmentScore: scoreResult.enrichmentScore,
              emailStatus: bestEmailVerif?.status,
              website: crawlResult.finalUrl || lead.website,
              automationId: this.automationId,
              model: extractionResult.model,
            } as any,
            actorId: options.actorId,
          },
        },
      },
    });

    this.logger.log(
      `Enrichment completed for lead "${lead.name}" (${lead.id}): score ${scoreResult.enrichmentScore}/100`
    );

    return {
      leadId: lead.id,
      companyId,
      status: 'ENRICHED',
      enrichmentScore: scoreResult.enrichmentScore,
      metadata: enrichmentMeta,
      updatedFields,
    };
  }

  /**
   * Enriches a batch of eligible leads for a specific company with bounded concurrency.
   */
  async enrichCompanyLeads(
    companyId: string,
    options: {
      leadIds?: string[];
      limit?: number;
      forceRefresh?: boolean;
      actorId?: string;
    } = {}
  ): Promise<EnrichmentBatchSummary> {
    if (!companyId) throw new BadRequestException('companyId is required');

    const limit = Math.min(options.limit || 10, 50); // cap to 50 max per batch

    // Select eligible leads for tenant
    const whereClause: Prisma.SalesLeadWhereInput = {
      companyId,
      ...(options.leadIds && options.leadIds.length > 0 ? { id: { in: options.leadIds } } : {}),
    };

    const candidateLeads = await this.prisma.salesLead.findMany({
      where: whereClause,
      take: options.leadIds && options.leadIds.length > 0 ? options.leadIds.length : Math.max(limit * 5, 20),
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, website: true, metadata: true },
    });

    // Filter to leads that need enrichment unless forceRefresh
    const eligibleLeads = candidateLeads.filter((l) => {
      if (options.forceRefresh) return true;
      const meta = l.metadata as Record<string, any>;
      return meta?.enrichment?.status !== 'ENRICHED';
    });

    const leadsToProcess = eligibleLeads.slice(0, limit);

    const summary: EnrichmentBatchSummary = {
      companyId,
      totalRequested: leadsToProcess.length,
      processed: 0,
      enriched: 0,
      noWebsite: 0,
      unreachable: 0,
      failed: 0,
      leads: [],
    };

    // Process leads with bounded concurrency (concurrency = 2) to protect local resources
    const concurrency = 2;
    for (let i = 0; i < leadsToProcess.length; i += concurrency) {
      const slice = leadsToProcess.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map((lead) =>
          this.enrichLead(companyId, lead.id, {
            forceRefresh: options.forceRefresh,
            actorId: options.actorId,
          }).catch((err) => {
            this.logger.error(`Error enriching lead ${lead.id}: ${err?.message}`);
            return {
              leadId: lead.id,
              companyId,
              status: 'FAILED' as EnrichmentStatus,
              enrichmentScore: 0,
              error: err?.message || 'Enrichment failed',
              metadata: {} as any,
              updatedFields: {},
            };
          })
        )
      );

      for (const res of results) {
        summary.processed++;
        summary.leads.push(res);
        if (res.status === 'ENRICHED') summary.enriched++;
        else if (res.status === 'NO_WEBSITE') summary.noWebsite++;
        else if (res.status === 'UNREACHABLE') summary.unreachable++;
        else summary.failed++;
      }
    }

    return summary;
  }

  /**
   * Retrieves summary status of lead enrichment across a company.
   */
  async getEnrichmentStatus(companyId: string) {
    if (!companyId) throw new BadRequestException('companyId is required');

    const totalLeads = await this.prisma.salesLead.count({ where: { companyId } });
    const allLeads = await this.prisma.salesLead.findMany({
      where: { companyId },
      select: { id: true, name: true, qualityScore: true, metadata: true },
    });

    let enriched = 0;
    let pending = 0;
    let unreachable = 0;
    let noWebsite = 0;
    let failed = 0;

    for (const lead of allLeads) {
      const enrichment = (lead.metadata as any)?.enrichment;
      if (!enrichment) {
        pending++;
      } else if (enrichment.status === 'ENRICHED') {
        enriched++;
      } else if (enrichment.status === 'NO_WEBSITE') {
        noWebsite++;
      } else if (enrichment.status === 'UNREACHABLE' || enrichment.status === 'BLOCKED') {
        unreachable++;
      } else {
        failed++;
      }
    }

    return {
      companyId,
      totalLeads,
      counts: {
        enriched,
        pending,
        unreachable,
        noWebsite,
        failed,
      },
      coveragePercent: totalLeads > 0 ? Math.round((enriched / totalLeads) * 100) : 0,
    };
  }
}

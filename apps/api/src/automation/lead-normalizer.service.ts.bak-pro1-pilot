import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma, SalesLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scoreFactors, scoreLead } from '../lead-gen/lead-search.service';
import {
  IngestionResult,
  NormalizedLead,
  RawGooglePlaceRecord,
} from './automation.types';

@Injectable()
export class LeadNormalizerService {
  private readonly logger = new Logger(LeadNormalizerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sanitizes and extracts the root domain from a website URL.
   */
  extractDomain(url?: string | null): string | null {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Formats and validates web URLs, prepending https:// if missing.
   */
  normalizeUrl(raw?: string | null): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 500) return null;
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('file:') || trimmed.startsWith('data:')) {
      return null;
    }
    try {
      const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
      const parsed = new URL(withProto);
      return parsed.toString();
    } catch {
      return null;
    }
  }

  /**
   * Cleans phone number strings.
   */
  normalizePhone(phone?: string | null): string | null {
    if (!phone || typeof phone !== 'string') return null;
    const trimmed = phone.trim();
    if (trimmed.length < 5 || trimmed.length > 40) return null;
    return trimmed;
  }

  /**
   * Normalizes a raw business record from Google Places / Maps (n8n or API format) into NormalizedLead.
   */
  normalizeRecord(
    raw: RawGooglePlaceRecord,
    fallbackCategory: string,
    fallbackLocation: string,
    automationId = 'automation-1-google-lead-finding'
  ): { lead?: NormalizedLead; error?: string } {
    if (!raw || typeof raw !== 'object') {
      return { error: 'Record is empty or not an object' };
    }

    // Resolve Google Place ID
    const placeId = String(raw.id || raw.place_id || raw.googlePlaceId || '').trim();
    if (!placeId) {
      return { error: 'Missing place_id / id identifier' };
    }

    // Resolve Business Name
    let businessName = '';
    if (typeof raw.displayName === 'object' && raw.displayName?.text) {
      businessName = raw.displayName.text;
    } else if (typeof raw.displayName === 'string') {
      businessName = raw.displayName;
    } else if (typeof raw.name === 'string') {
      businessName = raw.name;
    } else if (typeof raw.business_name === 'string') {
      businessName = raw.business_name;
    }
    businessName = businessName.trim();
    if (!businessName) {
      return { error: 'Missing business name' };
    }

    // Resolve Geography / Address
    const geography = String(raw.formattedAddress || raw.address || fallbackLocation).trim();

    // Resolve Contact Info
    const phone = this.normalizePhone(raw.nationalPhoneNumber || raw.phone);
    const website = this.normalizeUrl(raw.websiteUri || raw.website);
    const email = typeof raw.email === 'string' && raw.email.includes('@') ? raw.email.trim().toLowerCase() : null;

    // Resolve Category / Industry
    let industry = fallbackCategory;
    if (typeof raw.primaryTypeDisplayName === 'object' && raw.primaryTypeDisplayName?.text) {
      industry = raw.primaryTypeDisplayName.text;
    } else if (typeof raw.primaryType === 'string' && raw.primaryType.trim()) {
      industry = raw.primaryType.replace(/_/g, ' ');
    } else if (typeof raw.type === 'string' && raw.type.trim()) {
      industry = raw.type.replace(/_/g, ' ');
    }

    // Resolve Coordinates
    let lat: number | undefined;
    let lng: number | undefined;
    if (raw.location) {
      lat = raw.location.latitude ?? raw.location.lat;
      lng = raw.location.longitude ?? raw.location.lng ?? raw.location.lon;
    }

    // Resolve Reviews & Ratings
    const reviewCount = Number(raw.userRatingCount || raw.reviews || 0);
    const rating = raw.rating != null ? Number(raw.rating) : null;

    // Resolve Editorial Summary / Description
    let description: string | null = null;
    if (typeof raw.editorialSummary === 'object' && raw.editorialSummary?.text) {
      description = raw.editorialSummary.text;
    } else if (typeof raw.editorialSummary === 'string') {
      description = raw.editorialSummary;
    } else if (typeof raw.description === 'string') {
      description = raw.description;
    }

    // Google Maps Link
    const googleMapsUri =
      raw.googleMapsUri ||
      raw.reviews_link ||
      `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

    // Quality Score Calculation
    const scoringInput = {
      phone,
      email,
      website,
      reviewCount: isNaN(reviewCount) ? 0 : reviewCount,
    };
    const qualityScore = scoreLead(scoringInput);
    const factors = scoreFactors(scoringInput);

    return {
      lead: {
        googlePlaceId: placeId,
        businessName,
        organizationName: businessName,
        contactEmail: email,
        contactPhone: phone,
        website,
        googleMapsUri,
        industry,
        geography,
        qualityScore,
        reviewCount: isNaN(reviewCount) ? 0 : reviewCount,
        rating: isNaN(rating as number) ? null : rating,
        source: 'AUTOMATION_1_GOOGLE_MAPS',
        notes: description,
        metadata: {
          lat,
          lng,
          scoreFactors: factors,
          rawPlaceId: placeId,
          editorialSummary: description,
          ingestedAt: new Date().toISOString(),
          automationId,
        },
      },
    };
  }

  /**
   * Ingests, deduplicates, and saves a batch of normalized leads for a specific tenant.
   * Atomic and repeat-safe.
   */
  async ingestLeads(
    companyId: string,
    records: RawGooglePlaceRecord[],
    options: {
      category?: string;
      location?: string;
      actorId?: string;
      automationId?: string;
    } = {}
  ): Promise<IngestionResult> {
    if (!companyId) throw new BadRequestException('companyId is required');
    if (!Array.isArray(records) || records.length === 0) {
      return { totalProcessed: 0, created: 0, duplicates: 0, invalid: [], leadIds: [] };
    }

    const category = options.category || 'general';
    const location = options.location || 'unspecified';
    const automationId = options.automationId || 'automation-1-google-lead-finding';

    const result: IngestionResult = {
      totalProcessed: records.length,
      created: 0,
      duplicates: 0,
      invalid: [],
      leadIds: [],
    };

    // Load existing place IDs and website domains for deduplication
    const existing = await this.prisma.salesLead.findMany({
      where: { companyId },
      select: { googlePlaceId: true, website: true },
    });
    const knownPlaceIds = new Set(existing.map((l) => l.googlePlaceId).filter(Boolean));
    const knownDomains = new Set(
      existing.map((l) => this.extractDomain(l.website)).filter(Boolean) as string[]
    );

    for (let index = 0; index < records.length; index++) {
      const raw = records[index];
      const { lead, error } = this.normalizeRecord(raw, category, location, automationId);

      if (error || !lead) {
        result.invalid.push({ index, reason: error || 'Failed normalization' });
        continue;
      }

      // Check Place ID duplicate
      if (knownPlaceIds.has(lead.googlePlaceId)) {
        result.duplicates++;
        continue;
      }

      // Check domain duplicate if website present
      const domain = this.extractDomain(lead.website);
      if (domain && knownDomains.has(domain)) {
        result.duplicates++;
        continue;
      }

      try {
        const created = await this.prisma.salesLead.create({
          data: {
            companyId,
            name: lead.businessName,
            organizationName: lead.organizationName,
            contactEmail: lead.contactEmail,
            contactPhone: lead.contactPhone,
            website: lead.website,
            googlePlaceId: lead.googlePlaceId,
            qualityScore: lead.qualityScore,
            industry: lead.industry,
            geography: lead.geography,
            source: lead.source,
            status: SalesLeadStatus.NEW,
            notes: lead.notes,
            metadata: lead.metadata,
            leadGenAudits: {
              create: {
                event: 'AUTOMATION_DISCOVERED',
                detail: {
                  automationId,
                  qualityScore: lead.qualityScore,
                  googleMapsUri: lead.googleMapsUri,
                },
                actorId: options.actorId,
              },
            },
          },
        });

        knownPlaceIds.add(lead.googlePlaceId);
        if (domain) knownDomains.add(domain);

        result.created++;
        result.leadIds.push(created.id);
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Concurrent duplicate insertion hit @@unique([companyId, googlePlaceId])
          result.duplicates++;
        } else {
          this.logger.error(`Failed to persist lead "${lead.businessName}": ${err?.message}`);
          result.invalid.push({ index, reason: `Database error: ${err?.message}` });
        }
      }
    }

    this.logger.log(
      `Ingestion completed for company ${companyId}: ${result.created} created, ${result.duplicates} duplicates, ${result.invalid.length} invalid`
    );

    return result;
  }
}

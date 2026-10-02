import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';

export interface ClientNeeds {
  needsWebsite: boolean;
  needsSaaS: boolean;
  needsAutomation: boolean;
  budget: number | null; // INR (rupees) as stated by the client
  timeline: string | null;
  description: string;
}

const NEEDS_SYSTEM = `You extract structured client needs from a sales discovery call transcript for a small web/automation agency.
Return JSON only, exactly this shape:
{"needsWebsite": boolean, "needsSaaS": boolean, "needsAutomation": boolean, "budget": number|null (INR rupees), "timeline": string|null, "description": string}`;

export function normalizeNeeds(raw: any): ClientNeeds {
  const budget = Number(raw?.budget);
  return {
    needsWebsite: !!raw?.needsWebsite,
    needsSaaS: !!raw?.needsSaaS,
    needsAutomation: !!raw?.needsAutomation,
    budget: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
    timeline: typeof raw?.timeline === 'string' ? raw.timeline : null,
    description: typeof raw?.description === 'string' ? raw.description : '',
  };
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly gateway = new ModelGateway();

  constructor(private readonly prisma: PrismaService) {}

  async extractClientNeeds(transcript: string): Promise<ClientNeeds> {
    const res = await this.gateway.generate({
      systemMessage: NEEDS_SYSTEM,
      prompt: `Transcript:\n"""\n${transcript.slice(0, 12000)}\n"""`,
      requireStructuredOutput: true,
      temperature: 0,
    });
    return normalizeNeeds(res.structuredOutput);
  }

  /** Chairman submits call notes: store transcript + extracted needs, budget in paise. */
  async completeCall(companyId: string, callId: string, transcript: string) {
    const call = await this.prisma.discoveryCall.findFirst({ where: { id: callId, companyId } });
    if (!call) throw new NotFoundException('Discovery call not found');
    const needs = await this.extractClientNeeds(transcript);
    return this.prisma.discoveryCall.update({
      where: { id: call.id },
      data: {
        transcript,
        extractedNeeds: needs as any,
        estimatedBudget: needs.budget === null ? null : Math.round(needs.budget * 100),
        conductedAt: new Date(),
        status: 'COMPLETED',
      },
    });
  }

  async enrichFromGoogleProfile(googlePlaceId: string) {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (process.env.LEAD_GEN_PROVIDER_ENABLED !== 'true' || !key || googlePlaceId.startsWith('mock-')) {
      this.logger.warn('Places provider disabled — returning mock profile');
      return { hours: ['Mon–Sat 10:00–21:00'], rating: 4.2, reviewCount: 57, reviews: [], photoCount: 3, website: null };
    }
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'regularOpeningHours,rating,userRatingCount,reviews,photos,websiteUri',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Places details ${res.status}: ${await res.text()}`);
    const p = await res.json();
    return {
      hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? 0,
      reviews: (p.reviews ?? []).slice(0, 5).map((r: any) => ({ rating: r.rating, text: r.text?.text })),
      photoCount: p.photos?.length ?? 0,
      website: p.websiteUri ?? null,
    };
  }
}

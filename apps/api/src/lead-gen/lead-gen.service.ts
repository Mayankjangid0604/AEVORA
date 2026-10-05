import { Injectable, Logger, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma, SalesLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { LeadSearchService } from './lead-search.service';

const SEARCH_VARIANTS = ['', 'best', 'popular'];

/** Where to look for clients: India and abroad. LEAD_GEN_LOCATIONS = "City, Country; City, Country; ..." */
export const DEFAULT_LEAD_LOCATIONS = [
  'Jaipur, India', 'Delhi, India', 'Mumbai, India', 'Bengaluru, India', 'Pune, India', 'Hyderabad, India', 'Ahmedabad, India', 'Sikar, India',
  'Dubai, United Arab Emirates', 'London, United Kingdom', 'Toronto, Canada', 'Sydney, Australia', 'Singapore', 'New York, USA', 'Berlin, Germany', 'Nairobi, Kenya',
];
export function leadGenLocations(env = process.env): string[] {
  const raw = env.LEAD_GEN_LOCATIONS; // the old single LEAD_GEN_LOCATION (Sikar only) is intentionally ignored
  const list = raw ? raw.split(/;|\n/).map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : DEFAULT_LEAD_LOCATIONS;
}
/** Run n (0-based) takes the next `per` locations, wrapping around, so every city gets its turn. */
export function pickLocations(all: string[], run: number, per: number): string[] {
  const k = Math.max(1, Math.min(per || 1, all.length));
  const start = ((Math.max(0, run) * k) % all.length + all.length) % all.length;
  return Array.from({ length: k }, (_, i) => all[(start + i) % all.length]);
}

/** LeadGenOrchestrator + LeadQueue: runs searches (scheduled by BusinessLoopService), stores leads, serves the NEW-lead queue. */
@Injectable()
export class LeadGenService {
  private readonly logger = new Logger(LeadGenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: LeadSearchService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async runForCompany(companyId: string, triggeredBy: string, actorId?: string) {
    const switches = await this.prisma.killSwitchConfig.findMany({
      where: { companyId, feature: { in: ['GLOBAL_PRODUCTION', 'LEAD_GEN'] }, isDisabled: true },
    });
    if (switches.length) {
      throw new ForbiddenException(`Lead gen blocked by kill switch: ${switches.map((s) => s.feature).join(',')}`);
    }

    // Idempotency: one run at a time per company (a RUNNING row older than 1h is treated as stale).
    const active = await this.prisma.leadGenRun.findFirst({
      where: { companyId, status: 'RUNNING', triggeredAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (active) throw new ConflictException(`Lead gen run ${active.id} already in progress`);

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    const run = await this.prisma.leadGenRun.create({ data: { companyId, triggeredBy } });
    try {
      const categories = await this.categoriesFor(companyId);
      const runsSoFar = await this.prisma.leadGenRun.count({ where: { companyId } });
      const locations = pickLocations(leadGenLocations(), runsSoFar - 1, Number(process.env.LEAD_GEN_LOCATIONS_PER_RUN ?? 2));
      const radius = await this.radiusFor(companyId);

      const existing = await this.prisma.salesLead.findMany({
        where: { companyId, googlePlaceId: { not: null } },
        select: { googlePlaceId: true },
      });
      const known = new Set(existing.map((l) => l.googlePlaceId!));

      let totalFound = 0;
      let totalNew = 0;
      const weights = await this.weightsFor(companyId);
      const searches = locations.flatMap((location) => categories.flatMap((category) =>
        SEARCH_VARIANTS.slice(0, Math.min(SEARCH_VARIANTS.length, Math.max(1, weights[category] ?? 1))).map((variant) => ({ location, category, variant })),
      ));
      for (const { location, category, variant } of searches) {
        const found = await this.search.search({ category, location, radius, maxResults: 20, variant }, known);
        totalFound += found.length;
        for (const f of found) {
          known.add(f.googlePlaceId);
          try {
            const lead = await this.prisma.salesLead.create({
              data: {
                companyId,
                name: f.businessName,
                organizationName: f.businessName,
                contactEmail: f.email,
                contactPhone: f.phone,
                website: f.website,
                googlePlaceId: f.googlePlaceId,
                qualityScore: f.qualityScore,
                industry: f.category,
                geography: f.location,
                source: f.googlePlaceId.startsWith('osm-') ? 'LEAD_GEN_OSM' : f.googlePlaceId.startsWith('mock-') ? 'LEAD_GEN_MOCK' : 'LEAD_GEN_GOOGLE_PLACES',
                notes: f.description,
                metadata: { leadGenRunId: run.id, reviewCount: f.reviewCount, ...(f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : {}) },
                leadGenAudits: { create: { event: 'FOUND', detail: { runId: run.id, qualityScore: f.qualityScore }, actorId } },
              },
            });
            totalNew++;
            await this.prisma.simulationEvent.create({
              data: {
                type: 'LEAD_FOUND',
                simulationTime: new Date(),
                payload: { companyId, leadId: lead.id, qualityScore: f.qualityScore },
                idempotencyKey: `lead.found:${lead.id}`,
              },
            });
            this.realtime.broadcastToUser(company.chairmanId, 'lead.found', { leadId: lead.id, businessName: lead.name, qualityScore: f.qualityScore });
          } catch (e) {
            // Unique (companyId, googlePlaceId): inserted concurrently, skip.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          }
        }
      }
      return await this.prisma.leadGenRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date(), totalFound, totalNew },
      });
    } catch (e) {
      await this.prisma.leadGenRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: new Date(), error: String(e?.message ?? e) },
      });
      throw e;
    }
  }

  /** Searches per cycle per category (CEO raises high converters to 2). */
  async weightsFor(companyId: string): Promise<Record<string, number>> {
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId } });
    return (config?.weights as Record<string, number>) ?? {};
  }

  /** CEO-managed LeadGenConfig wins; otherwise the LEAD_GEN_CATEGORIES env var. */
  async categoriesFor(companyId: string) {
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId } });
    if (config?.categories.length) return config.categories;
    return (process.env.LEAD_GEN_CATEGORIES ?? 'restaurant').split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Radius resolution: company config → LEAD_GEN_RADIUS_M env → 50000.
   * Clamped to [100, 500_000] so bad values cannot cause runaway API requests.
   */
  async radiusFor(companyId: string): Promise<number> {
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId }, select: { radiusM: true } });
    const raw = config?.radiusM ?? Number(process.env.LEAD_GEN_RADIUS_M ?? 50000);
    const r = Number(raw);
    return Number.isFinite(r) && r >= 100 ? Math.min(r, 500_000) : 50_000;
  }

  /** Queue: NEW lead-gen leads, best first. */
  listQueue(companyId: string, take = 20) {
    return this.prisma.salesLead.findMany({
      where: { companyId, status: 'NEW', googlePlaceId: { not: null } },
      orderBy: [{ qualityScore: 'desc' }, { createdAt: 'asc' }],
      take,
    });
  }

  /** Atomically claim the top NEW lead (marks CONTACTED). Returns null when the queue is empty. */
  async dequeue(companyId: string, actorId?: string) {
    for (const lead of await this.listQueue(companyId, 5)) {
      const claimed = await this.prisma.salesLead.updateMany({
        where: { id: lead.id, companyId, status: 'NEW' },
        data: { status: 'CONTACTED', lastContactedAt: new Date(), assignedToId: actorId },
      });
      if (claimed.count) {
        await this.prisma.leadGenAudit.create({ data: { leadId: lead.id, event: 'DEQUEUED', actorId } });
        return { ...lead, status: SalesLeadStatus.CONTACTED };
      }
    }
    return null;
  }

  listRuns(companyId: string) {
    return this.prisma.leadGenRun.findMany({ where: { companyId }, orderBy: { triggeredAt: 'desc' }, take: 50 });
  }

  listLeads(companyId: string, status?: SalesLeadStatus) {
    return this.prisma.salesLead.findMany({
      where: { companyId, googlePlaceId: { not: null }, ...(status ? { status } : {}) },
      orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }
}

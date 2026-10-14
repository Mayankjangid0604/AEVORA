import { Injectable, Logger, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, SalesLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { createHash } from 'crypto';
import { LeadSearchService, scoreFactors, scoreLead } from './lead-search.service';
import { isRecipientSuppressed } from '../integration/integration.service';

export interface ImportLeadRow {
  businessName: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  location?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Deterministic identity for an imported business: website host, else email, else name+location. */
export function importDedupKey(r: ImportLeadRow): string {
  const host = (r.website ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  const raw = host ? `w:${host}` : r.email ? `e:${r.email.trim().toLowerCase()}` : `n:${r.businessName.trim().toLowerCase().replace(/\s+/g, ' ')}|${(r.location ?? '').trim().toLowerCase()}`;
  return `import-${createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
}

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
                metadata: { leadGenRunId: run.id, reviewCount: f.reviewCount, scoreFactors: scoreFactors(f), collectedAt: new Date().toISOString(), ...(f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : {}) },
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

  /**
   * Operator-provided leads (CSV/JSON already parsed). Validates, normalizes, dedups (re-imports are no-ops), scores with
   * persisted factors, and records provenance. ponytail: dedup is within imports only; an OSM lead for the same business
   * has a different key — add cross-source matching on website host if duplicates show up.
   */
  async importLeads(companyId: string, rows: ImportLeadRow[], source: string, actorId?: string) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('rows must be a non-empty array');
    if (rows.length > 1000) throw new BadRequestException('max 1000 rows per import');
    const result = { created: 0, duplicates: 0, invalid: [] as { index: number; reason: string }[], leadIds: [] as string[] };
    for (const [index, r] of rows.entries()) {
      const name = typeof r?.businessName === 'string' ? r.businessName.trim().slice(0, 200) : '';
      if (!name) { result.invalid.push({ index, reason: 'businessName required' }); continue; }
      const email = r.email?.trim() || null;
      if (email && !EMAIL_RE.test(email)) { result.invalid.push({ index, reason: 'invalid email' }); continue; }
      if (email && (await isRecipientSuppressed(this.prisma, companyId, email))) { result.invalid.push({ index, reason: 'suppressed (opted out)' }); continue; }
      const lead = { phone: r.phone?.trim() || null, email, website: r.website?.trim() || null, reviewCount: 0 };
      const key = importDedupKey({ ...r, businessName: name, email });
      try {
        const created = await this.prisma.salesLead.create({
          data: {
            companyId, name, organizationName: name,
            contactEmail: lead.email, contactPhone: lead.phone, website: lead.website,
            googlePlaceId: key,
            qualityScore: scoreLead(lead),
            industry: r.category?.trim() || null,
            geography: r.location?.trim() || null,
            source: 'OPERATOR_IMPORT',
            notes: r.notes?.slice(0, 2000) || null,
            metadata: { importSource: source, sourceUrl: r.sourceUrl ?? null, collectedAt: new Date().toISOString(), scoreFactors: scoreFactors(lead) },
            leadGenAudits: { create: { event: 'IMPORTED', detail: { source }, actorId } },
          },
        });
        result.created++;
        result.leadIds.push(created.id);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        result.duplicates++;
      }
    }
    return result;
  }

  /** Pipeline report straight from persisted rows — no estimates. */
  async funnel(companyId: string) {
    const [byStatus, drafts, responses] = await Promise.all([
      this.prisma.salesLead.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.prisma.outreachDraft.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.prisma.outreachResponse.groupBy({ by: ['responseType'], where: { companyId }, _count: { _all: true } }),
    ]);
    const leads = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const total = byStatus.reduce((a, r) => a + r._count._all, 0);
    return {
      leads: { total, ...leads },
      drafts: Object.fromEntries(drafts.map((r) => [r.status, r._count._all])),
      responses: Object.fromEntries(responses.map((r) => [r.responseType, r._count._all])),
      conversionRate: total ? (leads.CONVERTED ?? 0) / total : 0,
    };
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

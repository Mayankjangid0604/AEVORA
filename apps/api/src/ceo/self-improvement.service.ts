import { Injectable, Logger } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { DEFAULT_EMAIL_SCRIPT } from '../sales-outreach/email-outreach.service';
import { CeoDecision, CeoDecisionsService, cleanCategory, validScript } from './ceo-decisions.service';

export interface CategoryStats {
  category: string;
  contacted: number;   // leads that got at least one outreach campaign
  responses: number;  // leads that replied INTERESTED/BOOKED
  conversions: number; // leads that reached QUALIFIED or CONVERTED
  avgRevenuePaise: number;
  conversionRate: number; // conversions / contacted
}

const MIN_CONTACTED = 5;
const DROP_BELOW = 0.1;
const BOOST_ABOVE = 0.3;
const SCRIPT_BATCH = 10;
const SCRIPT_MIN_RATE = 0.15;

// Neighbouring local-business categories to try when one converts badly.
const ADJACENT: Record<string, string[]> = {
  restaurant: ['cafe', 'bakery', 'sweet shop', 'cloud kitchen'],
  cafe: ['bakery', 'restaurant', 'juice bar'],
  salon: ['spa', 'barber shop', 'beauty parlour'],
  gym: ['yoga studio', 'fitness studio', 'dance academy'],
  retail_shop: ['boutique', 'electronics shop', 'furniture store'],
  coaching_center: ['tuition centre', 'computer institute', 'language school'],
  clinic: ['dental clinic', 'physiotherapy clinic', 'diagnostic lab'],
  hotel: ['guest house', 'homestay', 'banquet hall'],
};
const GENERIC_ADJACENT = ['boutique', 'clinic', 'coaching_center', 'salon', 'cafe', 'gym', 'hotel', 'retail_shop'];

/** Pure rules: which categories to drop (and what to try instead) and which to boost. */
export function planCategoryChanges(stats: CategoryStats[], current: string[], dropped: string[], weights: Record<string, number>) {
  const remove: string[] = [];
  const add: string[] = [];
  const boost: string[] = [];
  const taken = new Set([...current, ...dropped]);
  for (const s of stats) {
    if (!current.includes(s.category) || s.contacted <= MIN_CONTACTED) continue;
    if (s.conversionRate < DROP_BELOW) {
      remove.push(s.category);
      const next = [...(ADJACENT[s.category] ?? []), ...GENERIC_ADJACENT].map(cleanCategory).find((c) => c && !taken.has(c));
      if (next) {
        add.push(next);
        taken.add(next);
      }
    } else if (s.conversionRate > BOOST_ABOVE && (weights[s.category] ?? 1) < 2) {
      boost.push(s.category);
    }
  }
  return { remove, add, boost };
}

/** Replace the first paragraph of a template body. */
export function replaceOpening(body: string, opening: string) {
  const paras = body.split(/\n\s*\n/);
  return paras.length > 1 ? [paras[0], opening.trim(), ...paras.slice(2)].join('\n\n') : `${opening.trim()}\n\n${body}`;
}

@Injectable()
export class SelfImprovementService {
  private readonly logger = new Logger(SelfImprovementService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadGen: LeadGenService,
    private readonly decisions: CeoDecisionsService,
  ) {}

  async run(companyId: string, ceoId: string, autonomy: boolean): Promise<CeoDecision[]> {
    const out: CeoDecision[] = [];
    try {
      out.push(...(await this.tuneCategories(companyId, ceoId, autonomy)));
    } catch (e) {
      this.logger.error(`[${companyId}] category tuning failed: ${e.message}`);
    }
    try {
      out.push(...(await this.optimizeScripts(companyId, autonomy)));
    } catch (e) {
      this.logger.error(`[${companyId}] script optimizer failed: ${e.message}`);
    }
    return out;
  }

  /** ConversionTracker: stats are derived from the database each review, so they are always current and survive restarts. */
  async categoryStats(companyId: string): Promise<CategoryStats[]> {
    const leads = await this.prisma.salesLead.findMany({
      where: { companyId, googlePlaceId: { not: null }, industry: { not: null }, outreachCampaigns: { some: {} } },
      select: {
        industry: true,
        status: true,
        outreachCampaigns: { select: { outcome: true } },
        clientProjects: { where: { paidAt: { not: null } }, select: { quotedAmount: true } },
      },
    });
    const by = new Map<string, { contacted: number; responses: number; conversions: number; revenue: number; paid: number }>();
    for (const l of leads) {
      const s = by.get(l.industry!) ?? { contacted: 0, responses: 0, conversions: 0, revenue: 0, paid: 0 };
      s.contacted++;
      if (l.outreachCampaigns.some((c) => c.outcome === 'INTERESTED' || c.outcome === 'BOOKED')) s.responses++;
      if (l.status === 'QUALIFIED' || l.status === 'CONVERTED') s.conversions++;
      for (const p of l.clientProjects) {
        s.revenue += p.quotedAmount ?? 0;
        s.paid++;
      }
      by.set(l.industry!, s);
    }
    return [...by.entries()].map(([category, s]) => ({
      category,
      contacted: s.contacted,
      responses: s.responses,
      conversions: s.conversions,
      avgRevenuePaise: s.paid ? Math.round(s.revenue / s.paid) : 0,
      conversionRate: s.contacted ? s.conversions / s.contacted : 0,
    }));
  }

  private async tuneCategories(companyId: string, ceoId: string, autonomy: boolean): Promise<CeoDecision[]> {
    const [stats, current, config] = await Promise.all([
      this.categoryStats(companyId),
      this.leadGen.categoriesFor(companyId),
      this.prisma.leadGenConfig.findUnique({ where: { companyId } }),
    ]);
    const weights = (config?.weights as Record<string, number>) ?? {};
    const plan = planCategoryChanges(stats, current, config?.dropped ?? [], weights);
    const pct = (c: string) => {
      const s = stats.find((x) => x.category === c)!;
      return `${c}: ${s.conversions}/${s.contacted} converted (${Math.round(s.conversionRate * 100)}%)`;
    };
    const out: CeoDecision[] = [];

    if (plan.remove.length) {
      // goes through the same executor as review decisions (autonomy switch, outcome logging)
      out.push(...(await this.decisions.apply(companyId, ceoId, [{
        type: 'CHANGE_LEAD_CATEGORY',
        reason: `Low conversion — ${plan.remove.map(pct).join('; ')}. Trying ${plan.add.join(', ') || 'no new category'} instead.`,
        parameters: { remove: plan.remove, add: plan.add },
      }], autonomy)));
    }

    if (plan.boost.length) {
      if (!autonomy) {
        out.push({ type: 'PIPELINE_ACTION', kind: 'CATEGORY', reason: 'high conversion', parameters: { boost: plan.boost }, outcome: 'BLOCKED', detail: 'CEO_AUTONOMY off — weights unchanged' });
      } else {
        const next = { ...weights, ...Object.fromEntries(plan.boost.map((c) => [c, 2])) };
        await this.prisma.leadGenConfig.upsert({
          where: { companyId },
          create: { companyId, categories: current, weights: next, updatedBy: ceoId },
          update: { weights: next, updatedBy: ceoId },
        });
        out.push({
          type: 'PIPELINE_ACTION',
          kind: 'CATEGORY',
          reason: `High conversion — ${plan.boost.map(pct).join('; ')}`,
          parameters: { boost: plan.boost },
          outcome: 'EXECUTED',
          detail: `Now searching ${plan.boost.join(', ')} twice per lead-gen cycle`,
        });
      }
    }
    return out;
  }

  /** OutreachScriptOptimizer: every 10 campaigns on a script, compare; below 15% positive → rewrite subject + opening. */
  private async optimizeScripts(companyId: string, autonomy: boolean): Promise<CeoDecision[]> {
    const scripts = await this.prisma.outreachScript.findMany({ where: { companyId, channel: 'EMAIL', isActive: true } });
    if (!scripts.length) {
      // Materialize the built-in script so its campaigns get a scriptId and can be measured.
      const exists = await this.prisma.outreachScript.findUnique({ where: { companyId_templateName: { companyId, templateName: DEFAULT_EMAIL_SCRIPT.templateName } } });
      if (!exists) {
        await this.prisma.outreachScript.create({ data: { companyId, channel: 'EMAIL', ...DEFAULT_EMAIL_SCRIPT } });
      }
      return [];
    }

    const out: CeoDecision[] = [];
    for (const script of scripts) {
      const where = { companyId, scriptId: script.id, status: { in: ['SENT', 'RESPONDED', 'CLOSED'] as any } };
      const [n, positive] = await Promise.all([
        this.prisma.outreachCampaign.count({ where }),
        this.prisma.outreachCampaign.count({ where: { ...where, outcome: { in: ['INTERESTED', 'BOOKED'] } } }),
      ]);
      if (n < script.evaluatedAtCount + SCRIPT_BATCH) continue;
      const rate = positive / n;
      const ratePct = Math.round(rate * 100);
      await this.prisma.outreachScript.update({ where: { id: script.id }, data: { evaluatedAtCount: n, responseRatePct: ratePct } });

      const parent = script.parentId ? await this.prisma.outreachScript.findUnique({ where: { id: script.parentId } }) : null;
      const ab = parent?.responseRatePct != null ? ` (previous version: ${parent.responseRatePct}% → this version: ${ratePct}%)` : '';
      if (rate >= SCRIPT_MIN_RATE) {
        out.push({ type: 'PIPELINE_ACTION', kind: 'SCRIPT', reason: 'script A/B check', parameters: { scriptId: script.id, campaigns: n, ratePct }, outcome: 'SKIPPED', detail: `Script "${script.templateName}" is working: ${positive}/${n} positive (${ratePct}%)${ab}` });
        continue;
      }
      if (!autonomy) {
        out.push({ type: 'PIPELINE_ACTION', kind: 'SCRIPT', reason: 'script A/B check', parameters: { scriptId: script.id, ratePct }, outcome: 'BLOCKED', detail: `Script at ${ratePct}% but CEO_AUTONOMY is off` });
        continue;
      }

      const res = await this.gateway.generate({
        systemMessage: `You improve cold emails for a small Indian web/automation agency. Rewrite ONLY the subject line and the opening paragraph (the first paragraph after the greeting).
Return JSON only: {"subjectTemplate": string, "openingParagraph": string}. Allowed placeholders: {{businessName}}, {{category}}, {{chairmanName}}, {{companyName}}.`,
        prompt: JSON.stringify({ subject: script.subjectTemplate, body: script.bodyTemplate, campaigns: n, positiveReplies: positive, responseRatePct: ratePct }),
        requireStructuredOutput: true,
        temperature: 0.5,
      });
      const raw = res.structuredOutput;
      const candidate = typeof raw?.openingParagraph === 'string'
        ? validScript({ subjectTemplate: raw.subjectTemplate, bodyTemplate: replaceOpening(script.bodyTemplate, raw.openingParagraph.slice(0, 800)) })
        : null;
      if (!candidate) {
        out.push({ type: 'PIPELINE_ACTION', kind: 'SCRIPT', reason: 'script A/B check', parameters: { scriptId: script.id, ratePct }, outcome: 'FAILED', detail: 'Rewrite rejected by validation; kept the current script' });
        continue;
      }
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.outreachScript.update({ where: { id: script.id }, data: { isActive: false } });
        return tx.outreachScript.create({
          data: { companyId, channel: 'EMAIL', templateName: `ceo-ab-${Date.now()}`, parentId: script.id, ...candidate },
        });
      });
      out.push({
        type: 'PIPELINE_ACTION',
        kind: 'SCRIPT',
        reason: `Script "${script.templateName}" got ${positive}/${n} positive replies (${ratePct}%, below 15%)${ab}`,
        parameters: { from: script.id, to: created.id, campaigns: n, ratePct },
        outcome: 'EXECUTED',
        detail: `New subject + opening: "${candidate.subjectTemplate}" (version ${created.templateName}); A/B continues from here`,
      });
    }
    return out;
  }
}

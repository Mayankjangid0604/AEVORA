import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway, ModelTier, shouldUseComplexModel } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { CEO_DECISION_TYPES, CeoDecision, CeoDecisionsService } from './ceo-decisions.service';
import { PipelineManagementService } from './pipeline-management.service';
import { WeeklyReportService, isMondayNine } from './weekly-report.service';
import { SelfImprovementService } from './self-improvement.service';
import { buildFeed } from './ceo-feed';
import { CeoDialogueService } from './ceo-dialogue.service';
import { IdeasService } from '../ideas/ideas.service';
import { CeoHiringService } from './ceo-hiring.service';
import { HeadHiringService } from './head-hiring.service';
import { OFFICE_ROOMS } from './office-rooms';
import { parseJson } from '../common/parse-json';
export { parseJson };

const DAY = 86_400_000;

const REVIEW_SYSTEM = `You are the CEO of an AI company. Review the business data and return JSON with these exact fields:
{
  "topRisk": string (biggest threat right now, 1 sentence),
  "topOpportunity": string (best thing to pursue, 1 sentence),
  "decisionsProposed": [
    { "type": "REALLOCATE_AGENT" | "CHANGE_LEAD_CATEGORY" | "ADJUST_OUTREACH_SCRIPT" | "PAUSE_VENTURE" | "HIRE_AGENT" | "ESCALATE_TO_CHAIRMAN",
      "reason": string,
      "parameters": {} }
  ],
  "weeklyReport": string (3-4 sentences, plain English summary for the Chairman)
}
Keep decisionsProposed to max 3 items. Only propose what the data actually supports.
For CHANGE_LEAD_CATEGORY use parameters {"add": string[], "remove": string[]} with plain business categories (e.g. "salon").
Follow the Chairman's directives when they are present, and use chairmanAnswers (the Chairman's replies to your earlier questions) in your decisions.
Only use ESCALATE_TO_CHAIRMAN when you genuinely need the Chairman's input; put the question in parameters.question and "LOW" | "MEDIUM" | "HIGH" in parameters.urgency.
HIRING: "team" lists everyone who works here. You build the company. To make money the company needs people who find clients (sales), attract them (marketing), build what is sold (development/design), deliver it (project management) and collect payment (finance). If a function the business needs right now has nobody, use HIRE_AGENT with parameters {"role": "job title, e.g. Web Developer", "department": "e.g. Engineering", "responsibilities": "what they will do, 1 sentence"}. Hire one person per role at a time, most important role first. Do not hire a role that already exists unless that person is clearly overloaded, never hire another CEO, and do not hire when team.canHire is false.
BOOTSTRAP: if "bootstrap.departmentsWithoutHead" is non-empty, that is your top priority above every other decision: HIRE_AGENT a "Head of <department>" for the first department in that list, with responsibilities "Lead the <department> department and build out its team", before proposing anything else this cycle. Once every department has a head, resume normal hiring, preferring to grow understaffed departments that already have a head.`;

export interface ReviewResult {
  topRisk: string;
  topOpportunity: string;
  decisionsProposed: CeoDecision[];
  weeklyReport: string;
}

/** Defensive parse of the model's review: whitelisted types, max 3, strings bounded. */
export function normalizeReview(raw: any): ReviewResult {
  const str = (v: unknown, fallback: string, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
  const decisions = (Array.isArray(raw?.decisionsProposed) ? raw.decisionsProposed : [])
    .filter((d: any) => CEO_DECISION_TYPES.includes(d?.type))
    .slice(0, 3)
    .map((d: any) => ({
      type: d.type,
      reason: str(d.reason, 'No reason given', 400),
      parameters: d.parameters && typeof d.parameters === 'object' && !Array.isArray(d.parameters) ? d.parameters : {},
    }));
  return {
    topRisk: str(raw?.topRisk, 'Not enough data to identify a risk yet.', 300),
    topOpportunity: str(raw?.topOpportunity, 'Not enough data to identify an opportunity yet.', 300),
    decisionsProposed: decisions,
    weeklyReport: str(raw?.weeklyReport, 'The CEO could not produce a report this cycle.', 1500),
  };
}

/** Simulation clock → "YYYY-MM-DDTHH" (local time, same basis as the world's day/night). */
export function simHourKey(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

export function isWeekdayNine(d: Date) {
  const day = d.getDay();
  return day >= 1 && day <= 5 && d.getHours() === 9;
}

export function findCeo(prisma: PrismaService, companyId: string) {
  return prisma.employee.findFirst({
    where: {
      companyId,
      status: 'ACTIVE',
      role: { OR: [{ title: { contains: 'CEO', mode: 'insensitive' } }, { title: { contains: 'Chief Executive', mode: 'insensitive' } }] },
    },
    orderBy: { hireDate: 'asc' },
  });
}

@Injectable()
export class CeoReviewService {
  private readonly logger = new Logger(CeoReviewService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: CeoDecisionsService,
    private readonly pipeline: PipelineManagementService,
    private readonly weekly: WeeklyReportService,
    private readonly improvement: SelfImprovementService,
    private readonly dialogue: CeoDialogueService,
    private readonly realtime: RealtimeGateway,
    private readonly ideas: IdeasService,
    private readonly hiring: CeoHiringService,
    private readonly headHiring: HeadHiringService,
  ) {}

  /** Called from the business loop: one review per simulation hour, and not more often than CEO_REVIEW_MIN_INTERVAL_MIN real minutes. */
  async runIfDue(companyId: string) {
    const ceo = await findCeo(this.prisma, companyId);
    if (!ceo) return 'no_ceo';
    const state = (await this.prisma.simulationState.findFirst({ where: { companyId } })) ?? (await this.prisma.simulationState.findFirst());
    const simTime = state?.simulationTime ?? new Date();
    const key = simHourKey(simTime);

    const last = await this.prisma.ceoReview.findFirst({ where: { companyId }, orderBy: { reviewedAt: 'desc' } });
    if (last?.simHour === key) return 'not_due';
    // Item 4: while the company is still building out (<20 active employees), review faster so the office fills up
    // within its first half hour instead of the normal ~15 min-per-hire cadence.
    const headcount = await this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } });
    const bootstrapping = headcount < Number(process.env.CEO_BOOTSTRAP_HEADCOUNT ?? 20);
    const minMs = (bootstrapping ? Number(process.env.CEO_BOOTSTRAP_INTERVAL_MIN ?? 2) : Number(process.env.CEO_REVIEW_MIN_INTERVAL_MIN ?? 15)) * 60_000;
    // ponytail: at high sim speeds a sim hour is seconds of real time; the real-time floor keeps LLM spend sane.
    if (last && Date.now() - last.reviewedAt.getTime() < minMs && !isWeekdayNine(simTime)) return 'throttled';

    const result = await this.runReview(companyId, ceo.id, simTime);
    // Item 3: once the CEO's own cycle is done, department Heads run their own small hiring cycle for their own team.
    await this.headHiring.runForCompany(companyId).catch((e) => this.logger.warn(`Head hiring cycle failed: ${e.message}`));
    return result;
  }

  async snapshot(companyId: string) {
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const [lastRun, runsThisWeek, leadsByStatus, sentThisWeek, positiveThisWeek, projects, paid, account, survival, directives, answers, ventures, categories, chairmanMessages, team] =
      await Promise.all([
        this.prisma.leadGenRun.findFirst({ where: { companyId }, orderBy: { triggeredAt: 'desc' } }),
        this.prisma.leadGenRun.aggregate({ where: { companyId, triggeredAt: { gte: weekAgo } }, _sum: { totalNew: true } }),
        this.prisma.salesLead.groupBy({ by: ['status'], where: { companyId, googlePlaceId: { not: null } }, _count: true }),
        this.prisma.outreachCampaign.count({ where: { companyId, sentAt: { gte: weekAgo } } }),
        this.prisma.outreachCampaign.count({ where: { companyId, sentAt: { gte: weekAgo }, outcome: { in: ['INTERESTED', 'BOOKED'] } } }),
        this.prisma.clientProject.groupBy({ by: ['status'], where: { companyId }, _count: true, _sum: { quotedAmount: true } }),
        this.prisma.clientProject.aggregate({ where: { companyId, status: { in: ['PAID', 'CLOSED'] }, paidAt: { gte: weekAgo } }, _sum: { quotedAmount: true } }),
        this.prisma.realMoneyAccount.findUnique({ where: { companyId } }),
        this.prisma.survivalConfig.findUnique({ where: { companyId } }),
        this.unreadDirectives(companyId),
        this.dialogue.pendingAnswers(companyId),
        this.prisma.venture.findMany({ where: { companyId, status: { in: ['ACTIVE', 'PAUSED'] } }, select: { name: true, status: true, teamSize: true, createdAt: true } }),
        this.prisma.leadGenConfig.findUnique({ where: { companyId } }),
        // What the Chairman told the Assistant in the last 24h (directives themselves also arrive via chairmanDirectives).
        this.prisma.assistantMessage.findMany({
          where: { companyId, from: 'CHAIRMAN', status: 'DONE', createdAt: { gte: new Date(Date.now() - DAY) } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { content: true },
        }),
        this.hiring.teamSnapshot(companyId),
      ]);

    const leads = Object.fromEntries(leadsByStatus.map((g) => [g.status, g._count]));
    const openStatuses = ['SCOPING', 'BUILDING', 'SAMPLE_SENT', 'REVISION', 'APPROVED', 'INVOICED'];
    const projectsByStatus = Object.fromEntries(projects.map((g) => [g.status, g._count]));
    const pipelinePaise = projects.filter((g) => openStatuses.includes(g.status)).reduce((s, g) => s + (g._sum.quotedAmount ?? 0), 0);

    return {
      leadGen: { lastRunAt: lastRun?.triggeredAt ?? null, lastRunStatus: lastRun?.status ?? null, leadsFoundThisWeek: runsThisWeek._sum.totalNew ?? 0, categories: categories?.categories ?? null },
      leads: { NEW: leads.NEW ?? 0, CONTACTED: leads.CONTACTED ?? 0, QUALIFIED: leads.QUALIFIED ?? 0, CONVERTED: leads.CONVERTED ?? 0, DISQUALIFIED: leads.DISQUALIFIED ?? 0 },
      outreach: { sentThisWeek, positiveThisWeek, responseRate: sentThisWeek ? Math.round((positiveThisWeek / sentThisWeek) * 100) : null },
      clientProjects: { byStatus: projectsByStatus, pipelinePaise, dealsInProgress: projects.filter((g) => openStatuses.includes(g.status)).reduce((s, g) => s + g._count, 0) },
      money: { balancePaise: account?.balance ?? 0, paidThisWeekPaise: paid._sum.quotedAmount ?? 0, survivalStatus: survival?.currentStatus ?? 'UNKNOWN' },
      team,
      ventures,
      chairmanDirectives: directives.map((d) => ({ id: d.id, instruction: d.description ?? d.title, issuedAt: d.createdAt })),
      chairmanMessages: chairmanMessages.map((m) => m.content),
      chairmanAnswers: answers.map((q) => ({ id: q.id, yourQuestion: q.question, chairmanAnswer: q.chairmanAnswer, answeredAt: q.answeredAt })),
      bootstrap: { departmentsWithoutHead: this.departmentsWithoutHead(team.members) },
    };
  }

  /** Item 3: departments (in a fixed, stable order) with nobody whose title contains "Head" or "Director" yet. */
  private departmentsWithoutHead(members: { role: string; department: string }[]) {
    const staffed = new Set(
      members.filter((m) => /\b(head|director)\b/i.test(m.role)).map((m) => m.department),
    );
    return Object.values(OFFICE_ROOMS)
      .filter((d) => d !== 'Board Room' && !staffed.has(d));
  }

  /** Chairman voice directives (Phase 42 COMMAND_CEO) from the last 7 days that the CEO has not yet read. */
  private async unreadDirectives(companyId: string) {
    const recent = await this.prisma.managementDecision.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        payload: { path: ['source'], equals: 'CHAIRMAN_VOICE' },
        createdAt: { gte: new Date(Date.now() - 7 * DAY) },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return recent.filter((d) => !(d.payload as any)?.ceoReadAt);
  }

  async runReview(companyId: string, ceoEmployeeId: string, simTime: Date) {
    const snap = await this.snapshot(companyId);

    let review: ReviewResult;
    try {
      // Fast local model every cycle; re-think with the complex tier only when the stakes are high.
      const prompt = JSON.stringify(snap);
      review = normalizeReview(parseJson(await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, prompt, REVIEW_SYSTEM, { json: true })));
      const types = review.decisionsProposed.map((d) => d.type);
      const maxBudget = Math.max(snap.clientProjects.pipelinePaise, snap.money.balancePaise, snap.money.paidThisWeekPaise);
      // The bigger model is very slow on a CPU; opt in with CEO_COMPLEX_RETHINK=true (e.g. with a GPU).
      if (process.env.CEO_COMPLEX_RETHINK === 'true' && shouldUseComplexModel(types, maxBudget)) {
        const reason = maxBudget > 5000000 ? `budget ${maxBudget} paise` : `decisions ${types.join(', ')}`;
        this.logger.log(`CEO using complex model for: ${reason}`);
        try {
          review = normalizeReview(parseJson(await this.gateway.callWithTier(ModelTier.LOCAL_COMPLEX, prompt, REVIEW_SYSTEM, { json: true })));
        } catch (e) {
          // Keep the first answer — a timed-out re-think must not wipe the CEO's decisions.
          this.logger.warn(`[${companyId}] complex re-think failed, keeping the first review: ${e.message}`);
        }
      }
    } catch (e) {
      this.logger.warn(`[${companyId}] CEO review model call failed: ${e.message}`);
      review = normalizeReview(null);
    }

    const autonomy = !(await this.prisma.killSwitchConfig.findFirst({
      where: { OR: [{ companyId }, { companyId: null }], feature: { in: ['GLOBAL_PRODUCTION', 'CEO_AUTONOMY'] }, isDisabled: true },
    }));

    // Claim the sim hour before acting, so a concurrent pass can't execute the same decisions twice.
    let record;
    try {
      record = await this.prisma.ceoReview.create({
        data: {
          companyId,
          ceoEmployeeId,
          simHour: simHourKey(simTime),
          leadsFound: snap.leadGen.leadsFoundThisWeek,
          leadsContacted: snap.outreach.sentThisWeek,
          leadsQualified: snap.leads.QUALIFIED,
          dealsInProgress: snap.clientProjects.dealsInProgress,
          paidThisWeek: snap.money.paidThisWeekPaise,
          balancePaise: snap.money.balancePaise,
          survivalStatus: snap.money.survivalStatus,
          topRisk: review.topRisk,
          topOpportunity: review.topOpportunity,
          decisionsProposed: review.decisionsProposed as any,
          weeklyReport: review.weeklyReport,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'not_due';
      throw e;
    }

    const pipelineActions = autonomy
      ? await this.pipeline.manage(companyId, ceoEmployeeId)
      : [{ type: 'PIPELINE_ACTION' as const, reason: 'CEO_AUTONOMY off', parameters: {}, outcome: 'BLOCKED' as const, detail: 'Pipeline management paused by kill switch' }];
    const applied = [
      ...(await this.decisions.apply(companyId, ceoEmployeeId, review.decisionsProposed, autonomy)),
      ...pipelineActions,
      ...(await this.improvement.run(companyId, ceoEmployeeId, autonomy)),
    ];

    // Mondays (real day): one self-generated startup idea per week. Background — it's another phi4 call,
    // and generateCeoIdea itself enforces the 7-day limit before calling the model.
    if (autonomy && new Date().getDay() === 1) {
      this.ideas.generateCeoIdea(companyId).catch((e) => this.logger.error(`[${companyId}] weekly CEO idea failed: ${e.message}`));
    }

    // Directives are now read.
    for (const d of snap.chairmanDirectives) {
      const md = await this.prisma.managementDecision.findUnique({ where: { id: d.id } });
      await this.prisma.managementDecision.update({
        where: { id: d.id },
        data: { payload: { ...((md?.payload as object) ?? {}), ceoReadAt: new Date().toISOString(), ceoReviewId: record.id } },
      });
    }

    await this.dialogue.markUsed(snap.chairmanAnswers.map((a) => a.id));

    const sendReport = isWeekdayNine(simTime);
    const saved = await this.prisma.ceoReview.update({
      where: { id: record.id },
      data: { decisionsProposed: applied as any, sentToChairman: sendReport },
    });

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    if (sendReport) {
      this.realtime.broadcastToUser(company.chairmanId, 'ceo.report', {
        reviewId: saved.id,
        report: saved.weeklyReport,
        topRisk: saved.topRisk,
        topOpportunity: saved.topOpportunity,
        decisions: applied.map((d) => ({ type: d.type, outcome: d.outcome, detail: d.detail })),
      });
    }
    // Low-priority nudge: web refreshes its CEO card, mobile bumps a badge (no alert).
    const fresh = buildFeed([saved], [], 50).filter((i) => i.kind !== 'REVIEW');
    this.realtime.broadcastToUser(company.chairmanId, 'ceo.activity', { reviewId: saved.id, count: fresh.length + 1, latest: fresh[0] ?? buildFeed([saved], [])[0] });

    if (isMondayNine(simTime)) {
      await this.weekly.generateAndSend(companyId, ceoEmployeeId, simTime).catch((e) => this.logger.error(`[${companyId}] weekly report failed: ${e.message}`));
    }
    this.logger.log(`[${companyId}] CEO review ${saved.id}: ${applied.map((d) => `${d.type}=${d.outcome}`).join(', ') || 'no decisions'}`);
    return saved;
  }

  /** Chairman → CEO: a typed question answered right away, grounded in the live business snapshot. */
  async answerChairman(companyId: string, question: string) {
    const q = question?.trim();
    if (!q) throw new BadRequestException('question is required');
    if (q.length > 1000) throw new BadRequestException('question too long (max 1000 characters)');
    const snap = await this.snapshot(companyId);
    const recent = await this.prisma.ceoReview.findFirst({ where: { companyId }, orderBy: { reviewedAt: 'desc' } });
    const text = await this.gateway.callWithTier(
      ModelTier.LOCAL_BASIC,
      JSON.stringify({ chairmanQuestion: q, business: snap, lastReview: recent && { at: recent.reviewedAt, topRisk: recent.topRisk, topOpportunity: recent.topOpportunity, actions: recent.decisionsProposed } }),
      `You are the CEO of a small AI-run web/automation agency in India, answering your Chairman directly.
Answer in plain English, 2-6 sentences, grounded ONLY in the business data provided. Amounts are in paise; state them in rupees (₹).
If the data can't answer the question, say so and say what you'd need.`,
    );
    return { question: q, answer: text.trim(), answeredAt: new Date() };
  }

  async feed(companyId: string, limit = 20) {
    const [reviews, weeklies] = await Promise.all([
      this.prisma.ceoReview.findMany({ where: { companyId }, orderBy: { reviewedAt: 'desc' }, take: limit }),
      this.prisma.weeklyReport.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 4 }),
    ]);
    return buildFeed(reviews, weeklies, limit);
  }

  list(companyId: string) {
    return this.prisma.ceoReview.findMany({ where: { companyId }, orderBy: { reviewedAt: 'desc' }, take: 50 });
  }
}

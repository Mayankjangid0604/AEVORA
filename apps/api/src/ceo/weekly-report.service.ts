import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';

const DAY = 86_400_000;

const COMMENTARY_SYSTEM = `You are the CEO of a small AI-run web/automation agency in India, writing the weekly report to the Chairman.
Return JSON only: {"biggestChallenge": string (1 sentence), "ceoCommentary": string}
ceoCommentary must be exactly 3 short paragraphs separated by a blank line:
1) what went well this week, 2) what didn't, 3) what you plan to do next week.
Be concrete, use the numbers given, no hype. Amounts are in paise; write them in rupees (₹).`;

/** The report for a Monday covers the previous simulation week: Monday 00:00 seven days earlier → this Monday 00:00. */
export function reportWeek(simNow: Date) {
  const end = new Date(simNow.getFullYear(), simNow.getMonth(), simNow.getDate());
  const start = new Date(end.getTime() - 7 * DAY);
  return { start, end };
}

export const isMondayNine = (d: Date) => d.getDay() === 1 && d.getHours() === 9;

export function normalizeCommentary(raw: any, fallback: { challenge: string; commentary: string }) {
  const challenge = typeof raw?.biggestChallenge === 'string' && raw.biggestChallenge.trim() ? raw.biggestChallenge.trim().slice(0, 300) : fallback.challenge;
  const commentary = typeof raw?.ceoCommentary === 'string' && raw.ceoCommentary.trim().length > 40 ? raw.ceoCommentary.trim().slice(0, 4000) : fallback.commentary;
  return { biggestChallenge: challenge, ceoCommentary: commentary };
}

@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);
  private readonly gateway = new ModelGateway();

  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  /**
   * Idempotent per (company, week). Activity is measured over the last 7 real days — records carry real timestamps —
   * while the week label follows the simulation calendar that triggered it.
   */
  async generateAndSend(companyId: string, ceoEmployeeId: string, simNow: Date) {
    const { start, end } = reportWeek(simNow);
    const existing = await this.prisma.weeklyReport.findUnique({ where: { companyId_weekStartDate: { companyId, weekStartDate: start } } });
    if (existing) return existing;

    const since = new Date(Date.now() - 7 * DAY);
    const [found, contacted, positive, payments, dealsWon, winners, reviews] = await Promise.all([
      this.prisma.leadGenRun.aggregate({ where: { companyId, triggeredAt: { gte: since } }, _sum: { totalNew: true } }),
      this.prisma.outreachCampaign.count({ where: { companyId, sentAt: { gte: since } } }),
      this.prisma.outreachCampaign.count({ where: { companyId, sentAt: { gte: since }, outcome: { in: ['INTERESTED', 'BOOKED'] } } }),
      this.prisma.realMoneyTransaction.aggregate({ where: { account: { companyId }, referenceType: 'CLIENT_PAYMENT', createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.clientProject.count({ where: { companyId, paidAt: { gte: since } } }),
      this.prisma.salesLead.groupBy({
        by: ['industry'],
        where: { companyId, status: { in: ['QUALIFIED', 'CONVERTED'] }, updatedAt: { gte: since }, industry: { not: null } },
        _count: true,
      }),
      this.prisma.ceoReview.findMany({ where: { companyId, reviewedAt: { gte: since } }, orderBy: { reviewedAt: 'desc' }, take: 30 }),
    ]);

    const top = [...winners].sort((a, b) => b._count - a._count)[0];
    const stats = {
      leadsFound: found._sum.totalNew ?? 0,
      leadsContacted: contacted,
      positiveReplies: positive,
      dealsWon,
      revenuePaise: payments._sum.amount ?? 0,
      topCategory: top?.industry ?? null,
    };
    const ceoActions = reviews.flatMap((r) => (r.decisionsProposed as any[]).filter((d) => d.outcome === 'EXECUTED').map((d) => d.detail ?? d.type)).slice(0, 15);
    const risks = [...new Set(reviews.map((r) => r.topRisk))].slice(0, 5);

    const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
    const fallback = {
      challenge: risks[0] ?? (stats.leadsContacted === 0 ? 'No outreach went out this week.' : 'Turning replies into paid projects.'),
      commentary:
        `This week we found ${stats.leadsFound} leads, contacted ${stats.leadsContacted}, and ${stats.positiveReplies} replied positively.\n\n` +
        `We closed ${stats.dealsWon} deal(s) for ${rupees(stats.revenuePaise)}.${risks[0] ? ` The main concern: ${risks[0]}` : ''}\n\n` +
        `Next week the focus stays on converting interested leads and keeping the pipeline full.`,
    };

    let result = { biggestChallenge: fallback.challenge, ceoCommentary: fallback.commentary };
    try {
      const res = await this.gateway.generate({
        systemMessage: COMMENTARY_SYSTEM,
        prompt: JSON.stringify({ week: { start, end }, stats, ceoActionsThisWeek: ceoActions, risksRaised: risks }),
        requireStructuredOutput: true,
        temperature: 0.3,
      });
      result = normalizeCommentary(res.structuredOutput, fallback);
    } catch (e) {
      this.logger.warn(`[${companyId}] weekly commentary model call failed, using template: ${e.message}`);
    }

    let report;
    try {
      report = await this.prisma.weeklyReport.create({
        data: {
          companyId,
          ceoEmployeeId,
          weekStartDate: start,
          weekEndDate: end,
          leadsFoundCount: stats.leadsFound,
          leadsContactedCount: stats.leadsContacted,
          dealsWonCount: stats.dealsWon,
          revenueEarnedPaise: stats.revenuePaise,
          topPerformingCategory: stats.topCategory,
          biggestChallenge: result.biggestChallenge,
          ceoCommentary: result.ceoCommentary,
          sentAt: new Date(),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.weeklyReport.findUniqueOrThrow({ where: { companyId_weekStartDate: { companyId, weekStartDate: start } } });
      }
      throw e;
    }

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    this.realtime.broadcastToUser(company.chairmanId, 'ceo.weekly_report', {
      reportId: report.id,
      weekStartDate: report.weekStartDate,
      revenueEarnedPaise: report.revenueEarnedPaise,
      dealsWonCount: report.dealsWonCount,
      biggestChallenge: report.biggestChallenge,
      ceoCommentary: report.ceoCommentary,
    });
    return report;
  }

  list(companyId: string, take = 4) {
    return this.prisma.weeklyReport.findMany({ where: { companyId }, orderBy: { weekStartDate: 'desc' }, take });
  }
}

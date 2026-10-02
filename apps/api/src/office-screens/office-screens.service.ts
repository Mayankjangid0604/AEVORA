import { BadRequestException, Injectable } from '@nestjs/common';
import { isValidFinancialAmount } from '@aevora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { cumulativeByMonth, dayKey, daysLeft, daysLeftInMonth, lastMonths, monthKey, payingClientFirstDates, sumByKey } from './screens.logic';

const PAID_STATUSES = ['PAID', 'CLOSED'] as const;
/** Start of an IST month ("2026-09") as a UTC instant. */
const monthStart = (mk: string) => new Date(Date.UTC(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1) - 330 * 60_000);
const nextMonth = (mk: string) => { const t = +mk.slice(0, 4) * 12 + +mk.slice(5, 7); return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

// Project pipeline → screen stage. Anything else (done / failed / cancelled) only appears in the full table.
const IN_PROGRESS = new Set(['ONBOARDING', 'ACTIVE', 'BLOCKED', 'IN_QA', 'IN_REVIEW', 'BUILDING', 'SAMPLE_SENT', 'REVISION']);
const NOT_STARTED = new Set(['PLANNED', 'SCOPING']);
export const stageOf = (status: string) => (IN_PROGRESS.has(status) ? 'IN_PROGRESS' : NOT_STARTED.has(status) ? 'NOT_STARTED' : 'OTHER');

export interface ScreenProject {
  id: string; source: 'PROJECT' | 'CLIENT_PROJECT'; name: string; client: string | null; status: string; stage: string;
  progress: number | null; owner: string | null; start: Date | null; deadline: Date | null; daysLeft: number | null;
}

/** Nearest deadline first, projects without a deadline last. */
export const byDeadline = (a: ScreenProject, b: ScreenProject) =>
  (a.deadline ? a.deadline.getTime() : Infinity) - (b.deadline ? b.deadline.getTime() : Infinity) || a.name.localeCompare(b.name);

/** One call per room: everything its wall screens show, straight from the database. */
@Injectable()
export class OfficeScreensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Research: company growth (paying clients, employees, projects) and revenue over 12 months + what we're doing about revenue. */
  async research(companyId: string, now = new Date()) {
    const months = lastMonths(now, 12);
    const since = new Date(Date.UTC(+months[0].slice(0, 4), +months[0].slice(5) - 1, 1) - 330 * 60_000);
    const [paid, paidInvoices, employees, clientProjects, projects, revenue, initiatives, objectives, campaigns, outreachThisMonth] = await Promise.all([
      this.prisma.clientProject.findMany({ where: { companyId, paidAt: { not: null }, status: { in: [...PAID_STATUSES] } }, select: { leadId: true, invoiceId: true, paidAt: true } }),
      this.prisma.invoice.findMany({ where: { companyId, status: 'PAID' }, select: { id: true, clientId: true, paidDate: true } }),
      this.prisma.employee.findMany({ where: { companyId }, select: { hireDate: true, terminationDate: true } }),
      this.prisma.clientProject.findMany({ where: { companyId }, select: { createdAt: true } }),
      this.prisma.project.findMany({ where: { companyId }, select: { createdAt: true } }),
      this.prisma.revenueRecord.findMany({ where: { companyId, status: 'RECEIVED', receivedAt: { gte: since } }, select: { amount: true, receivedAt: true } }),
      this.prisma.strategicInitiative.findMany({ where: { companyId, status: { in: ['ACTIVE', 'APPROVED'] } }, orderBy: { createdAt: 'desc' }, take: 3, select: { title: true, status: true } }),
      this.prisma.companyObjective.findMany({ where: { companyId, status: { in: ['ACTIVE', 'AT_RISK'] } }, orderBy: { createdAt: 'desc' }, take: 3, select: { title: true, status: true } }),
      this.prisma.marketingCampaign.findMany({ where: { companyId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 3, select: { name: true, status: true } }),
      this.prisma.outreachCampaign.count({ where: { companyId, status: { in: ['SENT', 'RESPONDED'] }, sentAt: { gte: new Date(Date.UTC(+monthKey(now).slice(0, 4), +monthKey(now).slice(5) - 1, 1) - 330 * 60_000) } } }),
    ]);

    const firstPaid = payingClientFirstDates(paid, paidInvoices); // first payment = when they became a paying client

    const actions = [
      ...initiatives.map((i) => ({ kind: 'Strategy', title: i.title, status: i.status })),
      ...objectives.map((o) => ({ kind: 'Objective', title: o.title, status: o.status })),
      ...campaigns.map((c) => ({ kind: 'Marketing', title: c.name, status: c.status })),
      ...(outreachThisMonth ? [{ kind: 'Sales', title: `Outreach: ${outreachThisMonth} message${outreachThisMonth === 1 ? '' : 's'} sent this month`, status: 'ACTIVE' }] : []),
    ].slice(0, 5);

    return {
      months,
      growth: {
        payingClients: cumulativeByMonth([...firstPaid.values()].map((d) => ({ from: d })), months),
        employees: cumulativeByMonth(employees.map((e) => ({ from: e.hireDate, to: e.terminationDate })), months),
        projects: cumulativeByMonth([...clientProjects, ...projects].map((p) => ({ from: p.createdAt })), months),
      },
      revenuePaise: sumByKey(revenue, (r) => (r.receivedAt ? monthKey(r.receivedAt) : null), (r) => r.amount, months),
      actions,
    };
  }

  /** Engineering & IT: in-progress, not-started, and every project by nearest deadline. Progress = completed tasks / all tasks. */
  async engineering(companyId: string, now = new Date()) {
    const [projects, clientProjects] = await Promise.all([
      this.prisma.project.findMany({
        where: { companyId },
        select: {
          id: true, name: true, status: true, startDate: true, targetEndDate: true, client: { select: { name: true } },
          tasks: { select: { status: true } },
          assignments: { where: { releasedAt: null }, take: 1, orderBy: { assignedAt: 'asc' }, select: { employee: { select: { name: true } } } },
        },
        take: 200,
      }),
      this.prisma.clientProject.findMany({
        where: { companyId }, take: 200,
        select: { id: true, projectType: true, status: true, createdAt: true, lead: { select: { name: true } } },
      }),
    ]);
    const rows: ScreenProject[] = [
      ...projects.map((p) => {
        const live = p.tasks.filter((t) => t.status !== 'CANCELLED');
        return {
          id: p.id, source: 'PROJECT' as const, name: p.name, client: p.client?.name ?? null, status: p.status, stage: stageOf(p.status),
          progress: live.length ? Math.round((100 * live.filter((t) => t.status === 'COMPLETED').length) / live.length) : null,
          owner: p.assignments[0]?.employee.name ?? null, start: p.startDate, deadline: p.targetEndDate, daysLeft: daysLeft(p.targetEndDate, now),
        };
      }),
      // Client-website pipeline: no tasks, owner or deadline stored, so those stay empty (shown as "—").
      ...clientProjects.map((p) => ({
        id: p.id, source: 'CLIENT_PROJECT' as const, name: `${p.lead.name} · ${p.projectType.toLowerCase().replace(/_/g, ' ')}`, client: p.lead.name,
        status: p.status, stage: stageOf(p.status), progress: null, owner: null, start: p.createdAt, deadline: null, daysLeft: null,
      })),
    ].sort(byDeadline);
    return {
      inProgress: rows.filter((r) => r.stage === 'IN_PROGRESS'),
      notStarted: rows.filter((r) => r.stage === 'NOT_STARTED'),
      all: rows,
    };
  }

  /** Sales: this month's revenue (by day, deals), target vs achieved, and last month's target vs revenue. All integer paise. */
  async sales(companyId: string, now = new Date()) {
    const month = monthKey(now), prev = lastMonths(now, 2)[0];
    const [records, targets] = await Promise.all([
      this.prisma.revenueRecord.findMany({
        where: { companyId, status: 'RECEIVED', receivedAt: { gte: monthStart(prev), lt: monthStart(nextMonth(month)) } },
        select: { amount: true, receivedAt: true },
      }),
      this.prisma.salesTarget.findMany({ where: { companyId, month: { in: [month, prev] } } }),
    ]);
    const inMonth = (mk: string) => records.filter((r) => r.receivedAt && monthKey(r.receivedAt) === mk);
    const cur = inMonth(month), last = inMonth(prev);
    const [y, m] = month.split('-').map(Number);
    const days = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const total = cur.reduce((s, r) => s + r.amount, 0), lastTotal = last.reduce((s, r) => s + r.amount, 0);
    const target = targets.find((t) => t.month === month)?.amountPaise ?? null;
    const lastTarget = targets.find((t) => t.month === prev)?.amountPaise ?? null;
    return {
      month, lastMonth: prev,
      current: { totalPaise: total, deals: cur.length, byDayPaise: sumByKey(cur, (r) => dayKey(r.receivedAt!), (r) => r.amount, days), today: dayKey(now) },
      target: target === null ? null : {
        amountPaise: target, achievedPaise: total, percent: target ? Math.floor((100 * total) / target) : null,
        remainingPaise: Math.max(0, target - total), daysLeft: daysLeftInMonth(now),
      },
      last: { revenuePaise: lastTotal, targetPaise: lastTarget, hit: lastTarget === null ? null : lastTotal >= lastTarget },
    };
  }

  async setSalesTarget(companyId: string, actorId: string, month: string, amountPaise: number) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month ?? ''))) throw new BadRequestException('month must be YYYY-MM');
    if (!isValidFinancialAmount(amountPaise) || amountPaise <= 0) throw new BadRequestException('amountPaise must be a positive integer (paise)');
    return this.prisma.salesTarget.upsert({
      where: { companyId_month: { companyId, month } },
      create: { companyId, month, amountPaise, setById: actorId },
      update: { amountPaise, setById: actorId },
    });
  }

  /** Reception: who came in today — new inquiries, client emails/WhatsApps received, and new leads. */
  async reception(companyId: string, now = new Date()) {
    const start = new Date(Date.parse(dayKey(now)) - 330 * 60_000);
    const [inquiries, messages, leads] = await Promise.all([
      this.prisma.clientInquiry.findMany({ where: { companyId, receivedAt: { gte: start } }, orderBy: { receivedAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, receivedAt: true } }),
      this.prisma.inboundMessage.findMany({ where: { companyId, createdAt: { gte: start } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, fromAddress: true, subject: true, status: true, createdAt: true } }),
      this.prisma.salesLead.findMany({ where: { companyId, createdAt: { gte: start } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, name: true, status: true, createdAt: true } }),
    ]);
    return { day: dayKey(now), inquiries, messages, leads, total: inquiries.length + messages.length + leads.length };
  }
}

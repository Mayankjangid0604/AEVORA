import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chairmanMailer } from '../notifications/chairman-mailer';
import { findCeo } from '../ceo/ceo-review.service';
import { isLastDayOfMonthIST, istHourOf, istMonth, reviewChange } from './monthly.logic';

const REVIEW_EVENT = 'MONTHLY_REVIEW';
const DIGEST_EVENT = 'MONTHLY_DIGEST';

/**
 * Month-end (last day, from 18:00 IST): 1) performance review → salary changes (limited; executives need the
 * Chairman's approval), 2) one digest email to the Chairman with that month's hires and the review. Both idempotent.
 */
@Injectable()
export class MonthlyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonthlyService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { this.tick().catch((e) => this.logger.warn(`Month-end: ${e.message}`)); }, 3_600_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (!isLastDayOfMonthIST(now) || istHourOf(now) < 18) return;
    for (const c of await this.prisma.company.findMany({ select: { id: true } })) {
      await this.review(c.id, istMonth(now)).catch((e) => this.logger.warn(`Review ${c.id}: ${e.message}`));
      await this.digest(c.id, istMonth(now), now).catch((e) => this.logger.warn(`Digest ${c.id}: ${e.message}`));
    }
  }

  /** One review per employee per month (EmploymentHistory MONTHLY_REVIEW with newValue "YYYY-MM:…"). */
  async review(companyId: string, month: string) {
    const people = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true, name: true, salary: true, performance: true, role: { select: { title: true, level: true, accessLevel: true } } },
    });
    const done = new Set((await this.prisma.employmentHistory.findMany({
      where: { employeeId: { in: people.map((p) => p.id) }, eventType: REVIEW_EVENT, newValue: { startsWith: `${month}:` } }, select: { employeeId: true },
    })).map((h) => h.employeeId));
    const ceo = await findCeo(this.prisma, companyId);
    const out: { employeeId: string; name: string; oldSalary: number; newSalary: number; percent: number; status: 'APPLIED' | 'PENDING_APPROVAL' | 'NO_CHANGE' }[] = [];
    for (const p of people) {
      if (done.has(p.id)) continue;
      const ch = reviewChange(p.salary, p.performance, p.role);
      const status = ch.newSalary === p.salary ? 'NO_CHANGE' : ch.needsApproval ? 'PENDING_APPROVAL' : 'APPLIED';
      await this.prisma.$transaction(async (tx) => {
        if (status === 'APPLIED') await tx.employee.update({ where: { id: p.id }, data: { salary: ch.newSalary } });
        if (status === 'PENDING_APPROVAL') {
          await tx.approvalRequest.create({ data: {
            companyId, requesterId: ceo?.id ?? p.id, action: 'SALARY_CHANGE', targetType: 'EMPLOYEE', targetId: p.id,
            proposedParams: { month, from: p.salary, to: ch.newSalary, percent: ch.percent, currency: 'AC' }, reasoning: `Monthly review: ${ch.reason}`,
          } });
        }
        await tx.employmentHistory.create({ data: {
          employeeId: p.id, eventType: REVIEW_EVENT, previousValue: String(p.salary), newValue: `${month}:${status}:${ch.newSalary}`, actor: 'MONTHLY_REVIEW', reason: ch.reason,
        } });
      });
      out.push({ employeeId: p.id, name: p.name, oldSalary: p.salary, newSalary: ch.newSalary, percent: ch.percent, status });
    }
    return out;
  }

  /** The Chairman's month-end digest: hires (name, role, department, salary, date) and the review. Sent once a month. */
  async digest(companyId: string, month: string, now = new Date()) {
    const sent = await this.prisma.companyEvent.findFirst({ where: { companyId, type: DIGEST_EVENT, payload: { path: ['month'], equals: month } } });
    if (sent) return { skipped: 'already sent' };
    const start = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1) - 330 * 60_000);
    const [hires, reviews] = await Promise.all([
      this.prisma.employee.findMany({ where: { companyId, hireDate: { gte: start, lte: now } }, orderBy: { hireDate: 'asc' },
        select: { name: true, salary: true, hireDate: true, role: { select: { title: true } }, department: { select: { name: true } } } }),
      this.prisma.employmentHistory.findMany({ where: { eventType: REVIEW_EVENT, newValue: { startsWith: `${month}:` }, employee: { companyId } },
        select: { previousValue: true, newValue: true, reason: true, employee: { select: { name: true } } } }),
    ]);
    const ac = (n: number) => `${n.toLocaleString('en-IN')} AC`;
    const reviewLines = reviews.map((r) => { const [, status, to] = String(r.newValue).split(':'); return `- ${r.employee.name}: ${ac(+r.previousValue!)} → ${ac(+to)} (${String(status).toLowerCase().replace('_', ' ')}; ${r.reason})`; });
    const text = [
      `Month-end digest — ${month}`,
      `New hires (${hires.length}):`,
      ...(hires.length ? hires.map((h) => `- ${h.name} · ${h.role?.title ?? '—'} · ${h.department?.name ?? '—'} · ${ac(h.salary)}/month · joined ${h.hireDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`) : ['- none']),
      '',
      `Performance review (${reviews.length}):`,
      ...(reviewLines.length ? reviewLines : ['- none']),
      '',
      'Salary changes marked "pending approval" wait for you in Decisions / Approvals.',
    ].join('\n');
    const emailed = await chairmanMailer.send({ subject: `Month-end digest: ${hires.length} hire${hires.length === 1 ? '' : 's'}, ${reviews.length} reviews (${month})`, text });
    await this.prisma.companyEvent.create({ data: { companyId, type: DIGEST_EVENT, payload: { month, hires: hires.length, reviews: reviews.length, emailed } } });
    return { month, hires: hires.length, reviews: reviews.length, emailed, text };
  }
}

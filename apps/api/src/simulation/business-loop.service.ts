import { ProjectStaffingService } from '../ceo/project-staffing.service';
import { DemoFactoryService } from '../sales-outreach/demo-factory.service';
import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurvivalService } from '../survival/survival.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { SalesAgentWorker } from '../sales-outreach/sales-agent.worker';
import { DeliveryAgentWorker } from '../delivery/delivery-agent.worker';
import { InvoiceAndPaymentService } from '../delivery/invoice-payment.service';
import { CeoReviewService } from '../ceo/ceo-review.service';
import { MarketingContentService } from '../marketing-content/marketing-content.service';
import { InboundMessageService } from '../sales-outreach/inbound-message.service';
import { OperatingLoopService } from '../operating-loop/operating-loop.service';
import { OpportunitySignalService } from '../operating-loop/opportunity-signal.service';

const INBOX_INTERVAL_MS = Number(process.env.INBOX_CHECK_MINUTES ?? 5) * 60_000;

const HOUR = 3_600_000;
export const WORK_BLOCKING_FEATURES = ['GLOBAL_PRODUCTION', 'AGENT_WORK_CYCLES'];

/**
 * FIND → CONTACT → DISCOVER → BUILD → DELIVER → COLLECT → REPEAT, per company:
 *   1 survival (SHUTDOWN stops the company here)  2 lead gen (every LEAD_GEN_INTERVAL_HOURS)
 *   3 sales outreach  4 delivery  5 payment follow-ups  6 CEO review (once per simulation hour)
 * Voice commands execute synchronously on request; venture agents get work cycles
 * from the simulation tick once survival allows it.
 *
 * Driven from the simulation tick but throttled on REAL time and never awaited by the tick:
 * these steps call LLMs, SMTP and Places, which must not stall the 1s tick or scale with sim speed.
 */
@Injectable()
export class BusinessLoopService {
  private readonly logger = new Logger(BusinessLoopService.name);
  private running = false;
  private lastRunAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly survival: SurvivalService,
    private readonly leadGen: LeadGenService,
    private readonly sales: SalesAgentWorker,
    private readonly delivery: DeliveryAgentWorker,
    private readonly payments: InvoiceAndPaymentService,
    private readonly ceo: CeoReviewService,
    private readonly marketingContent: MarketingContentService,
    private readonly inbox: InboundMessageService,
    private readonly staffing: ProjectStaffingService,
    private readonly demos: DemoFactoryService,
    private readonly ooda: OperatingLoopService,
    private readonly opportunitySignals: OpportunitySignalService,
  ) {}

  private readonly lastInboxCheck = new Map<string, number>();
  private passCount = 0;

  /** Called every tick. Starts a background pass when due; returns immediately. */
  runIfDue(now = Date.now()) {
    const interval = Number(process.env.BUSINESS_LOOP_INTERVAL_MS ?? 60_000);
    if (this.running || now - this.lastRunAt < interval) return false;
    this.lastRunAt = now;
    this.running = true;
    this.runOnce()
      .catch((e) => this.logger.error(`Business loop pass failed: ${e.message}`))
      .finally(() => (this.running = false));
    return true;
  }

  async runOnce() {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    for (const c of companies) await this.runCompany(c.id);
  }

  async runCompany(companyId: string) {
    const s = await this.survival.checkSurvival(companyId).catch((e) => {
      this.logger.error(`[${companyId}] survival check failed: ${e.message}`);
      return null;
    });
    if (!s?.alive) return { companyId, alive: false };

    const result: Record<string, unknown> = { companyId, alive: true, status: s.status };
    result.leadGen = await this.step(companyId, 'lead-gen', () => this.leadGenIfDue(companyId));
    // Sales and delivery call the local model and Vercel (minutes per lead). They run in the background so
    // staffing, the CEO review and the inbox check are not held up; a new pass starts only when the last one ended.
    result.sales = await this.background(companyId, 'sales', () => this.sales.processQueue(companyId));
    result.delivery = await this.background(companyId, 'delivery', () => this.delivery.processQueue(companyId));
    result.paymentReminders = await this.step(companyId, 'payments', () => this.payments.check(companyId));
    // Demo sites nobody replied to within DEMO_TTL_DAYS (7) are deleted from Vercel.
    result.demoCleanup = await this.step(companyId, 'demo-cleanup', () => this.demos.cleanupUnanswered(companyId));
    // CEO staffs client projects: reuse idle people, hire the gap within seats, share work, alert the Chairman.
    result.staffing = await this.step(companyId, 'staffing', () => this.staffing.run(companyId));
    // The CEO review is one or two model calls (minutes on a CPU) — background, so the inbox check and the
    // next loop pass are never held up by it.
    result.ceoReview = await this.background(companyId, 'ceo-review', async () => {
      const r = await this.ceo.runIfDue(companyId);
      return typeof r === 'string' ? r : { reviewId: r.id };
    });
    // PIXEL's weekly calendar on Mondays (real day). Starts in the background; one per ISO week.
    if (new Date().getDay() === 1) {
      result.pixel = await this.step(companyId, 'pixel-content', async () => {
        if (await this.marketingContent.getCurrentCalendar(companyId)) return 'calendar exists';
        return this.marketingContent.runPixelWeeklyWork(companyId);
      });
    }
    // Gmail replies every 10 min (real time). No-op until INBOX_ENABLED=true.
    if (Date.now() - (this.lastInboxCheck.get(companyId) ?? 0) >= INBOX_INTERVAL_MS) {
      this.lastInboxCheck.set(companyId, Date.now());
      result.inbox = await this.background(companyId, 'inbox-check', async () => {
        const r = await this.inbox.checkInbox(companyId);
        return r.skipped ?? `checked ${r.checked} emails, ${r.newMessages} new lead replies`;
      });
    }
    this.passCount++;
    if (this.passCount % 6 === 0) {
      result.opportunityScan = await this.background(companyId, 'opp-scan', () => this.opportunitySignals.scan(companyId));
      // ponytail: shared 'ooda-loop' key prevents concurrent scheduled + event cycles
      result.ooda = await this.background(companyId, 'ooda-loop', () => this.ooda.runFullCycle(companyId, 'scheduled_business_loop'));
    }
    // Event-driven OODA every 3rd non-scheduled pass (avoids querying on every tick)
    if (this.passCount % 6 !== 0 && this.passCount % 3 === 0) {
      result.oodaEvent = await this.background(companyId, 'ooda-loop', () => this.triggerOodaOnEvents(companyId));
    }
    return result;
  }

  private async leadGenIfDue(companyId: string) {
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId }, select: { intervalHours: true } });
    const rawHours = config?.intervalHours ?? Number(process.env.LEAD_GEN_INTERVAL_HOURS ?? 6);
    // Clamp to [0.1, 168] so invalid values cannot cause runaway or permanently-blocked runs.
    const hours = Number.isFinite(rawHours) && rawHours >= 0.1 ? Math.min(rawHours, 168) : 6;
    const last = await this.prisma.leadGenRun.findFirst({ where: { companyId }, orderBy: { triggeredAt: 'desc' } });
    if (last && Date.now() - last.triggeredAt.getTime() < hours * HOUR) return 'not_due';
    try {
      const run = await this.leadGen.runForCompany(companyId, 'SCHEDULE');
      return { runId: run.id, totalNew: run.totalNew };
    } catch (e) {
      if (e instanceof ConflictException || e instanceof ForbiddenException) return e.message;
      throw e;
    }
  }

  private readonly bg = new Map<string, { since: number; done: Promise<unknown> }>();

  /** Start a slow step without blocking the loop; return its result if it finishes within a few seconds. */
  private async background<T>(companyId: string, name: string, fn: () => Promise<T>) {
    const key = `${companyId}:${name}`;
    const running = this.bg.get(key);
    if (running) return `still running (${Math.round((Date.now() - running.since) / 1000)}s)`;
    const done = this.step(companyId, name, fn).finally(() => this.bg.delete(key));
    this.bg.set(key, { since: Date.now(), done });
    const waitMs = Number(process.env.BACKGROUND_STEP_WAIT_MS ?? 5000);
    return Promise.race([done, new Promise((r) => { const t = setTimeout(() => r('running in background'), waitMs); t.unref?.(); })]);
  }

  private async triggerOodaOnEvents(companyId: string): Promise<string> {
    const [health, criticalKpis, unresolvedAlerts] = await Promise.all([
      this.prisma.companyHealthSnapshot.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.companyKPI.count({ where: { companyId, status: 'CRITICAL' } }),
      this.prisma.operationalAlert.count({ where: { companyId, status: 'ACTIVE', severity: 'CRITICAL' } }),
    ]);

    // Only trigger if there's a genuine crisis signal
    const isCritical = (health && (health.financialScore < 30 || health.salesScore < 30)) || criticalKpis >= 3 || unresolvedAlerts >= 3;
    if (!isCritical) return 'no_event';

    // Don't trigger if a cycle is already running
    const active = await this.prisma.operatingLoopCycle.findFirst({
      where: { companyId, phase: { notIn: ['COMPLETE', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return 'cycle_already_active';

    const trigger = criticalKpis >= 3 ? 'critical_kpi_threshold' : unresolvedAlerts >= 3 ? 'critical_alert_surge' : 'health_score_critical';
    await this.ooda.runFullCycle(companyId, trigger);
    return `triggered:${trigger}`;
  }

  /** One failing step must not stop the rest of the loop. */
  private async step<T>(companyId: string, name: string, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (e) {
      this.logger.error(`[${companyId}] ${name} failed: ${e.message}`);
      return { error: e.message };
    }
  }
}

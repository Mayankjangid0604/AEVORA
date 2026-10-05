import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ModelGateway } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { EmailOutreachService, emailSignature, isKilled, outreachEnv } from '../sales-outreach/email-outreach.service';
import { validScript, CeoDecision, ActionKind } from './ceo-decisions.service';

const DAY = 86_400_000;
const MAX_PER_KIND = 5; // bound the emails one review can send

export const DEFAULT_FOLLOW_UP = {
  subjectTemplate: 'Following up — a free sample for {{businessName}}',
  bodyTemplate: `Namaste {{businessName}} team,

Just following up on my earlier note. We recently helped other local {{category}} businesses get more enquiries with a simple website and WhatsApp auto-replies.

If it's useful, we'll build a free sample for {{businessName}} — no commitment. Just reply "yes".

{{signature}}`,
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export function action(detail: string, reason: string, outcome: CeoDecision['outcome'] = 'EXECUTED', kind: ActionKind = 'PIPELINE'): CeoDecision {
  return { type: 'PIPELINE_ACTION', reason, parameters: {}, outcome, detail, kind };
}

/** The CEO watching the pipeline and acting without being asked. Every action is returned for the CeoReview log. */
@Injectable()
export class PipelineManagementService {
  private readonly logger = new Logger(PipelineManagementService.name);
  private readonly gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadGen: LeadGenService,
    private readonly email: EmailOutreachService,
    private readonly integration: IntegrationService,
  ) {}

  async manage(companyId: string, ceoId: string): Promise<CeoDecision[]> {
    const actions: CeoDecision[] = [];
    const run = async (name: string, fn: () => Promise<CeoDecision[]>) => {
      try {
        actions.push(...(await fn()));
      } catch (e) {
        this.logger.error(`[${companyId}] pipeline ${name} failed: ${e.message}`);
        actions.push(action(`${name} failed: ${String(e.message).slice(0, 200)}`, name, 'FAILED'));
      }
    };
    await run('refill leads', () => this.refillLeads(companyId));
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'OUTBOUND_EMAIL', 'CEO_AUTONOMY'])) {
      actions.push(action('Emails paused by kill switch; no follow-ups sent', 'kill switch', 'BLOCKED'));
      return actions;
    }
    await run('lead follow-ups', () => this.followUpSilentLeads(companyId, ceoId));
    await run('stale samples', () => this.nudgeStaleSamples(companyId));
    await run('referrals', () => this.askForReferrals(companyId));
    return actions;
  }

  /** Fewer than 10 NEW leads → search now (at most once an hour; the loop's 6-hourly search still runs). */
  private async refillLeads(companyId: string) {
    const fresh = await this.prisma.salesLead.count({ where: { companyId, status: 'NEW', googlePlaceId: { not: null } } });
    if (fresh >= 10) return [];
    const recent = await this.prisma.leadGenRun.findFirst({ where: { companyId, triggeredAt: { gte: new Date(Date.now() - 3_600_000) } } });
    if (recent) return [];
    try {
      const r = await this.leadGen.runForCompany(companyId, 'CEO');
      return [action(`Lead queue had ${fresh} new leads — ran a search, found ${r.totalNew} more`, 'lead queue below 10', 'EXECUTED', 'LEAD_GEN')];
    } catch (e) {
      if (e instanceof ConflictException || e instanceof ForbiddenException) return [action(`Wanted more leads: ${e.message}`, 'lead queue below 10', 'SKIPPED', 'LEAD_GEN')];
      throw e;
    }
  }

  /** First-touch emails >5 days old, no positive reply, lead still CONTACTED → one revised follow-up email. */
  private async followUpSilentLeads(companyId: string, ceoId: string) {
    const candidates = await this.prisma.outreachCampaign.findMany({
      where: {
        companyId,
        channel: 'EMAIL',
        status: { in: ['SENT', 'CLOSED'] },
        OR: [{ outcome: null }, { outcome: 'NO_RESPONSE' }],
        sentAt: { lt: new Date(Date.now() - 5 * DAY) },
        NOT: { idempotencyKey: { startsWith: 'followup:' } }, // never follow up on a follow-up
        lead: { status: 'CONTACTED', contactEmail: { not: null } },
      },
      include: { lead: true },
      orderBy: { sentAt: 'asc' },
      take: 30,
    });
    const done = new Set(
      (await this.prisma.outreachCampaign.findMany({
        where: { companyId, idempotencyKey: { in: candidates.map((c) => `followup:${c.id}`) } },
        select: { idempotencyKey: true },
      })).map((c) => c.idempotencyKey),
    );
    const todo = candidates.filter((c) => !done.has(`followup:${c.id}`)).slice(0, MAX_PER_KIND);
    if (!todo.length) return [];

    const template = await this.followUpTemplate(companyId);
    const out: CeoDecision[] = [];
    for (const c of todo) {
      const sent = await this.email.sendFollowUp(companyId, c.lead, c.id, template, ceoId);
      if (sent) out.push(action(`Follow-up email to ${c.lead.name} (${sent.status === 'SENT' ? 'sent' : 'failed'})`, `no reply for ${Math.floor((Date.now() - c.sentAt!.getTime()) / DAY)} days`, sent.status === 'SENT' ? 'EXECUTED' : 'FAILED', 'FOLLOW_UP'));
    }
    return out;
  }

  /** One LLM-revised follow-up template per review, shared by all leads; falls back to a fixed template. */
  private async followUpTemplate(companyId: string) {
    const since = new Date(Date.now() - 14 * DAY);
    const [sent, positive] = await Promise.all([
      this.prisma.outreachCampaign.count({ where: { companyId, channel: 'EMAIL', sentAt: { gte: since } } }),
      this.prisma.outreachCampaign.count({ where: { companyId, channel: 'EMAIL', sentAt: { gte: since }, outcome: { in: ['INTERESTED', 'BOOKED'] } } }),
    ]);
    try {
      const res = await this.gateway.generate({
        systemMessage: `Write a short, polite second-touch follow-up email for a small Indian web/automation agency to a local business that did not reply.
Return JSON only: {"subjectTemplate": string, "bodyTemplate": string}.
Allowed placeholders: {{businessName}}, {{category}}, {{chairmanName}}, {{companyName}}. Body must include {{businessName}}. Different angle from a generic pitch; one clear call to action.`,
        prompt: JSON.stringify({ emailsSent14d: sent, positiveReplies14d: positive, previous: DEFAULT_FOLLOW_UP }),
        requireStructuredOutput: true,
        temperature: 0.5,
      });
      return validScript(res.structuredOutput) ?? DEFAULT_FOLLOW_UP;
    } catch {
      return DEFAULT_FOLLOW_UP;
    }
  }

  /** SAMPLE_SENT for 7+ days → one follow-up offering a revision or 10% off. The discount is only noted; the invoice is unchanged. */
  private async nudgeStaleSamples(companyId: string) {
    const stale = await this.prisma.clientProject.findMany({
      where: { companyId, status: 'SAMPLE_SENT', ceoFollowUpAt: null, updatedAt: { lt: new Date(Date.now() - 7 * DAY) }, lead: { contactEmail: { not: null } } },
      include: { lead: true },
      take: MAX_PER_KIND,
    });
    const out: CeoDecision[] = [];
    for (const p of stale) {
      // claim first so a concurrent review can't email twice
      const claimed = await this.prisma.clientProject.updateMany({ where: { id: p.id, ceoFollowUpAt: null }, data: { ceoFollowUpAt: new Date() } });
      if (!claimed.count) continue;
      const discount = Math.round((p.quotedAmount ?? 0) * 0.1);
      await this.integration.sendEmail(companyId, outreachEnv(), {
        to: p.lead.contactEmail!,
        subject: `Your sample for ${p.lead.name} — happy to adjust it`,
        body: `Hello ${p.lead.name} team,

Did you get a chance to look at the sample we made for you?${p.sampleUrl ? `\n${p.sampleUrl}` : ''}

If anything isn't quite right, tell us what to change and we'll revise it for free. And if you'd like to go ahead this week, we can take 10% off (${rupees(discount)}).

${emailSignature()}`,
      });
      const note = `${new Date().toISOString().slice(0, 10)}: CEO offered a free revision or 10% off (${rupees(discount)}) — discount NOT applied to the invoice; needs Chairman approval.`;
      await this.prisma.clientProject.update({ where: { id: p.id }, data: { ceoNotes: p.ceoNotes ? `${p.ceoNotes}\n${note}` : note } });
      out.push(action(`Followed up with ${p.lead.name} on their sample; offered a revision or 10% off (${rupees(discount)}, pending your approval)`, 'sample unanswered for 7+ days', 'EXECUTED', 'FOLLOW_UP'));
    }
    return out;
  }

  /** PAID → ask once for one introduction. */
  private async askForReferrals(companyId: string) {
    const paid = await this.prisma.clientProject.findMany({
      where: { companyId, status: { in: ['PAID', 'CLOSED'] }, referralRequestedAt: null, lead: { contactEmail: { not: null } } },
      include: { lead: true },
      take: MAX_PER_KIND,
    });
    const out: CeoDecision[] = [];
    for (const p of paid) {
      const claimed = await this.prisma.clientProject.updateMany({ where: { id: p.id, referralRequestedAt: null }, data: { referralRequestedAt: new Date() } });
      if (!claimed.count) continue;
      await this.integration.sendEmail(companyId, outreachEnv(), {
        to: p.lead.contactEmail!,
        subject: `Thank you, ${p.lead.name} — one small request`,
        body: `Hello ${p.lead.name} team,

Thank you for working with us — it was a pleasure building this for you.

Do you know one other business owner who could use a website or some automation? A single introduction (just reply with their name and number) would mean a lot to a small team like ours.

${emailSignature()}`,
      });
      out.push(action(`Asked ${p.lead.name} for a referral after payment`, 'client paid', 'EXECUTED', 'FOLLOW_UP'));
    }
    return out;
  }
}

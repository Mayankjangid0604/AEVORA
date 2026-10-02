import { realProfile } from './demo-site/next-template';
import { Injectable, Logger } from '@nestjs/common';
import { ExecutionEnvironment, OutreachChannel, Prisma, SalesLead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { DemoFactoryService } from './demo-factory.service';
import { companyLine, companyProfile, requireCompanyContact } from '../config/company';

export const DEFAULT_EMAIL_SCRIPT = {
  templateName: 'default-email-intro',
  subjectTemplate: 'Quick idea for {{businessName}}',
  bodyTemplate: `Namaste {{businessName}} team,

This is {{companyLine}}. We help local {{category}} businesses get more customers online — a simple website, Google profile setup, and WhatsApp auto-replies.

Would you be open to a free sample of what this could look like for {{businessName}}? Just reply "yes" and we'll send it over within a couple of days.

{{signature}}`,
};

/** The only sign-off used on client-facing messages — never a personal name. */
export function emailSignature(): string {
  const c = requireCompanyContact();
  const phone = c.phone.replace(/^\+91(?=\d{10}$)/, '+91 ');
  return `Team ${c.name} | ${c.email} | ${phone}`;
}

/**
 * Clean a model-written email body: fill name placeholders with the sender, drop leftover [placeholder] lines,
 * drop sentences with invented percentages, and cut any sign-off (we append the real one).
 */
export function cleanEmailBody(text: string, senderName: string): string {
  let t = text.replace(/\r/g, '').trim();
  t = t.replace(/^\s*subject:.*\n+/i, '');
  t = t.replace(/\[(?:your|sender'?s?|my)\s*(?:full\s*)?name\]/gi, senderName);
  t = t.split('\n').filter((l) => !/\[[^\]]{2,40}\]/.test(l)).join('\n');
  t = t.replace(/[^.!?\n]*\b\d+(?:\.\d+)?\s?%[^.!?\n]*[.!?]?/g, '').replace(/[ \t]+\n/g, '\n');
  const signOff = t.search(/\n\s*(best regards|kind regards|warm regards|regards|sincerely|thanks(?: and regards)?|thank you|cheers|yours (?:truly|sincerely))\s*,?\s*(\n|$)/i);
  if (signOff > 0) t = t.slice(0, signOff);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/** "<abc@gmail.com>" / "abc@gmail.com" → "<abc@gmail.com>" (null for non-SMTP providers). */
export function normalizeMessageId(id?: string | null): string | null {
  if (!id || !/@/.test(id)) return null;
  const bare = id.trim().replace(/^<|>$/g, '');
  return `<${bare}>`;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function templateVars(lead: Pick<SalesLead, 'name' | 'industry'>): Record<string, string> {
  return {
    businessName: lead.name,
    category: lead.industry ?? 'local',
    // Legacy placeholder in stored/LLM-written scripts: resolves to the team, never the Chairman's personal name.
    chairmanName: `Team ${companyProfile().name}`,
    companyName: companyProfile().name,
    companyLine: companyLine(),
    signature: emailSignature(),
  };
}

export function outreachEnv(): ExecutionEnvironment {
  return ExecutionEnvironment[process.env.OUTREACH_ENVIRONMENT as ExecutionEnvironment] ?? ExecutionEnvironment.SANDBOX;
}

export async function isKilled(prisma: PrismaService, companyId: string, features: string[]) {
  const hit = await prisma.killSwitchConfig.findFirst({
    where: { OR: [{ companyId }, { companyId: null }], feature: { in: features }, isDisabled: true },
  });
  return !!hit;
}

@Injectable()
export class EmailOutreachService {
  private readonly logger = new Logger(EmailOutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly demoFactory: DemoFactoryService
  ) {}

  async getScript(companyId: string, channel: OutreachChannel) {
    return (
      (await this.prisma.outreachScript.findFirst({
        where: { companyId, channel, isActive: true },
        orderBy: { updatedAt: 'desc' },
      })) ?? { id: null, ...DEFAULT_EMAIL_SCRIPT }
    );
  }

  /** The employee sending the email (name + role), e.g. NOVA, Sales Representative. */
  private async senderFor(agentId?: string) {
    const emp = agentId ? await this.prisma.employee.findUnique({ where: { id: agentId }, select: { name: true, role: { select: { title: true } } } }) : null;
    return { name: emp?.name ?? `Team ${companyProfile().name}`, role: emp?.role?.title ?? 'Sales' };
  }

  /** Idempotent per (lead, EMAIL): a second call returns the existing campaign without resending. */
  async sendOutreachEmail(companyId: string, lead: SalesLead, agentId?: string) {
    if (!lead.contactEmail) throw new Error(`Lead ${lead.id} has no email`);
    if (lead.companyId !== companyId) throw new Error('Lead does not belong to company');
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'OUTBOUND_EMAIL', 'SALES_OUTREACH'])) {
      throw new Error('Outbound email blocked by kill switch');
    }

    const idempotencyKey = `outreach:${lead.id}:EMAIL`;
    let campaign;
    try {
      campaign = await this.prisma.outreachCampaign.create({
        data: { companyId, leadId: lead.id, channel: 'EMAIL', assignedAgentId: agentId, idempotencyKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.outreachCampaign.findUniqueOrThrow({ where: { idempotencyKey } });
      }
      throw e;
    }

    const env = outreachEnv();
    
    // 1. Build and Deploy Demo
    const demoUrl = await this.demoFactory.createDemoForLead(lead);

    // 2. Write the email as the sales employee who sends it (never "[Your Name]" or invented results).
    const modelGateway = new (require('@aevora/model-gateway').ModelGateway)();
    const vars = templateVars(lead);
    const sender = await this.senderFor(agentId);

    const subject = `Exclusive Proposal for ${lead.name}`;
    let body = [
      `Dear ${lead.name} Team,`,
      `I'm ${sender.name}, ${sender.role} at ${vars.companyName}. We build websites, business automation, custom CRMs and SaaS tools for businesses like yours.`,
      demoUrl ? `We put together a free demo website for ${lead.name}: ${demoUrl}` : `If it helps, we can put together a free sample of what this could look like for ${lead.name}.`,
      `Would you be open to a quick call this week?`,
    ].join('\n\n');

    try {
      const p = realProfile(lead);
      const prompt = `Write a short, polite B2B sales email to "${lead.name}", a real ${p.kind ?? lead.industry ?? 'business'}${p.address ? ` at ${p.address}` : ''}.
Facts about them (use only these, invent nothing): ${p.website ? `they already have a website (${p.website}) — offer a modern redesign plus automation` : 'they do not have a website yet — that is the opportunity'}${p.hours ? `; open ${p.hours}` : ''}.
You are ${sender.name}, ${sender.role} at "${vars.companyName}", which offers website development, business automation, custom CRM and SaaS.
${demoUrl ? `Mention this demo link we built for them: ${demoUrl}` : 'Offer to prepare a free sample for them.'}
Rules:
- Start with "Dear ${lead.name} Team,". Introduce yourself by your real name: ${sender.name}.
- Never use placeholders in square brackets such as [Your Name] or [Your Contact Information].
- Do not invent statistics, percentages, past clients or results.
- 120-180 words. End with a question inviting a call. Do NOT add any sign-off, name or contact details at the end.`;
      const aiRes = await modelGateway.generate({ prompt: `System: You are a professional B2B sales executive.\n\n` + prompt });
      const cleaned = cleanEmailBody(aiRes.text ?? '', sender.name);
      if (cleaned.length > 80) body = cleaned;
    } catch (e) {
      this.logger.warn(`AI email generation failed, falling back to static template: ${e.message}`);
    }
    body = `${body}\n\nBest regards,\n${sender.name}\n${sender.role}, ${vars.companyName}\n${emailSignature()}`;

    try {
      const sent = await this.integration.sendEmail(
        companyId,
        env,
        {
          to: lead.contactEmail,
          subject,
          body,
          senderName: sender.name,
        },
        agentId,
      );
      return this.prisma.outreachCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT', sentAt: new Date(), scriptId: null, emailMessageId: normalizeMessageId(sent?.referenceId) },
      });
    } catch (e) {
      this.logger.error(`Outreach email to lead ${lead.id} failed: ${e.message}`);
      return this.prisma.outreachCampaign.update({
        where: { id: campaign.id },
        data: { status: 'FAILED', error: e.message, scriptId: null },
      });
    }
  }

  /** Second-touch email for an earlier campaign. Idempotent per source campaign (`followup:<campaignId>`). */
  async sendFollowUp(companyId: string, lead: SalesLead, sourceCampaignId: string, template: { subjectTemplate: string; bodyTemplate: string }, agentId?: string) {
    if (!lead.contactEmail) throw new Error(`Lead ${lead.id} has no email`);
    if (lead.companyId !== companyId) throw new Error('Lead does not belong to company');
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'OUTBOUND_EMAIL', 'SALES_OUTREACH'])) {
      throw new Error('Outbound email blocked by kill switch');
    }
    const idempotencyKey = `followup:${sourceCampaignId}`;
    let campaign;
    try {
      campaign = await this.prisma.outreachCampaign.create({
        data: { companyId, leadId: lead.id, channel: 'EMAIL', assignedAgentId: agentId, idempotencyKey, notes: `Follow-up to campaign ${sourceCampaignId}` },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // already followed up
      throw e;
    }
    const vars = templateVars(lead);
    try {
      const sender = await this.senderFor(agentId);
      const sent = await this.integration.sendEmail(companyId, outreachEnv(), {
        to: lead.contactEmail,
        subject: renderTemplate(template.subjectTemplate, vars),
        body: renderTemplate(template.bodyTemplate, vars),
        senderName: sender.name,
      }, agentId);
      return this.prisma.outreachCampaign.update({ where: { id: campaign.id }, data: { status: 'SENT', sentAt: new Date(), emailMessageId: normalizeMessageId(sent?.referenceId) } });
    } catch (e) {
      return this.prisma.outreachCampaign.update({ where: { id: campaign.id }, data: { status: 'FAILED', error: e.message } });
    }
  }
}

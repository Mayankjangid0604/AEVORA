import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SalesLead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { DemoFactoryService } from './demo-factory.service';
import { isKilled, renderTemplate, templateVars } from './email-outreach.service';

const DEFAULT_WA_TEMPLATE = `Namaste {{businessName}} team! 👋

This is {{companyLine}}.

We help {{category}} businesses get more customers online — professional websites, Google profile setup, and WhatsApp automation.

We've built a free demo specifically for {{businessName}}:
{{demoUrl}}

Would you like to see it? Reply "yes" and we'll share the details!

— {{signature}}`;

@Injectable()
export class WhatsAppOutreachService {
  private readonly logger = new Logger(WhatsAppOutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly demoFactory: DemoFactoryService,
  ) {}

  async sendOutreachMessage(companyId: string, lead: SalesLead, agentId?: string) {
    if (!lead.contactPhone) throw new Error(`Lead ${lead.id} has no phone`);
    if (lead.companyId !== companyId) throw new Error('Lead does not belong to company');
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'OUTBOUND_WHATSAPP', 'SALES_OUTREACH'])) {
      throw new Error('Outbound WhatsApp blocked by kill switch');
    }

    const idempotencyKey = `outreach:${lead.id}:WHATSAPP`;
    let campaign;
    try {
      campaign = await this.prisma.outreachCampaign.create({
        data: { companyId, leadId: lead.id, channel: 'WHATSAPP', assignedAgentId: agentId, idempotencyKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.outreachCampaign.findUniqueOrThrow({ where: { idempotencyKey } });
      }
      throw e;
    }

    const demoUrl = await this.demoFactory.createDemoForLead(lead);

    const script = await this.prisma.outreachScript.findFirst({
      where: { companyId, channel: 'WHATSAPP', isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const vars = { ...templateVars(lead), demoUrl: demoUrl ?? '(demo pending)' };
    const message = renderTemplate(script?.bodyTemplate ?? DEFAULT_WA_TEMPLATE, vars);

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });

    // Push to chairman's device — the mobile/web app sends the WhatsApp message
    // via deep link (wa.me) or WhatsApp Business API when configured.
    const waPayload = {
      campaignId: campaign.id,
      leadId: lead.id,
      businessName: lead.name,
      phone: lead.contactPhone,
      message,
      demoUrl,
    };

    const waApiConfigured = !!process.env.WHATSAPP_API_TOKEN;

    if (waApiConfigured) {
      try {
        await this.sendViaApi(lead.contactPhone, message);
        this.logger.log(`WhatsApp sent to ${lead.contactPhone} via API`);
      } catch (e) {
        this.logger.error(`WhatsApp API failed for lead ${lead.id}: ${e.message}`);
        // Fall back to chairman push
        this.realtime.broadcastToUser(company.chairmanId, 'whatsapp.send', waPayload);
        return this.prisma.outreachCampaign.update({
          where: { id: campaign.id },
          data: { status: 'SCHEDULED', notes: `API failed, pushed to chairman: ${e.message}` },
        });
      }
    } else {
      // No API — push to chairman's device to send manually via wa.me deep link
      this.realtime.broadcastToUser(company.chairmanId, 'whatsapp.send', waPayload);
      this.logger.log(`WhatsApp message pushed to chairman for lead ${lead.id}`);
    }

    return this.prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: {
        status: waApiConfigured ? 'SENT' : 'SCHEDULED',
        sentAt: waApiConfigured ? new Date() : null,
        notes: waApiConfigured ? null : 'Awaiting chairman manual send via WhatsApp',
      },
    });
  }

  /** WhatsApp Business Cloud API — requires WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID. */
  private async sendViaApi(toPhone: string, message: string) {
    const token = process.env.WHATSAPP_API_TOKEN!;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    // Normalize to international format
    const normalized = toPhone.replace(/[^0-9+]/g, '').replace(/^0+/, '').replace(/^\+?91/, '91');
    const to = normalized.startsWith('91') ? normalized : `91${normalized}`;

    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  }
}

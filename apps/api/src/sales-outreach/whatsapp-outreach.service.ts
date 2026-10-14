import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SalesLead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOutboundAllowed } from '../common/outbound-policy';
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

    // Pilot policy: WhatsApp is never sent automatically (the Business API sender was removed). The Chairman's device
    // receives the message and a human sends it via wa.me — that manual send is the approval.
    await assertOutboundAllowed(this.prisma, companyId, 'WHATSAPP'); // emergency stop / kill switch: not even a manual push
    this.realtime.broadcastToUser(company.chairmanId, 'whatsapp.send', waPayload);
    this.logger.log(`WhatsApp message pushed to chairman for manual approval/send (lead ${lead.id})`);

    return this.prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SCHEDULED', sentAt: null, notes: 'Awaiting chairman manual send via WhatsApp' },
    });
  }
}

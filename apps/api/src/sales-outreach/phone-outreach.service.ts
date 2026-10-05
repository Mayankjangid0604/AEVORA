import { Injectable } from '@nestjs/common';
import { Prisma, SalesLead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { renderTemplate, templateVars } from './email-outreach.service';

const DEFAULT_CALL_SCRIPT = `Hi, is this {{businessName}}? I'm calling from {{companyName}}. We build simple websites and WhatsApp automation for local {{category}} businesses. Could I send you a free sample for {{businessName}}?`;

/** Phone calls are placed by the Chairman from the mobile app; this schedules them and pushes a call.scheduled event. */
@Injectable()
export class PhoneOutreachService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async schedulePhoneCall(companyId: string, lead: SalesLead, agentId?: string) {
    if (!lead.contactPhone) throw new Error(`Lead ${lead.id} has no phone`);
    if (lead.companyId !== companyId) throw new Error('Lead does not belong to company');

    const idempotencyKey = `outreach:${lead.id}:PHONE`;
    let campaign;
    try {
      campaign = await this.prisma.outreachCampaign.create({
        data: { companyId, leadId: lead.id, channel: 'PHONE', status: 'SCHEDULED', assignedAgentId: agentId, idempotencyKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.outreachCampaign.findUniqueOrThrow({ where: { idempotencyKey } });
      }
      throw e;
    }

    const script = await this.prisma.outreachScript.findFirst({
      where: { companyId, channel: 'PHONE', isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    this.realtime.broadcastToUser(company.chairmanId, 'call.scheduled', {
      campaignId: campaign.id,
      leadId: lead.id,
      businessName: lead.name,
      phone: lead.contactPhone,
      script: renderTemplate(script?.bodyTemplate ?? DEFAULT_CALL_SCRIPT, templateVars(lead)),
    });
    return campaign;
  }
}

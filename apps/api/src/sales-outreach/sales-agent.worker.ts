import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OutreachOutcome, SalesLead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { EmailOutreachService, isKilled } from './email-outreach.service';
import { PhoneOutreachService } from './phone-outreach.service';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

const DAY = 86_400_000;

@Injectable()
export class SalesAgentWorker {
  private readonly logger = new Logger(SalesAgentWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadGen: LeadGenService,
    private readonly email: EmailOutreachService,
    private readonly phone: PhoneOutreachService,
    private readonly whatsapp: WhatsAppOutreachService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** The sales agent is the first ACTIVE employee whose role title mentions "sales". */
  private findSalesAgent(companyId: string) {
    return this.prisma.employee.findFirst({
      where: { companyId, status: 'ACTIVE', role: { title: { contains: 'sales', mode: 'insensitive' } } },
      orderBy: { hireDate: 'asc' },
    });
  }

  async processQueue(companyId: string, batch = Number(process.env.SALES_BATCH_SIZE ?? 5)) {
    if (await isKilled(this.prisma, companyId, ['GLOBAL_PRODUCTION', 'SALES_OUTREACH', 'OUTBOUND_EMAIL'])) return { skipped: 'kill_switch' };
    const agent = await this.findSalesAgent(companyId);
    if (!agent) return { skipped: 'no_sales_agent' };

    const followUps = await this.followUpStale(companyId, agent.id);
    let contacted = 0;
    for (let i = 0; i < batch; i++) {
      const lead = await this.leadGen.dequeue(companyId, agent.id);
      if (!lead) break;
      await this.contact(companyId, lead, agent.id);
      contacted++;
    }
    return { contacted, followUps };
  }

  /** Email first; WhatsApp if phone but no email; phone-only as fallback; no channel → disqualify. */
  private async contact(companyId: string, lead: SalesLead, agentId: string) {
    if (lead.contactEmail) return this.email.sendOutreachEmail(companyId, lead, agentId);
    if (lead.contactPhone) return this.whatsapp.sendOutreachMessage(companyId, lead, agentId);
    await this.prisma.salesLead.update({ where: { id: lead.id }, data: { status: 'DISQUALIFIED' } });
    await this.prisma.leadGenAudit.create({ data: { leadId: lead.id, event: 'DISQUALIFIED', detail: { reason: 'no_contact_channel' }, actorId: agentId } });
  }

  /** Emails failed, or unanswered after N days → close as NO_RESPONSE and try phone. */
  private async followUpStale(companyId: string, agentId: string) {
    const days = Number(process.env.OUTREACH_FOLLOWUP_DAYS ?? 3);
    const stale = await this.prisma.outreachCampaign.findMany({
      where: {
        companyId,
        channel: 'EMAIL',
        outcome: null,
        OR: [{ status: 'SENT', sentAt: { lt: new Date(Date.now() - days * DAY) } }, { status: 'FAILED' }],
      },
      include: { lead: true },
      take: 20,
    });
    let closed = 0;
    for (const c of stale) {
      // Claim atomically so two overlapping runs never schedule the same phone call twice.
      const claimed = await this.prisma.outreachCampaign.updateMany({ where: { id: c.id, outcome: null }, data: { status: 'CLOSED', outcome: 'NO_RESPONSE' } });
      if (!claimed.count) continue;
      closed++;
      if (c.lead.contactPhone) await this.phone.schedulePhoneCall(companyId, c.lead, agentId);
    }
    return closed;
  }

  /** Response logged by Chairman (mobile/web). INTERESTED/BOOKED → QUALIFIED lead + DiscoveryCall + notify. */
  async recordOutcome(companyId: string, campaignId: string, outcome: OutreachOutcome, notes?: string) {
    if (!(outcome in OutreachOutcome)) throw new BadRequestException(`Invalid outcome ${outcome}`);
    const campaign = await this.prisma.outreachCampaign.findFirst({ where: { id: campaignId, companyId }, include: { lead: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.outcome === outcome) return campaign; // idempotent replay

    const updated = await this.prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: {
        outcome,
        notes,
        status: outcome === 'NO_RESPONSE' ? 'CLOSED' : 'RESPONDED',
        responseReceivedAt: outcome === 'NO_RESPONSE' ? null : new Date(),
        sentAt: campaign.sentAt ?? new Date(),
      },
    });

    if (outcome === 'INTERESTED' || outcome === 'BOOKED') {
      await this.prisma.salesLead.update({ where: { id: campaign.leadId }, data: { status: 'QUALIFIED' } });
      const call = await this.prisma.discoveryCall.upsert({
        where: { campaignId: campaign.id },
        create: { companyId, leadId: campaign.leadId, campaignId: campaign.id },
        update: {},
      });
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
      this.realtime.broadcastToUser(company.chairmanId, 'lead.interested', {
        leadId: campaign.leadId,
        businessName: campaign.lead.name,
        phone: campaign.lead.contactPhone,
        discoveryCallId: call.id,
      });
    } else if (outcome === 'NOT_INTERESTED') {
      await this.prisma.salesLead.update({ where: { id: campaign.leadId }, data: { status: 'DISQUALIFIED' } });
    }
    await this.prisma.leadGenAudit.create({ data: { leadId: campaign.leadId, event: `OUTCOME_${outcome}`, detail: { campaignId, notes } } });
    return updated;
  }
}

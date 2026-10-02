import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { OutreachOutcome } from '@prisma/client';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAgentWorker } from './sales-agent.worker';
import { DiscoveryService } from './discovery.service';
import { InboundMessageService } from './inbound-message.service';
import { WhatsAppOutreachService } from './whatsapp-outreach.service';

@Controller('outreach')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesOutreachController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: SalesAgentWorker,
    private readonly discovery: DiscoveryService,
    private readonly inbound: InboundMessageService,
    private readonly whatsapp: WhatsAppOutreachService,
  ) {}

  @Get('campaigns')
  campaigns(@Request() req, @Query('status') status?: string) {
    return this.prisma.outreachCampaign.findMany({
      where: { companyId: req.user.companyId, ...(status ? { status: status as any } : {}) },
      include: { lead: { select: { id: true, name: true, contactPhone: true, contactEmail: true, qualityScore: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Post('campaigns/:id/outcome')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  outcome(@Request() req, @Param('id') id: string, @Body() body: { outcome: OutreachOutcome; notes?: string }) {
    return this.worker.recordOutcome(req.user.companyId, id, body.outcome, body.notes);
  }

  @Post('process')
  @Roles('CHAIRMAN')
  process(@Request() req) {
    return this.worker.processQueue(req.user.companyId);
  }

  @Get('discovery-calls')
  discoveryCalls(@Request() req) {
    return this.prisma.discoveryCall.findMany({
      where: { companyId: req.user.companyId },
      include: { lead: true },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }

  @Post('discovery-calls/:id/transcript')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  transcript(@Request() req, @Param('id') id: string, @Body() body: { transcript: string }) {
    return this.discovery.completeCall(req.user.companyId, id, body.transcript);
  }

  // --- WhatsApp ---

  @Post('whatsapp/:leadId')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async sendWhatsApp(@Request() req, @Param('leadId') leadId: string) {
    const lead = await this.prisma.salesLead.findFirstOrThrow({ where: { id: leadId, companyId: req.user.companyId } });
    return this.whatsapp.sendOutreachMessage(req.user.companyId, lead);
  }

  // --- Inbound Messages ---

  @Get('inbound')
  inboundMessages(@Request() req) {
    return this.inbound.listNew(req.user.companyId);
  }

  @Post('inbound')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  ingestMessage(@Request() req, @Body() body: { channel: 'EMAIL' | 'WHATSAPP'; from: string; body: string; subject?: string }) {
    return this.inbound.ingest(req.user.companyId, body.channel, body.from, body.body, body.subject);
  }

  @Post('inbound/poll-email')
  @Roles('CHAIRMAN')
  pollEmail(@Request() req) {
    return this.inbound.pollEmailInbox(req.user.companyId);
  }
}

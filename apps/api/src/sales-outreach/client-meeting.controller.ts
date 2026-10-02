import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { ClientMeetingService } from './client-meeting.service';
import { ExecutionEnvironment } from '@prisma/client';
import { IntegrationService } from '../integration/integration.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('client-meeting')
export class ClientMeetingController {
  constructor(
    private readonly meetingService: ClientMeetingService,
    private readonly integrationService: IntegrationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('request')
  async requestMeeting(
    @Body() body: { companyId: string; clientId: string; timezone?: string; threadId?: string }
  ) {
    return this.meetingService.requestMeeting(body.companyId, body.clientId, body.timezone, body.threadId);
  }

  @Post(':id/owner-propose')
  async ownerProposesTime(
    @Param('id') id: string,
    @Body() body: { companyId: string; employeeId: string; times: string[] }
  ) {
    const meeting = await this.meetingService.ownerProposesTime(id, body.companyId, body.employeeId, body.times);
    
    // Also send an email to the client with the proposed times
    const m = await this.prisma.clientMeeting.findUnique({ where: { id }, include: { client: true } });
    const contactEmail = (m?.client as any)?.contactEmail || 'client@example.com';
    if (m && m.client && contactEmail) {
      const timesList = body.times.map(t => `- ${t}`).join('\n');
      const text = `Hi ${m.client.name},\n\nWe would like to propose a meeting. Please let us know if any of the following times work for you:\n${timesList}\n\nLooking forward to speaking with you.`;
      
      await this.integrationService.sendEmail(
        body.companyId,
        ExecutionEnvironment.SANDBOX,
        {
          to: contactEmail,
          subject: 'Proposed Meeting Times',
          body: text,
        }
      );
    }
    
    return meeting;
  }

  @Post(':id/client-confirm')
  async clientConfirmsTime(
    @Param('id') id: string,
    @Body() body: { confirmedTime: string }
  ) {
    return this.meetingService.clientConfirmsTime(id, body.confirmedTime);
  }

  @Post(':id/client-propose-alternative')
  async clientProposesAlternative(
    @Param('id') id: string,
    @Body() body: { alternativeTimes: string[] }
  ) {
    return this.meetingService.clientProposesAlternative(id, body.alternativeTimes);
  }

  @Post(':id/owner-confirm')
  async ownerConfirmsAlternative(
    @Param('id') id: string,
    @Body() body: { companyId: string; confirmedTime: string }
  ) {
    return this.meetingService.ownerConfirmsAlternative(id, body.companyId, body.confirmedTime);
  }
}

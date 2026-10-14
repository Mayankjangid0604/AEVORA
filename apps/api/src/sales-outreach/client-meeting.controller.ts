import { Controller, Post, Body, Param, Request, UseGuards, NotFoundException } from '@nestjs/common';
import { ClientMeetingService } from './client-meeting.service';
import { IntegrationService } from '../integration/integration.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Tenant always comes from the token (body companyId is ignored): a caller cannot act on another company's meetings. */
@Controller('client-meeting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT')
export class ClientMeetingController {
  constructor(
    private readonly meetingService: ClientMeetingService,
    private readonly integrationService: IntegrationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('request')
  async requestMeeting(
    @Request() req,
    @Body() body: { clientId: string; timezone?: string; threadId?: string }
  ) {
    return this.meetingService.requestMeeting(req.user.companyId, body.clientId, body.timezone, body.threadId);
  }

  @Post(':id/owner-propose')
  async ownerProposesTime(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { employeeId: string; times: string[] }
  ) {
    const meeting = await this.meetingService.ownerProposesTime(id, req.user.companyId, body.employeeId, body.times);
    
    // Email the client the proposed times. The operator's request is the approval; no address on file = no email.
    const m = await this.prisma.clientMeeting.findFirst({ where: { id, companyId: req.user.companyId }, include: { client: true } });
    const contactEmail = (m?.client as any)?.contactEmail as string | undefined;
    if (m?.client && contactEmail) {
      const timesList = body.times.map(t => `- ${t}`).join('\n');
      const text = `Hi ${m.client.name},\n\nWe would like to propose a meeting. Please let us know if any of the following times work for you:\n${timesList}\n\nLooking forward to speaking with you.`;
      await this.integrationService.sendWithApprover(req.user.companyId, req.user.actorId, {
        to: contactEmail, subject: 'Proposed Meeting Times', body: text, source: 'client-meeting',
      });
    }

    return meeting;
  }

  @Post(':id/client-confirm')
  async clientConfirmsTime(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { confirmedTime: string }
  ) {
    await this.assertOwnMeeting(id, req.user.companyId);
    return this.meetingService.clientConfirmsTime(id, body.confirmedTime);
  }

  @Post(':id/client-propose-alternative')
  async clientProposesAlternative(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { alternativeTimes: string[] }
  ) {
    await this.assertOwnMeeting(id, req.user.companyId);
    return this.meetingService.clientProposesAlternative(id, body.alternativeTimes);
  }

  @Post(':id/owner-confirm')
  async ownerConfirmsAlternative(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { confirmedTime: string }
  ) {
    return this.meetingService.ownerConfirmsAlternative(id, req.user.companyId, body.confirmedTime);
  }

  private async assertOwnMeeting(id: string, companyId: string) {
    if (!(await this.prisma.clientMeeting.findFirst({ where: { id, companyId }, select: { id: true } }))) throw new NotFoundException('Meeting not found');
  }
}

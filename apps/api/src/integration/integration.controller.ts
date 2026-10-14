import { BadRequestException, Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IntegrationService, outreachEnv } from './integration.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@Controller('integration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  /**
   * Queues an email as a PENDING_APPROVAL draft for this tenant. It never sends directly and ignores any
   * caller-supplied environment; approval happens through POST /outreach/drafts/:id/approve.
   */
  @Post('email')
  async sendEmail(@Body() body: any, @Request() req) {
    if (typeof body?.to !== 'string' || typeof body?.subject !== 'string' || typeof body?.emailBody !== 'string') {
      throw new BadRequestException('to, subject and emailBody are required');
    }
    return this.integrationService.sendEmail(
      req.user.companyId,
      outreachEnv(),
      { to: body.to, subject: body.subject, body: body.emailBody, source: 'integration-api' },
      req.user.actorId,
    );
  }
}

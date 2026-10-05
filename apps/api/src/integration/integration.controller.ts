import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { ExecutionEnvironment } from '@prisma/client';

@Controller('integration')
@UseGuards(JwtAuthGuard)
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post('email')
  async sendEmail(@Body() body: any, @Request() req) {
    return this.integrationService.sendEmail(
      req.user.companyId,
      body.environment || ExecutionEnvironment.SIMULATION,
      {
        to: body.to,
        subject: body.subject,
        body: body.emailBody, // using emailBody to not conflict with nestjs Body
      },
      req.user.actorId
    );
  }
}

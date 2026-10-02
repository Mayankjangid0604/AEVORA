import { BadRequestException, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { SalesLeadStatus } from '@prisma/client';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { IntegrationApiKeyGuard, IntegrationAuth } from '../authorization/integration-api-key.guard';
import { Roles } from '../authorization/roles.decorator';
import { LeadGenService } from './lead-gen.service';

@Controller('lead-gen')
@UseGuards(JwtAuthGuard, IntegrationApiKeyGuard, RolesGuard)
export class LeadGenController {
  constructor(private readonly leadGen: LeadGenService) {}

  @Get('runs')
  runs(@Request() req) {
    return this.leadGen.listRuns(req.user.companyId);
  }

  @Get('leads')
  leads(@Request() req, @Query('status') status?: string) {
    if (status && !(status in SalesLeadStatus)) throw new BadRequestException(`Invalid status ${status}`);
    return this.leadGen.listLeads(req.user.companyId, status as SalesLeadStatus | undefined);
  }

  @Post('trigger')
  @Roles('CHAIRMAN')
  @IntegrationAuth()
  trigger(@Request() req) {
    const triggeredBy = req.user.actorId === 'SYSTEM_INTEGRATION' ? 'INTEGRATION' : 'MANUAL';
    return this.leadGen.runForCompany(req.user.companyId, triggeredBy, req.user.actorId);
  }
}

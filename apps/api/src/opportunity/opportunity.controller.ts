import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ProposalFlowService } from '../proposal/proposal-flow.service';
import { actorOf } from './pipeline-util';

/** Tenant-scoped opportunity queue. Foreign ids are 404; generating a proposal is idempotent and sends nothing. */
@Controller('opportunity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'EMPLOYEE')
export class OpportunityController {
  constructor(private readonly flow: ProposalFlowService) {}

  @Get()
  list(@Request() req) { return this.flow.listOpportunities(req.user.companyId); }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) { return this.flow.getOpportunity(req.user.companyId, id); }

  @Post(':id/proposals')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  generate(@Request() req, @Param('id') id: string, @Body() body: { force?: string | boolean }) {
    return this.flow.generate(req.user.companyId, actorOf(req), id, body?.force === true || body?.force === 'true');
  }
}

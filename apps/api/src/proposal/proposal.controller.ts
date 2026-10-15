import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { actorOf } from '../opportunity/pipeline-util';
import { ProposalFlowService } from './proposal-flow.service';

/**
 * Operator proposal workflow. Tenant is always req.user.companyId (foreign ids are 404). Staff can read, management
 * can draft/edit/submit/record, only the Chairman can approve. Nothing is sent to a customer from here.
 */
@Controller('proposal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'EMPLOYEE')
export class ProposalController {
  constructor(private readonly flow: ProposalFlowService) {}

  @Get()
  list(@Request() req, @Query('opportunityId') opportunityId?: string) {
    if (!opportunityId) throw new BadRequestException('opportunityId is required');
    return this.flow.listForOpportunity(req.user.companyId, opportunityId);
  }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) { return this.flow.get(req.user.companyId, id); }

  @Post(':id/update')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  update(@Request() req, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.flow.update(req.user.companyId, actorOf(req), id, body ?? {});
  }

  @Post(':id/submit')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  submit(@Request() req, @Param('id') id: string) { return this.flow.submit(req.user.companyId, actorOf(req), id); }

  @Post(':id/decision')
  @Roles('CHAIRMAN')
  decision(@Request() req, @Param('id') id: string, @Body() body: { decision?: string; reason?: string }) {
    return this.flow.decide(req.user.companyId, actorOf(req), id, body?.decision, body?.reason);
  }

  @Post(':id/mark-sent')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  markSent(@Request() req, @Param('id') id: string) { return this.flow.markSent(req.user.companyId, actorOf(req), id); }

  @Post(':id/customer-response')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  customerResponse(@Request() req, @Param('id') id: string, @Body() body: { response?: string }) {
    return this.flow.customerResponse(req.user.companyId, actorOf(req), id, body?.response);
  }

  @Post(':id/project')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  createProject(@Request() req, @Param('id') id: string) { return this.flow.createProject(req.user.companyId, actorOf(req), id); }
}

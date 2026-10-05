import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ContinuousImprovementService } from './continuous-improvement.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@UseGuards(RolesGuard)
@Controller('continuous-improvement')
export class ContinuousImprovementController {
  constructor(private readonly ciService: ContinuousImprovementService, private readonly authz: AuthorizationService) {}

  @Get('company/:companyId/detect')
  async detect(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.detectImprovementOpportunities(companyId);
  }

  @Get('company/:companyId/proposals')
  async listProposals(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.listProposals(companyId);
  }

  @Post('proposals')
  async createProposal(@Body() body: any, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, body?.companyId);
    return this.ciService.createProposal(body);
  }

  @Get('proposals/:id')
  async getProposal(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.getProposal(id);
  }

  /** The approver recorded is the authenticated actor, not a client-supplied name. */
  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/approve')
  async approveProposal(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.approveProposal(id, req.user.actorId);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/reject')
  async rejectProposal(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.rejectProposal(id, req.user.actorId);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/rollback')
  async rollbackProposal(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.rollbackProposal(id);
  }

  @Post('proposals/:id/outcomes')
  async recordOutcome(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.recordOutcome(id, body);
  }
}

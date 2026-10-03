import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ContinuousImprovementService } from './continuous-improvement.service';

@Controller('continuous-improvement')
export class ContinuousImprovementController {
  constructor(private readonly ciService: ContinuousImprovementService) {}

  @Get('company/:companyId/detect')
  async detect(@Param('companyId') companyId: string) {
    return this.ciService.detectImprovementOpportunities(companyId);
  }

  @Get('company/:companyId/proposals')
  async listProposals(@Param('companyId') companyId: string) {
    return this.ciService.listProposals(companyId);
  }

  @Post('proposals')
  async createProposal(@Body() body: any) {
    return this.ciService.createProposal(body);
  }

  @Get('proposals/:id')
  async getProposal(@Param('id') id: string) {
    return this.ciService.getProposal(id);
  }

  @Post('proposals/:id/approve')
  async approveProposal(@Param('id') id: string, @Body() body: { approver: string }) {
    return this.ciService.approveProposal(id, body.approver || 'System');
  }

  @Post('proposals/:id/reject')
  async rejectProposal(@Param('id') id: string, @Body() body: { approver: string }) {
    return this.ciService.rejectProposal(id, body.approver || 'System');
  }

  @Post('proposals/:id/rollback')
  async rollbackProposal(@Param('id') id: string) {
    return this.ciService.rollbackProposal(id);
  }

  @Post('proposals/:id/outcomes')
  async recordOutcome(@Param('id') id: string, @Body() body: any) {
    return this.ciService.recordOutcome(id, body);
  }
}

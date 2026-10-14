import { Controller, Get, Post, Body, Param, Request, UseGuards, Optional, NotFoundException } from '@nestjs/common';
import { ContinuousImprovementService } from './continuous-improvement.service';
import { AntiEntropyEngineService } from './anti-entropy-engine.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { AuthorityTier } from '../governance/authority-context.types';

@UseGuards(RolesGuard)
@Controller('continuous-improvement')
export class ContinuousImprovementController {
  constructor(
    private readonly ciService: ContinuousImprovementService,
    private readonly authz: AuthorizationService,
    @Optional() private readonly entropyEngine?: AntiEntropyEngineService,
  ) {}

  @Get('company/:companyId/signals')
  async listSignals(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return {
      message: 'Active improvement signals queried',
      companyId,
    };
  }

  @Post('company/:companyId/signals')
  async recordSignal(@Param('companyId') companyId: string, @Body() body: any, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.recordSignal({ ...body, companyId });
  }

  @Get('company/:companyId/detect')
  async detectOpportunities(@Param('companyId') companyId: string, @Request() req) {
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
    return this.ciService.createProposal({ ...body, actorId: req.user.actorId });
  }

  @Get('proposals/:id')
  async getProposal(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.getProposal(id);
  }

  @Post('proposals/:id/simulate')
  async simulateProposal(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.simulateProposal(body?.companyId, id, req.user.actorId);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/approve')
  async approveProposal(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    const approverTier = req.user?.actorRole === 'CHAIRMAN' ? AuthorityTier.CHAIRMAN : AuthorityTier.EPHEMERAL_DELEGATE;
    return this.ciService.approveProposal(id, req.user.actorId, {
      approverTier,
      authorityProofId: body?.authorityProofId,
    });
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/reject')
  async rejectProposal(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.rejectProposal(id, req.user.actorId, body?.reason);
  }

  @Get('company/:companyId/rank')
  async rankOpportunities(
    @Param('companyId') companyId: string,
    @Request() req,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.rankImprovementOpportunities(companyId);
  }

  @Get('company/:companyId/oscillation/:entity')
  async checkOscillation(
    @Param('companyId') companyId: string,
    @Param('entity') entity: string,
    @Request() req,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.detectOscillation(companyId, entity);
  }

  @Post('company/:companyId/cycle')
  async runImprovementCycle(
    @Param('companyId') companyId: string,
    @Body() body: any,
    @Request() req,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.ciService.runGovernedSelfImprovementCycle(companyId, req.user.actorId, body);
  }

  @Post('proposals/:id/execute')
  async executeProposal(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    const actorTier = req.user?.actorRole === 'CHAIRMAN' ? AuthorityTier.CHAIRMAN : AuthorityTier.WORKFORCE_AGENT;
    return this.ciService.executeProposal(id, body?.companyId, {
      ...body,
      actorId: req.user?.actorId,
      actorRole: req.user?.actorRole,
      actorTier,
    });
  }

  @Post('proposals/:id/validate')
  async validateImprovement(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.validateImprovement(id, body?.companyId, body);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/rollback')
  async rollbackProposal(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'improvementProposal', id);
    return this.ciService.rollbackProposal(id, body?.companyId, body?.reason, body?.evidence);
  }

  // --- ANTI-ENTROPY ENDPOINTS ---

  @Get('company/:companyId/entropy/audit')
  async runEntropyAudit(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    if (!this.entropyEngine) throw new NotFoundException('AntiEntropyEngineService not available');
    return this.entropyEngine.runAudit(companyId);
  }

  @Get('company/:companyId/entropy/findings')
  async listEntropyFindings(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    if (!this.entropyEngine) throw new NotFoundException('AntiEntropyEngineService not available');
    return this.entropyEngine.listFindings(companyId);
  }

  @Post('company/:companyId/entropy/remediate/:findingId')
  async remediateFinding(
    @Param('companyId') companyId: string,
    @Param('findingId') findingId: string,
    @Request() req,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    if (!this.entropyEngine) throw new NotFoundException('AntiEntropyEngineService not available');
    return this.entropyEngine.autoRemediateFinding(companyId, findingId, req.user.actorId);
  }

  @Get('company/:companyId/entropy/score')
  async computeEntropyScore(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    if (!this.entropyEngine) throw new NotFoundException('AntiEntropyEngineService not available');
    return this.entropyEngine.computeEntropyScore(companyId);
  }
}

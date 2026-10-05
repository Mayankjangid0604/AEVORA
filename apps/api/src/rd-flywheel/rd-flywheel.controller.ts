import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdInitiativeService } from './rd-initiative.service';
import { RdCapabilityService } from './rd-capability.service';
import { RdCapabilityLinkService } from './rd-capability-link.service';
import { RdFeedbackService } from './rd-feedback.service';
import { RdResourcePlanService } from './rd-resource-plan.service';
import { RdAnalyticsService } from './rd-analytics.service';
import { RdAuditService } from './rd-audit.service';
import { RdPortfolioStatus, RdInitiativeStatus, RdCapabilityMaturity, RdFeedbackType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('rd-flywheel')
export class RdFlywheelController {
  constructor(
    private readonly portfolios: RdPortfolioService,
    private readonly initiatives: RdInitiativeService,
    private readonly capabilities: RdCapabilityService,
    private readonly capLinks: RdCapabilityLinkService,
    private readonly feedback: RdFeedbackService,
    private readonly resourcePlans: RdResourcePlanService,
    private readonly analytics: RdAnalyticsService,
    private readonly auditSvc: RdAuditService,
  ) {}

  // ─── Portfolios ────────────────────────────────────────────────────────────

  @Post('portfolios')
  createPortfolio(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.portfolios.create(companyId, actorId, body);
  }

  @Get('portfolios')
  listPortfolios(@Req() req, @Query('status') status?: RdPortfolioStatus) {
    return this.portfolios.list(req.user.companyId, status);
  }

  @Get('portfolios/:id')
  getPortfolio(@Req() req, @Param('id') id: string) {
    return this.portfolios.get(req.user.companyId, id);
  }

  @Patch('portfolios/:id')
  updatePortfolio(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.portfolios.update(companyId, actorId, id, body);
  }

  // ─── Initiatives ───────────────────────────────────────────────────────────

  @Post('portfolios/:portfolioId/initiatives')
  createInitiative(@Req() req, @Param('portfolioId') portfolioId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.initiatives.create(companyId, actorId, portfolioId, body);
  }

  @Get('initiatives')
  listInitiatives(@Req() req, @Query('portfolioId') portfolioId?: string, @Query('status') status?: RdInitiativeStatus) {
    return this.initiatives.list(req.user.companyId, portfolioId, status);
  }

  @Get('initiatives/:id')
  getInitiative(@Req() req, @Param('id') id: string) {
    return this.initiatives.get(req.user.companyId, id);
  }

  @Patch('initiatives/:id')
  updateInitiative(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.initiatives.update(companyId, actorId, id, body);
  }

  @Post('initiatives/:id/approve')
  approveInitiative(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.initiatives.approve(companyId, actorId, id);
  }

  @Post('initiatives/:id/start')
  startInitiative(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.initiatives.start(companyId, actorId, id);
  }

  @Post('initiatives/:id/complete')
  completeInitiative(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.initiatives.complete(companyId, actorId, id);
  }

  @Post('initiatives/:id/cancel')
  cancelInitiative(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.initiatives.cancel(companyId, actorId, id);
  }

  // ─── Capabilities ──────────────────────────────────────────────────────────

  @Post('capabilities')
  createCapability(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.capabilities.create(companyId, actorId, body);
  }

  @Get('capabilities')
  listCapabilities(@Req() req, @Query('domain') domain?: string) {
    return this.capabilities.list(req.user.companyId, domain);
  }

  @Get('capabilities/:id')
  getCapability(@Req() req, @Param('id') id: string) {
    return this.capabilities.get(req.user.companyId, id);
  }

  @Patch('capabilities/:id/maturity')
  updateMaturity(@Req() req, @Param('id') id: string, @Body() body: { maturity: RdCapabilityMaturity }) {
    const { companyId, actorId } = req.user;
    return this.capabilities.updateMaturity(companyId, actorId, id, body.maturity);
  }

  // ─── Capability Links ──────────────────────────────────────────────────────

  @Post('initiatives/:initiativeId/capabilities')
  linkCapability(@Req() req, @Param('initiativeId') initiativeId: string, @Body() body: { capabilityId: string }) {
    const { companyId, actorId } = req.user;
    return this.capLinks.link(companyId, actorId, initiativeId, body.capabilityId);
  }

  @Get('initiatives/:initiativeId/capabilities')
  listLinkedCapabilities(@Req() req, @Param('initiativeId') initiativeId: string) {
    return this.capLinks.list(req.user.companyId, initiativeId);
  }

  // ─── Feedback ──────────────────────────────────────────────────────────────

  @Post('feedback')
  submitFeedback(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.feedback.submit(companyId, actorId, body);
  }

  @Get('feedback')
  listFeedback(@Req() req, @Query('initiativeId') initiativeId?: string, @Query('feedbackType') feedbackType?: RdFeedbackType) {
    return this.feedback.list(req.user.companyId, initiativeId, feedbackType);
  }

  // ─── Resource Plans ────────────────────────────────────────────────────────

  @Post('resource-plans')
  createResourcePlan(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.resourcePlans.create(companyId, actorId, body);
  }

  @Get('resource-plans')
  listResourcePlans(@Req() req, @Query('portfolioId') portfolioId?: string, @Query('fiscalYear') fiscalYear?: string) {
    return this.resourcePlans.list(req.user.companyId, portfolioId, fiscalYear ? parseInt(fiscalYear) : undefined);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/flywheel')
  flyWheelSummary(@Req() req) {
    return this.analytics.flyWheelSummary(req.user.companyId);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  getAudit(@Req() req, @Query('portfolioId') portfolioId?: string) {
    return this.auditSvc.trail(req.user.companyId, portfolioId);
  }
}

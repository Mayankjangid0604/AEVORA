import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { AeObjectiveService } from './ae-objective.service';
import { AeOperatingCycleService } from './ae-operating-cycle.service';
import { AeEscalationService } from './ae-escalation.service';
import { AeDecisionService } from './ae-decision.service';
import { AeRecommendationService } from './ae-recommendation.service';
import { AeDashboardService } from './ae-dashboard.service';
import { AeAuditService } from './ae-audit.service';
import { AeObjectiveStatus, AeDecisionStatus, AeEscalationLevel } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('autonomous-enterprise')
export class AutonomousEnterpriseController {
  constructor(
    private readonly objectives: AeObjectiveService,
    private readonly cycles: AeOperatingCycleService,
    private readonly escalations: AeEscalationService,
    private readonly decisions: AeDecisionService,
    private readonly recommendations: AeRecommendationService,
    private readonly dashboard: AeDashboardService,
    private readonly auditSvc: AeAuditService,
  ) {}

  // ─── Objectives ──────────────────────────────────────────────────────────────

  @Post('objectives')
  createObjective(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.objectives.create(companyId, actorId, body);
  }

  @Get('objectives')
  listObjectives(@Req() req, @Query('status') status?: AeObjectiveStatus) {
    return this.objectives.list(req.user.companyId, status);
  }

  @Get('objectives/:id')
  getObjective(@Req() req, @Param('id') id: string) {
    return this.objectives.get(req.user.companyId, id);
  }

  @Patch('objectives/:id')
  updateObjective(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.objectives.update(companyId, actorId, id, body);
  }

  @Post('objectives/:id/approve')
  approveObjective(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.objectives.approve(companyId, actorId, id);
  }

  // ─── Operating Cycles ────────────────────────────────────────────────────────

  @Post('operating-cycles/open')
  openCycle(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.cycles.open(companyId, actorId, body);
  }

  @Get('operating-cycles')
  listCycles(@Req() req) {
    return this.cycles.list(req.user.companyId);
  }

  @Get('operating-cycles/:id')
  getCycle(@Req() req, @Param('id') id: string) {
    return this.cycles.get(req.user.companyId, id);
  }

  @Post('operating-cycles/:id/review')
  reviewCycle(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.cycles.review(companyId, actorId, id);
  }

  @Post('operating-cycles/:id/close')
  closeCycle(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.cycles.close(companyId, actorId, id);
  }

  // ─── Escalations ─────────────────────────────────────────────────────────────

  @Post('escalations')
  raiseEscalation(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.escalations.raise(companyId, actorId, body);
  }

  @Get('escalations')
  listEscalations(@Req() req, @Query('cycleId') cycleId?: string, @Query('level') level?: AeEscalationLevel) {
    return this.escalations.list(req.user.companyId, cycleId, level);
  }

  @Post('escalations/:id/resolve')
  resolveEscalation(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.escalations.resolve(companyId, actorId, id);
  }

  @Post('escalations/:id/defer')
  deferEscalation(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.escalations.defer(companyId, actorId, id);
  }

  // ─── Decisions ───────────────────────────────────────────────────────────────

  @Post('decisions')
  createDecision(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.decisions.create(companyId, actorId, body);
  }

  @Get('decisions')
  listDecisions(@Req() req, @Query('status') status?: AeDecisionStatus) {
    return this.decisions.list(req.user.companyId, status);
  }

  @Get('decisions/:id')
  getDecision(@Req() req, @Param('id') id: string) {
    return this.decisions.get(req.user.companyId, id);
  }

  @Post('decisions/:id/decide')
  decideDecision(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.decisions.decide(companyId, actorId, id, body?.notes);
  }

  @Post('decisions/:id/defer')
  deferDecision(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.decisions.defer(companyId, actorId, id);
  }

  @Post('decisions/:id/dismiss')
  dismissDecision(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.decisions.dismiss(companyId, actorId, id);
  }

  // ─── Recommendations ─────────────────────────────────────────────────────────

  @Post('recommendations')
  proposeRecommendation(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.recommendations.propose(companyId, actorId, body);
  }

  @Get('recommendations')
  listRecommendations(@Req() req, @Query('domain') domain?: string) {
    return this.recommendations.list(req.user.companyId, domain);
  }

  @Post('recommendations/:id/acknowledge')
  acknowledgeRecommendation(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.recommendations.acknowledge(companyId, actorId, id);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  @Get('dashboard/summary')
  getDashboard(@Req() req) {
    return this.dashboard.enterpriseSummary(req.user.companyId);
  }

  // ─── Audit ───────────────────────────────────────────────────────────────────

  @Get('audit')
  getAudit(@Req() req) {
    return this.auditSvc.trail(req.user.companyId);
  }
}

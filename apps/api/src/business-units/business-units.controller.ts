import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { BuBusinessUnitService } from './bu-business-unit.service';
import { BuObjectiveService } from './bu-objective.service';
import { BuKpiService } from './bu-kpi.service';
import { BuBudgetService } from './bu-budget.service';
import { BuRiskService } from './bu-risk.service';
import { BuCapitalRequestService } from './bu-capital-request.service';
import { BuPerformanceReviewService } from './bu-performance-review.service';
import { BuPnlService } from './bu-pnl.service';
import { BuAuditService } from './bu-audit.service';
import { BuStatus, BuLifecycle, BuKpiStatus, BuRiskSeverity, BuCapitalRequestStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
@Controller('business-units')
export class BusinessUnitsController {
  constructor(
    private readonly bus: BuBusinessUnitService,
    private readonly objectives: BuObjectiveService,
    private readonly kpis: BuKpiService,
    private readonly budgets: BuBudgetService,
    private readonly risks: BuRiskService,
    private readonly capitalRequests: BuCapitalRequestService,
    private readonly performanceReviews: BuPerformanceReviewService,
    private readonly pnl: BuPnlService,
    private readonly auditSvc: BuAuditService,
  ) {}

  // ─── Business Units ────────────────────────────────────────────────────────

  @Post()
  create(@Req() req, @Body() body: { name: string; code: string; description?: string; charter?: string; leaderId?: string; parentBuId?: string; strategicThemeId?: string }) {
    const { companyId, actorId } = req.user;
    return this.bus.create(companyId, actorId, body);
  }

  @Get()
  list(@Req() req, @Query('status') status?: BuStatus) {
    return this.bus.list(req.user.companyId, status);
  }

  @Get(':id')
  get(@Req() req, @Param('id') id: string) {
    return this.bus.get(req.user.companyId, id);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() body: { name?: string; description?: string; charter?: string; leaderId?: string; parentBuId?: string; strategicThemeId?: string }) {
    const { companyId, actorId } = req.user;
    return this.bus.update(companyId, actorId, id, body);
  }

  @Post(':id/advance-lifecycle')
  advanceLifecycle(@Req() req, @Param('id') id: string, @Body() body: { lifecycle: BuLifecycle }) {
    const { companyId, actorId } = req.user;
    return this.bus.advanceLifecycle(companyId, actorId, id, body.lifecycle);
  }

  @Post(':id/approve')
  approve(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.bus.approve(companyId, actorId, id);
  }

  @Post(':id/retire')
  retire(@Req() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    const { companyId, actorId } = req.user;
    return this.bus.retire(companyId, actorId, id, body?.reason);
  }

  // ─── Objectives ────────────────────────────────────────────────────────────

  @Post(':id/objectives')
  createObjective(@Req() req, @Param('id') buId: string, @Body() body: { title: string; description?: string; targetValue?: string; dueDate?: string }) {
    const { companyId, actorId } = req.user;
    return this.objectives.create(companyId, actorId, buId, body);
  }

  @Get(':id/objectives')
  listObjectives(@Req() req, @Param('id') buId: string) {
    return this.objectives.list(req.user.companyId, buId);
  }

  @Patch('objectives/:objectiveId')
  updateObjective(@Req() req, @Param('objectiveId') objectiveId: string, @Body() body: { title?: string; description?: string; targetValue?: string; dueDate?: string }) {
    const { companyId, actorId } = req.user;
    return this.objectives.update(companyId, actorId, objectiveId, body);
  }

  @Post('objectives/:objectiveId/cancel')
  cancelObjective(@Req() req, @Param('objectiveId') objectiveId: string) {
    const { companyId, actorId } = req.user;
    return this.objectives.cancel(companyId, actorId, objectiveId);
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  @Post(':id/kpis')
  recordKpi(@Req() req, @Param('id') buId: string, @Body() body: { name: string; description?: string; currentValue?: string; targetValue?: string; unit?: string; periodStart?: string; periodEnd?: string }) {
    const { companyId, actorId } = req.user;
    return this.kpis.record(companyId, actorId, buId, body);
  }

  @Get(':id/kpis')
  listKpis(@Req() req, @Param('id') buId: string) {
    return this.kpis.list(req.user.companyId, buId);
  }

  @Patch('kpis/:kpiId/status')
  updateKpiStatus(@Req() req, @Param('kpiId') kpiId: string, @Body() body: { status: BuKpiStatus }) {
    const { companyId, actorId } = req.user;
    return this.kpis.updateStatus(companyId, actorId, kpiId, body.status);
  }

  // ─── Budgets ───────────────────────────────────────────────────────────────

  @Post(':id/budgets')
  createBudget(@Req() req, @Param('id') buId: string, @Body() body: { fiscalYear: number; fiscalQuarter?: number; allocatedMc: number; forecastedSpendMc?: number; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.budgets.create(companyId, actorId, buId, body);
  }

  @Get(':id/budgets')
  listBudgets(@Req() req, @Param('id') buId: string) {
    return this.budgets.list(req.user.companyId, buId);
  }

  @Patch('budgets/:budgetId')
  updateBudget(@Req() req, @Param('budgetId') budgetId: string, @Body() body: { allocatedMc?: number; forecastedSpendMc?: number; actualSpendMc?: number; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.budgets.update(companyId, actorId, budgetId, body);
  }

  // ─── Risks ─────────────────────────────────────────────────────────────────

  @Post(':id/risks')
  createRisk(@Req() req, @Param('id') buId: string, @Body() body: { title: string; description?: string; severity?: BuRiskSeverity; likelihood?: string; mitigation?: string }) {
    const { companyId, actorId } = req.user;
    return this.risks.create(companyId, actorId, buId, body);
  }

  @Get(':id/risks')
  listRisks(@Req() req, @Param('id') buId: string) {
    return this.risks.list(req.user.companyId, buId);
  }

  @Post('risks/:riskId/resolve')
  resolveRisk(@Req() req, @Param('riskId') riskId: string, @Body() body: { mitigation?: string }) {
    const { companyId, actorId } = req.user;
    return this.risks.resolve(companyId, actorId, riskId, body?.mitigation);
  }

  @Post('risks/:riskId/accept')
  acceptRisk(@Req() req, @Param('riskId') riskId: string) {
    const { companyId, actorId } = req.user;
    return this.risks.accept(companyId, actorId, riskId);
  }

  // ─── Capital Requests ──────────────────────────────────────────────────────

  @Post(':id/capital-requests')
  createCapitalRequest(@Req() req, @Param('id') buId: string, @Body() body: { title: string; description?: string; amountMc: number; currency?: string; justification?: string; expectedReturn?: string; idempotencyKey: string }) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.create(companyId, actorId, buId, body);
  }

  @Get(':id/capital-requests')
  listCapitalRequests(@Req() req, @Param('id') buId: string, @Query('status') status?: BuCapitalRequestStatus) {
    return this.capitalRequests.list(req.user.companyId, buId, status);
  }

  @Get('capital-requests/:requestId')
  getCapitalRequest(@Req() req, @Param('requestId') requestId: string) {
    return this.capitalRequests.get(req.user.companyId, requestId);
  }

  @Post('capital-requests/:requestId/submit')
  submitCapitalRequest(@Req() req, @Param('requestId') requestId: string) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.submit(companyId, actorId, requestId);
  }

  @Post('capital-requests/:requestId/review')
  reviewCapitalRequest(@Req() req, @Param('requestId') requestId: string) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.review(companyId, actorId, requestId);
  }

  @Post('capital-requests/:requestId/approve')
  approveCapitalRequest(@Req() req, @Param('requestId') requestId: string) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.approve(companyId, actorId, requestId);
  }

  @Post('capital-requests/:requestId/reject')
  rejectCapitalRequest(@Req() req, @Param('requestId') requestId: string, @Body() body: { reason: string }) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.reject(companyId, actorId, requestId, body.reason);
  }

  @Post('capital-requests/:requestId/withdraw')
  withdrawCapitalRequest(@Req() req, @Param('requestId') requestId: string) {
    const { companyId, actorId } = req.user;
    return this.capitalRequests.withdraw(companyId, actorId, requestId);
  }

  // ─── Performance Reviews ───────────────────────────────────────────────────

  @Post(':id/performance-reviews')
  createPerformanceReview(@Req() req, @Param('id') buId: string, @Body() body: { period: string; summary?: string; kpiScorePct?: number }) {
    const { companyId, actorId } = req.user;
    return this.performanceReviews.create(companyId, actorId, buId, body);
  }

  @Get(':id/performance-reviews')
  listPerformanceReviews(@Req() req, @Param('id') buId: string) {
    return this.performanceReviews.list(req.user.companyId, buId);
  }

  @Post('performance-reviews/:reviewId/approve')
  approvePerformanceReview(@Req() req, @Param('reviewId') reviewId: string) {
    const { companyId, actorId } = req.user;
    return this.performanceReviews.approve(companyId, actorId, reviewId);
  }

  // ─── P&L Summary ──────────────────────────────────────────────────────────

  @Get(':id/pnl')
  pnlSummary(@Req() req, @Param('id') buId: string) {
    return this.pnl.pnlSummary(req.user.companyId, buId);
  }

  // ─── Audit Trail ──────────────────────────────────────────────────────────

  @Get(':id/audit')
  audit(@Req() req, @Param('id') buId: string, @Query('limit') limit?: string) {
    return this.auditSvc.trail(req.user.companyId, buId, limit ? parseInt(limit) : 100);
  }

  @Get('audit/all')
  auditAll(@Req() req, @Query('limit') limit?: string) {
    return this.auditSvc.trail(req.user.companyId, undefined, limit ? parseInt(limit) : 100);
  }
}

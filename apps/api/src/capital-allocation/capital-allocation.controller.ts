import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { CaPoolService } from './ca-pool.service';
import { CaProposalService } from './ca-proposal.service';
import { CaScenarioService } from './ca-scenario.service';
import { CaConstraintService } from './ca-constraint.service';
import { CaAllocationService } from './ca-allocation.service';
import { CaPerformanceService } from './ca-performance.service';
import { CaAnalyticsService } from './ca-analytics.service';
import { CaAuditService } from './ca-audit.service';
import { CaProposalStatus, CaScenarioType, CaInvestmentCategory, CaRiskLevel } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
@Controller('capital-allocation')
export class CapitalAllocationController {
  constructor(
    private readonly pools: CaPoolService,
    private readonly proposals: CaProposalService,
    private readonly scenarios: CaScenarioService,
    private readonly constraints: CaConstraintService,
    private readonly allocations: CaAllocationService,
    private readonly performance: CaPerformanceService,
    private readonly analytics: CaAnalyticsService,
    private readonly auditSvc: CaAuditService,
  ) {}

  // ─── Pools ─────────────────────────────────────────────────────────────────

  @Post('pools')
  createPool(@Req() req, @Body() body: { name: string; description?: string; totalMc: number; availableMc: number; fiscalYear: number; currency?: string }) {
    const { companyId, actorId } = req.user;
    return this.pools.create(companyId, actorId, body);
  }

  @Get('pools')
  listPools(@Req() req, @Query('fiscalYear') fiscalYear?: string) {
    return this.pools.list(req.user.companyId, fiscalYear ? parseInt(fiscalYear) : undefined);
  }

  @Get('pools/:id')
  getPool(@Req() req, @Param('id') id: string) {
    return this.pools.get(req.user.companyId, id);
  }

  @Patch('pools/:id')
  updatePool(@Req() req, @Param('id') id: string, @Body() body: { name?: string; description?: string; totalMc?: number; availableMc?: number; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.pools.update(companyId, actorId, id, body);
  }

  // ─── Constraints ───────────────────────────────────────────────────────────

  @Post('pools/:id/constraints')
  createConstraint(@Req() req, @Param('id') poolId: string, @Body() body: { name: string; description?: string; maxSingleAllocMc?: number; minLiquidityMc?: number; maxCategoryPct?: number; maxBuPct?: number }) {
    const { companyId, actorId } = req.user;
    return this.constraints.create(companyId, actorId, poolId, body);
  }

  @Get('pools/:id/constraints')
  listConstraints(@Req() req, @Param('id') poolId: string) {
    return this.constraints.list(req.user.companyId, poolId);
  }

  // ─── Proposals ─────────────────────────────────────────────────────────────

  @Post('proposals')
  createProposal(@Req() req, @Body() body: { poolId: string; title: string; description?: string; category?: CaInvestmentCategory; targetBuId?: string; targetProductId?: string; targetStrategyId?: string; requestedMc: number; currency?: string; justification?: string; expectedRoiPct?: number; riskLevel?: CaRiskLevel; idempotencyKey: string }) {
    const { companyId, actorId } = req.user;
    return this.proposals.create(companyId, actorId, body.poolId, body);
  }

  @Get('proposals')
  listProposals(@Req() req, @Query('poolId') poolId?: string, @Query('status') status?: CaProposalStatus) {
    return this.proposals.list(req.user.companyId, poolId, status);
  }

  @Get('proposals/:id')
  getProposal(@Req() req, @Param('id') id: string) {
    return this.proposals.get(req.user.companyId, id);
  }

  @Post('proposals/:id/submit')
  submitProposal(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.proposals.submit(companyId, actorId, id);
  }

  @Post('proposals/:id/review')
  reviewProposal(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.proposals.review(companyId, actorId, id);
  }

  @Post('proposals/:id/approve')
  approveProposal(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.proposals.approve(companyId, actorId, id);
  }

  @Post('proposals/:id/reject')
  rejectProposal(@Req() req, @Param('id') id: string, @Body() body: { reason: string }) {
    const { companyId, actorId } = req.user;
    return this.proposals.reject(companyId, actorId, id, body.reason);
  }

  @Post('proposals/:id/withdraw')
  withdrawProposal(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.proposals.withdraw(companyId, actorId, id);
  }

  // ─── Scenarios ─────────────────────────────────────────────────────────────

  @Post('proposals/:proposalId/scenarios')
  createScenario(@Req() req, @Param('proposalId') proposalId: string, @Body() body: { scenarioType?: CaScenarioType; label?: string; projectedReturnMc?: number; projectedRoiPct?: number; timeHorizonMonths?: number; assumptions?: string }) {
    const { companyId, actorId } = req.user;
    return this.scenarios.create(companyId, actorId, proposalId, body);
  }

  @Get('proposals/:proposalId/scenarios')
  listScenarios(@Req() req, @Param('proposalId') proposalId: string) {
    return this.scenarios.list(req.user.companyId, proposalId);
  }

  // ─── Authorize Allocation ──────────────────────────────────────────────────

  @Post('proposals/:proposalId/authorize')
  authorizeAllocation(@Req() req, @Param('proposalId') proposalId: string, @Body() body: { amountMc: number; currency?: string; notes?: string; financeRef?: string; idempotencyKey: string }) {
    const { companyId, actorId } = req.user;
    return this.allocations.authorize(companyId, actorId, proposalId, body);
  }

  // ─── Allocations ───────────────────────────────────────────────────────────

  @Get('allocations')
  listAllocations(@Req() req, @Query('proposalId') proposalId?: string) {
    return this.allocations.list(req.user.companyId, proposalId);
  }

  @Get('allocations/:id')
  getAllocation(@Req() req, @Param('id') id: string) {
    return this.allocations.get(req.user.companyId, id);
  }

  @Post('allocations/:id/execute')
  executeAllocation(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.allocations.execute(companyId, actorId, id);
  }

  @Post('allocations/:id/complete')
  completeAllocation(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.allocations.complete(companyId, actorId, id);
  }

  // ─── Performance ───────────────────────────────────────────────────────────

  @Post('allocations/:allocationId/performance')
  recordPerformance(@Req() req, @Param('allocationId') allocationId: string, @Body() body: { period: string; actualReturnMc?: number; expectedReturnMc?: number; varianceMc?: number; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.performance.record(companyId, actorId, allocationId, body);
  }

  @Get('allocations/:allocationId/performance')
  listPerformance(@Req() req, @Param('allocationId') allocationId: string) {
    return this.performance.list(req.user.companyId, allocationId);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/portfolio')
  portfolioSummary(@Req() req) {
    return this.analytics.portfolioSummary(req.user.companyId);
  }

  @Get('analytics/concentration/:poolId')
  concentrationAnalysis(@Req() req, @Param('poolId') poolId: string) {
    return this.analytics.concentrationAnalysis(req.user.companyId, poolId);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  auditTrail(@Req() req, @Query('poolId') poolId?: string) {
    return this.auditSvc.trail(req.user.companyId, poolId);
  }
}

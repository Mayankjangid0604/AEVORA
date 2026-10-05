import { Controller, Get, Post, Param, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { OperatingLoopService } from './operating-loop.service';
import { OpportunitySignalService } from './opportunity-signal.service';
import { MemoryIntegrationService } from './memory-integration.service';
import { PerformanceAggregationService } from './performance-aggregation.service';
import { ItlErrorPoolService } from './itl-error-pool.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operating-loop')
export class OperatingLoopController {
  constructor(
    private readonly loop: OperatingLoopService,
    private readonly signals: OpportunitySignalService,
    private readonly memory: MemoryIntegrationService,
    private readonly perf: PerformanceAggregationService,
    private readonly itlPool: ItlErrorPoolService,
    private readonly authz: AuthorizationService,
  ) {}

  // ── OODA cycles ──

  @Roles('CHAIRMAN')
  @Post(':companyId/cycle')
  async startCycle(@Param('companyId') companyId: string, @Body() body: { trigger: string }, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.loop.runFullCycle(companyId, body.trigger);
  }

  @Get(':companyId/cycles')
  async listCycles(@Param('companyId') companyId: string, @Query('limit') limit: string | undefined, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.loop.listCycles(companyId, limit ? parseInt(limit, 10) : 20);
  }

  @Get('cycle/:id')
  async getCycle(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'operatingLoopCycle', id);
    return this.loop.getCycle(id);
  }

  @Get(':companyId/pending-approvals')
  async getPendingApprovals(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.loop.getPendingApprovals(companyId);
  }

  @Roles('CHAIRMAN')
  @Post('cycle/:id/verdict')
  async chairmanVerdict(@Param('id') id: string, @Body() body: { verdict: 'APPROVED' | 'REJECTED' }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'operatingLoopCycle', id);
    const cycle = await this.loop.recordChairmanVerdict(id, body.verdict);
    if (body.verdict === 'APPROVED') {
      await this.loop.execute(id);
      await this.loop.measure(id);
      await this.loop.learn(id);
      return this.loop.getCycle(id);
    }
    return cycle;
  }

  // ── Opportunity signals ──

  @Post(':companyId/scan-opportunities')
  async scanOpportunities(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.signals.scan(companyId);
  }

  // ── Unified memory ──

  @Get(':companyId/context')
  async getContext(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.memory.getCompanyContext(companyId);
  }

  @Get(':companyId/memory/search')
  async searchMemory(@Param('companyId') companyId: string, @Query('q') q: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.memory.search(companyId, q || '');
  }

  // ── Performance ──

  @Get(':companyId/performance')
  async getPerformance(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.perf.getCompanyPerformance(companyId);
  }

  @Get('performance/agent/:employeeId')
  async getAgentPerformance(@Param('employeeId') employeeId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', employeeId);
    return this.perf.getAgentPerformance(employeeId);
  }

  // ── ITL Error Pool ──

  /** View all cycles currently in the ITL error pool for this company. */
  @Get(':companyId/error-pool')
  async getErrorPool(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.itlPool.getPoolSnapshot(companyId);
  }

  /** Trigger an immediate ITL pool scan for the selected company's failed cycles. */
  @Roles('CHAIRMAN')
  @Post('error-pool/scan')
  async scanPool(@Request() req) {
    // Scoped to the explicitly selected company (X-Company-Id, already validated by JwtAuthGuard); no implicit fallback.
    const companyId = req.headers['x-company-id'];
    if (typeof companyId !== 'string' || !companyId) throw new BadRequestException('X-Company-Id header is required');
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.itlPool.processPool(companyId);
  }

  /** Force-retry a specific failed cycle immediately (Chairman override). */
  @Roles('CHAIRMAN')
  @Post('error-pool/retry/:cycleId')
  async forceRetry(@Param('cycleId') cycleId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'operatingLoopCycle', cycleId);
    return this.itlPool.forceRetry(cycleId);
  }

  /** Permanently dismiss a cycle from the error pool. */
  @Roles('CHAIRMAN')
  @Post('error-pool/dismiss/:cycleId')
  async dismissCycle(@Param('cycleId') cycleId: string, @Body() body: { reason: string }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'operatingLoopCycle', cycleId);
    return this.itlPool.dismiss(cycleId, body.reason ?? 'Chairman dismissed');
  }

  // ── Unified OS dashboard ──

  @Get(':companyId/dashboard')
  async osDashboard(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    const [performance, context, pendingApprovals, recentCycles, opportunities, errorPool] = await Promise.all([
      this.perf.getCompanyPerformance(companyId),
      this.memory.getCompanyContext(companyId, { limit: 5 }),
      this.loop.getPendingApprovals(companyId),
      this.loop.listCycles(companyId, 5),
      this.signals.listIdentified(companyId),
      this.itlPool.getPoolSnapshot(companyId),
    ]);

    return {
      performance: performance.summary,
      pendingApprovals: pendingApprovals.length,
      recentCycles: recentCycles.map(c => ({ id: c.id, trigger: c.trigger, phase: c.phase, startedAt: c.startedAt })),
      opportunities: opportunities.length,
      recentDecisions: context.decisions.slice(0, 5),
      recentLessons: context.memories.filter(m => m.type === 'LESSON').slice(0, 5),
      errorPool: {
        total: errorPool.length,
        requiresChairman: errorPool.filter(e => e.requiresChairman).length,
        autoHealing: errorPool.filter(e => e.canAutoHeal && !e.requiresChairman).length,
        topErrors: errorPool.slice(0, 3),
      },
    };
  }
}

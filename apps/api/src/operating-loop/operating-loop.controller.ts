import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
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
  ) {}

  // ── OODA cycles ──

  @Roles('CHAIRMAN')
  @Post(':companyId/cycle')
  startCycle(@Param('companyId') companyId: string, @Body() body: { trigger: string }) {
    return this.loop.runFullCycle(companyId, body.trigger);
  }

  @Get(':companyId/cycles')
  listCycles(@Param('companyId') companyId: string, @Query('limit') limit?: string) {
    return this.loop.listCycles(companyId, limit ? parseInt(limit, 10) : 20);
  }

  @Get('cycle/:id')
  getCycle(@Param('id') id: string) {
    return this.loop.getCycle(id);
  }

  @Get(':companyId/pending-approvals')
  getPendingApprovals(@Param('companyId') companyId: string) {
    return this.loop.getPendingApprovals(companyId);
  }

  @Roles('CHAIRMAN')
  @Post('cycle/:id/verdict')
  async chairmanVerdict(@Param('id') id: string, @Body() body: { verdict: 'APPROVED' | 'REJECTED' }) {
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
  scanOpportunities(@Param('companyId') companyId: string) {
    return this.signals.scan(companyId);
  }

  // ── Unified memory ──

  @Get(':companyId/context')
  getContext(@Param('companyId') companyId: string) {
    return this.memory.getCompanyContext(companyId);
  }

  @Get(':companyId/memory/search')
  searchMemory(@Param('companyId') companyId: string, @Query('q') q: string) {
    return this.memory.search(companyId, q || '');
  }

  // ── Performance ──

  @Get(':companyId/performance')
  getPerformance(@Param('companyId') companyId: string) {
    return this.perf.getCompanyPerformance(companyId);
  }

  @Get('performance/agent/:employeeId')
  getAgentPerformance(@Param('employeeId') employeeId: string) {
    return this.perf.getAgentPerformance(employeeId);
  }

  // ── ITL Error Pool ──

  /** View all cycles currently in the ITL error pool for this company. */
  @Get(':companyId/error-pool')
  getErrorPool(@Param('companyId') companyId: string) {
    return this.itlPool.getPoolSnapshot(companyId);
  }

  /** Trigger an immediate ITL pool scan (processes all failed cycles now). */
  @Roles('CHAIRMAN')
  @Post('error-pool/scan')
  scanPool() {
    return this.itlPool.processPool();
  }

  /** Force-retry a specific failed cycle immediately (Chairman override). */
  @Roles('CHAIRMAN')
  @Post('error-pool/retry/:cycleId')
  forceRetry(@Param('cycleId') cycleId: string) {
    return this.itlPool.forceRetry(cycleId);
  }

  /** Permanently dismiss a cycle from the error pool. */
  @Roles('CHAIRMAN')
  @Post('error-pool/dismiss/:cycleId')
  dismissCycle(@Param('cycleId') cycleId: string, @Body() body: { reason: string }) {
    return this.itlPool.dismiss(cycleId, body.reason ?? 'Chairman dismissed');
  }

  // ── Unified OS dashboard ──

  @Get(':companyId/dashboard')
  async osDashboard(@Param('companyId') companyId: string) {
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

import {
  Injectable, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategyReviewStatus } from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';
import { StrategyStateService } from './strategy-state.service';
import { OrganizationalMemoryService } from '../management/organizational-memory.service';
import { EscalationService } from '../management/escalation.service';
import { OrgMemoryType, DecisionPriority, RiskLevel } from '@prisma/client';

@Injectable()
export class StrategyReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
    private readonly stateSvc: StrategyStateService,
    private readonly memorySvc: OrganizationalMemoryService,
    private readonly escalationSvc: EscalationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  private buildKey(companyId: string): string {
    const now = new Date();
    return `${companyId}:STRATEGY:${now.toISOString().slice(0, 10)}`;
  }

  async runReview(companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);

    const idempotencyKey = this.buildKey(companyId);

    const existing = await this.prisma.strategyReviewCycle.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
    });

    if (existing) {
      if (existing.status === StrategyReviewStatus.COMPLETED) throw new BadRequestException('Strategy review already completed for today');
      if (existing.status === StrategyReviewStatus.RUNNING) throw new BadRequestException('Strategy review is already running');
      if (existing.status === StrategyReviewStatus.FAILED) {
        await this.prisma.strategyReviewCycle.delete({ where: { id: existing.id } });
      }
    }

    let review: any;
    try {
      review = await this.prisma.strategyReviewCycle.create({
        data: { companyId, idempotencyKey, triggeredBy: actorId, status: StrategyReviewStatus.RUNNING },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Strategy review already in progress (concurrent request)');
      throw e;
    }

    await this.audit.record({ companyId, actorId, action: 'STRATEGY_REVIEW_STARTED', objectType: 'StrategyReviewCycle', objectId: review.id });

    try {
      // Step 1: collect strategic state
      const state = await this.stateSvc.collectStrategicState(companyId);

      // Step 2: detect drift signals
      const warningSignals: string[] = [];
      const gapsIdentified: string[] = [];
      let driftDetected = false;

      // Warning: at-risk objectives
      const atRiskObjectives = await this.prisma.companyObjective.count({ where: { companyId, status: 'AT_RISK' } });
      if (atRiskObjectives > 0) {
        warningSignals.push(`${atRiskObjectives} objective(s) AT_RISK`);
        driftDetected = true;
      }

      // Warning: active initiatives with no linked objective
      const orphanInitiatives = await this.prisma.strategicInitiative.count({ where: { companyId, status: 'ACTIVE', objectiveId: null } });
      if (orphanInitiatives > 0) {
        gapsIdentified.push(`${orphanInitiatives} active initiative(s) without linked objective`);
      }

      // Warning: stalled initiatives (ACTIVE but low progress proxied by age > 90 days)
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const stalledCount = await this.prisma.strategicInitiative.count({
        where: { companyId, status: 'ACTIVE', startedAt: { lt: cutoff }, completedAt: null },
      });
      if (stalledCount > 0) {
        warningSignals.push(`${stalledCount} initiative(s) active >90 days without completion`);
        driftDetected = true;
      }

      // Warning: high open risks
      if (state.openRisks > 5) warningSignals.push(`${state.openRisks} open risks unresolved`);

      // Step 3: generate recommendations as escalations for critical signals
      let escalationCount = 0;
      if (driftDetected && warningSignals.length >= 2) {
        await this.escalationSvc.createEscalation(companyId, actorId, {
          title: 'Strategy drift detected',
          reason: `Strategy drift detected. Signals: ${warningSignals.join('; ')}. Gaps: ${gapsIdentified.join('; ')}.`,
          priority: DecisionPriority.HIGH,
          riskLevel: RiskLevel.HIGH,
          escalatedTo: 'CHAIRMAN',
          evidence: [{ source: 'strategy_review', signals: warningSignals, gaps: gapsIdentified }],
        });
        escalationCount++;
      }

      // Step 4: record to organizational memory (weekly/monthly strategic lesson)
      await this.memorySvc.record(companyId, actorId, {
        memoryType: OrgMemoryType.LESSON,
        subject: 'Strategy review summary',
        content: `Drift: ${driftDetected}. Warnings: ${warningSignals.join('; ') || 'none'}. Gaps: ${gapsIdentified.join('; ') || 'none'}. Health: ${state.healthStatus || 'unknown'}.`,
        tags: ['STRATEGY_REVIEW', driftDetected ? 'DRIFT' : 'STABLE'],
      });

      const completed = await this.prisma.strategyReviewCycle.update({
        where: { id: review.id },
        data: {
          status: StrategyReviewStatus.COMPLETED,
          completedAt: new Date(),
          driftDetected,
          warningSignals: warningSignals as any,
          gapsIdentified: gapsIdentified as any,
          recommendationCount: warningSignals.length + gapsIdentified.length,
          escalationCount,
          summary: { state: { activeObjectives: state.activeObjectives, activeInitiatives: state.activeInitiatives, openRisks: state.openRisks }, driftDetected } as any,
        },
      });

      await this.audit.record({ companyId, actorId, action: 'STRATEGY_REVIEW_COMPLETED', objectType: 'StrategyReviewCycle', objectId: review.id, newValue: { driftDetected, warningSignals } });
      return completed;

    } catch (error) {
      await this.prisma.strategyReviewCycle.update({
        where: { id: review.id },
        data: { status: StrategyReviewStatus.FAILED, completedAt: new Date(), error: String(error) },
      });
      throw error;
    }
  }

  async getReviews(companyId: string) {
    return this.prisma.strategyReviewCycle.findMany({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OodaPhase } from '@prisma/client';
import { ActionDispatchService } from './action-dispatch.service';

@Injectable()
export class OperatingLoopService {
  private readonly logger = new Logger(OperatingLoopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionDispatch: ActionDispatchService,
  ) {}

  async startCycle(companyId: string, trigger: string) {
    return this.prisma.operatingLoopCycle.create({
      data: { companyId, trigger, phase: OodaPhase.OBSERVE },
    });
  }

  async observe(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const companyId = cycle.companyId;

    const [health, kpis, alerts, recentDecisions, agentPerf, opportunities] = await Promise.all([
      this.prisma.companyHealthSnapshot.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.companyKPI.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      this.prisma.operationalAlert.findMany({ where: { companyId, status: 'ACTIVE' }, take: 10 }),
      this.prisma.decisionProposal.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.employeePerformance.findMany({
        include: { employee: { select: { name: true, status: true } } },
        where: { employee: { companyId } },
        take: 20,
      }),
      this.prisma.companyOpportunity.findMany({ where: { companyId, status: 'IDENTIFIED' }, take: 10 }),
    ]);

    const observations = {
      health: health ? { financial: health.financialScore, sales: health.salesScore, marketing: health.marketingScore, workforce: health.workforceScore, operations: health.operationsScore, customer: health.customerScore, overall: health.status } : null,
      kpiSummary: kpis.map(k => ({ name: k.name, current: k.currentValue, target: k.target, status: k.status, trend: k.trend })),
      activeAlerts: alerts.length,
      recentDecisions: recentDecisions.map(d => ({ title: d.title, status: d.status, impact: d.impactLevel })),
      agentPerformance: agentPerf.map(p => ({ name: p.employee.name, completed: p.tasksCompleted, late: p.tasksLate, quality: p.qualityScore, productivity: p.productivityScore })),
      openOpportunities: opportunities.length,
      collectedAt: new Date().toISOString(),
    };

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: { observations: observations as any, phase: OodaPhase.THINK },
    });
  }

  async think(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const obs = cycle.observations as any;

    // Deterministic analysis — no LLM call needed for structured signal processing
    const issues: string[] = [];
    const strengths: string[] = [];

    if (obs.health) {
      const h = obs.health;
      if (h.financial < 40) issues.push('Financial health critical');
      if (h.sales < 40) issues.push('Sales pipeline weak');
      if (h.workforce < 40) issues.push('Workforce issues detected');
      if (h.financial > 70) strengths.push('Strong financial position');
      if (h.sales > 70) strengths.push('Healthy sales pipeline');
    }

    const atRiskKpis = (obs.kpiSummary || []).filter((k: any) => k.status === 'AT_RISK' || k.status === 'CRITICAL');
    if (atRiskKpis.length > 0) issues.push(`${atRiskKpis.length} KPIs at risk or critical`);

    const lowPerformers = (obs.agentPerformance || []).filter((a: any) => a.quality < 50);
    if (lowPerformers.length > 0) issues.push(`${lowPerformers.length} agents with low quality scores`);

    if (obs.activeAlerts > 5) issues.push(`${obs.activeAlerts} unresolved alerts`);
    if (obs.openOpportunities > 0) strengths.push(`${obs.openOpportunities} opportunities identified`);

    // Retrieve relevant memories
    const memories = await this.prisma.organizationalMemory.findMany({
      where: { companyId: cycle.companyId, isArchived: false, memoryType: 'LESSON' },
      orderBy: { relevanceScore: 'desc' },
      take: 5,
    });

    const analysis = {
      issues,
      strengths,
      atRiskKpis: atRiskKpis.map((k: any) => k.name),
      lowPerformers: lowPerformers.map((a: any) => a.name),
      relevantLessons: memories.map(m => ({ subject: m.subject, content: m.content })),
      biggestBottleneck: issues[0] || 'No critical issues detected',
      analyzedAt: new Date().toISOString(),
    };

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: { analysis: analysis as any, phase: OodaPhase.DECIDE },
    });
  }

  async decide(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const analysis = cycle.analysis as any;

    // Generate options based on the biggest bottleneck
    const options: any[] = [];
    const bottleneck = analysis.biggestBottleneck;

    if (bottleneck.includes('Financial')) {
      options.push(
        { title: 'Cut non-essential spending', impact: 'HIGH', effort: 'LOW', risk: 'LOW' },
        { title: 'Accelerate sales pipeline', impact: 'HIGH', effort: 'MEDIUM', risk: 'MEDIUM' },
        { title: 'Seek chairman funding', impact: 'HIGH', effort: 'LOW', risk: 'LOW' },
      );
    } else if (bottleneck.includes('Sales')) {
      options.push(
        { title: 'Increase lead generation radius', impact: 'MEDIUM', effort: 'LOW', risk: 'LOW' },
        { title: 'Add sales agent', impact: 'HIGH', effort: 'MEDIUM', risk: 'MEDIUM' },
        { title: 'Improve outreach scripts', impact: 'MEDIUM', effort: 'LOW', risk: 'LOW' },
      );
    } else if (bottleneck.includes('Workforce') || bottleneck.includes('agents')) {
      options.push(
        { title: 'Retrain underperforming agents', impact: 'MEDIUM', effort: 'MEDIUM', risk: 'LOW' },
        { title: 'Reassign agent workloads', impact: 'MEDIUM', effort: 'LOW', risk: 'LOW' },
      );
    } else if (bottleneck.includes('KPI')) {
      options.push(
        { title: 'Focus resources on at-risk KPIs', impact: 'HIGH', effort: 'MEDIUM', risk: 'LOW' },
        { title: 'Adjust KPI targets to realistic levels', impact: 'LOW', effort: 'LOW', risk: 'LOW' },
      );
    } else {
      options.push(
        { title: 'Continue current operations', impact: 'LOW', effort: 'LOW', risk: 'LOW' },
        { title: 'Explore new opportunities', impact: 'MEDIUM', effort: 'MEDIUM', risk: 'MEDIUM' },
      );
    }

    // Pick highest impact, lowest effort as recommendation
    const sorted = [...options].sort((a, b) => {
      const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 } as any;
      const effortOrder = { LOW: 3, MEDIUM: 2, HIGH: 1 } as any;
      return (impactOrder[b.impact] + effortOrder[b.effort]) - (impactOrder[a.impact] + effortOrder[a.effort]);
    });
    const recommendation = sorted[0];
    const needsChairman = recommendation.impact === 'HIGH' && recommendation.risk !== 'LOW';

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: {
        options: options as any,
        recommendation: recommendation as any,
        phase: needsChairman ? OodaPhase.ASK_CHAIRMAN : OodaPhase.EXECUTE,
      },
    });
  }

  async recordChairmanVerdict(cycleId: string, verdict: 'APPROVED' | 'REJECTED') {
    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: {
        chairmanVerdict: verdict,
        phase: verdict === 'APPROVED' ? OodaPhase.EXECUTE : OodaPhase.FAILED,
        ...(verdict === 'REJECTED' ? { completedAt: new Date(), error: 'Chairman rejected recommendation' } : {}),
      },
    });
  }

  async execute(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const recommendation = cycle.recommendation as any;

    if (!recommendation?.title) {
      return this.prisma.operatingLoopCycle.update({
        where: { id: cycleId },
        data: { execution: { action: 'No action', dispatched: false, executedAt: new Date().toISOString() } as any, phase: OodaPhase.MEASURE },
      });
    }

    const result = await this.actionDispatch.dispatch(cycle.companyId, recommendation);
    this.logger.log(`OODA execute [${cycleId}]: ${result.service} dispatched=${result.dispatched}`);

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: { execution: result as any, phase: OodaPhase.MEASURE },
    });
  }

  async measure(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const companyId = cycle.companyId;

    const [kpis, health] = await Promise.all([
      this.prisma.companyKPI.findMany({ where: { companyId }, take: 10 }),
      this.prisma.companyHealthSnapshot.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const measurements = {
      postExecutionKpis: kpis.map(k => ({ name: k.name, value: k.currentValue, status: k.status })),
      healthScore: health?.status || 'UNKNOWN',
      measuredAt: new Date().toISOString(),
    };

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: { measurements: measurements as any, phase: OodaPhase.LEARN },
    });
  }

  async learn(cycleId: string) {
    const cycle = await this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const companyId = cycle.companyId;
    const recommendation = cycle.recommendation as any;
    const analysis = cycle.analysis as any;

    const execution = cycle.execution as any;
    const lessons = [
      {
        trigger: cycle.trigger,
        bottleneck: analysis?.biggestBottleneck,
        action: recommendation?.title,
        dispatched: execution?.dispatched ?? false,
        service: execution?.service ?? 'unknown',
        outcome: execution?.dispatched ? 'EXECUTED' : 'NOT_DISPATCHED',
        learnedAt: new Date().toISOString(),
      },
    ];

    // Store lesson in organizational memory
    try {
      const ceo = await this.prisma.employee.findFirst({
        where: { companyId, agent: { isNot: null } },
        orderBy: { createdAt: 'asc' },
      });
      if (ceo) {
        await this.prisma.organizationalMemory.create({
          data: {
            companyId,
            memoryType: 'LESSON',
            subject: `OODA cycle: ${cycle.trigger}`,
            content: `Bottleneck: ${analysis?.biggestBottleneck}. Action: ${recommendation?.title}. Dispatched: ${execution?.dispatched ?? false}. Service: ${execution?.service ?? 'none'}.`,
            tags: ['ooda', 'auto-learned'] as any,
            recordedBy: ceo.id,
            relevanceScore: 60,
          },
        });
      }
    } catch (e) {
      this.logger.warn(`Failed to store lesson in memory: ${(e as Error).message}`);
    }

    return this.prisma.operatingLoopCycle.update({
      where: { id: cycleId },
      data: {
        lessons: lessons as any,
        phase: OodaPhase.COMPLETE,
        completedAt: new Date(),
      },
    });
  }

  /** Run a full OODA cycle end-to-end (for the business loop to call). */
  async runFullCycle(companyId: string, trigger: string) {
    const cycle = await this.startCycle(companyId, trigger);
    try {
      await this.observe(cycle.id);
      await this.think(cycle.id);
      const decided = await this.decide(cycle.id);
      // If it needs chairman approval, stop here — the chairman endpoint will continue it
      if ((decided as any).phase === 'ASK_CHAIRMAN') return decided;
      await this.execute(cycle.id);
      await this.measure(cycle.id);
      await this.learn(cycle.id);
      return this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    } catch (e) {
      this.logger.error(`OODA cycle failed: ${(e as Error).message}`);
      return this.prisma.operatingLoopCycle.update({
        where: { id: cycle.id },
        data: { phase: OodaPhase.FAILED, error: (e as Error).message, completedAt: new Date() },
      });
    }
  }

  async listCycles(companyId: string, limit = 20) {
    return this.prisma.operatingLoopCycle.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getCycle(id: string) {
    return this.prisma.operatingLoopCycle.findUniqueOrThrow({ where: { id } });
  }

  async getPendingApprovals(companyId: string) {
    return this.prisma.operatingLoopCycle.findMany({
      where: { companyId, phase: OodaPhase.ASK_CHAIRMAN },
      orderBy: { createdAt: 'desc' },
    });
  }
}

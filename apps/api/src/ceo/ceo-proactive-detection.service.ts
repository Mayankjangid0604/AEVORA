import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignificanceFilterService } from '../enterprise-brain/significance-filter.service';
import { CeoOperationalContext, ProactiveDetectionSignal, DetectionDimension } from './ceo-core.types';
import { CeoDecisionCategory, CeoDecisionRiskLevel } from '@prisma/client';

@Injectable()
export class CeoProactiveDetectionService {
  private readonly logger = new Logger(CeoProactiveDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly significanceFilter: SignificanceFilterService,
  ) {}

  /**
   * Evaluates assembled CEO operational context across 8 proactive detection dimensions:
   * 1. PROBLEMS
   * 2. RISKS
   * 3. OPPORTUNITIES
   * 4. BOTTLENECKS
   * 5. OBJECTIVE_FAILURES
   * 6. KPI_DETERIORATION
   * 7. RESOURCE_CONSTRAINTS
   * 8. EMERGING_STRATEGIC_ISSUES
   */
  async detectSignals(context: CeoOperationalContext): Promise<ProactiveDetectionSignal[]> {
    const signals: ProactiveDetectionSignal[] = [];
    const { companyId } = context;

    // 1. PROBLEMS: Overdue tasks and delayed projects
    if (context.activeWork.overdueTasks > 0) {
      const signal = this.createSignal({
        companyId,
        dimension: 'PROBLEMS',
        title: `${context.activeWork.overdueTasks} Overdue High-Priority Tasks Detected`,
        description: `Operational bottleneck: Multiple critical execution tasks have passed their deadline without completion.`,
        severity: context.activeWork.overdueTasks >= 5 ? 'HIGH' : 'MEDIUM',
        urgency: 'HIGH',
        category: 'OPERATIONS',
        evidence: { overdueTaskCount: context.activeWork.overdueTasks },
        recommendedAction: 'Escalate overdue task priorities and reassign unblocked workers.',
      });
      signals.push(signal);
    }

    // 2. RISKS: Active critical or high company risks
    const criticalRisks = context.risks.filter((r) => r.severity === 'CRITICAL' || r.score >= 16);
    for (const risk of criticalRisks) {
      const signal = this.createSignal({
        companyId,
        dimension: 'RISKS',
        title: `Strategic Threat: ${risk.title}`,
        description: `High-impact corporate risk requires CEO evaluation and mitigation deployment.`,
        severity: 'CRITICAL',
        urgency: 'HIGH',
        category: 'OPERATIONS',
        targetEntityType: 'COMPANY_RISK',
        targetEntityId: risk.id,
        evidence: { riskId: risk.id, score: risk.score, severity: risk.severity },
        recommendedAction: 'Formulate mitigation strategy or escalate to Chairman if impact exceeds operational limits.',
      });
      signals.push(signal);
    }

    // 3. OPPORTUNITIES: Stale opportunities or unharvested pipeline value
    const availableOpps = context.opportunities.filter((o) => o.status === 'IDENTIFIED' || o.status === 'EVALUATING');
    if (availableOpps.length > 0) {
      const signal = this.createSignal({
        companyId,
        dimension: 'OPPORTUNITIES',
        title: `${availableOpps.length} High-Potential Business Opportunities Ready for Pursuit`,
        description: `Identified commercial opportunities awaiting executive action and resource allocation.`,
        severity: 'LOW',
        urgency: 'MEDIUM',
        category: 'SALES',
        evidence: { count: availableOpps.length, topOpportunities: availableOpps.slice(0, 3).map((o) => o.title) },
        recommendedAction: 'Direct sales leadership to qualify and propose custom client offers.',
      });
      signals.push(signal);
    }

    // 4. BOTTLENECKS: Staffing imbalance or missing leadership
    if (context.resources.departmentCount > 0 && context.resources.headcount === 0) {
      const signal = this.createSignal({
        companyId,
        dimension: 'BOTTLENECKS',
        title: 'Severe Workforce Void: Zero Active Personnel Across Departments',
        description: `Company has structured departments but zero active personnel to execute initiatives.`,
        severity: 'CRITICAL',
        urgency: 'IMMEDIATE',
        category: 'WORKFORCE',
        evidence: { departmentCount: context.resources.departmentCount, headcount: 0 },
        recommendedAction: 'Initiate automated hiring for department leads and core execution agents.',
      });
      signals.push(signal);
    }

    // 5. OBJECTIVE_FAILURES: Blocked or lagging strategic objectives
    const failingObjectives = context.objectives.strategic.filter(
      (o) => o.status === 'BLOCKED' || (o.status === 'IN_PROGRESS' && o.progress < 25)
    );
    for (const obj of failingObjectives) {
      const signal = this.createSignal({
        companyId,
        dimension: 'OBJECTIVE_FAILURES',
        title: `Strategic Objective Impediment: ${obj.title}`,
        description: `Strategic objective status is ${obj.status} with low execution progress (${obj.progress}%).`,
        severity: 'HIGH',
        urgency: 'HIGH',
        category: 'OPERATIONS',
        targetEntityType: 'COMPANY_OBJECTIVE',
        targetEntityId: obj.id,
        evidence: { objectiveId: obj.id, status: obj.status, progress: obj.progress },
        recommendedAction: 'Trigger strategic replanning and unblock departmental dependencies.',
      });
      signals.push(signal);
    }

    // 6. KPI_DETERIORATION: Underperforming key metrics
    const laggingKpis = context.kpis.filter((k) => k.status === 'AT_RISK' || (k.targetValue > 0 && k.currentValue < k.targetValue * 0.5));
    for (const kpi of laggingKpis) {
      const signal = this.createSignal({
        companyId,
        dimension: 'KPI_DETERIORATION',
        title: `KPI Underperformance: ${kpi.name}`,
        description: `Current KPI value (${kpi.currentValue}) lags significantly behind target (${kpi.targetValue}).`,
        severity: 'MEDIUM',
        urgency: 'MEDIUM',
        category: 'KPI',
        targetEntityType: 'COMPANY_KPI',
        targetEntityId: kpi.id,
        evidence: { kpiId: kpi.id, current: kpi.currentValue, target: kpi.targetValue },
        recommendedAction: 'Dispatch corrective task to KPI owner for root-cause diagnosis.',
      });
      signals.push(signal);
    }

    // 7. RESOURCE_CONSTRAINTS: Depleted capital or cash reserves
    if (context.resources.acWalletBalance <= 1000 && context.resources.realMoneyBalance <= 1000) {
      const signal = this.createSignal({
        companyId,
        dimension: 'RESOURCE_CONSTRAINTS',
        title: 'Capital Reserves Critical: Operating Cash Below Safety Buffer',
        description: `Total liquid reserves have dropped below minimum threshold for uninterrupted operations.`,
        severity: 'CRITICAL',
        urgency: 'IMMEDIATE',
        category: 'FINANCE',
        evidence: { acBalance: context.resources.acWalletBalance, realBalance: context.resources.realMoneyBalance },
        recommendedAction: 'Freeze discretionary spending and request Chairman capital allocation review.',
      });
      signals.push(signal);
    }

    // 8. EMERGING_STRATEGIC_ISSUES: Enterprise Brain discrepancies & data conflicts
    if (context.uncertaintyContext.hasDiscrepancy) {
      const count = context.uncertaintyContext.unresolvedDiscrepancies.length;
      const signal = this.createSignal({
        companyId,
        dimension: 'EMERGING_STRATEGIC_ISSUES',
        title: `Enterprise Data Inconsistency: ${count} Authoritative Discrepancies Flagged`,
        description: `The Enterprise Brain identified conflicting facts between enterprise sources. Facts must be investigated rather than fabricated.`,
        severity: 'HIGH',
        urgency: 'HIGH',
        category: 'FINANCE',
        evidence: {
          discrepancyCount: count,
          discrepancies: context.uncertaintyContext.unresolvedDiscrepancies.map((d) => ({
            domain: d.domain,
            field: d.field,
            variance: d.variance,
            primary: d.primarySource,
            secondary: d.secondarySource,
            notes: d.uncertaintyNotes,
          })),
        },

        recommendedAction: 'Preserve uncertainty in decisions; audit conflicting records against primary ledger.',
      });
      signals.push(signal);
    }

    return signals;
  }

  private createSignal(params: {
    companyId: string;
    dimension: DetectionDimension;
    title: string;
    description: string;
    severity: CeoDecisionRiskLevel;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
    category: CeoDecisionCategory;
    targetEntityType?: string;
    targetEntityId?: string;
    evidence: Record<string, any>;
    recommendedAction: string;
  }): ProactiveDetectionSignal {
    const id = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Evaluate significance score using SignificanceFilterService
    const evaluation = this.significanceFilter.evaluateEvent({
      domain: 'CEO_PROACTIVE_DETECTION',
      entityType: params.targetEntityType ?? 'COMPANY',
      entityId: params.targetEntityId ?? params.companyId,
      title: params.title,
      riskLevel: params.severity,
      financialImpact: params.evidence.amount ?? (params.severity === 'CRITICAL' ? 500000 : 50000),
      isStrategicObjectiveImpact: params.dimension === 'OBJECTIVE_FAILURES' || params.dimension === 'EMERGING_STRATEGIC_ISSUES',
      urgency: params.urgency === 'IMMEDIATE' ? 'CRITICAL' : params.urgency,
      operationalBlockedCount: params.dimension === 'BOTTLENECKS' || params.dimension === 'PROBLEMS' ? 3 : 0,
    });

    return {
      id,
      companyId: params.companyId,
      dimension: params.dimension,
      title: params.title,
      description: params.description,
      severity: params.severity,
      urgency: params.urgency,
      category: params.category,
      targetEntityType: params.targetEntityType,
      targetEntityId: params.targetEntityId,
      evidence: params.evidence,
      recommendedAction: params.recommendedAction,
      significanceScore: evaluation.score,
      significanceTier: evaluation.tier,
      requiresChairmanEscalation: evaluation.escalateToChairman,
    };
  }
}

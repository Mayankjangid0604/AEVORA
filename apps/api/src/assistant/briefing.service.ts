import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStateService, CompanyStateSnapshot } from '../management/company-state.service';
import { SalesPipelineService, PipelineMetrics } from '../sales/sales-pipeline.service';

// ── Priority classification (deterministic, no AI scoring) ──

export type BriefingPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export interface BriefingItem {
  priority: BriefingPriority;
  category: string;
  title: string;
  detail?: string;
  entityType?: string;
  entityId?: string;
}

export interface ExecutiveBriefing {
  summary: string;
  criticalItems: BriefingItem[];
  highPriorityItems: BriefingItem[];
  sales: { leads: number; qualified: number; openOpportunities: number; staleOpportunities: number; pipelineValue: number; wonDeals: number; lostDeals: number };
  finance: { balance: number; totalRevenue: number; openInvoices: number; recentPayments: number; failedPayments: number };
  people: { active: number; departments: number; blockedTasks: number; overdueTasks: number };
  operations: { activeProjects: number; blockedProjects: number; overdueTaskCount: number; activeAlerts: number };
  kpis?: { total: number; onTrack: number; atRisk: number; offTrack: number; critical: number };
  performance?: { criticalEmployees: number; decliningPerformance: number; majorImprovement: number; departmentLeadershipHealth: string };
  succession?: { criticalRolesWithoutSuccessor: number; highRiskRoles: number; readySuccessors: number; pendingReplacementRecommendations: number };
  decisions: { pendingApprovals: number; pendingDecisions: number; highRiskCommands: number };
  recentActivity: { recentCommands: number; recentAssistantMessages: number; recentCeoDecisions: number };
  generatedAt: string;
}

export function classifyBriefingPriority(signal: string): BriefingPriority {
  switch (signal) {
    case 'critical_alert': case 'failed_payment': case 'ceo_escalation': return 'CRITICAL';
    case 'pending_approval': case 'high_risk_command': case 'blocked_project': case 'overdue_task': return 'HIGH';
    case 'stale_opportunity': case 'pending_decision': case 'unresolved_alert': return 'MEDIUM';
    case 'new_lead': case 'completed_project': case 'recent_hire': return 'LOW';
    default: return 'INFORMATIONAL';
  }
}

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companyState: CompanyStateService,
    private readonly salesPipeline: SalesPipelineService,
  ) {}

  async generateBriefing(companyId: string, period?: string): Promise<ExecutiveBriefing> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      state,
      pipeline,
      pendingApprovals,
      pendingDecisions,
      highRiskCommands,
      activeAlerts,
      criticalAlerts,
      failedPayments,
      recentCommands,
      recentMessages,
      recentCeoDecisions,
      overdueTasks,
      blockedTasks,
      staleOpps,
      qualifiedLeads,
    ] = await Promise.all([
      this.companyState.collectState(companyId),
      this.salesPipeline.getPipelineMetrics(companyId).catch(() => null),
      this.prisma.chairmanCommand.findMany({ where: { companyId, status: 'AWAITING_APPROVAL' }, select: { id: true, naturalLanguage: true, riskLevel: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []),
      this.prisma.managementDecision.findMany({ where: { companyId, status: 'PROPOSED' }, select: { id: true, title: true, type: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []),
      this.prisma.chairmanCommand.count({ where: { companyId, riskLevel: 'HIGH', status: { in: ['AWAITING_APPROVAL', 'EXECUTING'] } } }).catch(() => 0),
      this.prisma.operationalAlert.findMany({ where: { companyId, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } }, select: { id: true, severity: true, category: true, title: true, description: true }, orderBy: { severity: 'desc' }, take: 20 }).catch(() => []),
      this.prisma.operationalAlert.findMany({ where: { companyId, severity: 'CRITICAL', status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } }, select: { id: true, title: true, description: true }, take: 10 }).catch(() => []),
      this.prisma.paymentEvent.count({ where: { companyId, status: 'FAILED', createdAt: { gte: oneDayAgo } } }).catch(() => 0),
      this.prisma.chairmanCommand.count({ where: { companyId, createdAt: { gte: oneDayAgo } } }).catch(() => 0),
      this.prisma.assistantMessage.count({ where: { companyId, createdAt: { gte: oneDayAgo } } }).catch(() => 0),
      this.prisma.managementDecision.count({ where: { companyId, createdAt: { gte: oneDayAgo } } }).catch(() => 0),
      this.prisma.task.count({ where: { companyId, status: 'IN_PROGRESS', dueAt: { lt: now } } }).catch(() => 0),
      this.prisma.task.count({ where: { companyId, status: 'BLOCKED' } }).catch(() => 0),
      this.salesPipeline.getStaleOpportunities(companyId).catch(() => []),
      this.prisma.salesLead.count({ where: { companyId, status: 'QUALIFIED' } }).catch(() => 0),
    ]);

    let dateFilter: Date | undefined;
    if (period === 'today') dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === 'week') dateFilter = new Date(now.getTime() - 7 * 86_400_000);
    else if (period === 'month') dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);

    const account = await this.prisma.realMoneyAccount.findUnique({
      where: { companyId },
      include: { transactions: { where: { referenceType: 'CLIENT_PAYMENT', ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}) } } }
    });
    const periodRevenue = account?.transactions.reduce((s, t) => s + t.amount, 0) ?? 0;

    const recentPayments = await this.prisma.paymentEvent.count({ where: { companyId, status: 'COMPLETED', createdAt: { gte: oneDayAgo } } }).catch(() => 0);

    // Build priority items
    const items: BriefingItem[] = [];

    for (const a of criticalAlerts) {
      items.push({ priority: 'CRITICAL', category: 'alert', title: a.title ?? 'Critical Alert', detail: a.description ?? undefined, entityType: 'OperationalAlert', entityId: a.id });
    }
    if (failedPayments > 0) {
      items.push({ priority: 'CRITICAL', category: 'finance', title: `${failedPayments} failed payment${failedPayments > 1 ? 's' : ''} in the last 24 hours` });
    }
    for (const cmd of pendingApprovals) {
      items.push({ priority: 'HIGH', category: 'approval', title: `Awaiting approval: ${(cmd.naturalLanguage ?? '').slice(0, 60)}`, detail: `Risk: ${cmd.riskLevel}`, entityType: 'ChairmanCommand', entityId: cmd.id });
    }
    if (state.projects.blocked > 0) {
      items.push({ priority: 'HIGH', category: 'operations', title: `${state.projects.blocked} blocked project${state.projects.blocked > 1 ? 's' : ''}` });
    }
    if (overdueTasks > 0) {
      items.push({ priority: 'HIGH', category: 'operations', title: `${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}` });
    }
    if (state.kpis?.critical > 0) {
      items.push({ priority: 'CRITICAL', category: 'kpi', title: `${state.kpis.critical} critical KPI${state.kpis.critical > 1 ? 's' : ''} failing` });
    }
    if (state.kpis?.offTrack > 0) {
      items.push({ priority: 'HIGH', category: 'kpi', title: `${state.kpis.offTrack} KPI${state.kpis.offTrack > 1 ? 's' : ''} off track` });
    }
    for (const d of pendingDecisions) {
      items.push({ priority: 'MEDIUM', category: 'decision', title: `Pending decision: ${(d.title ?? '').slice(0, 60)}`, entityType: 'ManagementDecision', entityId: d.id });
    }
    for (const a of activeAlerts.filter(a => a.severity !== 'CRITICAL')) {
      items.push({ priority: 'MEDIUM', category: 'alert', title: `[${a.severity}] ${a.title ?? 'Alert'}`, detail: a.description ?? undefined, entityType: 'OperationalAlert', entityId: a.id });
    }
    if (staleOpps.length > 0) {
      items.push({ priority: 'MEDIUM', category: 'sales', title: `${staleOpps.length} stale opportunit${staleOpps.length > 1 ? 'ies' : 'y'} (>14 days no activity)` });
    }
    if (blockedTasks > 0) {
      items.push({ priority: 'MEDIUM', category: 'operations', title: `${blockedTasks} blocked task${blockedTasks > 1 ? 's' : ''}` });
    }

    // Sort: CRITICAL first, then HIGH, MEDIUM, LOW, INFORMATIONAL
    const priorityOrder: Record<BriefingPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const criticalItems = items.filter(i => i.priority === 'CRITICAL');
    const highPriorityItems = items.filter(i => i.priority === 'HIGH');

    // Build summary
    const summaryParts: string[] = [];
    if (criticalItems.length) summaryParts.push(`${criticalItems.length} critical item${criticalItems.length > 1 ? 's' : ''} require immediate attention`);
    if (highPriorityItems.length) summaryParts.push(`${highPriorityItems.length} high-priority item${highPriorityItems.length > 1 ? 's' : ''}`);
    if (pendingApprovals.length) summaryParts.push(`${pendingApprovals.length} pending approval${pendingApprovals.length > 1 ? 's' : ''}`);
    if (!summaryParts.length) summaryParts.push('No critical issues. Company operations are running normally');

    return {
      summary: summaryParts.join('. ') + '.',
      criticalItems,
      highPriorityItems,
      sales: {
        leads: state.sales.totalLeads,
        qualified: qualifiedLeads,
        openOpportunities: state.sales.openOpportunities,
        staleOpportunities: pipeline?.staleOpportunities ?? staleOpps.length,
        pipelineValue: pipeline?.weightedPipelineValue ?? 0,
        wonDeals: state.sales.closedWon,
        lostDeals: state.sales.closedLost,
      },
      finance: {
        balance: state.finance.acBalance,
        totalRevenue: periodRevenue || state.finance.totalRevenue,
        openInvoices: state.finance.openInvoices,
        recentPayments,
        failedPayments,
      },
      people: {
        active: state.workforce.activeEmployees,
        departments: state.workforce.departments,
        blockedTasks,
        overdueTasks,
      },
      operations: {
        activeProjects: state.projects.active,
        blockedProjects: state.projects.blocked,
        overdueTaskCount: overdueTasks,
        activeAlerts: activeAlerts.length,
      },
      kpis: state.kpis ? {
        total: state.kpis.total,
        onTrack: state.kpis.onTrack,
        atRisk: state.kpis.atRisk,
        offTrack: state.kpis.offTrack,
        critical: state.kpis.critical,
      } : undefined,
      performance: state.performance ? {
        criticalEmployees: state.performance.critical,
        decliningPerformance: state.performance.declining,
        majorImprovement: state.performance.exceptional,
        departmentLeadershipHealth: state.performance.underperforming > 0 ? 'NEEDS ATTENTION' : 'STABLE',
      } : undefined,
      succession: state.succession ? {
        criticalRolesWithoutSuccessor: state.succession.rolesWithoutSuccessor,
        highRiskRoles: state.succession.highRiskRoles,
        readySuccessors: state.succession.readySuccessors,
        pendingReplacementRecommendations: state.succession.pendingRecommendations,
      } : undefined,
      decisions: {
        pendingApprovals: pendingApprovals.length,
        pendingDecisions: pendingDecisions.length,
        highRiskCommands,
      },
      recentActivity: {
        recentCommands,
        recentAssistantMessages: recentMessages,
        recentCeoDecisions,
      },
      generatedAt: now.toISOString(),
    };
  }

  formatBriefingResponse(b: ExecutiveBriefing): string {
    const lines: string[] = ['Executive Briefing'];
    lines.push(`\n${b.summary}`);

    if (b.criticalItems.length) {
      lines.push(`\nCRITICAL (${b.criticalItems.length}):`);
      b.criticalItems.forEach(i => lines.push(`  ⚠ ${i.title}${i.detail ? ` — ${i.detail}` : ''}`));
    }
    if (b.highPriorityItems.length) {
      lines.push(`\nNEEDS ATTENTION (${b.highPriorityItems.length}):`);
      b.highPriorityItems.forEach(i => lines.push(`  • ${i.title}${i.detail ? ` — ${i.detail}` : ''}`));
    }

    lines.push(`\nSales: ${b.sales.leads} leads, ${b.sales.openOpportunities} open opportunities, pipeline ${Math.round(b.sales.pipelineValue).toLocaleString()}, ${b.sales.wonDeals} won / ${b.sales.lostDeals} lost${b.sales.staleOpportunities ? `, ${b.sales.staleOpportunities} stale` : ''}`);
    lines.push(`Finance: Balance ${Math.round(b.finance.balance).toLocaleString()}, Revenue ${Math.round(b.finance.totalRevenue).toLocaleString()}, ${b.finance.openInvoices} open invoices${b.finance.failedPayments ? `, ${b.finance.failedPayments} FAILED payments` : ''}`);
    lines.push(`People: ${b.people.active} active across ${b.people.departments} departments${b.people.blockedTasks ? `, ${b.people.blockedTasks} blocked tasks` : ''}${b.people.overdueTasks ? `, ${b.people.overdueTasks} overdue` : ''}`);
    lines.push(`Operations: ${b.operations.activeProjects} active projects${b.operations.blockedProjects ? `, ${b.operations.blockedProjects} blocked` : ''}, ${b.operations.activeAlerts} alerts`);
    if (b.kpis && b.kpis.total > 0) {
      lines.push(`KPIs: ${b.kpis.total} total, ${b.kpis.onTrack} on track, ${b.kpis.atRisk} at risk, ${b.kpis.offTrack} off track, ${b.kpis.critical} critical`);
    }
    if (b.performance) {
      lines.push(`Performance: ${b.performance.criticalEmployees} critical, ${b.performance.decliningPerformance} declining, ${b.performance.majorImprovement} exceptional, Leadership Health: ${b.performance.departmentLeadershipHealth}`);
    }
    if (b.succession) {
      lines.push(`Succession: ${b.succession.criticalRolesWithoutSuccessor} vacant critical roles, ${b.succession.highRiskRoles} high risk, ${b.succession.readySuccessors} ready successors, ${b.succession.pendingReplacementRecommendations} pending replacements`);
    }
    lines.push(`Decisions: ${b.decisions.pendingApprovals} pending approvals, ${b.decisions.pendingDecisions} pending decisions${b.decisions.highRiskCommands ? `, ${b.decisions.highRiskCommands} high-risk commands` : ''}`);

    if (b.recentActivity.recentCommands || b.recentActivity.recentAssistantMessages || b.recentActivity.recentCeoDecisions) {
      lines.push(`\nLast 24h: ${b.recentActivity.recentCommands} commands, ${b.recentActivity.recentAssistantMessages} assistant messages, ${b.recentActivity.recentCeoDecisions} CEO decisions`);
    }

    return lines.join('\n');
  }

  formatAttentionResponse(b: ExecutiveBriefing): string {
    const actionable = [...b.criticalItems, ...b.highPriorityItems];
    if (!actionable.length) return 'Nothing urgent requires your attention right now. All clear.';

    const lines: string[] = ['Items Requiring Your Attention'];
    if (b.criticalItems.length) {
      lines.push(`\nCRITICAL:`);
      b.criticalItems.forEach(i => lines.push(`  ⚠ ${i.title}${i.detail ? ` — ${i.detail}` : ''}`));
    }
    if (b.highPriorityItems.length) {
      lines.push(`\nHIGH PRIORITY:`);
      b.highPriorityItems.forEach(i => lines.push(`  • ${i.title}${i.detail ? ` — ${i.detail}` : ''}`));
    }
    lines.push(`\nTotal: ${actionable.length} item${actionable.length > 1 ? 's' : ''} need your attention.`);
    return lines.join('\n');
  }
}

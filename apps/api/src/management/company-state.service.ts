import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, TaskStatus } from '@prisma/client';

export interface CompanyStateSnapshot {
  companyId: string;
  snapshotAt: Date;
  lifecycle: {
    status: string;
    productionState: string;
  };
  workforce: {
    totalEmployees: number;
    activeEmployees: number;
    suspendedEmployees: number;
    terminatedEmployees: number;
    departments: number;
  };
  strategicPlanning: {
    activePlan: any;
    planStatus: string;
    planningPeriod: string;
    strategicHealth: string;
    healthReasons: string[];
    objectives: any[];
    objectiveProgress: number;
    atRiskObjectives: number;
    blockedObjectives: number;
    overdueMilestones: number;
    activeInitiatives: number;
    strategicRisks: number;
    criticalRisks: number;
    pendingStrategicDecisions: number;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    blocked: number;
  };
  tasks: {
    total: number;
    inProgress: number;
    blocked: number;
    overdue: number;
  };
  customers: {
    total: number;
    active: number;
  };
  sales: {
    totalLeads: number;
    openOpportunities: number;
    closedWon: number;
    closedLost: number;
  };
  finance: {
    acBalance: number;
    totalRevenue: number;
    openInvoices: number;
    budgets?: any;
  };
  marketing: {
    activeCampaigns: number;
    scheduledContent: number;
  };
  kpis: {
    total: number;
    onTrack: number;
    atRisk: number;
    offTrack: number;
    critical: number;
    companyWide: number;
    departmentBreakdown: Record<string, any>;
    topRisks: any[];
    improving: number;
    declining: number;
  };
  performance?: any;
  succession?: any;
}

@Injectable()
export class CompanyStateService {
  constructor(private readonly prisma: PrismaService) {}

  async collectState(companyId: string): Promise<CompanyStateSnapshot> {
    const now = new Date();

    const [
      company,
      employeeCounts,
      deptCount,
      projectCounts,
      taskCounts,
      clientCount,
      leadCount,
      opportunityCounts,
      acWallet,
      revenueSums,
      invoiceCount,
      campaignCount,
      contentCount,
      activeBudgets,
      strategicPlan,
      pendingStrategicDecisions,
      kpisList,
      recentEvals,
      allSuccessionPlans,
    ] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { status: true, productionState: true } }),
      this.prisma.employee.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.department.count({ where: { companyId } }),
      this.prisma.project.groupBy({ by: ['status'], where: { companyId }, _count: true }).catch(() => []),
      this.prisma.task.groupBy({ by: ['status'], where: { companyId }, _count: true }).catch(() => []),
      this.prisma.client.count({ where: { companyId } }),
      this.prisma.salesLead.count({ where: { companyId } }).catch(() => 0),
      this.prisma.opportunity.groupBy({ by: ['status'], where: { companyId }, _count: true }).catch(() => []),
      this.prisma.aCWallet.findUnique({ where: { companyId } }),
      this.prisma.revenueRecord.aggregate({ where: { companyId }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
      this.prisma.invoice.count({ where: { companyId, status: 'ISSUED' } }).catch(() => 0),
      this.prisma.marketingCampaign.count({ where: { companyId, status: 'ACTIVE' } }).catch(() => 0),
      this.prisma.marketingContent.count({ where: { companyId, status: 'SCHEDULED' } }).catch(() => 0),
      this.prisma.companyBudget.findMany({ where: { companyId, status: 'ACTIVE' }, include: { departmentBudgets: { include: { department: true } } } }),
      this.prisma.strategicPlan.findFirst({
        where: { companyId, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
        include: { objectives: { include: { initiatives: true, milestones: true, risks: true } } }
      }),
      this.prisma.managementDecision.count({
        where: { companyId, type: 'GENERAL', title: { startsWith: 'Strategic Plan Proposal:' }, status: 'PROPOSED' }
      }),
      this.prisma.companyKPI.findMany({
        where: { companyId, isActive: true }
      }),
      this.prisma.performanceEvaluation.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.successionPlan.findMany({
        where: { companyId },
        include: { candidates: true }
      }),
    ]);

    const empByStatus = (status: string) =>
      (employeeCounts.find((e: any) => e.status === status)?._count ?? 0) as number;

    const projectByStatus = (status: string) =>
      ((projectCounts as any[]).find((p: any) => p.status === status)?._count ?? 0) as number;

    const taskByStatus = (status: string) =>
      ((taskCounts as any[]).find((t: any) => t.status === status)?._count ?? 0) as number;

    const oppByStatus = (status: string) =>
      ((opportunityCounts as any[]).find((o: any) => o.status === status)?._count ?? 0) as number;

    let strategicHealth = 'HEALTHY';
    let healthReasons: string[] = ['No active strategic plan'];
    let objectiveProgress = 0;
    let atRiskObjectives = 0;
    let blockedObjectives = 0;
    let overdueMilestones = 0;
    let activeInitiatives = 0;
    let strategicRisks = 0;
    let criticalRisksCount = 0;

    if (strategicPlan) {
      healthReasons = [];
      let totalProgress = 0;
      const objectives = strategicPlan.objectives || [];
      if (objectives.length > 0) {
        objectives.forEach((obj: any) => {
          totalProgress += obj.progress || 0;
          if (obj.status === 'BLOCKED') blockedObjectives++;
          if (obj.targetDate && new Date(obj.targetDate) < now && obj.status !== 'COMPLETED') atRiskObjectives++;
          
          activeInitiatives += (obj.initiatives || []).filter((i: any) => i.status === 'ACTIVE').length;
          overdueMilestones += (obj.milestones || []).filter((m: any) => m.dueDate && new Date(m.dueDate) < now && m.status !== 'COMPLETED').length;
          
          const risks = obj.risks || [];
          strategicRisks += risks.length;
          criticalRisksCount += risks.filter((r: any) => r.impact === 'CRITICAL').length;
        });
        objectiveProgress = Math.round(totalProgress / objectives.length);
      } else {
        healthReasons.push('Plan has no objectives.');
      }

      if (blockedObjectives > 0 || criticalRisksCount > 0) {
        strategicHealth = 'CRITICAL';
        if (blockedObjectives > 0) healthReasons.push(`${blockedObjectives} objective(s) are blocked.`);
        if (criticalRisksCount > 0) healthReasons.push(`${criticalRisksCount} critical risk(s) identified.`);
      } else if (atRiskObjectives > 0 || overdueMilestones > 0) {
        strategicHealth = 'AT_RISK';
        if (atRiskObjectives > 0) healthReasons.push(`${atRiskObjectives} objective(s) are overdue/at risk.`);
        if (overdueMilestones > 0) healthReasons.push(`${overdueMilestones} milestone(s) are overdue.`);
      } else {
        healthReasons.push('All objectives are on track.');
      }
    }

    const kpiState = {
      total: kpisList.length,
      onTrack: 0,
      atRisk: 0,
      offTrack: 0,
      critical: 0,
      companyWide: 0,
      departmentBreakdown: {} as Record<string, any>,
      topRisks: [] as any[],
      improving: 0,
      declining: 0
    };

    kpisList.forEach((k: any) => {
       if (k.status === 'ON_TRACK' || k.status === 'EXCEEDED') kpiState.onTrack++;
       if (k.status === 'AT_RISK') kpiState.atRisk++;
       if (k.status === 'OFF_TRACK') kpiState.offTrack++;
       if (k.status === 'CRITICAL') kpiState.critical++;
       
       if (k.trend === 'IMPROVING') kpiState.improving++;
       if (k.trend === 'DECLINING') kpiState.declining++;
       
       if (!k.departmentId) {
         kpiState.companyWide++;
       } else {
         if (!kpiState.departmentBreakdown[k.departmentId]) {
           kpiState.departmentBreakdown[k.departmentId] = { total: 0, onTrack: 0, atRisk: 0, offTrack: 0, critical: 0 };
         }
         kpiState.departmentBreakdown[k.departmentId].total++;
         if (k.status === 'ON_TRACK' || k.status === 'EXCEEDED') kpiState.departmentBreakdown[k.departmentId].onTrack++;
         if (k.status === 'AT_RISK') kpiState.departmentBreakdown[k.departmentId].atRisk++;
         if (k.status === 'OFF_TRACK') kpiState.departmentBreakdown[k.departmentId].offTrack++;
         if (k.status === 'CRITICAL') kpiState.departmentBreakdown[k.departmentId].critical++;
       }
    });
    kpiState.topRisks = kpisList.filter((k: any) => k.status === 'CRITICAL' || k.status === 'OFF_TRACK').slice(0, 5);

    // PERFORMANCE STATE
    const performance = {
      evaluatedEmployees: new Set(recentEvals.map((e: any) => e.employeeId)).size,
      exceptional: recentEvals.filter((e: any) => e.status === 'EXCEPTIONAL').length,
      strong: recentEvals.filter((e: any) => e.status === 'STRONG').length,
      stable: recentEvals.filter((e: any) => e.status === 'STABLE').length,
      atRisk: recentEvals.filter((e: any) => e.status === 'AT_RISK').length,
      underperforming: recentEvals.filter((e: any) => e.status === 'UNDERPERFORMING').length,
      critical: recentEvals.filter((e: any) => e.status === 'CRITICAL').length,
      declining: 0 // Calculate if needed based on trend
    };

    // SUCCESSION STATE
    const succession = {
      criticalRoles: allSuccessionPlans.length,
      rolesWithoutSuccessor: allSuccessionPlans.filter((p: any) => !p.currentHolderId).length,
      highRiskRoles: allSuccessionPlans.filter((p: any) => p.riskLevel === 'HIGH' || p.riskLevel === 'CRITICAL').length,
      readySuccessors: allSuccessionPlans.reduce((sum, p) => sum + p.candidates.filter((c: any) => c.readiness === 'READY').length, 0),
      pendingRecommendations: 0 // Will be handled elsewhere if needed
    };

    return {
      companyId,
      snapshotAt: now,
      lifecycle: {
        status: company?.status ?? 'UNKNOWN',
        productionState: company?.productionState ?? 'UNKNOWN',
      },
      workforce: {
        totalEmployees: employeeCounts.reduce((s: number, e: any) => s + e._count, 0),
        activeEmployees: empByStatus(EmployeeStatus.ACTIVE),
        suspendedEmployees: empByStatus(EmployeeStatus.SUSPENDED),
        terminatedEmployees: empByStatus(EmployeeStatus.TERMINATED),
        departments: deptCount,
      },
      strategicPlanning: {
        activePlan: strategicPlan ? { id: strategicPlan.id, name: strategicPlan.name } : null,
        planStatus: strategicPlan?.status ?? 'NONE',
        planningPeriod: strategicPlan ? `${strategicPlan.planningPeriodStart?.toISOString().split('T')[0]} to ${strategicPlan.planningPeriodEnd?.toISOString().split('T')[0]}` : '',
        strategicHealth,
        healthReasons,
        objectives: strategicPlan?.objectives ?? [],
        objectiveProgress,
        atRiskObjectives,
        blockedObjectives,
        overdueMilestones,
        activeInitiatives,
        strategicRisks,
        criticalRisks: criticalRisksCount,
        pendingStrategicDecisions,
      },
      projects: {
        total: (projectCounts as any[]).reduce((s, p) => s + p._count, 0),
        active: projectByStatus('ACTIVE') + projectByStatus('IN_PROGRESS'),
        completed: projectByStatus('COMPLETED'),
        blocked: projectByStatus('BLOCKED'),
      },
      tasks: {
        total: (taskCounts as any[]).reduce((s, t) => s + t._count, 0),
        inProgress: taskByStatus(TaskStatus.IN_PROGRESS),
        blocked: taskByStatus(TaskStatus.BLOCKED),
        overdue: 0, // computed separately if needed
      },
      customers: {
        total: clientCount,
        active: clientCount,
      },
      sales: {
        totalLeads: leadCount,
        openOpportunities: oppByStatus('OPEN') + oppByStatus('QUALIFYING') + oppByStatus('NEGOTIATION'),
        closedWon: oppByStatus('CLOSED_WON'),
        closedLost: oppByStatus('CLOSED_LOST'),
      },
      finance: {
        acBalance: acWallet?.balance ?? 0,
        totalRevenue: (revenueSums as any)?._sum?.amount ?? 0,
        openInvoices: invoiceCount,
        budgets: activeBudgets,
      },
      marketing: {
        activeCampaigns: campaignCount,
        scheduledContent: contentCount,
      },
      kpis: kpiState,
      performance,
      succession
    };
  }
}

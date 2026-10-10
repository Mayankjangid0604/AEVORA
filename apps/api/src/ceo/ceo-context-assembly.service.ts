import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseBrainService } from '../enterprise-brain/enterprise-brain.service';
import { CompanyStateService } from '../management/company-state.service';
import { CeoOperationalContext } from './ceo-core.types';
import { DetectedConflict } from '../enterprise-brain/enterprise-brain.types';

@Injectable()
export class CeoContextAssemblyService {
  private readonly logger = new Logger(CeoContextAssemblyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enterpriseBrain: EnterpriseBrainService,
    private readonly companyState: CompanyStateService,
  ) {}

  /**
   * Assembles comprehensive, multi-source operational context for CEO reasoning.
   * Consumes Enterprise Brain as the authoritative derived understanding layer.
   * Strictly enforces company isolation and uncertainty preservation.
   */
  async assembleContext(companyId: string): Promise<CeoOperationalContext> {
    const assembledAt = new Date();
    this.logger.debug(`[${companyId}] Assembling CEO operational context`);

    // 1. Authoritative Derived Understanding from Enterprise Brain
    const brainState = await this.enterpriseBrain.getDerivedEnterpriseState(companyId);

    // 2. Company State Snapshot
    const companySnapshot = await this.companyState.collectState(companyId);


    // 3. Objectives (Strategic, Executive, Departmental)
    const allObjectives = await this.prisma.companyObjective.findMany({
      where: { companyId },
      orderBy: { priority: 'asc' },
    });

    const strategic = allObjectives
      .filter((o) => !o.parentObjectiveId && !o.departmentId)
      .map((o) => ({ id: o.id, title: o.title, priority: o.priority, status: o.status, progress: o.progress }));

    const executive = allObjectives
      .filter((o) => o.parentObjectiveId && !o.departmentId)
      .map((o) => ({ id: o.id, title: o.title, priority: o.priority, status: o.status, progress: o.progress, parentId: o.parentObjectiveId }));

    const departmental = allObjectives
      .filter((o) => !!o.departmentId)
      .map((o) => ({ id: o.id, title: o.title, departmentId: o.departmentId, status: o.status, progress: o.progress }));

    // 4. KPIs
    const kpiRecords = await this.prisma.companyKPI.findMany({
      where: { companyId },
    });

    const kpis = kpiRecords.map((k) => ({
      id: k.id,
      name: k.name,
      targetValue: k.target,
      currentValue: k.currentValue,
      status: k.status,
    }));

    // 5. Risks
    const riskRecords = await this.prisma.companyRisk.findMany({
      where: { companyId, status: { not: 'RESOLVED' } },
      orderBy: { score: 'desc' },
      take: 15,
    });

    const risks = riskRecords.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.impact,
      score: r.score,
      status: r.status,
    }));

    // 6. Opportunities
    const oppRecords = await this.prisma.companyOpportunity.findMany({
      where: { companyId, status: { in: ['IDENTIFIED', 'ANALYZING', 'RECOMMENDED'] } },
      take: 15,
    });

    const opportunities = oppRecords.map((o) => ({
      id: o.id,
      title: o.title,
      type: o.opportunityType,
      status: o.status,
    }));

    // 7. Resources & Financial State
    const [employeeCount, deptCount, acWallet, realMoney, budgetCount] = await Promise.all([
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.department.count({ where: { companyId } }),
      this.prisma.aCWallet.findFirst({ where: { companyId } }),
      this.prisma.realMoneyAccount.findFirst({ where: { companyId } }),
      this.prisma.companyBudget.count({ where: { companyId, status: 'ACTIVE' } }),
    ]);

    const resources = {
      headcount: employeeCount,
      departmentCount: deptCount,
      acWalletBalance: acWallet?.balance ?? 0,
      realMoneyBalance: realMoney?.balance ?? 0,
      activeBudgets: budgetCount,
    };

    // 8. Active Work (Projects and Tasks)
    const now = new Date();
    const [activeProjects, readyTasks, inProgressTasks, overdueTasks] = await Promise.all([
      this.prisma.project.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.task.count({ where: { companyId, status: 'READY' } }),
      this.prisma.task.count({ where: { companyId, status: 'IN_PROGRESS' } }),
      this.prisma.task.count({
        where: {
          companyId,
          status: { in: ['READY', 'IN_PROGRESS'] },
          dueAt: { lt: now },
        },
      }),
    ]);

    const activeWork = {
      activeProjects,
      readyTasks,
      inProgressTasks,
      overdueTasks,
    };

    // 9. Organizational Memory (V16 Slice 5: Relevance-filtered, maturity-aware)
    const rawMemories = await this.prisma.organizationalMemory.findMany({
      where: { companyId, isArchived: false },
      orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
      take: 25,
    });

    const nonDeprecated = rawMemories.filter((m) => {
      const tags = (m.tags as any) || {};
      return tags.maturity !== 'DEPRECATED';
    });

    const organizationalMemory = nonDeprecated.slice(0, 10).map((m) => {
      const tags = (m.tags as any) || {};
      return {
        id: m.id,
        type: m.memoryType,
        subject: m.subject,
        content: m.content,
        relevanceScore: m.relevanceScore,
        maturity: tags.maturity || 'OBSERVATION',
        confidence: tags.confidence ?? m.relevanceScore,
        category: tags.category || 'DECISION',
        evidenceReferences: tags.evidenceReferences || [],
      };
    });

    // 10. Recent Decisions
    const recentDecisionsList = await this.prisma.ceoAutonomousDecision.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentDecisions = recentDecisionsList.map((d) => ({
      id: d.id,
      triggerType: d.triggerType,
      proposedAction: d.proposedAction,
      executionStatus: d.executionStatus,
      createdAt: d.createdAt,
    }));

    // 11. Uncertainty Context Preservation
    const unresolvedDiscrepancies: DetectedConflict[] = (brainState.conflictsDetected || []).filter(
      (d) => !d.isResolved
    );

    const unverifiedSources = (brainState.unresolvedUncertainties || []).slice();

    const hasDiscrepancy = unresolvedDiscrepancies.length > 0;
    const preservedUncertaintyNote = hasDiscrepancy
      ? `ATTENTION: Enterprise Brain identified ${unresolvedDiscrepancies.length} unresolved enterprise discrepancies. Data in affected domains must NOT be treated as definitive facts without verification.`
      : null;


    return {
      companyId,
      assembledAt,
      brainState,
      companySnapshot,
      objectives: {
        strategic,
        executive,
        departmental,
      },
      kpis,
      risks,
      opportunities,
      resources,
      activeWork,
      organizationalMemory,
      recentDecisions,
      uncertaintyContext: {
        hasDiscrepancy,
        unresolvedDiscrepancies,
        unverifiedSources,
        preservedUncertaintyNote,
      },
    };
  }
}

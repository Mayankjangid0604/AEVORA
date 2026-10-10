import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DetectedConflict } from './enterprise-brain.types';

/**
 * SOURCE OF TRUTH HIERARCHY:
 * Level 1 (Apex): Primary Financial Ledger / Bank Accounts / Verified Invoices
 * Level 2: Core Entity State (Direct records in Employee, Task, Company)
 * Level 3: Verified Execution Results (TaskResult, Delivery Records)
 * Level 4: Self-reported / Estimated / Marketing Forecasts
 */
export const SOURCE_OF_TRUTH_HIERARCHY: Record<string, number> = {
  REAL_MONEY_ACCOUNT: 1,
  REVENUE_RECORD: 1,
  INVOICE_LEDGER: 1,
  CORE_EMPLOYEE_RECORD: 2,
  CORE_TASK_RECORD: 2,
  CORE_COMPANY_RECORD: 2,
  TASK_EXECUTION_RESULT: 3,
  PROJECT_STATUS_RECORD: 3,
  GOAL_SELF_REPORTED_PROGRESS: 4,
  CRM_PIPELINE_ESTIMATE: 4,
  MARKETING_FORECAST: 4,
};

@Injectable()
export class ConflictResolutionEngine {
  private readonly logger = new Logger(ConflictResolutionEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates authoritative PostgreSQL tables to detect, reconcile, or surface discrepancies.
   * NEVER fabricates or averages values.
   */
  async detectAndResolveConflicts(companyId: string): Promise<DetectedConflict[]> {
    const conflicts: DetectedConflict[] = [];

    await Promise.all([
      this.checkFinancialDiscrepancies(companyId, conflicts),
      this.checkGoalTaskDiscrepancies(companyId, conflicts),
      this.checkWorkforceDiscrepancies(companyId, conflicts),
      this.checkOpportunityRevenueDiscrepancies(companyId, conflicts),
    ]);

    return conflicts;
  }

  /**
   * Check 1: Financial Reconciliation
   * Primary: RevenueRecord aggregate sum vs Secondary: Issued & Paid Invoice sum
   */
  private async checkFinancialDiscrepancies(companyId: string, out: DetectedConflict[]) {
    try {
      const [revenueAgg, invoiceAgg] = await Promise.all([
        this.prisma.revenueRecord.aggregate({
          where: { companyId },
          _sum: { amount: true },
        }),
        this.prisma.invoice.aggregate({
          where: { companyId, status: 'PAID' },
          _sum: { total: true },
        }),
      ]);

      const revTotal = revenueAgg._sum.amount ?? 0;
      const invTotal = invoiceAgg._sum.total ?? 0;

      // Variance check: if both have records and differ by more than ₹1.00
      if (revTotal > 0 && invTotal > 0 && Math.abs(revTotal - invTotal) > 1.0) {
        // Both are Level 1 (Ledger sources) — if they differ, this is a true unresolvable accounting anomaly!
        out.push({
          id: `conflict-fin-${companyId}-${Date.now()}`,
          companyId,
          domain: 'FINANCE',
          entityType: 'REVENUE_VS_INVOICE',
          entityId: companyId,
          field: 'totalPaidRevenue',
          primarySource: 'REVENUE_RECORD',
          primaryValue: revTotal,
          secondarySource: 'INVOICE_LEDGER',
          secondaryValue: invTotal,
          variance: Math.abs(revTotal - invTotal),
          resolutionStrategy: 'UNRESOLVED_PRESERVE_UNCERTAINTY',
          resolvedValue: null,
          isResolved: false,
          uncertaintyNotes: `Conflict between verified RevenueRecords (₹${revTotal}) and Paid Invoices (₹${invTotal}). Variance: ₹${Math.abs(revTotal - invTotal)}. CEO must not treat either as singular fact until reconciled.`,
          detectedAt: new Date(),
        });
      }
    } catch (e: any) {
      this.logger.warn(`Financial discrepancy check non-fatal error: ${e.message}`);
    }
  }

  /**
   * Check 2: Goal Progress vs Direct Task Realities
   * A Goal reporting 100% or COMPLETED while active tasks are BLOCKED or CANCELLED
   */
  private async checkGoalTaskDiscrepancies(companyId: string, out: DetectedConflict[]) {
    try {
      const goals = await this.prisma.goal.findMany({
        where: { companyId, status: 'COMPLETED' },
        include: {
          tasks: { select: { id: true, status: true, title: true } },
        },
        take: 20,
      });

      for (const goal of goals) {
        const incompleteTasks = goal.tasks.filter((t) => t.status !== 'COMPLETED');
        if (incompleteTasks.length > 0) {
          // Hierarchy rule: Core Task records (Level 2) trump Goal self-reported status (Level 4)
          const primarySourceRank = SOURCE_OF_TRUTH_HIERARCHY.CORE_TASK_RECORD; // 2
          const secondarySourceRank = SOURCE_OF_TRUTH_HIERARCHY.GOAL_SELF_REPORTED_PROGRESS; // 4

          out.push({
            id: `conflict-goal-${goal.id}`,
            companyId,
            domain: 'PROJECTS_GOALS',
            entityType: 'GOAL',
            entityId: goal.id,
            field: 'status',
            primarySource: 'CORE_TASK_RECORD',
            primaryValue: 'INCOMPLETE_OR_BLOCKED_TASKS',
            secondarySource: 'GOAL_SELF_REPORTED_PROGRESS',
            secondaryValue: goal.status,
            resolutionStrategy: 'AUTHORITY_HIERARCHY',
            resolvedValue: 'ACTIVE_REQUIRING_TASK_CLOSURE',
            isResolved: true,
            uncertaintyNotes: `Goal "${goal.title}" marked COMPLETED, but ${incompleteTasks.length} child task(s) are in ${incompleteTasks.map((t) => t.status).join(', ')}. Resolved to Level 2 (Tasks) reality: Goal is functionally incomplete.`,
            detectedAt: new Date(),
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`Goal-task discrepancy check non-fatal error: ${e.message}`);
    }
  }

  /**
   * Check 3: Workforce Headcount Consistency
   * Active employees count vs assigned department counts
   */
  private async checkWorkforceDiscrepancies(companyId: string, out: DetectedConflict[]) {
    try {
      const [totalActive, departments] = await Promise.all([
        this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
        this.prisma.department.findMany({
          where: { companyId },
          include: { _count: { select: { employees: true } } },
        }),
      ]);

      const deptSum = departments.reduce((acc, d) => acc + d._count.employees, 0);

      // If active employees do not match department distribution (e.g. unassigned employees)
      if (totalActive !== deptSum && totalActive > 0) {
        out.push({
          id: `conflict-workforce-${companyId}`,
          companyId,
          domain: 'WORKFORCE',
          entityType: 'COMPANY_WORKFORCE',
          entityId: companyId,
          field: 'employeeDepartmentAlignment',
          primarySource: 'CORE_EMPLOYEE_RECORD',
          primaryValue: totalActive,
          secondarySource: 'DEPARTMENT_AGGREGATE',
          secondaryValue: deptSum,
          variance: Math.abs(totalActive - deptSum),
          resolutionStrategy: 'AUTHORITY_HIERARCHY',
          resolvedValue: totalActive,
          isResolved: true,
          uncertaintyNotes: `Workforce headcount variance: ${totalActive} active employees vs ${deptSum} employees assigned to departments. Resolved to Core Employee Records.`,
          detectedAt: new Date(),
        });
      }
    } catch (e: any) {
      this.logger.warn(`Workforce discrepancy check non-fatal error: ${e.message}`);
    }
  }

  /**
   * Check 4: Pipeline Opportunities marked WON vs Actual Ledger / Delivery
   */
  private async checkOpportunityRevenueDiscrepancies(companyId: string, out: DetectedConflict[]) {
    try {
      const wonOpps = await this.prisma.opportunity.findMany({
        where: { companyId, status: 'WON' },
        take: 20,
      });

      for (const opp of wonOpps) {
        const matchingRevenue = await this.prisma.revenueRecord.count({
          where: { companyId, project: { clientId: opp.clientId } },
        });

        if (matchingRevenue === 0 && (opp.estimatedValue ?? 0) > 0) {
          out.push({
            id: `conflict-opp-${opp.id}`,
            companyId,
            domain: 'SALES_PIPELINE',
            entityType: 'OPPORTUNITY',
            entityId: opp.id,
            field: 'revenueRealization',
            primarySource: 'REVENUE_RECORD',
            primaryValue: 0,
            secondarySource: 'CRM_PIPELINE_ESTIMATE',
            secondaryValue: opp.estimatedValue,
            variance: opp.estimatedValue ?? 0,
            resolutionStrategy: 'AUTHORITY_HIERARCHY',
            resolvedValue: 0,
            isResolved: true,
            uncertaintyNotes: `Opportunity "${opp.title}" marked WON with value ₹${opp.estimatedValue}, but zero verified RevenueRecords exist for this client. Resolved to Financial Ledger (₹0 realized).`,
            detectedAt: new Date(),
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`Opportunity revenue discrepancy check non-fatal error: ${e.message}`);
    }
  }
}

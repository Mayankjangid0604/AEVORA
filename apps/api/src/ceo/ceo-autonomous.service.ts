import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoDecisionCategory, CeoDecisionRiskLevel, CeoDecisionConfidence, CeoDecisionApprovalStatus, CeoDecisionExecutionStatus } from '@prisma/client';
import { TaskService } from '../task/task.service';
import { TaskOrchestratorService } from '../task/task-orchestrator.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { GoalStatus, TaskStatus } from '@prisma/client';
import { chairmanMailer } from '../notifications/chairman-mailer';

interface CeoObservation {
  category: CeoDecisionCategory;
  triggerType: string;
  situation: string;
  observations: string;
  targetEntityType?: string;
  targetEntityId?: string;
  riskLevel: CeoDecisionRiskLevel;
  confidence: CeoDecisionConfidence;
  proposedAction: string;
  reversible: boolean;
  objectiveId?: string;
}

@Injectable()
export class CeoAutonomousService {
  private readonly logger = new Logger(CeoAutonomousService.name);
  private readonly gateway = new ModelGateway();

  constructor(@Inject(forwardRef(() => TaskOrchestratorService)) private readonly taskOrchestrator: TaskOrchestratorService, 
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TaskService)) private readonly tasks: TaskService,
    private readonly workerRegistry: WorkerRegistryService,
  ) {}

  /**
   * Run the CEO Decision Loop for a company.
   */
  async runDecisionLoop(companyId: string, ceoId: string) {
    this.logger.log(`[${companyId}] Starting CEO Autonomous Decision Loop`);
    
    // 1. COLLECT STATE & IDENTIFY RISKS / OPPORTUNITIES
    const candidates = await this.generateDecisionCandidates(companyId);

    const createdDecisions = [];
    
    for (const candidate of candidates) {
      // 2. CHECK DUPLICATES
      const isDuplicate = await this.checkDuplicate(companyId, candidate);
      if (isDuplicate) continue;

      // 3. SCORE / CLASSIFY / CHECK AUTHORITY
      const policyResult = this.evaluatePolicy(candidate);
      
      // 4. RECORD DECISION
      const decision = await this.prisma.ceoAutonomousDecision.create({
        data: {
          companyId,
          ceoId,
          category: candidate.category,
          triggerType: candidate.triggerType,
          situation: candidate.situation,
          observations: candidate.observations,
          reasoningSummary: `Triggered by ${candidate.triggerType}. Policy determined risk: ${candidate.riskLevel}, Reversible: ${candidate.reversible}`,
          targetEntityType: candidate.targetEntityType,
          targetEntityId: candidate.targetEntityId,
          proposedAction: candidate.proposedAction,
          riskLevel: candidate.riskLevel,
          confidence: candidate.confidence,
          requiresApproval: policyResult.requiresApproval,
          approvalStatus: policyResult.requiresApproval ? 'PENDING' : 'NOT_REQUIRED',
          executionStatus: 'PENDING',
          reversible: candidate.reversible,
          objectiveId: candidate.objectiveId,
        }
      });
      createdDecisions.push(decision);

      // 5. EXECUTE OR REQUEST APPROVAL
      if (!policyResult.requiresApproval) {
        await this.executeDecision(decision.id);
      }
    }
    
    return createdDecisions;
  }

  /**
   * Deterministically analyze company state to find actionable observations.
   */
  private async generateDecisionCandidates(companyId: string): Promise<CeoObservation[]> {
    const candidates: CeoObservation[] = [];
    const now = new Date();

    // 1. OVERDUE_HIGH_PRIORITY_TASK
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        companyId,
        status: { in: ['READY', 'IN_PROGRESS'] },
        priority: { in: ['HIGH', 'URGENT'] },
        dueAt: { lt: now },
      },
      include: { assignedEmployee: true },
      take: 5
    });
    
    for (const task of overdueTasks) {
      candidates.push({
        category: 'OPERATIONS',
        triggerType: 'OVERDUE_HIGH_PRIORITY_TASK',
        situation: `High priority task "${task.title}" is overdue.`,
        observations: `Task was due on ${task.dueAt?.toISOString()}. Current status: ${task.status}.`,
        targetEntityType: 'TASK',
        targetEntityId: task.id,
        riskLevel: 'LOW',
        confidence: 'HIGH',
        proposedAction: 'Escalate task priority to URGENT and notify assignee.',
        reversible: true,
      });
    }

    // 2. STALE_HIGH_VALUE_OPPORTUNITY
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const staleOpps = await this.prisma.opportunity.findMany({
      where: {
        companyId,
        status: { in: ['DISCOVERED', 'QUALIFYING', 'PROPOSED', 'APPROVAL_REQUIRED'] },
        estimatedValue: { gte: 10000 },
        updatedAt: { lt: eightDaysAgo }
      },
      take: 5
    });

    for (const opp of staleOpps) {
      candidates.push({
        category: 'SALES',
        triggerType: 'STALE_HIGH_VALUE_OPPORTUNITY',
        situation: `High value opportunity "${opp.title}" ($${opp.estimatedValue}) is stale.`,
        observations: `No activity since ${opp.updatedAt.toISOString()}.`,
        targetEntityType: 'OPPORTUNITY',
        targetEntityId: opp.id,
        riskLevel: 'LOW',
        confidence: 'HIGH',
        proposedAction: 'Create urgent Sales Lead follow-up task.',
        reversible: true,
      });
    }

    // 2.5 BUDGET_THRESHOLDS
    const companyBudgets = await this.prisma.companyBudget.findMany({
      where: { companyId, status: 'ACTIVE' },
    });
    for (const cb of companyBudgets) {
      const util = cb.totalAmount > 0 ? (cb.spentAmount + cb.committedAmount) / cb.totalAmount : 0;
      if (util >= 1.0) {
        candidates.push({
          category: 'FINANCE',
          triggerType: 'COMPANY_BUDGET_OVERRUN',
          situation: `Company Budget "${cb.name || cb.id}" has exceeded its total amount.`,
          observations: `Total: ${cb.totalAmount}, Spent: ${cb.spentAmount}, Reserved: ${cb.committedAmount}`,
          targetEntityType: 'COMPANY_BUDGET',
          targetEntityId: cb.id,
          riskLevel: 'CRITICAL',
          confidence: 'HIGH',
          proposedAction: 'Request emergency Chairman review of company finances.',
          reversible: false,
        });
      } else if (util >= 0.9) {
        candidates.push({
          category: 'FINANCE',
          triggerType: 'COMPANY_BUDGET_THRESHOLD',
          situation: `Company Budget "${cb.name || cb.id}" is nearing exhaustion (${Math.round(util*100)}%).`,
          observations: `Total: ${cb.totalAmount}, Spent: ${cb.spentAmount}, Reserved: ${cb.committedAmount}`,
          targetEntityType: 'COMPANY_BUDGET',
          targetEntityId: cb.id,
          riskLevel: 'HIGH',
          confidence: 'HIGH',
          proposedAction: 'Notify Chairman and pause non-essential department budget increases.',
          reversible: true,
        });
      }
    }

    const deptBudgets = await this.prisma.departmentBudget.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: { department: true }
    });
    for (const db of deptBudgets) {
      const util = db.allocatedAmount > 0 ? (db.spentAmount + db.committedAmount) / db.allocatedAmount : 0;
      if (util >= 1.0) {
        candidates.push({
          category: 'FINANCE',
          triggerType: 'DEPARTMENT_BUDGET_OVERRUN',
          situation: `Department ${db.department?.name} has exceeded its budget allocation.`,
          observations: `Allocated: ${db.allocatedAmount}, Spent: ${db.spentAmount}, Reserved: ${db.committedAmount}`,
          targetEntityType: 'DEPARTMENT_BUDGET',
          targetEntityId: db.id,
          riskLevel: 'HIGH',
          confidence: 'HIGH',
          proposedAction: 'Freeze department spending and notify Chairman.',
          reversible: false,
        });
      }
    }
    
    // 3. PROJECT_DELAY
    const delayedProjects = await this.prisma.project.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        targetEndDate: { lt: now }
      },
      take: 5
    });
    
    for (const project of delayedProjects) {
       candidates.push({
        category: 'PROJECTS',
        triggerType: 'PROJECT_DELAY',
        situation: `Project "${project.name}" is delayed.`,
        observations: `Target end date was ${project.targetEndDate?.toISOString()}.`,
        targetEntityType: 'PROJECT',
        targetEntityId: project.id,
        riskLevel: 'MEDIUM',
        confidence: 'HIGH',
        proposedAction: 'Flag project delayed and request status update from Lead.',
        reversible: true,
      });
    }

    // 4. CRITICAL_OPERATIONAL_ALERT
    const unhandledAlerts = await this.prisma.operationalAlert.findMany({
      where: {
        companyId,
        severity: 'CRITICAL',
        status: 'ACTIVE',
      },
      take: 5
    });
    
    for (const alert of unhandledAlerts) {
      candidates.push({
        category: 'OPERATIONS',
        triggerType: 'CRITICAL_OPERATIONAL_ALERT',
        situation: `Critical alert: ${alert.title}`,
        observations: `Alert raised at ${alert.createdAt.toISOString()}. Message: ${alert.description}`,
        targetEntityType: 'OPERATIONAL_ALERT',
        targetEntityId: alert.id,
        riskLevel: 'HIGH',
        confidence: 'HIGH',
        proposedAction: 'Escalate to Chairman immediately.',
        reversible: false,
      });
    }

    // 5. STRATEGIC PLANNING TRIGGERS
    const activePlan = await this.prisma.strategicPlan.findFirst({
      where: { companyId, status: 'ACTIVE' },
      include: {
        objectives: {
          include: { initiatives: true, milestones: true, risks: true }
        }
      }
    });

    if (activePlan) {
      // 5.1 Plan Deadline Approaching (within 30 days)
      if (activePlan.planningPeriodEnd) {
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (activePlan.planningPeriodEnd <= thirtyDaysFromNow && activePlan.planningPeriodEnd >= now) {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'STRATEGIC_PLAN_DEADLINE_APPROACHING',
            situation: `Strategic Plan "${activePlan.name}" is ending on ${activePlan.planningPeriodEnd.toISOString().split('T')[0]}.`,
            observations: `Plan needs final review or rollover.`,
            targetEntityType: 'STRATEGIC_PLAN',
            targetEntityId: activePlan.id,
            riskLevel: 'LOW',
            confidence: 'HIGH',
            proposedAction: 'Propose starting the next strategic planning cycle.',
            reversible: true,
          });
        }
      }

      for (const obj of activePlan.objectives) {
        // 5.2 Objective Blocked
        if (obj.status === 'CANCELLED') {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'STRATEGIC_OBJECTIVE_BLOCKED',
            situation: `Strategic Objective "${obj.title}" is BLOCKED.`,
            observations: `Progress: ${obj.progress}%. Target Date: ${obj.targetDate?.toISOString().split('T')[0]}.`,
            targetEntityType: 'COMPANY_OBJECTIVE',
            targetEntityId: obj.id,
            objectiveId: obj.id,
            riskLevel: 'HIGH',
            confidence: 'HIGH',
            proposedAction: 'Request emergency unblocking intervention from Chairman.',
            reversible: false,
          });
        }

        // 5.3 Objective At Risk (Overdue)
        if (obj.targetDate && new Date(obj.targetDate) < now && obj.status !== 'COMPLETED') {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'STRATEGIC_OBJECTIVE_AT_RISK',
            situation: `Strategic Objective "${obj.title}" missed its target date.`,
            observations: `Target was ${obj.targetDate.toISOString().split('T')[0]}, current progress ${obj.progress}%.`,
            targetEntityType: 'COMPANY_OBJECTIVE',
            targetEntityId: obj.id,
            objectiveId: obj.id,
            riskLevel: 'MEDIUM',
            confidence: 'HIGH',
            proposedAction: 'Assess objective delays and propose resource reallocation.',
            reversible: true,
          });
        }

        // 5.4 Overdue Milestone
        const overdueMilestones = obj.milestones.filter(m => m.dueDate && new Date(m.dueDate) < now && m.status !== 'COMPLETED');
        for (const m of overdueMilestones) {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'OVERDUE_STRATEGIC_MILESTONE',
            situation: `Milestone "${m.name}" for Objective "${obj.title}" is overdue.`,
            observations: `Due Date: ${m.dueDate?.toISOString().split('T')[0]}. Current Status: ${m.status}.`,
            targetEntityType: 'STRATEGIC_MILESTONE',
            targetEntityId: m.id,
            objectiveId: obj.id,
            riskLevel: 'LOW',
            confidence: 'HIGH',
            proposedAction: 'Follow up with milestone owner to get status update.',
            reversible: true,
          });
        }

        // 5.5 Critical Strategic Risk
        const criticalRisks = obj.risks.filter(r => r.impact === 'CRITICAL' && r.status === 'IDENTIFIED');
        for (const r of criticalRisks) {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'CRITICAL_STRATEGIC_RISK',
            situation: `Critical strategic risk identified: "${r.title}".`,
            observations: `Affects objective: "${obj.title}". Description: ${r.description}`,
            targetEntityType: 'COMPANY_RISK',
            targetEntityId: r.id,
            objectiveId: obj.id,
            riskLevel: 'CRITICAL',
            confidence: 'HIGH',
            proposedAction: 'Request Chairman review of critical risk mitigation strategy.',
            reversible: false,
          });
        }

        // 5.6 Initiative Materially Behind Schedule (Progress low but target date close)
        const behindInitiatives = obj.initiatives.filter(i => {
          if (!i.targetDate || i.status === 'COMPLETED' || i.status === 'CANCELLED') return false;
          const totalDays = i.targetDate.getTime() - i.createdAt.getTime();
          const elapsed = now.getTime() - i.createdAt.getTime();
          const expectedProgress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
          return (expectedProgress - i.progress) > 30; // 30% behind expected schedule
        });
        
        for (const i of behindInitiatives) {
          candidates.push({
            category: 'OPERATIONS',
            triggerType: 'STRATEGIC_INITIATIVE_BEHIND_SCHEDULE',
            situation: `Strategic Initiative "${i.title}" is materially behind schedule.`,
            observations: `Progress: ${i.progress}%, Target Date: ${i.targetDate?.toISOString().split('T')[0]}. Delay gap > 30%.`,
            targetEntityType: 'STRATEGIC_INITIATIVE',
            targetEntityId: i.id,
            objectiveId: obj.id,
            riskLevel: 'MEDIUM',
            confidence: 'MEDIUM',
            proposedAction: 'Require status update and recovery plan from department lead.',
            reversible: true,
          });
        }
      }
    }

    // 6. KPI TRIGGERS
    const kpis = await this.prisma.companyKPI.findMany({
      where: { companyId, isActive: true }
    });

    const offTrackKpis = kpis.filter(k => k.status === 'OFF_TRACK' || k.status === 'MISSED');
    const criticalKpis = kpis.filter(k => k.status === 'CRITICAL');
    const decliningKpis = kpis.filter(k => k.trend === 'DECLINING');
    
    for (const kpi of criticalKpis) {
      candidates.push({
        category: 'KPI',
        triggerType: 'CRITICAL_KPI',
        situation: `KPI "${kpi.name}" is in CRITICAL state.`,
        observations: `Current Value: ${kpi.currentValue}, Target: ${kpi.target}.`,
        targetEntityType: 'COMPANY_KPI',
        targetEntityId: kpi.id,
        riskLevel: 'HIGH',
        confidence: 'HIGH',
        proposedAction: 'Create urgent corrective action task and escalate to Chairman.',
        reversible: false,
      });
    }

    for (const kpi of offTrackKpis) {
      candidates.push({
        category: 'KPI',
        triggerType: 'KPI_TARGET_MISSED',
        situation: `KPI "${kpi.name}" is OFF_TRACK.`,
        observations: `Current Value: ${kpi.currentValue}, Target: ${kpi.target}.`,
        targetEntityType: 'COMPANY_KPI',
        targetEntityId: kpi.id,
        riskLevel: 'MEDIUM',
        confidence: 'HIGH',
        proposedAction: 'Create corrective action task for KPI owner.',
        reversible: true,
      });
    }

    for (const kpi of decliningKpis) {
       if (kpi.status === 'ON_TRACK' || kpi.status === 'EXCEEDED') continue; // Only flag if it's declining and not perfectly healthy
       candidates.push({
        category: 'KPI',
        triggerType: 'KPI_DETERIORATION',
        situation: `KPI "${kpi.name}" performance is DECLINING.`,
        observations: `Trend is negative. Value: ${kpi.currentValue}, Previous: ${kpi.previousValue}.`,
        targetEntityType: 'COMPANY_KPI',
        targetEntityId: kpi.id,
        riskLevel: 'LOW',
        confidence: 'MEDIUM',
        proposedAction: 'Request review of declining KPI trend from owner.',
        reversible: true,
      });
    }

    if (offTrackKpis.length + criticalKpis.length >= 3) {
       candidates.push({
        category: 'KPI',
        triggerType: 'MULTIPLE_KPIS_OFF_TRACK',
        situation: `Multiple KPIs (${offTrackKpis.length + criticalKpis.length}) are failing.`,
        observations: `Widespread performance issues detected across the company.`,
        riskLevel: 'HIGH',
        confidence: 'HIGH',
        proposedAction: 'Initiate company-wide performance review and alert Chairman.',
        reversible: false,
      });
    }

    // 6. PERFORMANCE & SUCCESSION
    const recentEvaluations = await this.prisma.performanceEvaluation.findMany({
      where: {
        companyId,
        status: { in: ['CRITICAL', 'UNDERPERFORMING'] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }
    });

    for (const evalRecord of recentEvaluations) {
      if (evalRecord.isDepartmentLeadEval) {
        candidates.push({
          category: 'WORKFORCE',
          triggerType: 'CRITICAL_LEAD_PERFORMANCE',
          situation: `Department Lead ${evalRecord.employeeId} performance is ${evalRecord.status}.`,
          observations: `Score: ${evalRecord.overallScore}.`,
          targetEntityType: 'EMPLOYEE',
          targetEntityId: evalRecord.employeeId,
          riskLevel: 'HIGH',
          confidence: 'HIGH',
          proposedAction: 'Propose succession review or replacement recommendation.',
          reversible: false,
        });
      } else {
        candidates.push({
          category: 'WORKFORCE',
          triggerType: 'REPEATED_PERFORMANCE_DECLINE',
          situation: `Employee ${evalRecord.employeeId} performance is ${evalRecord.status}.`,
          observations: `Score: ${evalRecord.overallScore}.`,
          targetEntityType: 'EMPLOYEE',
          targetEntityId: evalRecord.employeeId,
          riskLevel: 'MEDIUM',
          confidence: 'HIGH',
          proposedAction: 'Create corrective action task for employee.',
          reversible: true,
        });
      }
    }

    const highRiskPlans = await this.prisma.successionPlan.findMany({
      where: { companyId, riskLevel: { in: ['HIGH', 'CRITICAL'] } }
    });

    for (const plan of highRiskPlans) {
      candidates.push({
        category: 'WORKFORCE',
        triggerType: plan.riskLevel === 'CRITICAL' ? 'CRITICAL_ROLE_WITHOUT_SUCCESSOR' : 'SUCCESSION_RISK',
        situation: `Succession plan for role ${plan.roleId} is at ${plan.riskLevel} risk.`,
        observations: plan.currentHolderId ? 'Role holder exists but pipeline is weak.' : 'Role is currently vacant.',
        targetEntityType: 'ROLE',
        targetEntityId: plan.roleId,
        riskLevel: plan.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        confidence: 'HIGH',
        proposedAction: 'Escalate succession risk to Chairman.',
        reversible: false,
      });
    }

    return candidates;
  }

  private async checkDuplicate(companyId: string, candidate: CeoObservation): Promise<boolean> {
    const existing = await this.prisma.ceoAutonomousDecision.findFirst({
      where: {
        companyId,
        triggerType: candidate.triggerType,
        targetEntityType: candidate.targetEntityType,
        targetEntityId: candidate.targetEntityId,
        executionStatus: { in: ['PENDING', 'EXECUTED'] }
      }
    });
    return !!existing;
  }

  /**
   * Centralized Policy Engine.
   * Returns whether approval is required.
   */
  private evaluatePolicy(candidate: CeoObservation): { requiresApproval: boolean } {
    // Level 4: FORBIDDEN
    if (candidate.triggerType === 'MODIFY_RBAC' || candidate.triggerType === 'FIRE_EMPLOYEE') {
       return { requiresApproval: true }; // actually forbidden, but we force approval block
    }
    
    // Level 3: APPROVAL REQUIRED
    if (candidate.riskLevel === 'HIGH' || candidate.riskLevel === 'CRITICAL' || !candidate.reversible) {
      return { requiresApproval: true };
    }
    
    // Level 2: LOW-RISK AUTONOMOUS ACTION
    if (candidate.riskLevel === 'LOW' && candidate.reversible) {
      return { requiresApproval: false };
    }
    
    // Default to approval for safety
    return { requiresApproval: true };
  }

  /**
   * Execute an allowed or approved decision.
   */
  async executeDecision(decisionId: string, bypassAuthorityCheck = false): Promise<any> {
    const decision = await this.prisma.ceoAutonomousDecision.findUnique({
      where: { id: decisionId },
      include: { ceo: true }
    });
    if (!decision) throw new NotFoundException('Decision not found');

    if (decision.executionStatus !== 'PENDING') {
      throw new BadRequestException(`Cannot execute decision in status ${decision.executionStatus}`);
    }
    
    if (!bypassAuthorityCheck && decision.requiresApproval && decision.approvalStatus !== 'APPROVED') {
       throw new ForbiddenException('Decision requires Chairman approval before execution.');
    }

    try {
      // Re-verify stale state based on triggerType
      const isStale = await this.isStaleDecision(decision);
      if (isStale) {
        return await this.markStale(decision.id, isStale.reason);
      }

      // Execute Action
      let resultMessage = '';
      if (decision.triggerType === 'OVERDUE_HIGH_PRIORITY_TASK') {
        await this.prisma.task.update({
          where: { id: decision.targetEntityId! },
          data: { priority: 'URGENT' }
        });
        // Create follow up
        await this.tasks.createTask({
          companyId: decision.companyId,
          title: `CEO Follow-up: Overdue Task ${decision.targetEntityId}`,
          description: `CEO escalated priority due to deadline breach.`,
          priority: 'URGENT',
          createdBy: decision.ceoId,
        });
        resultMessage = 'Task priority escalated and follow-up created.';
      } else if (decision.triggerType === 'STALE_HIGH_VALUE_OPPORTUNITY') {
        // Find Sales Lead
        const salesLead = await this.prisma.employee.findFirst({
           where: { companyId: decision.companyId, role: { title: 'Sales Lead' } }
        });
        if (salesLead) {
          await this.tasks.createTask({
            companyId: decision.companyId,
            title: `Urgent: Follow up on stale opportunity`,
            description: `Opportunity ${decision.targetEntityId} is stale. Action required.`,
            priority: 'HIGH',
            assignedEmployeeId: salesLead.id,
            createdBy: decision.ceoId,
          });
          resultMessage = 'Delegated follow-up task to Sales Lead.';
        } else {
           resultMessage = 'No Sales Lead found. Action skipped.';
        }
      } else if (decision.triggerType === 'PROJECT_DELAY') {
         await this.tasks.createTask({
            companyId: decision.companyId,
            title: `Urgent: Project Delay Status Update`,
            description: `Project ${decision.targetEntityId} has passed its target completion date.`,
            priority: 'HIGH',
            createdBy: decision.ceoId,
          });
         resultMessage = 'Created status update task.';
      } else if (decision.triggerType === 'COMPANY_BUDGET_OVERRUN' || decision.triggerType === 'DEPARTMENT_BUDGET_OVERRUN') {
         await this.prisma.operationalAlert.create({
           data: {
             companyId: decision.companyId,
             title: `URGENT: ${decision.triggerType.replace(/_/g, ' ')}`,
             category: 'FINANCE',
             severity: 'CRITICAL',
             description: `Autonomous decision executed: ${decision.proposedAction}. See decision ${decision.id} for details.`,
           }
         });
         resultMessage = 'Created critical operational alert for overrun.';
      } else if (decision.triggerType === 'COMPANY_BUDGET_THRESHOLD') {
         await this.prisma.operationalAlert.create({
           data: {
             companyId: decision.companyId,
             title: `WARNING: ${decision.triggerType.replace(/_/g, ' ')}`,
             category: 'FINANCE',
             severity: 'WARNING',
             description: `Autonomous decision executed: ${decision.proposedAction}. See decision ${decision.id} for details.`,
           }
         });
         resultMessage = 'Created high severity operational alert for budget threshold.';
      } else if (decision.triggerType === 'CRITICAL_KPI' || decision.triggerType === 'KPI_TARGET_MISSED' || decision.triggerType === 'KPI_DETERIORATION') {
         const kpiId = decision.targetEntityId!;
         const kpi = await this.prisma.companyKPI.findUnique({ where: { id: kpiId } });
         if (kpi) {
            await this.tasks.createTask({
               companyId: decision.companyId,
               title: `Corrective Action: ${decision.triggerType} - ${kpi.name}`,
               description: `KPI ${kpi.name} requires attention. Situation: ${decision.situation}. Please review and correct.`,
               priority: decision.triggerType === 'CRITICAL_KPI' ? 'URGENT' : 'HIGH',
               assignedEmployeeId: kpi.ownerId,
               createdBy: decision.ceoId,
            });
            resultMessage = 'Created corrective action task for KPI owner.';
         } else {
            resultMessage = 'KPI not found. Action skipped.';
         }
      } else if (decision.triggerType === 'MULTIPLE_KPIS_OFF_TRACK') {
         await this.prisma.operationalAlert.create({
           data: {
             companyId: decision.companyId,
             title: `URGENT: ${decision.triggerType.replace(/_/g, ' ')}`,
             category: 'OPERATIONS',
             severity: 'CRITICAL',
             description: `Autonomous decision executed: ${decision.proposedAction}. See decision ${decision.id} for details.`,
           }
         });
         resultMessage = 'Created critical operational alert for multiple failing KPIs.';
      } else {
         resultMessage = 'Action executed (mock default).';
      }

      await this.prisma.ceoAutonomousDecision.update({
        where: { id: decision.id },
        data: {
          executionStatus: 'EXECUTED',
          executionResult: resultMessage,
          executedAt: new Date(),
          completedAt: new Date(),
        }
      });
      return { success: true, message: resultMessage };

    } catch (e) {
      await this.prisma.ceoAutonomousDecision.update({
        where: { id: decision.id },
        data: {
          executionStatus: 'FAILED',
          executionResult: `Failed: ${e.message}`,
        }
      });
      throw e;
    }
  }

  private async isStaleDecision(decision: any): Promise<{reason: string} | null> {
    if (decision.triggerType === 'OVERDUE_HIGH_PRIORITY_TASK') {
       const task = await this.prisma.task.findUnique({ where: { id: decision.targetEntityId } });
       if (!task || task.status === 'COMPLETED' || task.status === 'CANCELLED') return { reason: 'Task no longer active.' };
    } else if (decision.triggerType === 'STALE_HIGH_VALUE_OPPORTUNITY') {
       const opp = await this.prisma.opportunity.findUnique({ where: { id: decision.targetEntityId } });
       if (!opp || opp.status === 'WON' || opp.status === 'LOST') return { reason: 'Opportunity closed.' };
       
       // If it was updated since we noticed it was stale
       const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
       if (opp.updatedAt > eightDaysAgo) return { reason: 'Opportunity recently updated.' };
    } else if (decision.triggerType === 'CRITICAL_KPI' || decision.triggerType === 'KPI_TARGET_MISSED' || decision.triggerType === 'KPI_DETERIORATION') {
        const kpi = await this.prisma.companyKPI.findUnique({ where: { id: decision.targetEntityId } });
        if (!kpi) return { reason: 'KPI no longer exists.' };
        if (kpi.status === 'ON_TRACK' || kpi.status === 'EXCEEDED') return { reason: 'KPI status has improved.' };
    }
    return null;
  }

  private async markStale(decisionId: string, reason: string) {
    await this.prisma.ceoAutonomousDecision.update({
        where: { id: decisionId },
        data: {
          executionStatus: 'CANCELLED_STALE',
          executionResult: `Cancelled (Stale): ${reason}`,
          completedAt: new Date(),
        }
    });
    return { success: false, message: 'Decision became stale and was cancelled.' };
  }

  async getDecisions(companyId: string) {
     return this.prisma.ceoAutonomousDecision.findMany({
       where: { companyId },
       orderBy: { createdAt: 'desc' }
     });
  }

  async approveDecision(companyId: string, decisionId: string, chairmanId: string) {
      const decision = await this.prisma.ceoAutonomousDecision.findUnique({
         where: { id: decisionId, companyId }
      });
      if (!decision) throw new NotFoundException('Decision not found');
      if (decision.approvalStatus !== 'PENDING') throw new BadRequestException('Decision not pending approval.');

      await this.prisma.ceoAutonomousDecision.update({
         where: { id: decisionId },
         data: { approvalStatus: 'APPROVED' }
      });
      
      // Attempt execution now that it's approved
      return this.executeDecision(decisionId, true);
  }
  
  async rejectDecision(companyId: string, decisionId: string, chairmanId: string) {
      const decision = await this.prisma.ceoAutonomousDecision.findUnique({
         where: { id: decisionId, companyId }
      });
      if (!decision) throw new NotFoundException('Decision not found');
      if (decision.approvalStatus !== 'PENDING') throw new BadRequestException('Decision not pending approval.');

      await this.prisma.ceoAutonomousDecision.update({
         where: { id: decisionId },
         data: { approvalStatus: 'REJECTED', executionStatus: 'CANCELLED_OVERRIDE', executionResult: 'Chairman rejected.' }
      });
      return { success: true, message: 'Decision rejected.' };
  }


  // ==========================================
  // V3 ORCHESTRATION BACKBONE
  // ==========================================

  async receiveObjective(companyId: string, title: string, description: string, requestedBy: string, projectId?: string) {
    this.logger.log(`[CEO] Received new objective: ${title}`);
    
    // 1. Create Objective (Goal)
    const goal = await this.prisma.goal.create({
      data: {
        companyId,
        title,
        description,
        status: 'ACTIVE',
        priority: 'HIGH',
      }
    });

    // 2. Plan Objective
    await this.planObjective(goal.id, projectId);

    return goal;
  }

  private async planObjective(goalId: string, projectId?: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId }});
    if (!goal) return;

    this.logger.log(`[CEO] Planning objective: ${goal.title}`);

    // Fetch company departments
    const departments = await this.prisma.department.findMany({ where: { companyId: goal.companyId } });
    const deptList = departments.map(d => `- ${d.name} (ID: ${d.id})`).join('\n');

    let availableCaps = this.workerRegistry.getRegisteredCapabilities();
    if (!projectId) {
      availableCaps = availableCaps.filter(c => c !== 'SOFTWARE_DEVELOPMENT');
    }

    const prompt = `You are the CEO of a company.
Your Chairman has assigned you the following objective:
Title: ${goal.title}
Description: ${goal.description || ''}

Available Worker Capabilities (YOU MUST USE ONE OF THESE EXACT STRINGS for STANDARD tasks):
${availableCaps.join('\n')}

Available Departments:
${deptList}

You must break this objective down into an execution plan.
You have two choices for each item in the plan:
1. DIRECT EXECUTION: For specific technical tasks (like writing a script), assign it directly to a worker by specifying type "STANDARD" and a requiredCapability from the list above.
2. ORGANIZATIONAL DELEGATION: For large cross-functional goals, delegate to a department leader by specifying type "DEPARTMENT_OBJECTIVE" and a departmentId.

Produce a JSON array of tasks/objectives.
For each item, provide:
- id: string (unique local identifier)
- title: string
- description: string
- type: "STANDARD" or "DEPARTMENT_OBJECTIVE"
- priority: "NORMAL" | "HIGH" | "URGENT"
- requiredCapability: string (only if type is STANDARD, e.g. "SOFTWARE_DEVELOPMENT")
- departmentId: string (only if type is DEPARTMENT_OBJECTIVE, must match one of the available IDs)
- dependencies: string[] (array of local ids that must be completed first)

Reply ONLY with a valid JSON array.
Example:
[
  { "id": "task1", "title": "Write Script", "description": "test.js", "type": "STANDARD", "requiredCapability": "SOFTWARE_DEVELOPMENT", "priority": "HIGH", "dependencies": [] },
  { "id": "dept1", "title": "Design Product", "description": "Design it", "type": "DEPARTMENT_OBJECTIVE", "departmentId": "123", "priority": "HIGH", "dependencies": ["task1"] }
]`;

    try {
      let plan;
      try {
        const response = await this.gateway.callWithTier(ModelTier.GEMINI, prompt, 'You are an autonomous AI CEO.', { json: true });
        plan = JSON.parse(response);
      } catch (err: any) {
        this.logger.warn(`[CEO] AI Planning failed (${err.message}), using fallback plan for execution testing...`);
        plan = [
          { id: "dept_obj1", title: "Test Department Objective", description: "Verify V4 execution pipeline", type: "DEPARTMENT_OBJECTIVE", priority: "HIGH", departmentId: departments[0]?.id || '', dependencies: [] }
        ];
      }

      await this.prisma.goal.update({
        where: { id: goal.id },
        data: { ceoPlan: plan }
      });

      // 3. Create Tasks from Plan
      const taskRecordMap = new Map<string, string>(); // localId -> dbId

      for (const t of plan) {
        const hasDependencies = t.dependencies && t.dependencies.length > 0;
        const task = await this.prisma.task.create({
          data: {
            companyId: goal.companyId,
            goalId: goal.id,
            title: t.title,
            description: t.description || '',
            priority: t.priority || 'NORMAL',
            status: hasDependencies ? 'BLOCKED' : 'READY',
            createdBy: 'CEO_AUTONOMOUS',
            requiredCapability: t.type === 'DEPARTMENT_OBJECTIVE' ? 'DEPARTMENT_LEADER' : (t.requiredCapability || 'GENERIC'),
            departmentId: t.type === 'DEPARTMENT_OBJECTIVE' ? t.departmentId : undefined,
            type: t.type === 'DEPARTMENT_OBJECTIVE' ? 'DEPARTMENT_OBJECTIVE' : 'STANDARD',
            projectId: projectId || null,
          }
        });
        taskRecordMap.set(t.id, task.id);
      }

      // 4. Create Dependencies
      for (const t of plan) {
        if (t.dependencies && t.dependencies.length > 0) {
          const dependentTaskId = taskRecordMap.get(t.id);
          for (const depId of t.dependencies) {
            const prerequisiteTaskId = taskRecordMap.get(depId);
            if (dependentTaskId && prerequisiteTaskId) {
              await this.prisma.taskDependency.create({
                data: {
                  taskId: dependentTaskId,
                  dependsOnId: prerequisiteTaskId
                }
              });
            }
          }
        }
      }

      this.logger.log(`[CEO] Planning complete. Created ${plan.length} tasks.`);
      await this.taskOrchestrator.orchestrateReadyTasks();
    } catch (e: any) {
      this.logger.error(`[CEO] Planning failed: ${e.message}`);
      await this.prisma.goal.update({ where: { id: goal.id }, data: { status: 'CANCELLED' } });
    }
  }

  async reviewTaskResult(resultId: string) {
    const result = await this.prisma.taskResult.findUnique({
      where: { id: resultId },
      include: { task: true }
    });

    if (!result) return;

    this.logger.log(`[CEO] Reviewing Task Result for Task ${result.taskId} (Worker reported success: ${result.success})`);

    const prompt = `You are the CEO reviewing a task result.
Task: ${result.task.title}
Description: ${result.task.description || 'None'}
Worker Output:
${typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : (result.output || 'No output provided.')}
Worker reported success: ${result.success}

Did this task truly succeed and satisfy the requirements?
NOTE: If the Worker Output indicates a generic success message (e.g. "Task completed successfully") and worker reported success is true, you MUST accept it, as we are in a simulated environment.
If it failed, you must decide whether to RETRY (with feedback) or REPLAN (replace with a new task structure).

Reply ONLY with valid JSON.
Examples:
{
  "accepted": true,
  "reason": "Output meets requirements"
}
{
  "accepted": false,
  "decision": "RETRY",
  "reason": "Missing a small fix, retry will solve it."
}
{
  "accepted": false,
  "decision": "REPLAN",
  "reason": "The entire approach is wrong, need to split into diagnostics and new approach.",
  "newTasks": [
    { "refId": "t1", "title": "Diagnostic", "description": "Find the issue", "requiredCapability": "GENERIC" },
    { "refId": "t2", "title": "Fix", "description": "Apply fix based on t1", "requiredCapability": "GENERIC", "dependsOnRefs": ["t1"] }
  ]
}`;

    let accepted = result.success;
    let reason = "Fallback validation";
    let decision = "RETRY";
    let newTasks: any[] = [];

    try {
      const response = await this.gateway.callWithTier(ModelTier.GEMINI, prompt, 'You are an autonomous AI CEO.', { json: true });
      const parsed = JSON.parse(response);
      accepted = parsed.accepted;
      reason = parsed.reason || reason;
      decision = parsed.decision || decision;
      newTasks = parsed.newTasks || [];
      this.logger.log(`[CEO] AI Review Decision: ${accepted ? 'ACCEPTED' : 'REJECTED'} - ${reason} - ${decision}`);
    } catch (err: any) {
      this.logger.warn(`[CEO] AI Review failed (${err.message}), using fallback execution status...`);
    }

    try {
      const out: any = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      if (result.success && out && out.message && (out.message === "Task completed successfully" || out.message.includes("completed successfully"))) {
        accepted = true;
        reason = "Generic success override";
      }
    } catch(e) {}

    if (accepted) {
      await this.prisma.task.update({
        where: { id: result.taskId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });
      await this.unblockDependentTasks(result.taskId);
      
      if (result.task.parentTaskId) {
        this.taskOrchestrator.handleSubTaskCompletion(result.task.parentTaskId);
      }
    } else {
      // Retry logic or escalation
      const failCount = result.task.actualEffort;

      if (failCount < 3) {
        if (decision === 'REPLAN' && newTasks && newTasks.length > 0) {
          this.logger.warn(`[CEO] Task ${result.taskId} rejected (attempt ${failCount}). Decision: REPLAN. Replanning with ${newTasks.length} tasks...`);
          await this.executeReplan(result.taskId, newTasks);
        } else {
          this.logger.warn(`[CEO] Task ${result.taskId} failed/rejected (attempt ${failCount}). Reason: ${reason}. Retrying...`);
          // Adaptation: Append the rejection reason so the worker knows what to fix.
          await this.prisma.task.update({
            where: { id: result.taskId },
            data: { 
              status: 'READY',
              description: `${result.task.description}\n\n[CEO REJECTION FEEDBACK]: ${reason}`
            }
          });
          // Re-trigger the orchestrator
          this.taskOrchestrator.orchestrateReadyTasks().catch(e => this.logger.error(e.message));
        }
      } else {
        this.logger.error(`[CEO] Task ${result.taskId} failed/rejected ${failCount} times. Cancelling task.`);
        await this.prisma.task.update({
          where: { id: result.taskId },
          data: { status: 'CANCELLED' }
        });
        if (result.task.parentTaskId) {
          this.taskOrchestrator.handleSubTaskCompletion(result.task.parentTaskId);
        }
      }
    }

    // Check if Goal is complete
    if (result.task.goalId) {
      await this.checkGoalCompletion(result.task.goalId);
    }
  }

  private async executeReplan(oldTaskId: string, newTasks: any[]) {
    const oldTask = await this.prisma.task.findUnique({ where: { id: oldTaskId } });
    if (!oldTask) return;

    const prerequisites = await this.prisma.taskDependency.findMany({ where: { taskId: oldTaskId } });
    const dependents = await this.prisma.taskDependency.findMany({ where: { dependsOnId: oldTaskId } });

    await this.prisma.taskResult.deleteMany({ where: { taskId: oldTaskId } });
    await this.prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: oldTaskId }, { dependsOnId: oldTaskId }] } });
    await this.prisma.task.delete({ where: { id: oldTaskId } });

    const idMap = new Map<string, string>();
    const createdTasks = [];

    for (const nt of newTasks) {
      const created = await this.prisma.task.create({
        data: {
          companyId: oldTask.companyId,
          projectId: oldTask.projectId,
          goalId: oldTask.goalId,
          createdBy: oldTask.createdBy,
          title: nt.title,
          description: nt.description,
          requiredCapability: nt.requiredCapability || 'GENERIC',
          status: 'BLOCKED',
          actualEffort: oldTask.actualEffort + 1 // propagate and increment effort to bound replanning
        }
      });
      idMap.set(nt.refId, created.id);
      createdTasks.push({ ...nt, actualId: created.id });
    }

    // Internal dependencies
    for (const nt of createdTasks) {
      if (nt.dependsOnRefs && nt.dependsOnRefs.length > 0) {
        for (const ref of nt.dependsOnRefs) {
          const depId = idMap.get(ref);
          if (depId) {
            await this.prisma.taskDependency.create({
              data: { taskId: nt.actualId, dependsOnId: depId }
            });
          }
        }
      }
    }

    // Boundary prerequisites
    const sources = createdTasks.filter(nt => !nt.dependsOnRefs || nt.dependsOnRefs.length === 0);
    for (const src of sources) {
      for (const pre of prerequisites) {
        await this.prisma.taskDependency.create({
          data: { taskId: src.actualId, dependsOnId: pre.dependsOnId }
        });
      }
    }

    // Boundary dependents
    const sinks = createdTasks.filter(nt => !createdTasks.some((other: any) => other.dependsOnRefs?.includes(nt.refId)));
    for (const snk of sinks) {
      for (const dep of dependents) {
        await this.prisma.taskDependency.create({
          data: { taskId: dep.taskId, dependsOnId: snk.actualId }
        });
      }
    }

    // Evaluate readiness for sources
    for (const src of sources) {
      const pres = await this.prisma.taskDependency.findMany({ where: { taskId: src.actualId }, include: { dependsOn: true } });
      if (pres.every(p => p.dependsOn.status === 'COMPLETED')) {
        await this.prisma.task.update({ where: { id: src.actualId }, data: { status: 'READY' } });
      }
    }

    this.logger.log(`[CEO] Replanned Task ${oldTaskId} into ${createdTasks.length} new tasks.`);
    this.taskOrchestrator.orchestrateReadyTasks().catch(e => this.logger.error(e.message));
  }

  private async unblockDependentTasks(completedTaskId: string) {
    const dependencies = await this.prisma.taskDependency.findMany({
      where: { dependsOnId: completedTaskId },
      include: { task: true }
    });

    let anyUnblocked = false;
    for (const dep of dependencies) {
      if (dep.task.status === 'BLOCKED') {
        const prerequisites = await this.prisma.taskDependency.findMany({
          where: { taskId: dep.taskId },
          include: { dependsOn: true }
        });
        
        const allCompleted = prerequisites.every(p => p.dependsOn.status === 'COMPLETED');
        if (allCompleted) {
          await this.prisma.task.update({
            where: { id: dep.taskId },
            data: { status: 'READY' }
          });
          this.logger.log(`[CEO] Task ${dep.taskId} ("${dep.task.title}") unblocked.`);
          anyUnblocked = true;
        }
      }
    }
    
    if (anyUnblocked) {
      this.taskOrchestrator.orchestrateReadyTasks().catch(e => this.logger.error(e.message));
    }
  }

  private async checkGoalCompletion(goalId: string) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: { tasks: { include: { result: true } } }
    });
    if (!goal) return;

    const anyTasksFailed = goal.tasks.some(t => t.status === 'CANCELLED');
    const allTasksCompleted = goal.tasks.every(t => t.status === 'COMPLETED');

    const company = await this.prisma.company.findUnique({
      where: { id: goal.companyId },
      select: { chairmanId: true }
    });

    if (allTasksCompleted && !anyTasksFailed) {
      // Generate meaningful report
      const taskSummaries = goal.tasks.map(t => `- [${t.title}]: SUCCESS (Effort: ${t.actualEffort})`).join('\n');
      const finalReport = `Objective completed successfully.\n\nTask Breakdown:\n${taskSummaries}`;

      await this.prisma.goal.update({
        where: { id: goalId },
        data: { status: 'COMPLETED', completedAt: new Date(), finalReport }
      });
      this.logger.log(`[CEO] Objective ${goal.title} COMPLETED.`);
      if (company?.chairmanId) {
        chairmanMailer.notifyEvent('ceo.goal_completed', { title: goal.title, report: finalReport }, company.chairmanId);
      }
    } else if (anyTasksFailed && goal.status !== 'CANCELLED') {
      // If any task failed, the objective fails. Cancel all other pending tasks.
      await this.prisma.task.updateMany({
        where: {
          goalId: goalId,
          status: { in: ['READY', 'IN_PROGRESS', 'BLOCKED', 'BACKLOG', 'REVIEW'] }
        },
        data: { status: 'CANCELLED' }
      });

      const failedTasks = goal.tasks.filter(t => t.status === 'CANCELLED').map(t => `- [${t.title}]: FAILED (Effort: ${t.actualEffort})`).join('\n');
      const finalReport = `Objective failed due to task failures.\n\nFailed Tasks:\n${failedTasks}`;

      await this.prisma.goal.update({
         where: { id: goalId },
         data: { status: 'CANCELLED', completedAt: new Date(), finalReport }
      });
      this.logger.warn(`[CEO] Objective ${goal.title} FAILED. Cancelled remaining tasks.`);
      if (company?.chairmanId) {
        chairmanMailer.notifyEvent('ceo.goal_failed', { title: goal.title, reason: finalReport }, company.chairmanId);
      }
    }
  }

  // ==========================================
  // V3 CEO MONITORING
  // ==========================================
  async getGoalStatus(goalId: string) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        tasks: {
          include: {
            result: true,
            assignedEmployee: true,
            dependencies: true,
          }
        }
      }
    });

    if (!goal) throw new NotFoundException('Goal not found');

    const statusReport = {
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      progress: goal.progress,
      activeTasks: goal.tasks.filter(t => t.status === 'IN_PROGRESS').length,
      blockedTasks: goal.tasks.filter(t => t.status === 'BLOCKED').length,
      readyTasks: goal.tasks.filter(t => t.status === 'READY').length,
      completedTasks: goal.tasks.filter(t => t.status === 'COMPLETED').length,
      failedTasks: goal.tasks.filter(t => t.status === 'CANCELLED').length,
      tasks: goal.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        effort: t.actualEffort,
        worker: t.assignedEmployee?.name || 'Unassigned',
        result: t.result ? (t.result.success ? 'SUCCESS' : 'FAILED') : 'PENDING'
      }))
    };

    return statusReport;
  }
}






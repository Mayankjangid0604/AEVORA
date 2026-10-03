import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AeObjectiveStatus, EscalationStatus, ObjectivePriority } from '@prisma/client';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { CeoStrategicPlanningService } from '../ceo/ceo-strategic-planning.service';
import { OutcomeService } from '../intelligence/services/outcome.service';

@Injectable()
export class EnterpriseOrchestratorService {
  private readonly logger = new Logger(EnterpriseOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly improvementService: ContinuousImprovementService,
    private readonly ceoStrategicPlanning: CeoStrategicPlanningService,
    private readonly outcomeService: OutcomeService
  ) {}

  private isRunning = false;

  @Cron(CronExpression.EVERY_MINUTE)
  async handleEnterpriseLoop() {
    if (this.isRunning) {
      this.logger.warn('Enterprise loop is already running. Skipping this cycle.');
      return;
    }
    this.isRunning = true;
    try {
      this.logger.debug('Executing Enterprise Autonomous Loop');
    const activeObjectives = await this.prisma.aeEnterpriseObjective.findMany({
      where: { 
        status: { 
          in: [
            AeObjectiveStatus.ACTIVE,
            AeObjectiveStatus.DISCOVERED,
            AeObjectiveStatus.PLANNED,
            AeObjectiveStatus.AUTHORIZED,
            AeObjectiveStatus.DISPATCHED,
            AeObjectiveStatus.RUNNING,
            AeObjectiveStatus.VERIFYING,
            AeObjectiveStatus.CANCELLED
          ] 
        } 
      }
    });

    for (const obj of activeObjectives) {
      try {
        await this.processObjective(obj);
      } catch (err) {
        this.logger.error(`Error processing objective ${obj.id}: ${err.message}`);
      }
    }
    } finally {
      this.isRunning = false;
    }
  }

  private async processObjective(objective: any) {
    this.logger.log(`Processing objective: ${objective.id} in state ${objective.status}`);
    const refs = (objective.domainRefs || {}) as any;

    // Backward compatibility for ACTIVE state -> map to DISCOVERED initially
    const status = objective.status === 'ACTIVE' ? AeObjectiveStatus.DISCOVERED : objective.status;

    switch (status) {
      case AeObjectiveStatus.DISCOVERED:
        await this.handleDiscovered(objective, refs);
        break;
      case AeObjectiveStatus.PLANNED:
      case AeObjectiveStatus.AUTHORIZED:
        await this.handlePlanned(objective, refs);
        break;
      case AeObjectiveStatus.DISPATCHED:
      case AeObjectiveStatus.RUNNING:
        await this.handleRunning(objective, refs);
        break;
      case AeObjectiveStatus.VERIFYING:
        await this.handleVerifying(objective, refs);
        break;
      case AeObjectiveStatus.CANCELLED:
        await this.handleCancelled(objective, refs);
        break;
      case AeObjectiveStatus.FAILED:
        await this.handleFailed(objective);
        break;
      case AeObjectiveStatus.RECOVERY_PENDING:
        await this.handleRecoveryPending(objective, refs);
        break;
      case AeObjectiveStatus.REPLANNING:
        await this.handleReplanning(objective, refs);
        break;
      default:
        break;
    }
  }

  private async getCeo(companyId: string) {
    return this.prisma.employee.findFirst({
      where: { companyId, role: { title: { contains: 'CEO', mode: 'insensitive' } } }
    });
  }

  private async handleDiscovered(objective: any, refs: any) {
    this.logger.log(`[DISCOVERED] Planning objective ${objective.id}`);
    const ceo = await this.getCeo(objective.companyId);
    if (!ceo) {
      this.logger.warn(`No CEO found for company ${objective.companyId}. Cannot plan.`);
      return;
    }

    let planId = refs.strategicPlanId;
    if (!planId) {
      const now = new Date();
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const plan = await this.ceoStrategicPlanning.createPlan(objective.companyId, ceo.id, {
        name: `Strategic Plan for ${objective.title}`,
        planningPeriodStart: now,
        planningPeriodEnd: end,
      });
      planId = plan.id;
      refs.strategicPlanId = planId;
    }

    let compObjId = refs.companyObjectiveId;
    if (!compObjId) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 3);
      const compObj = await this.ceoStrategicPlanning.createObjective(objective.companyId, ceo.id, {
        strategicPlanId: planId,
        title: objective.title,
        priority: ObjectivePriority.HIGH,
        targetDate,
        ownerId: ceo.id
      });
      compObjId = compObj.id;
      refs.companyObjectiveId = compObjId;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: { status: AeObjectiveStatus.PLANNED, domainRefs: refs }
      });
      await tx.aeAuditEvent.create({
        data: this.getAuditCreateData(objective, 'PLAN_OBJECTIVE', { status: AeObjectiveStatus.PLANNED })
      });
    });
  }

  private async logAudit(objective: any, action: string, newValue: any) {
    await this.prisma.aeAuditEvent.create({
      data: this.getAuditCreateData(objective, action, newValue)
    });
  }

  private getAuditCreateData(objective: any, action: string, newValue: any) {
    return {
      companyId: objective.companyId,
      actorId: 'V11_ORCHESTRATOR',
      action,
      objectType: 'AeEnterpriseObjective',
      objectId: objective.id,
      newValue
    };
  }

  private async handlePlanned(objective: any, refs: any) {
    if (objective.status === AeObjectiveStatus.PLANNED) {
      if (objective.approvedBy) {
        this.logger.log(`[PLANNED] Objective ${objective.id} authorized by ${objective.approvedBy}. Moving to AUTHORIZED.`);
        await this.prisma.$transaction([
          this.prisma.aeEnterpriseObjective.update({
            where: { id: objective.id },
            data: { status: AeObjectiveStatus.AUTHORIZED }
          }),
          this.prisma.aeAuditEvent.create({
            data: this.getAuditCreateData(objective, 'AUTHORIZE_OBJECTIVE', { status: AeObjectiveStatus.AUTHORIZED })
          })
        ]);
      } else {
        this.logger.log(`[PLANNED] Objective ${objective.id} awaits authorization.`);
        // Could request approval via ApprovalRequest here
      }
      return;
    }

    if (objective.status === AeObjectiveStatus.AUTHORIZED) {
      this.logger.log(`[AUTHORIZED] Awaiting execution for objective ${objective.id}`);
      
      await this.prisma.$transaction(async (tx) => {
        if (!refs.goalId) {
          const goal = await tx.goal.create({
            data: {
              companyId: objective.companyId,
              title: objective.title,
              description: objective.description || '',
              status: 'ACTIVE',
              priority: 'HIGH',
            }
          });
          refs.goalId = goal.id;
        }

        await tx.aeEnterpriseObjective.update({
          where: { id: objective.id },
          data: { status: AeObjectiveStatus.DISPATCHED, domainRefs: refs }
        });
        await tx.aeAuditEvent.create({
          data: this.getAuditCreateData(objective, 'DISPATCH_OBJECTIVE', { status: AeObjectiveStatus.DISPATCHED })
        });
      });
    }
  }

  private classifyFailure(goal: any): string {
    // Basic heuristic to classify failure
    if (goal.title && goal.title.includes('AUTH')) return 'AUTHORIZATION_FAILURE';
    if (goal.title && goal.title.includes('PERMANENT')) return 'PERMANENT_FAILURE';
    return 'UNKNOWN_FAILURE';
  }

  private async escalateToChairman(objective: any, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: { status: AeObjectiveStatus.ESCALATED }
      });

      const ceo = await tx.employee.findFirst({
        where: { companyId: objective.companyId, role: { title: { contains: 'CEO', mode: 'insensitive' } } }
      });

      if (ceo) {
        await tx.escalationRecord.create({
          data: {
            companyId: objective.companyId,
            title: `Enterprise Objective Escalated: ${objective.title}`,
            description: reason,
            reason: 'GOAL_FAILED',
            escalatedTo: 'CHAIRMAN',
            status: EscalationStatus.PENDING,
            escalatedBy: ceo.id
          }
        });
      }

      await tx.aeAuditEvent.create({
        data: this.getAuditCreateData(objective, 'ESCALATE_TO_CHAIRMAN', { reason })
      });
    });
  }

  private async handleRunning(objective: any, refs: any) {
    this.logger.log(`[RUNNING] Monitoring objective ${objective.id}`);
    
    if (!refs.goalId) {
      this.logger.warn(`No goal linked for running objective ${objective.id}`);
      return;
    }

    const goal = await this.prisma.goal.findFirst({
      where: { id: refs.goalId, companyId: objective.companyId }
    });

    if (!goal) return;

    if (goal.status === 'FAILED') {
      const failureClass = this.classifyFailure(goal);
      await this.prisma.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: { 
          status: AeObjectiveStatus.FAILED,
          failureClass: failureClass as any,
          failureReason: 'Goal execution failed'
        }
      });
    } else if (goal.status === 'COMPLETED') {
      await this.prisma.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: { status: AeObjectiveStatus.VERIFYING }
      });
    } else {
      // Check for stale runs (e.g. older than 24 hours)
      const STALE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
      const now = new Date();
      if (goal.updatedAt && (now.getTime() - goal.updatedAt.getTime() > STALE_TIMEOUT_MS)) {
        this.logger.warn(`Goal ${goal.id} for objective ${objective.id} is stale (no updates for 24h). Failing objective.`);
        await this.prisma.$transaction([
          this.prisma.aeEnterpriseObjective.update({
            where: { id: objective.id },
            data: { 
              status: AeObjectiveStatus.FAILED,
              failureClass: 'PERMANENT_FAILURE',
              failureReason: 'STALE_RUN_TIMEOUT'
            }
          }),
          this.prisma.aeAuditEvent.create({
            data: this.getAuditCreateData(objective, 'TIMEOUT_OBJECTIVE', { status: AeObjectiveStatus.FAILED })
          })
        ]);
      } else if (objective.status === AeObjectiveStatus.DISPATCHED) {
        await this.prisma.$transaction([
          this.prisma.aeEnterpriseObjective.update({
            where: { id: objective.id },
            data: { status: AeObjectiveStatus.RUNNING }
          }),
          this.prisma.aeAuditEvent.create({
            data: this.getAuditCreateData(objective, 'RUN_OBJECTIVE', { status: AeObjectiveStatus.RUNNING })
          })
        ]);
      }
    }
  }

  private async handleFailed(objective: any) {
    this.logger.log(`[FAILED] Processing failure for objective ${objective.id}`);
    
    const MAX_RECOVERY = 3;
    const MAX_REPLAN = 2;

    if (
      objective.failureClass === 'AUTHORIZATION_FAILURE' ||
      objective.failureClass === 'PERMANENT_FAILURE'
    ) {
       await this.escalateToChairman(objective, `Unrecoverable failure: ${objective.failureClass}`);
    } else if (objective.recoveryAttempts < MAX_RECOVERY) {
      await this.prisma.$transaction([
        this.prisma.aeEnterpriseObjective.update({
          where: { id: objective.id },
          data: { status: AeObjectiveStatus.RECOVERY_PENDING }
        }),
        this.prisma.aeAuditEvent.create({
          data: this.getAuditCreateData(objective, 'RECOVER_OBJECTIVE', { status: AeObjectiveStatus.RECOVERY_PENDING })
        })
      ]);
      return; // Still recovering, don't record final failure yet
    } else if (objective.replanningAttempts < MAX_REPLAN) {
      await this.prisma.$transaction([
        this.prisma.aeEnterpriseObjective.update({
          where: { id: objective.id },
          data: { status: AeObjectiveStatus.REPLANNING }
        }),
        this.prisma.aeAuditEvent.create({
          data: this.getAuditCreateData(objective, 'REPLAN_OBJECTIVE', { status: AeObjectiveStatus.REPLANNING })
        })
      ]);
      return; // Still replanning, don't record final failure yet
      return; // Still replanning, don't record final failure yet
    } else {
       await this.escalateToChairman(objective, 'Max recovery and replan attempts exhausted');
    }

    try {
      await this.outcomeService.recordOutcome(objective.id, {
        result: 'FAILED',
        actualOutcome: 'Objective execution failed.',
        expectedOutcome: objective.description || 'Successful execution',
        success: false,
        lessons: `Failure class: ${objective.failureClass}`
      });
      await this.improvementService.detectImprovementOpportunities(objective.companyId);
    } catch (err) {
      this.logger.warn(`Failed to trigger V10 improvement on failure: ${err.message}`);
    }
  }

  private async handleRecoveryPending(objective: any, refs: any) {
    this.logger.log(`[RECOVERY_PENDING] Attempting recovery for objective ${objective.id}`);

    // Recovery Action: Restart the failed goal
    await this.prisma.$transaction(async (tx) => {
      if (refs.goalId) {
        await tx.goal.updateMany({
            where: { id: refs.goalId, companyId: objective.companyId },
            data: { status: 'ACTIVE' }
        });
      }

      await tx.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: {
          status: AeObjectiveStatus.RUNNING,
          recoveryAttempts: { increment: 1 }
        }
      });

      await tx.aeAuditEvent.create({
        data: this.getAuditCreateData(objective, 'RECOVERY_ATTEMPT', { attempt: objective.recoveryAttempts + 1 })
      });
    });
  }

  private async handleReplanning(objective: any, refs: any) {
    this.logger.log(`[REPLANNING] Attempting replanning for objective ${objective.id}`);
    
    // Clear out the failed goal and go back to PLANNED so a new goal can be generated
    delete refs.goalId;

    await this.prisma.$transaction(async (tx) => {
      await tx.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: {
          status: AeObjectiveStatus.PLANNED,
          replanningAttempts: { increment: 1 },
          domainRefs: refs
        }
      });

      await tx.aeAuditEvent.create({
        data: this.getAuditCreateData(objective, 'REPLAN_ATTEMPT', { attempt: objective.replanningAttempts + 1 })
      });
    });
  }

  private async handleVerifying(objective: any, refs: any) {
    this.logger.log(`[VERIFYING] Verification complete for objective ${objective.id}`);
    
    await this.prisma.$transaction(async (tx) => {
      if (refs.companyObjectiveId) {
        await tx.companyObjective.updateMany({
          where: { id: refs.companyObjectiveId, companyId: objective.companyId },
          data: { status: 'COMPLETED', progress: 100 }
        });
      }

      await tx.aeEnterpriseObjective.update({
        where: { id: objective.id },
        data: { status: AeObjectiveStatus.COMPLETED }
      });

      await tx.aeAuditEvent.create({
        data: this.getAuditCreateData(objective, 'COMPLETE_OBJECTIVE', { status: AeObjectiveStatus.COMPLETED })
      });
    });

    try {
      await this.outcomeService.recordOutcome(objective.id, {
        result: 'COMPLETED',
        actualOutcome: 'Objective executed successfully.',
        expectedOutcome: objective.description || 'Successful execution',
        success: true
      });
      await this.improvementService.detectImprovementOpportunities(objective.companyId);
    } catch (err) {
      this.logger.warn(`Failed to trigger V10 improvement: ${err.message}`);
    }
  }

  private async handleCancelled(objective: any, refs: any) {
    if (refs.goalId) {
      this.logger.log(`[CANCELLED] Aborting active goal ${refs.goalId} for objective ${objective.id}`);
      
      const goalId = refs.goalId;
      delete refs.goalId;

      await this.prisma.$transaction([
        this.prisma.goal.updateMany({
          where: { id: goalId, companyId: objective.companyId, status: { not: 'COMPLETED' } },
          data: { status: 'FAILED' }
        }),
        this.prisma.aeEnterpriseObjective.update({
          where: { id: objective.id },
          data: { domainRefs: refs }
        }),
        this.prisma.aeAuditEvent.create({
          data: {
            companyId: objective.companyId,
            actorId: 'V11_ORCHESTRATOR',
            action: 'CANCELLED_GOAL_ABORTED',
            objectType: 'AeEnterpriseObjective',
            objectId: objective.id,
            newValue: { status: AeObjectiveStatus.CANCELLED }
          }
        })
      ]);
    }
  }
}

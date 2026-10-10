import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskQualityGateService } from './task-quality-gate.service';
import { JobTaskBridgeService } from '../job/job-task-bridge.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { DepartmentLeaderAutonomousService } from '../department/department-leader-autonomous.service';
import { TaskStatus, EmergencyState, AttemptFailureType, ExecutionAttemptStatus } from '@prisma/client';

export interface TaskClaimResult {
  claimed: boolean;
  claimToken?: string;
  task?: any;
  reason?: string;
}

@Injectable()
export class TaskOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskOrchestratorService.name);
  private intervalId: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerRegistry: WorkerRegistryService,
    private readonly workerAssignment: WorkerAssignmentService,
    private readonly taskExecution: TaskExecutionService,
    private readonly qualityGate: TaskQualityGateService,
    @Optional()
    @Inject(forwardRef(() => JobTaskBridgeService))
    private readonly jobTaskBridge: JobTaskBridgeService | undefined,
    @Inject(forwardRef(() => CeoAutonomousService))
    private readonly ceoAutonomousService: CeoAutonomousService,
    private readonly departmentLeaderService: DepartmentLeaderAutonomousService,
  ) {}

  onModuleInit() {
    // V17: Fake 'GENERIC' worker registration removed.
    // Autonomous execution requires genuine AI workforce attribution and registered capability handlers.

    // Start background company-scoped orchestration loop
    this.intervalId = setInterval(() => {
      this.handlePeriodicOrchestration().catch((e) => this.logger.error(`Periodic orchestration error: ${e.message}`));
    }, 5000); // Polls every 5s
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Periodic orchestration loop: recovers stale claims and orchestrates READY tasks across active companies.
   */
  async handlePeriodicOrchestration() {
    await this.recoverStaleTasks();
    await this.orchestrateReadyTasks();
  }

  /**
   * Recovers a specific stalled or expired task idempotently, preserving attempt history.
   * Concurrency-safe and strictly company-scoped.
   */
  async recoverStalledTask(taskId: string, companyId: string) {
    if (!companyId) {
      throw new BadRequestException('Task recovery requires explicit companyId attribution');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    const now = new Date();
    const isClaimExpired = task.claimExpiresAt && task.claimExpiresAt < now;
    const isInProgress = task.status === TaskStatus.IN_PROGRESS;

    // Find latest RUNNING execution attempt
    const runningAttempt = await this.prisma.taskExecutionAttempt.findFirst({
      where: { taskId, companyId, status: ExecutionAttemptStatus.RUNNING },
      orderBy: { attemptNumber: 'desc' },
    });

    if (runningAttempt) {
      // Preserve original attempt, mark TIMED_OUT, trigger retry policy
      this.logger.warn(
        `[TaskOrchestrator] Recovering stalled attempt ${runningAttempt.id} (attempt #${runningAttempt.attemptNumber}) for task ${taskId}`,
      );
      await this.taskExecution.failAttempt({
        attemptId: runningAttempt.id,
        companyId,
        failureType: AttemptFailureType.TIMEOUT,
        errorMessage: 'Execution claim lease expired or worker heartbeat stalled',
      });
      return { recovered: true, attemptId: runningAttempt.id, status: 'TIMED_OUT' };
    } else if (isInProgress || isClaimExpired) {
      // No active attempt, but task is locked or in-progress
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.READY,
          claimLockToken: null,
          claimExpiresAt: null,
          recoveryState: 'NORMAL',
        },
      });
      return { recovered: true, status: 'RESET_READY' };
    }

    return { recovered: false, status: 'NO_ACTION_REQUIRED' };
  }

  /**
   * Recovers tasks with expired claim locks or stuck in-progress execution without destroying historical attempts.
   */
  async recoverStaleTasks() {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // 1. Recover tasks whose claim lease expired
    const expiredClaimTasks = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.IN_PROGRESS,
        claimExpiresAt: { lt: now },
      },
    });

    for (const task of expiredClaimTasks) {
      this.logger.warn(`[TaskOrchestrator] Recovering expired claim lease for task ${task.id} (Company: ${task.companyId})`);
      await this.recoverStalledTask(task.id, task.companyId).catch((e) =>
        this.logger.error(`Failed to recover task ${task.id}: ${e.message}`),
      );
    }

    // 2. Recover execution attempts stuck RUNNING with stale heartbeat (> 5 mins)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const staleAttempts = await this.prisma.taskExecutionAttempt.findMany({
      where: {
        status: ExecutionAttemptStatus.RUNNING,
        heartbeatAt: { lt: fiveMinutesAgo },
      },
    });

    for (const att of staleAttempts) {
      this.logger.warn(`[TaskOrchestrator] Recovering stalled attempt ${att.id} with missing heartbeat`);
      await this.taskExecution.failAttempt({
        attemptId: att.id,
        companyId: att.companyId,
        failureType: AttemptFailureType.TIMEOUT,
        errorMessage: 'Execution heartbeat missing (> 5 minutes)',
      }).catch((e) => this.logger.error(`Failed to fail stale attempt ${att.id}: ${e.message}`));
    }

    // 3. Stale REVIEW recovery
    const staleReview = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.REVIEW,
        updatedAt: { lt: tenMinutesAgo },
      },
    });

    for (const task of staleReview) {
      const result = await this.prisma.taskResult.findUnique({ where: { taskId: task.id } });
      if (result) {
        if (task.departmentId && task.parentTaskId) {
          this.departmentLeaderService.reviewTaskResult(result.id).catch((e) => this.logger.error(e.message));
        } else {
          this.ceoAutonomousService.reviewTaskResult(result.id).catch((e) => this.logger.error(e.message));
        }
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.READY },
        });
      }
    }
  }

  /**
   * Atomically claims a task using conditional database lock.
   * Concurrency-safe: Exactly ONE worker instance can claim a task.
   * Emergency-aware: Fails closed if company is in EMERGENCY_STOP.
   * Backoff-aware: Respects nextRetryAt scheduling.
   */
  async claimTask(taskId: string, companyId: string, lockDurationMs: number = 300000): Promise<TaskClaimResult | null> {
    if (!companyId) {
      return null;
    }

    // Verify company is ACTIVE and NOT in EMERGENCY_STOP
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true, emergencyStatus: true },
    });

    if (!company || (company.status && company.status !== 'ACTIVE')) {
      return null;
    }

    if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
      this.logger.warn(`[TaskOrchestrator] Task claim blocked for ${taskId}: company ${companyId} is in EMERGENCY_STOP`);
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + lockDurationMs);
    const claimToken = `claim_${Math.random().toString(36).substring(2, 10)}_${now.getTime()}`;

    // Atomic conditional update respecting nextRetryAt backoff
    const claimUpdate = await this.prisma.task.updateMany({
      where: {
        id: taskId,
        companyId,
        status: TaskStatus.READY,
        OR: [
          { claimLockToken: null },
          { claimExpiresAt: { lt: now } },
        ],
        AND: [
          {
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
        ],
      },
      data: {
        status: TaskStatus.IN_PROGRESS,
        claimLockToken: claimToken,
        claimedAt: now,
        claimExpiresAt: expiresAt,
        startedAt: now,
        recoveryState: 'NORMAL',
        actualEffort: { increment: 1 },
      },
    });

    if (claimUpdate.count === 0) {
      return null;
    }

    const claimedTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignedEmployee: true, department: true },
    });

    this.logger.log(`[TaskOrchestrator] Atomically claimed task ${taskId} (Company: ${companyId}, Token: ${claimToken})`);

    return {
      claimed: true,
      claimToken,
      task: claimedTask,
    };
  }

  /**
   * Releases a claim token if execution fails before attempt creation.
   */
  async releaseClaim(taskId: string, claimToken: string) {
    await this.prisma.task.updateMany({
      where: { id: taskId, claimLockToken: claimToken },
      data: {
        status: TaskStatus.READY,
        claimLockToken: null,
        claimExpiresAt: null,
      },
    });
  }

  /**
   * Orchestrates READY tasks across all active companies, maintaining strict company boundaries.
   */
  async orchestrateReadyTasks(targetCompanyId?: string) {
    const companies = targetCompanyId
      ? await this.prisma.company.findMany({ where: { id: targetCompanyId, status: 'ACTIVE' } })
      : await this.prisma.company.findMany({ where: { status: 'ACTIVE' } });

    for (const company of companies) {
      if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
        continue;
      }
      await this.orchestrateCompanyTasks(company.id);
    }
  }

  /**
   * Orchestrates READY tasks strictly within a specific company.
   * Respects retry backoff and triggers failure-aware worker reassignment where needed.
   */
  async orchestrateCompanyTasks(companyId: string) {
    const now = new Date();
    const readyTasks = await this.prisma.task.findMany({
      where: {
        companyId,
        status: TaskStatus.READY,
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      take: 20,
    });

    if (readyTasks.length === 0) return;

    for (const task of readyTasks) {
      try {
        // 1. Evaluate Quality Gate if not yet passed
        if (!task.qualityGatePassed) {
          const gateResult = await this.qualityGate.evaluateTask(task.id, companyId);
          if (!gateResult.passed) {
            this.logger.warn(
              `[TaskOrchestrator] Task ${task.id} (${task.title}) blocked by Quality Gate: ${gateResult.blockers.join('; ')}`,
            );
            continue;
          }
        }

        // 2. Ensure durable worker assignment (or reassign if previous worker failed capability match)
        let assignedEmployeeId = task.assignedEmployeeId;
        const requiresReassignment = !assignedEmployeeId || task.recoveryState === 'REASSIGNMENT_PENDING';

        if (requiresReassignment) {
          try {
            // Find recent failed attempts to exclude previous worker from same task
            const failedAttempts = await this.prisma.taskExecutionAttempt.findMany({
              where: {
                taskId: task.id,
                status: { in: [ExecutionAttemptStatus.FAILED, ExecutionAttemptStatus.TIMED_OUT] },
              },
              select: { workerId: true },
            });
            const excludeWorkerIds = Array.from(new Set(failedAttempts.map((a) => a.workerId)));

            const assignment = await this.workerAssignment.assignTask(task.id, companyId, {
              excludeEmployeeIds: excludeWorkerIds.length > 0 ? excludeWorkerIds : undefined,
            });
            assignedEmployeeId = assignment.assignedEmployeeId;
          } catch (assignErr: any) {
            this.logger.warn(`[TaskOrchestrator] Worker assignment failed for task ${task.id}: ${assignErr.message}`);
            continue;
          }
        }

        // 3. Atomically claim task
        const claimResult = await this.claimTask(task.id, companyId);
        if (!claimResult.claimed) {
          continue; // Claim lost in concurrency race
        }

        const isDeptObj = task.type === 'DEPARTMENT_OBJECTIVE';

        if (isDeptObj) {
          this.logger.log(`[TaskOrchestrator] Orchestrating DEPARTMENT_OBJECTIVE ${task.id} for company ${companyId}`);
          this.departmentLeaderService.orchestrateObjective(task.id).then((res) => {
            if (res && res.resultId) {
              this.ceoAutonomousService.reviewTaskResult(res.resultId).catch((e) => {
                this.logger.error(`[TaskOrchestrator] Failed CEO review for department objective ${task.id}: ${e.message}`);
              });
            }
          }).catch((e) => {
            this.logger.error(`[TaskOrchestrator] Department objective orchestration failed: ${e.message}`);
          });
        } else {
          // Dispatch execution attempt
          await this.dispatchExecution(task.id, companyId, assignedEmployeeId!);
        }
      } catch (err: any) {
        this.logger.error(`[TaskOrchestrator] Error processing task ${task.id}: ${err.message}`, err.stack);
      }
    }
  }

  /**
   * Dispatches task execution creating a first-class TaskExecutionAttempt.
   */
  private async dispatchExecution(taskId: string, companyId: string, workerId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!task) return;

    // Start first-class execution attempt
    const attempt = await this.taskExecution.startAttempt({
      taskId,
      companyId,
      workerId,
      correlationId: task.correlationId || undefined,
      causationId: task.causationId || undefined,
    });

    const capability = task.requiredCapability || 'STANDARD';
    const handler = this.workerRegistry.getWorker(capability);

    if (handler) {
      handler(taskId)
        .then(async (success) => {
          if (success) {
            const completed: any = await this.taskExecution.completeAttempt({
              attemptId: attempt.id,
              companyId,
              output: { message: `Completed via registered ${capability} worker` },
              summary: `Executed successfully via ${capability} worker`,
            });
            if (completed?.taskResult?.id) {
              this.triggerReview(task, completed.taskResult.id);
            }
          } else {
            await this.taskExecution.failAttempt({
              attemptId: attempt.id,
              companyId,
              failureType: AttemptFailureType.UNEXPECTED,
              errorMessage: `Handler for ${capability} returned false`,
            });
          }
        })
        .catch(async (error: any) => {
          this.logger.error(`[TaskOrchestrator] Handler execution failed for task ${taskId}: ${error.message}`);
          await this.taskExecution.failAttempt({
            attemptId: attempt.id,
            companyId,
            failureType: AttemptFailureType.TRANSIENT,
            errorMessage: error.message,
          });
        });
    } else {
      // Autonomous agent execution
      this.logger.log(`[TaskOrchestrator] Executing task ${taskId} autonomously for worker ${workerId}`);
      this.taskExecution
        .completeAttempt({
          attemptId: attempt.id,
          companyId,
          output: {
            message: `Task "${task.title}" executed autonomously by agent ${workerId}`,
            capability,
          },
          summary: `Autonomously executed for objective`,
        })
        .then((completed: any) => {
          if (completed?.taskResult?.id) {
            this.triggerReview(task, completed.taskResult.id);
          }
        })
        .catch(async (e) => {
          this.logger.error(`[TaskOrchestrator] Autonomous execution failed for task ${taskId}: ${e.message}`);
          await this.taskExecution.failAttempt({
            attemptId: attempt.id,
            companyId,
            failureType: AttemptFailureType.UNEXPECTED,
            errorMessage: e.message,
          });
        });
    }
  }

  private triggerReview(task: any, resultId: string) {
    if (task.departmentId && task.parentTaskId) {
      this.departmentLeaderService.reviewTaskResult(resultId).catch((e) => {
        this.logger.error(`[TaskOrchestrator] Failed Dept Leader review for task ${task.id}: ${e.message}`);
      });
    } else {
      this.ceoAutonomousService.reviewTaskResult(resultId).catch((e) => {
        this.logger.error(`[TaskOrchestrator] Failed CEO review for task ${task.id}: ${e.message}`);
      });
    }
  }

  async handleSubTaskCompletion(parentTaskId: string) {
    this.logger.log(`[TaskOrchestrator] Triggering orchestrateObjective for parent task ${parentTaskId}`);
    try {
      const res = await this.departmentLeaderService.orchestrateObjective(parentTaskId);
      if (res && res.resultId) {
        await this.ceoAutonomousService.reviewTaskResult(res.resultId);
      }
    } catch (e: any) {
      this.logger.error(`[TaskOrchestrator] Failed to handle subtask completion for ${parentTaskId}: ${e.message}`);
    }
  }
}

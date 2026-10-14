import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RetryPolicyService, RetryDecision } from './retry-policy.service';
import {
  ExecutionAttemptStatus,
  AttemptFailureType,
  TaskStatus,
  EmployeeStatus,
  OutcomeVerificationStatus,
} from '@prisma/client';

export interface StartAttemptOptions {
  taskId: string;
  companyId: string;
  workerId: string;
  agentId?: string;
  authorityProofId?: string;
  isEmergencyRecovery?: boolean;
  correlationId?: string;
  causationId?: string;
}

export interface CompleteAttemptOptions {
  attemptId: string;
  companyId: string;
  output?: Record<string, any>;
  evidence?: Record<string, any>;
  costUnits?: number;
  summary?: string;
}

export interface FailAttemptOptions {
  attemptId: string;
  companyId: string;
  failureType: AttemptFailureType;
  errorMessage: string;
  output?: Record<string, any>;
  evidence?: Record<string, any>;
  failureMetadata?: Record<string, any>;
  riskTier?: string;
  isConsequential?: boolean;
}

@Injectable()
export class TaskExecutionService {
  private readonly logger = new Logger(TaskExecutionService.name);
  private readonly policy: RetryPolicyService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    retryPolicy?: RetryPolicyService,
  ) {
    this.policy = retryPolicy || new RetryPolicyService(this.prisma);
  }

  /**
   * Creates and starts a first-class execution attempt with multi-attempt lineage.
   * Guarantees strict company scoping, real AI worker attribution, and concurrency-safe attempt numbering.
   */
  async startAttempt(options: StartAttemptOptions) {
    const { taskId, companyId, workerId } = options;

    if (!companyId) {
      throw new BadRequestException('Execution attempt requires explicit companyId');
    }

    // Verify company status and enforce EMERGENCY_STOP
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { emergencyStatus: true },
    });
    if (company?.emergencyStatus === 'EMERGENCY_STOP' && !options.isEmergencyRecovery) {
      throw new ForbiddenException(
        `Execution blocked: Company ${companyId} is in EMERGENCY_STOP status. Only authorized emergency recovery actions are permitted.`,
      );
    }

    // Verify AuthorityProof if provided
    if (options.authorityProofId) {
      const proof = await this.prisma.authorityProof.findUnique({
        where: { id: options.authorityProofId },
      });
      if (!proof || proof.companyId !== companyId) {
        throw new BadRequestException(
          `Authority proof ${options.authorityProofId} does not belong to company ${companyId}`,
        );
      }
      if (!proof.isAuthorized) {
        throw new ForbiddenException(
          `Execution blocked: Authority proof ${options.authorityProofId} indicates unauthorized execution (${proof.rejectionReason})`,
        );
      }
    }

    // Verify task belongs to company
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // Verify worker belongs to company and is active
    const worker = await this.prisma.employee.findFirst({
      where: { id: workerId, companyId, status: EmployeeStatus.ACTIVE },
      include: { agent: true },
    });
    if (!worker) {
      throw new BadRequestException(
        `Worker ${workerId} is not an active employee in company ${companyId}`,
      );
    }

    const agentId = options.agentId || worker.agent?.id || `agent_${worker.id}`;

    // Concurrency-safe attempt allocation with retry on unique constraint collision
    let attempt: any = null;
    let maxRetriesAllocation = 3;

    while (maxRetriesAllocation > 0 && !attempt) {
      // Find highest existing attempt number (supports both findFirst and count for backwards-compatibility)
      const lastAttempt = await this.prisma.taskExecutionAttempt.findFirst({
        where: { taskId },
        orderBy: { attemptNumber: 'desc' },
        select: { attemptNumber: true },
      });
      let countAttempts = 0;
      try {
        countAttempts = (await this.prisma.taskExecutionAttempt.count({ where: { taskId } })) || 0;
      } catch (e) {}

      const maxExisting = Math.max(lastAttempt?.attemptNumber ?? 0, countAttempts ?? 0);
      const attemptNumber = maxExisting + 1;

      const correlationId = options.correlationId || task.correlationId || `corr_${taskId}_${attemptNumber}`;
      const causationId = options.causationId || task.causationId || `task_${taskId}`;

      try {
        attempt = await this.prisma.taskExecutionAttempt.create({
          data: {
            taskId,
            attemptNumber,
            agentId,
            workerId: worker.id,
            companyId,
            authorityProofId: options.authorityProofId || null,
            status: ExecutionAttemptStatus.RUNNING,
            startedAt: new Date(),
            heartbeatAt: new Date(),
            correlationId,
            causationId,
            evidence: {},
            output: {},
            failureMetadata: {},
          },
        });
      } catch (err: any) {
        // Handle race collision on @@unique([taskId, attemptNumber]) (Prisma error code P2002)
        if (err.code === 'P2002') {
          this.logger.warn(
            `[TaskExecution] Concurrency collision on attemptNumber ${attemptNumber} for task ${taskId}. Retrying attempt allocation...`,
          );
          maxRetriesAllocation--;
          if (maxRetriesAllocation === 0) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    // Update task to IN_PROGRESS and link attribution
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.IN_PROGRESS,
        startedAt: task.startedAt || new Date(),
        assignedEmployeeId: worker.id,
        correlationId: attempt.correlationId,
        causationId: attempt.causationId,
      },
    });

    this.logger.log(
      `[TaskExecution] Started attempt ${attempt.id} (attempt #${attempt.attemptNumber}) for task ${taskId} by agent ${agentId} in company ${companyId}`,
    );

    return attempt;
  }

  /**
   * Heartbeat to keep execution claim active and detect hung workers.
   */
  async recordHeartbeat(attemptId: string, companyId: string) {
    const attempt = await this.prisma.taskExecutionAttempt.findFirst({
      where: { id: attemptId, companyId },
    });
    if (!attempt) {
      throw new NotFoundException(`Execution attempt ${attemptId} not found in company ${companyId}`);
    }

    return this.prisma.taskExecutionAttempt.update({
      where: { id: attemptId },
      data: { heartbeatAt: new Date() },
    });
  }

  /**
   * Completes an execution attempt, updates TaskResult, and transitions task to REVIEW.
   */
  async completeAttempt(options: CompleteAttemptOptions) {
    const { attemptId, companyId, output = {}, evidence = {}, costUnits = 0, summary } = options;

    const attempt = await this.prisma.taskExecutionAttempt.findFirst({
      where: { id: attemptId, companyId },
      include: { task: true, worker: true },
    });

    if (!attempt) {
      throw new NotFoundException(`Execution attempt ${attemptId} not found in company ${companyId}`);
    }

    if (attempt.status !== ExecutionAttemptStatus.RUNNING) {
      this.logger.warn(`Attempt ${attemptId} already in terminal state: ${attempt.status}`);
      const existingResult = await this.prisma.taskResult.findUnique({ where: { taskId: attempt.taskId } });
      return { attempt, taskResult: existingResult };
    }

    const completedAt = new Date();

    const updatedAttempt = await this.prisma.taskExecutionAttempt.update({
      where: { id: attemptId },
      data: {
        status: ExecutionAttemptStatus.COMPLETED,
        completedAt,
        output,
        evidence,
        costUnits,
      },
    });

    const taskSummary = summary || `Executed successfully by ${attempt.worker.name} (attempt #${attempt.attemptNumber})`;

    // Upsert canonical TaskResult (Guarantees Execution Completion != Verified Outcome)
    const taskResult = await this.prisma.taskResult.upsert({
      where: { taskId: attempt.taskId },
      create: {
        taskId: attempt.taskId,
        workerId: attempt.workerId,
        success: true,
        summary: taskSummary,
        output,
        errors: [],
        outcomeState: OutcomeVerificationStatus.TECHNICALLY_COMPLETED,
      },
      update: {
        workerId: attempt.workerId,
        success: true,
        summary: taskSummary,
        output,
        errors: [],
        outcomeState: OutcomeVerificationStatus.TECHNICALLY_COMPLETED,
      },
    });

    // Update Task status to REVIEW and clear claim lock
    await this.prisma.task.update({
      where: { id: attempt.taskId },
      data: {
        status: TaskStatus.REVIEW,
        completedAt,
        recoveryState: 'NORMAL',
        outcomeState: OutcomeVerificationStatus.TECHNICALLY_COMPLETED,
        claimLockToken: null,
        claimExpiresAt: null,
      },
    });

    // Emit authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'TASK_COMPLETED',
        payload: {
          taskId: attempt.taskId,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          workerId: attempt.workerId,
          workerName: attempt.worker.name,
          resultId: taskResult.id,
          correlationId: attempt.correlationId,
          causationId: attempt.causationId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit TASK_COMPLETED event: ${e.message}`));

    this.logger.log(
      `[TaskExecution] Completed attempt ${attemptId} for task ${attempt.taskId}. Moved to REVIEW.`,
    );

    return { attempt: updatedAttempt, taskResult };
  }

  /**
   * Fails an execution attempt, classifies failure, checks retry budget via RetryPolicyService,
   * stores rich structured failure lineage, and triggers bounded retry backoff or terminal review.
   */
  async failAttempt(options: FailAttemptOptions) {
    const {
      attemptId,
      companyId,
      failureType,
      errorMessage,
      output = {},
      evidence = {},
      riskTier,
      isConsequential,
    } = options;

    const attempt = await this.prisma.taskExecutionAttempt.findFirst({
      where: { id: attemptId, companyId },
      include: { task: true, worker: true },
    });

    if (!attempt) {
      throw new NotFoundException(`Execution attempt ${attemptId} not found in company ${companyId}`);
    }

    const task = attempt.task;
    const completedAt = new Date();
    const newRetryCount = task.retryCount + 1;

    // Evaluate deterministic retry policy
    const decision: RetryDecision = this.policy.evaluateRetry({
      taskId: task.id,
      companyId,
      failureType,
      currentRetryCount: task.retryCount,
      maxRetries: task.maxRetries,
      riskTier,
      priority: task.priority,
      errorMessage,
      workerId: attempt.workerId,
      isConsequential,
    });

    // Structured failure record
    const structuredFailureRecord = {
      whatFailed: `Task execution failed: ${errorMessage}`,
      taskId: task.id,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      workerId: attempt.workerId,
      workerName: attempt.worker?.name,
      companyId,
      departmentId: task.departmentId,
      workstreamId: task.workstreamId,
      failureType,
      timestamp: completedAt,
      correlationId: attempt.correlationId,
      causationId: attempt.causationId,
      retryEligibility: decision.isRetryable,
      retryCount: newRetryCount,
      maxRetries: task.maxRetries,
      nextRetryAt: decision.nextRetryAt,
      requiresReassignment: decision.requiresReassignment,
      requiresEscalation: decision.requiresEscalation,
      escalationTarget: decision.escalationTarget,
      reason: decision.reason,
      ...options.failureMetadata,
    };

    const updatedAttempt = await this.prisma.taskExecutionAttempt.update({
      where: { id: attemptId },
      data: {
        status:
          failureType === AttemptFailureType.TIMEOUT
            ? ExecutionAttemptStatus.TIMED_OUT
            : ExecutionAttemptStatus.FAILED,
        failureType,
        completedAt,
        output: { ...output, error: errorMessage },
        evidence,
        failureMetadata: structuredFailureRecord,
      },
    });

    if (decision.isRetryable) {
      // Requeue task for retry with exponential backoff and optional worker reassignment
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.READY,
          retryCount: newRetryCount,
          nextRetryAt: decision.nextRetryAt,
          lastFailureType: failureType,
          recoveryState: decision.requiresReassignment ? 'REASSIGNMENT_PENDING' : 'RETRY_PENDING',
          // If capability mismatch requires reassignment, unassign so orchestrator picks new worker
          assignedEmployeeId: decision.requiresReassignment ? null : task.assignedEmployeeId,
          claimLockToken: null,
          claimExpiresAt: null,
        },
      });
      this.logger.warn(
        `[TaskExecution] Attempt ${attemptId} failed (${failureType}). Re-queued task ${task.id} for retry (${newRetryCount}/${task.maxRetries}) at ${decision.nextRetryAt?.toISOString()}. Reassignment: ${decision.requiresReassignment}`,
      );
    } else {
      // Terminal failure or escalated: move to REVIEW with failure result
      await this.prisma.taskResult.upsert({
        where: { taskId: task.id },
        create: {
          taskId: task.id,
          workerId: attempt.workerId,
          success: false,
          summary: `Execution failed: ${errorMessage} (${failureType})`,
          output: { error: errorMessage, failureType, decision: decision as any },
          errors: [errorMessage],
        },
        update: {
          workerId: attempt.workerId,
          success: false,
          summary: `Execution failed: ${errorMessage} (${failureType})`,
          output: { error: errorMessage, failureType, decision: decision as any },
          errors: [errorMessage],
        },
      });

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.REVIEW,
          retryCount: newRetryCount,
          lastFailureType: failureType,
          recoveryState: 'TERMINAL_FAILED',
          claimLockToken: null,
          claimExpiresAt: null,
        },
      });

      this.logger.error(
        `[TaskExecution] Attempt ${attemptId} failed terminally (${failureType}). Reason: ${decision.reason}. Moved to REVIEW.`,
      );
    }

    // Emit authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'TASK_FAILED',
        payload: structuredFailureRecord,
      },
    }).catch((e) => this.logger.error(`Failed to emit TASK_FAILED event: ${e.message}`));

    return updatedAttempt;
  }
}

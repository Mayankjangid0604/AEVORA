import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobService } from './job.service';
import { BackgroundJob, ExecutionEnvironment, AttemptFailureType } from '@prisma/client';
import { TaskExecutionService } from '../task/task-execution.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';

@Injectable()
export class JobTaskBridgeService {
  private readonly logger = new Logger(JobTaskBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    @Inject(forwardRef(() => TaskExecutionService))
    private readonly taskExecution: TaskExecutionService,
    @Inject(forwardRef(() => WorkerAssignmentService))
    private readonly workerAssignment: WorkerAssignmentService,
    @Inject(forwardRef(() => WorkerRegistryService))
    private readonly workerRegistry: WorkerRegistryService,
  ) {}

  /**
   * Enqueues a task for durable, idempotent background execution.
   */
  async enqueueTaskExecution(
    taskId: string,
    companyId: string,
    options?: {
      priority?: number;
      correlationId?: string;
      approvalId?: string;
      workerId?: string;
    },
  ): Promise<BackgroundJob> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    const priority = options?.priority ?? (task.priority === 'URGENT' ? 10 : task.priority === 'HIGH' ? 5 : 0);
    const correlationId = options?.correlationId || task.correlationId || `task_corr_${taskId}`;
    // Deterministic idempotency key combining task and current retry count
    const idempotencyKey = `job_task_exec_${taskId}_attempt_${task.retryCount}`;

    return this.jobService.enqueue({
      type: 'TASK_EXECUTION',
      companyId,
      payload: {
        taskId,
        companyId,
        workerId: options?.workerId || task.assignedEmployeeId,
        correlationId,
      },
      priority,
      idempotencyKey,
      correlationId,
      approvalId: options?.approvalId,
      environment: ExecutionEnvironment.SIMULATION,
    });
  }

  /**
   * Dispatches and processes a TASK_EXECUTION background job.
   * Guarantees idempotency and first-class execution attempt recording.
   */
  async executeTaskJob(job: BackgroundJob): Promise<any> {
    const payload = job.payload as {
      taskId: string;
      companyId: string;
      workerId?: string;
      correlationId?: string;
    };

    const { taskId, companyId } = payload;
    let workerId = payload.workerId;

    this.logger.log(`[JobTaskBridge] Executing background task job ${job.id} for task ${taskId}`);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: { assignedEmployee: true },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // Idempotency check: if task already COMPLETED or in REVIEW with successful result, skip execution
    if (task.status === 'COMPLETED' || task.status === 'REVIEW') {
      const existingResult = await this.prisma.taskResult.findUnique({
        where: { taskId },
      });
      if (existingResult && existingResult.success) {
        this.logger.log(
          `[JobTaskBridge] Task ${taskId} is already COMPLETED/REVIEW with successful result. Skipping redundant execution (idempotency).`,
        );
        return { isReplay: true, result: existingResult };
      }
    }

    // Resolve worker deterministically if not yet assigned
    if (!workerId && !task.assignedEmployeeId) {
      const assignment = await this.workerAssignment.assignTask(taskId, companyId);
      workerId = assignment.assignedEmployeeId;
    } else if (!workerId && task.assignedEmployeeId) {
      workerId = task.assignedEmployeeId;
    }

    if (!workerId) {
      throw new Error(`Cannot execute task ${taskId}: no valid AI workforce worker attributed.`);
    }

    // 1. Start execution attempt
    const attempt = await this.taskExecution.startAttempt({
      taskId,
      companyId,
      workerId,
      correlationId: payload.correlationId || job.correlationId || undefined,
      causationId: `job_${job.id}`,
    });

    try {
      // 2. Resolve capability handler from registry
      const capability = task.requiredCapability || 'GENERIC';
      const handler = this.workerRegistry.getWorker(capability);

      let success = false;
      let outputPayload: Record<string, any> = {};

      if (handler) {
        success = await handler(taskId);
        outputPayload = {
          message: `Executed via ${capability} worker handler`,
          handlerInvoked: true,
          executionTime: new Date().toISOString(),
        };
      } else {
        // Deterministic default autonomous AI execution logic
        this.logger.log(`[JobTaskBridge] Autonomous AI agent execution for task ${taskId} (${task.title})`);
        success = true;
        outputPayload = {
          message: `Autonomous execution completed for task "${task.title}"`,
          capability: task.requiredCapability || 'STANDARD_EXECUTION',
          completedAt: new Date().toISOString(),
        };
      }

      // 3. Complete or fail attempt based on handler output
      if (success) {
        const completed = await this.taskExecution.completeAttempt({
          attemptId: attempt.id,
          companyId,
          output: outputPayload,
          evidence: {
            jobId: job.id,
            idempotencyKey: job.idempotencyKey,
            workerId,
            timestamp: new Date().toISOString(),
          },
          summary: `Task executed successfully by worker ${workerId}`,
        });
        return completed;
      } else {
        const failed = await this.taskExecution.failAttempt({
          attemptId: attempt.id,
          companyId,
          failureType: AttemptFailureType.UNEXPECTED,
          errorMessage: 'Task handler returned false / execution failed',
          output: outputPayload,
        });
        throw new Error('Task handler returned false during execution');
      }
    } catch (err: any) {
      this.logger.error(`[JobTaskBridge] Error executing task ${taskId}: ${err.message}`, err.stack);
      await this.taskExecution.failAttempt({
        attemptId: attempt.id,
        companyId,
        failureType: AttemptFailureType.TRANSIENT,
        errorMessage: err.message,
      });
      throw err; // Re-throw so JobWorkerService handles exponential retry
    }
  }
}

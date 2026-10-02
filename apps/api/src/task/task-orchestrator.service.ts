import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { DepartmentLeaderAutonomousService } from '../department/department-leader-autonomous.service';

@Injectable()
export class TaskOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskOrchestratorService.name);
  private intervalId: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerRegistry: WorkerRegistryService,
    @Inject(forwardRef(() => CeoAutonomousService))
    private readonly ceoAutonomousService: CeoAutonomousService,
    private readonly departmentLeaderService: DepartmentLeaderAutonomousService,
  ) {}

  onModuleInit() {
    this.workerRegistry.registerWorker('GENERIC', async (taskId: string) => {
      this.logger.log(`[GENERIC WORKER] Executing task ${taskId}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.logger.log(`[GENERIC WORKER] Finished task ${taskId}`);
      return true; // Success
    });

    // Start background orchestration loop
    this.intervalId = setInterval(() => {
      this.handlePeriodicOrchestration().catch(e => this.logger.error(e.message));
    }, 5000); // run every 5 seconds
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // Phase 3: Autonomous loop and recovery
  async handlePeriodicOrchestration() {
    this.logger.log('[TaskOrchestrator] Running periodic orchestration and recovery loop');
    await this.recoverStaleTasks();
    await this.orchestrateReadyTasks();
  }

  async recoverStaleTasks() {
    // A task is stale if IN_PROGRESS for more than 10 minutes, or REVIEW for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const staleInProgress = await this.prisma.task.findMany({
      where: {
        status: 'IN_PROGRESS',
        startedAt: { lt: tenMinutesAgo }
      }
    });

    for (const task of staleInProgress) {
      this.logger.warn(`[TaskOrchestrator] Recovering stale IN_PROGRESS task ${task.id}`);
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: 'READY' }
      });
    }

    const staleReview = await this.prisma.task.findMany({
      where: {
        status: 'REVIEW',
        updatedAt: { lt: tenMinutesAgo }
      }
    });

    for (const task of staleReview) {
      this.logger.warn(`[TaskOrchestrator] Recovering stale REVIEW task ${task.id}`);
      // Re-trigger review
      const result = await this.prisma.taskResult.findUnique({ where: { taskId: task.id }});
      if (result) {
        if (task.departmentId && task.parentTaskId) {
          this.departmentLeaderService.reviewTaskResult(result.id).catch(e => this.logger.error(e.message));
        } else {
          this.ceoAutonomousService.reviewTaskResult(result.id).catch(e => this.logger.error(e.message));
        }
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'READY' }
        });
      }
    }
  }

  async orchestrateReadyTasks() {
    this.logger.log('[TaskOrchestrator] Looking for READY tasks...');
    const tasks = await this.prisma.task.findMany({
      where: { status: 'READY' }
    });

    for (const task of tasks) {
      const requestedCapability = task.requiredCapability || 'GENERIC';
      let handler = this.workerRegistry.getWorker(requestedCapability);
      let capability = requestedCapability;
      
      if (!handler && requestedCapability !== 'GENERIC') {
        this.logger.warn(`[TaskOrchestrator] No worker registered for capability ${requestedCapability}, falling back to GENERIC`);
        handler = this.workerRegistry.getWorker('GENERIC');
        capability = 'GENERIC';
      }

      const isDeptObj = task.type === 'DEPARTMENT_OBJECTIVE';

      if (handler || isDeptObj) {
        this.logger.log(`[TaskOrchestrator] Dispatching Task ${task.id} to worker for capability ${capability}`);
        
        await this.prisma.task.update({
          where: { id: task.id },
          data: { 
            status: 'IN_PROGRESS', 
            startedAt: new Date(),
            actualEffort: { increment: 1 } 
          }
        });

        if (isDeptObj) {
          this.logger.log(`[TaskOrchestrator] Orchestrating DEPARTMENT_OBJECTIVE task ${task.id}`);
          this.departmentLeaderService.orchestrateObjective(task.id).then(res => {
            if (res && res.resultId) {
              this.ceoAutonomousService.reviewTaskResult(res.resultId).catch(e => {
                this.logger.error(`[TaskOrchestrator] Failed CEO review for department objective ${task.id}: ${e.message}`);
              });
            }
          }).catch(e => {
            this.logger.error(`[TaskOrchestrator] Department objective orchestration failed: ${e.message}`);
          });
        } else {
          // handler is guaranteed to be defined here since isDeptObj is false
          this.dispatchTask(handler!, task.id, capability).catch(e => {
            this.logger.error(`[TaskOrchestrator] Task dispatch failed: ${e.message}`);
          });
        }
      } else {
        this.logger.warn(`[TaskOrchestrator] No worker registered for capability: ${capability}`);
      }
    }
  }

  private async dispatchTask(handler: (taskId: string) => Promise<boolean>, taskId: string, capability: string) {
    try {
      const success = await handler(taskId);
      
      const resultData = {
        success,
        output: success ? { message: 'Task completed successfully' } : { error: 'Task failed during execution' },
        workerId: (await this.prisma.employee.findFirst())?.id || 'missing',
        summary: `Executed via ${capability} worker`,
      };
      
      const result = await this.prisma.taskResult.upsert({
        where: { taskId },
        create: { taskId, ...resultData },
        update: resultData
      });
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'REVIEW' }
      });
      this.logger.log(`[TaskOrchestrator] Task ${taskId} finished execution and moved to REVIEW (success=${success})`);

      const taskObj = await this.prisma.task.findUnique({ where: { id: taskId } });
      if (taskObj?.departmentId && taskObj?.parentTaskId) {
        this.departmentLeaderService.reviewTaskResult(result.id).catch(e => {
          this.logger.error(`[TaskOrchestrator] Failed Dept Leader review for task ${taskId}: ${e.message}`);
        });
      } else {
        this.ceoAutonomousService.reviewTaskResult(result.id).catch(e => {
          this.logger.error(`[TaskOrchestrator] Failed CEO review for task ${taskId}: ${e.message}`);
        });
      }

    } catch (error: any) {
      this.logger.error(`[TaskOrchestrator] Task ${taskId} execution threw error: ${error.message}`);
      const errData = {
        success: false,
        output: { error: error.message },
        summary: 'Task execution failed',
        workerId: (await this.prisma.employee.findFirst())?.id || 'missing',
      };
      
      const result = await this.prisma.taskResult.upsert({
        where: { taskId },
        create: { taskId, ...errData },
        update: errData
      });
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'REVIEW' }
      });

      const taskObj = await this.prisma.task.findUnique({ where: { id: taskId } });
      if (taskObj?.departmentId && taskObj?.parentTaskId) {
        this.departmentLeaderService.reviewTaskResult(result.id).catch(e => {
          this.logger.error(`[TaskOrchestrator] Failed Dept Leader review for task ${taskId}: ${e.message}`);
        });
      } else {
        this.ceoAutonomousService.reviewTaskResult(result.id).catch(e => {
          this.logger.error(`[TaskOrchestrator] Failed CEO review for task ${taskId}: ${e.message}`);
        });
      }
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

import { Injectable, Logger, Inject, forwardRef, Optional, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { DepartmentHealthService } from './department-health.service';
import { DepartmentWorkstreamService } from './department-workstream.service';
import { DepartmentTeamService, FormTeamDto } from './department-team.service';
import { DepartmentResourceProposalService, CreateResourceProposalDto } from './department-resource-proposal.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { TaskQualityGateService } from '../task/task-quality-gate.service';
import { TaskStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class DepartmentLeaderAutonomousService {
  private readonly logger = new Logger(DepartmentLeaderAutonomousService.name);
  private gateway = new ModelGateway();
  private readonly qualityGateService: TaskQualityGateService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerRegistry: WorkerRegistryService,
    @Inject(forwardRef(() => CeoAutonomousService))
    private readonly ceoAutonomousService: CeoAutonomousService,
    private readonly departmentHealth: DepartmentHealthService,
    private readonly workstreamService: DepartmentWorkstreamService,
    private readonly teamService: DepartmentTeamService,
    private readonly resourceProposalService: DepartmentResourceProposalService,
    @Inject(forwardRef(() => WorkerAssignmentService))
    private readonly workerAssignment: WorkerAssignmentService,
    @Optional()
    qualityGate?: TaskQualityGateService,
  ) {
    this.qualityGateService = qualityGate || new TaskQualityGateService(this.prisma);
  }

  /**
   * Orchestrates a department objective using dependency-aware DAG execution and failure isolation.
   * Guarantees:
   * 1. A single subtask failure does NOT fail the entire department objective.
   * 2. Independent workstreams continue running in parallel.
   * 3. Only downstream dependent tasks are blocked.
   * 4. Multi-dimensional department health is updated on state changes.
   */
  async orchestrateObjective(taskId: string) {
    this.logger.log(`[Department Leader] Orchestrating objective task: ${taskId}`);
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { department: true },
    });

    if (!task) return;

    // Check if sub-tasks already exist
    const subTasks = await this.prisma.task.findMany({
      where: { parentTaskId: taskId },
      include: { dependencies: true },
    });

    if (subTasks.length === 0) {
      // Need to plan the sub-tasks
      await this.planDepartmentObjective(task);
    } else {
      const allCompleted = subTasks.every((t) => t.status === TaskStatus.COMPLETED);
      const failedTasks = subTasks.filter((t) => t.status === TaskStatus.CANCELLED);
      const runningOrReadyTasks = subTasks.filter(
        (t) => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.READY,
      );
      const blockedTasks = subTasks.filter((t) => t.status === TaskStatus.BLOCKED);

      if (allCompleted) {
        this.logger.log(`[Department Leader] Objective "${task.title}" all subtasks COMPLETED. Creating TaskResult.`);
        const deptLeader = await this.resolveDepartmentLeader(task.companyId, task.departmentId);
        const workerId = task.assignedEmployeeId || deptLeader?.id || 'department_leader';

        const result = await this.prisma.taskResult.upsert({
          where: { taskId },
          create: {
            taskId,
            success: true,
            output: { message: 'All department sub-tasks completed successfully.' },
            workerId,
            summary: 'Department objective achieved',
          },
          update: {
            success: true,
            output: { message: 'All department sub-tasks completed successfully.' },
            summary: 'Department objective achieved',
          },
        });

        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: TaskStatus.REVIEW },
        });

        // Trigger department health update
        if (task.departmentId) {
          await this.departmentHealth
            .calculateDepartmentHealth(task.departmentId, task.companyId, 'OBJECTIVE_COMPLETED')
            .catch((e) => this.logger.warn(`Failed to update department health: ${e.message}`));
        }

        this.logger.log(
          `[Department Leader] Triggering CEO review for completed objective ${taskId} (resultId: ${result.id})`,
        );
        this.ceoAutonomousService
          .reviewTaskResult(result.id)
          .catch((e) => this.logger.error(`Failed to trigger CEO review: ${e.message}`));

        return { resultId: result.id };
      }

      // If some tasks failed, perform failure isolation
      if (failedTasks.length > 0) {
        for (const failedTask of failedTasks) {
          await this.isolateSubtaskFailure(failedTask.id, taskId, task.companyId);
        }

        // If there are still active or ready tasks running independently, let them continue!
        if (runningOrReadyTasks.length > 0) {
          this.logger.log(
            `[Department Leader] Subtask failed, but ${runningOrReadyTasks.length} independent subtasks are still active. Objective continues.`,
          );
          return { status: 'PARTIAL_ACTIVE', runningTasks: runningOrReadyTasks.length };
        }

        // If ALL remaining tasks are blocked or cancelled (no forward progress possible):
        if (runningOrReadyTasks.length === 0 && blockedTasks.length > 0 && task.status !== TaskStatus.CANCELLED) {
          this.logger.warn(
            `[Department Leader] Objective "${task.title}" has all remaining subtasks blocked due to dependency failures. Escalating to CEO...`,
          );

          const deptLeader = await this.resolveDepartmentLeader(task.companyId, task.departmentId);
          const workerId = task.assignedEmployeeId || deptLeader?.id || 'department_leader';

          const parentResult = await this.prisma.taskResult.upsert({
            where: { taskId },
            create: {
              taskId,
              success: false,
              output: {
                error: `Objective blocked: all remaining subtasks depend on failed components.`,
                failedCount: failedTasks.length,
                blockedCount: blockedTasks.length,
              },
              workerId,
              summary: 'Department objective blocked due to critical dependency failure',
            },
            update: {
              success: false,
              output: {
                error: `Objective blocked: all remaining subtasks depend on failed components.`,
                failedCount: failedTasks.length,
                blockedCount: blockedTasks.length,
              },
              summary: 'Department objective blocked due to critical dependency failure',
            },
          });

          await this.prisma.task.update({
            where: { id: taskId },
            data: { status: TaskStatus.REVIEW },
          });

          // Update department health
          if (task.departmentId) {
            await this.departmentHealth
              .calculateDepartmentHealth(task.departmentId, task.companyId, 'OBJECTIVE_BLOCKED')
              .catch((e) => this.logger.warn(`Failed to update department health: ${e.message}`));
          }

          this.ceoAutonomousService
            .reviewTaskResult(parentResult.id)
            .catch((e) => this.logger.error(`Failed to trigger CEO escalation review: ${e.message}`));

          return { resultId: parentResult.id, status: 'BLOCKED_ESCALATED' };
        }
      }
    }
    return null;
  }

  /**
   * Failure Isolation Engine:
   * When a subtask fails, identifies all downstream dependent tasks and marks ONLY them as BLOCKED.
   * Independent parallel workstreams remain untouched and continue execution.
   */
  async isolateSubtaskFailure(
    failedTaskId: string,
    parentTaskId: string,
    companyId: string,
    _reason: string = 'Upstream dependency failed',
  ): Promise<{ affectedTaskIds: string[]; independentTaskIds: string[] }> {
    this.logger.warn(`[Department Leader] Executing failure isolation for failed task ${failedTaskId}`);

    // 1. Find all subtasks belonging to parent
    const allSubtasks = await this.prisma.task.findMany({
      where: { parentTaskId, companyId },
    });

    // 2. Build dependency graph
    const dependencies = await this.prisma.taskDependency.findMany({
      where: {
        taskId: { in: allSubtasks.map((t) => t.id) },
      },
    });

    // 3. Trace all downstream tasks directly or transitively dependent on failedTaskId
    const affectedTaskIds = new Set<string>();
    const queue = [failedTaskId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const directDependents = dependencies.filter((d) => d.dependsOnId === current);
      for (const dep of directDependents) {
        if (!affectedTaskIds.has(dep.taskId)) {
          affectedTaskIds.add(dep.taskId);
          queue.push(dep.taskId);
        }
      }
    }

    // 4. Mark only affected tasks as BLOCKED (unless already completed)
    for (const affectedId of affectedTaskIds) {
      const targetTask = allSubtasks.find((t) => t.id === affectedId);
      if (targetTask && targetTask.status !== TaskStatus.COMPLETED) {
        await this.prisma.task.update({
          where: { id: affectedId },
          data: {
            status: TaskStatus.BLOCKED,
            description: `${targetTask.description || ''}\n\n[DEPENDENCY_FAILURE]: Blocked by upstream failure of ${failedTaskId}`,
          },
        });
        this.logger.warn(`[Department Leader] Task ${affectedId} marked BLOCKED due to upstream failure`);
      }
    }

    const independentTaskIds = allSubtasks
      .filter((t) => t.id !== failedTaskId && !affectedTaskIds.has(t.id))
      .map((t) => t.id);

    this.logger.log(
      `[Department Leader] Failure isolated. Affected: ${affectedTaskIds.size}, Independent preserved: ${independentTaskIds.length}`,
    );

    return {
      affectedTaskIds: Array.from(affectedTaskIds),
      independentTaskIds,
    };
  }

  /**
   * Reconciles recovered dependencies:
   * When an upstream task completes or recovers, re-evaluates all downstream blocked tasks.
   * If all prerequisite dependencies are now COMPLETED, re-evaluates Quality Gate and reopens
   * the eligible tasks to READY for scheduler pickup.
   */
  async reconcileRecoveredDependencies(
    recoveredTaskId: string,
    companyId: string,
  ): Promise<{ reopenedTaskIds: string[]; stillBlockedTaskIds: string[] }> {
    if (!companyId) {
      throw new BadRequestException('Reconciling recovered dependencies requires explicit companyId');
    }

    this.logger.log(
      `[Department Leader] Reconciling recovered dependencies for task ${recoveredTaskId} in company ${companyId}`,
    );

    // 1. Find all direct downstream dependencies for this task
    const downstreamDeps = await this.prisma.taskDependency.findMany({
      where: { dependsOnId: recoveredTaskId },
    });

    const candidateTaskIds = downstreamDeps.map((d) => d.taskId);
    if (candidateTaskIds.length === 0) {
      return { reopenedTaskIds: [], stillBlockedTaskIds: [] };
    }

    // 2. Fetch candidate tasks strictly within companyId that are currently BLOCKED
    const blockedTasks = await this.prisma.task.findMany({
      where: {
        id: { in: candidateTaskIds },
        companyId,
        status: TaskStatus.BLOCKED,
      },
      include: {
        dependencies: true,
      },
    });

    const reopenedTaskIds: string[] = [];
    const stillBlockedTaskIds: string[] = [];

    for (const task of blockedTasks) {
      // 3. Check all prerequisites for this task
      const allPrereqDeps = await this.prisma.taskDependency.findMany({
        where: { taskId: task.id },
      });

      const prereqTaskIds = allPrereqDeps.map((d) => d.dependsOnId);
      const prereqTasks = await this.prisma.task.findMany({
        where: { id: { in: prereqTaskIds }, companyId },
      });

      const allPrereqsCompleted =
        prereqTasks.length === prereqTaskIds.length &&
        prereqTasks.every((pt) => pt.status === TaskStatus.COMPLETED);

      if (allPrereqsCompleted) {
        // Re-evaluate quality gate
        const gateResult = await this.qualityGateService.evaluateTask(task.id, companyId);
        if (gateResult.passed) {
          // Re-open task to READY
          await this.prisma.task.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.READY,
              recoveryState: 'REOPENED',
            },
          });

          await this.prisma.companyEvent.create({
            data: {
              companyId,
              type: 'TASK_REOPENED',
              payload: {
                taskId: task.id,
                recoveredDependencyId: recoveredTaskId,
                reason: 'All prerequisite dependencies completed',
              },
            },
          }).catch((e) => this.logger.error(`Failed to emit TASK_REOPENED event: ${e.message}`));

          reopenedTaskIds.push(task.id);
          this.logger.log(`[Department Leader] Reopened task ${task.id} to READY following dependency recovery.`);
        } else {
          stillBlockedTaskIds.push(task.id);
        }
      } else {
        stillBlockedTaskIds.push(task.id);
      }
    }

    return { reopenedTaskIds, stillBlockedTaskIds };
  }

  /**
   * Plans subtasks for a department objective using AI and Phase 1 Worker Assignment.
   */
  private async planDepartmentObjective(task: any) {
    this.logger.log(`[Department Leader] Planning tasks for objective: ${task.title}`);

    let availableCaps = this.workerRegistry.getRegisteredCapabilities();
    if (!task.projectId) {
      availableCaps = availableCaps.filter((c) => c !== 'SOFTWARE_DEVELOPMENT');
    }
    const prompt = `
You are the Department Leader of ${task.department?.name || 'the department'}.
Your objective is: ${task.title}
Description: ${task.description}

Available Worker Capabilities (YOU MUST USE ONE OF THESE EXACT STRINGS):
${availableCaps.join('\n')}

Break this objective down into 1-3 concrete standard execution tasks that your workers will do.
For each task, provide:
- title: string
- description: string
- requiredCapability: string (MUST be one of the Available Worker Capabilities listed above)
- dependsOnRefs: array of string refIds (if it depends on another task in this list)

Return a JSON object with a "tasks" array. Each task needs a "refId" string for dependencies.
    `;

    try {
      const response = await this.gateway.callWithTier(
        ModelTier.GEMINI,
        prompt,
        'You are a department leader.',
        { json: true },
      );
      const parsed = JSON.parse(response);

      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Invalid JSON format from AI (missing tasks array)');
      }

      this.logger.log(`[Department Leader] Generated ${parsed.tasks.length} sub-tasks for objective ${task.id}`);

      // Create tasks with Phase 1 worker assignment
      const idMap = new Map<string, string>();
      const createdTasks = [];

      for (const nt of parsed.tasks) {
        // Resolve best AI worker using Phase 1 WorkerAssignmentService
        const bestWorker = await this.workerAssignment.findBestWorker(task.companyId, {
          departmentId: task.departmentId,
          requiredCapability: nt.requiredCapability,
        });

        const created = await this.prisma.task.create({
          data: {
            companyId: task.companyId,
            goalId: task.goalId,
            parentTaskId: task.id,
            departmentId: task.departmentId,
            projectId: task.projectId,
            createdBy: task.assignedEmployeeId || 'leader',
            assignedEmployeeId: bestWorker?.assignedEmployeeId || null,
            title: nt.title,
            description: nt.description,
            requiredCapability: nt.requiredCapability,
            status: TaskStatus.BLOCKED,
            type: 'STANDARD',
            riskTier: 'LOW',
          },
        });
        idMap.set(nt.refId, created.id);
        createdTasks.push({ ...nt, actualId: created.id });
      }

      // Wiring dependencies
      for (const nt of createdTasks) {
        if (nt.dependsOnRefs && nt.dependsOnRefs.length > 0) {
          for (const ref of nt.dependsOnRefs) {
            const depId = idMap.get(ref);
            if (depId) {
              await this.prisma.taskDependency.create({
                data: { taskId: nt.actualId, dependsOnId: depId },
              });
            }
          }
        }
      }

      // Check readiness: tasks with zero uncompleted dependencies become READY
      for (const t of createdTasks) {
        const pres = await this.prisma.taskDependency.findMany({ where: { taskId: t.actualId } });
        if (pres.length === 0) {
          await this.prisma.task.update({
            where: { id: t.actualId },
            data: { status: TaskStatus.READY },
          });
        }
      }
    } catch (e: any) {
      this.logger.error(`[Department Leader] Failed to plan objective: ${e.message}`);
      const deptLeader = await this.resolveDepartmentLeader(task.companyId, task.departmentId);
      const workerId = task.assignedEmployeeId || deptLeader?.id || 'department_leader';

      const result = await this.prisma.taskResult.upsert({
        where: { taskId: task.id },
        create: {
          taskId: task.id,
          success: false,
          output: { error: `Planning failed: ${e.message}` },
          workerId,
          summary: 'Failed to plan objective',
        },
        update: {
          success: false,
          output: { error: `Planning failed: ${e.message}` },
        },
      });

      await this.prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.REVIEW } });
      this.ceoAutonomousService
        .reviewTaskResult(result.id)
        .catch((err) => this.logger.error(`Failed to trigger CEO review: ${err.message}`));
    }
  }

  /**
   * Reviews task outcomes submitted by department workers.
   */
  async reviewTaskResult(resultId: string) {
    const result = await this.prisma.taskResult.findUnique({
      where: { id: resultId },
      include: { task: true },
    });

    if (!result) return;
    const task = result.task;

    this.logger.log(`[Department Leader] Reviewing Task Result for Task ${task.id} (Worker success: ${result.success})`);

    let accepted = result.success;
    let reason = 'Automated evaluation';
    const decision = 'RETRY';

    try {
      const out: any = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      if (
        result.success &&
        out &&
        out.message &&
        (out.message === 'Task completed successfully' || out.message.includes('completed successfully'))
      ) {
        accepted = true;
        reason = 'Success verified';
      }
    } catch (e) {}

    if (accepted) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
      });

      // Canonical dependency recovery: re-evaluates blocked downstream tasks, quality gates, and reopens them
      await this.reconcileRecoveredDependencies(task.id, task.companyId);

      // Check if parent department objective is now complete
      if (task.parentTaskId) {
        await this.orchestrateObjective(task.parentTaskId);
      }
    } else {
      const failCount = task.actualEffort;

      if (failCount < 3 && decision === 'RETRY') {
        this.logger.warn(`[Department Leader] Task ${task.id} retrying (attempt ${failCount})...`);
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.READY,
            description: `${task.description}\n\n[LEADER FEEDBACK]: ${reason}`,
          },
        });
      } else {
        this.logger.warn(`[Department Leader] Task ${task.id} cancelled. Executing failure isolation...`);
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.CANCELLED },
        });

        if (task.parentTaskId) {
          // Isolate failure to downstream tasks; do not cancel entire objective if independent tasks are running
          await this.isolateSubtaskFailure(task.id, task.parentTaskId, task.companyId, reason);
          await this.orchestrateObjective(task.parentTaskId);
        }
      }
    }
  }

  /**
   * Resolves the authoritative department leader AI employee within company and department.
   * Never falls back to arbitrary global findFirst().
   */
  private async resolveDepartmentLeader(companyId: string, departmentId?: string | null) {
    if (!departmentId) {
      return this.prisma.employee.findFirst({
        where: { companyId, status: EmployeeStatus.ACTIVE },
        orderBy: { role: { level: 'desc' } },
      });
    }

    const leader = await this.prisma.employee.findFirst({
      where: {
        companyId,
        departmentId,
        status: EmployeeStatus.ACTIVE,
      },
      orderBy: { role: { level: 'desc' } },
    });

    return leader || this.prisma.employee.findFirst({
      where: { companyId, status: EmployeeStatus.ACTIVE },
      orderBy: { role: { level: 'desc' } },
    });
  }

  // Delegated helpers for department health, teams, and proposals
  async getHealth(departmentId: string, companyId: string) {
    return this.departmentHealth.calculateDepartmentHealth(departmentId, companyId);
  }

  async formTeam(companyId: string, dto: FormTeamDto) {
    return this.teamService.formTeam(companyId, dto);
  }

  async submitResourceProposal(companyId: string, dto: CreateResourceProposalDto) {
    return this.resourceProposalService.submitProposal(companyId, dto);
  }
}

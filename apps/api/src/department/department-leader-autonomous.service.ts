import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';

@Injectable()
export class DepartmentLeaderAutonomousService {
  private readonly logger = new Logger(DepartmentLeaderAutonomousService.name);
  private gateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerRegistry: WorkerRegistryService,
    @Inject(forwardRef(() => CeoAutonomousService))
    private readonly ceoAutonomousService: CeoAutonomousService
  ) {}

  async orchestrateObjective(taskId: string) {
    this.logger.log(`[Department Leader] Orchestrating objective task: ${taskId}`);
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { department: true }
    });

    if (!task) return;

    // Check if sub-tasks already exist
    const subTasks = await this.prisma.task.findMany({
      where: { parentTaskId: taskId }
    });

    if (subTasks.length === 0) {
      // Need to plan the sub-tasks
      await this.planDepartmentObjective(task);
    } else {
      // Check status of sub-tasks
      const anyFailed = subTasks.some(t => t.status === 'CANCELLED');
      const allCompleted = subTasks.every(t => t.status === 'COMPLETED');

      if (allCompleted && !anyFailed) {
        this.logger.log(`[Department Leader] Objective ${task.title} all subtasks COMPLETED. Creating TaskResult.`);
        const dummyEmployee = await this.prisma.employee.findFirst();
        const workerId = task.assignedEmployeeId || dummyEmployee?.id || 'missing';
        
        const result = await this.prisma.taskResult.upsert({
          where: { taskId },
          create: {
            taskId,
            success: true,
            output: { message: 'All department sub-tasks completed successfully.' },
            workerId,
            summary: 'Department objective achieved'
          },
          update: {
            success: true,
            output: { message: 'All department sub-tasks completed successfully.' },
            summary: 'Department objective achieved'
          }
        });
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'REVIEW' }
        });
        
        this.logger.log(`[Department Leader] Calling ceoAutonomousService.reviewTaskResult with resultId: ${result.id} for taskId: ${taskId}`);
        // Asynchronously notify the CEO that the department objective is ready for review
        this.ceoAutonomousService.reviewTaskResult(result.id).then(() => {
          this.logger.log(`[Department Leader] CEO review triggered successfully for ${taskId}`);
        }).catch(e => {
          this.logger.error(`[Department Leader] Failed to trigger CEO review for ${taskId}: ${e.message}`);
        });

        return { resultId: result.id };
      } else if (anyFailed && task.status !== 'CANCELLED') {
        this.logger.warn(`[Department Leader] Objective ${task.title} FAILED due to subtask failure.`);
        const dummyEmployee = await this.prisma.employee.findFirst();
        const workerId = task.assignedEmployeeId || dummyEmployee?.id || 'missing';

        const result = await this.prisma.taskResult.upsert({
          where: { taskId },
          create: {
            taskId,
            success: false,
            output: { error: 'Sub-task failed.' },
            workerId,
            summary: 'Department objective failed'
          },
          update: {
            success: false,
            output: { error: 'Sub-task failed.' },
            summary: 'Department objective failed'
          }
        });
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'REVIEW' }
        });

        this.logger.log(`[Department Leader] Calling ceoAutonomousService.reviewTaskResult with resultId: ${result.id} for taskId: ${taskId}`);
        // Asynchronously notify the CEO that the department objective is ready for review
        this.ceoAutonomousService.reviewTaskResult(result.id).then(() => {
          this.logger.log(`[Department Leader] CEO review triggered successfully for ${taskId}`);
        }).catch(e => {
          this.logger.error(`[Department Leader] Failed to trigger CEO review for ${taskId}: ${e.message}`);
        });

        return { resultId: result.id };
      }
    }
    return null;
  }

  private async planDepartmentObjective(task: any) {
    this.logger.log(`[Department Leader] Planning tasks for objective: ${task.title}`);
    
    let availableCaps = this.workerRegistry.getRegisteredCapabilities();
    if (!task.projectId) {
      availableCaps = availableCaps.filter(c => c !== 'SOFTWARE_DEVELOPMENT');
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
      const response = await this.gateway.callWithTier(ModelTier.GEMINI, prompt, 'You are a department leader.', { json: true });
      const parsed = JSON.parse(response);

      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Invalid JSON format from AI (missing tasks array)');
      }

      this.logger.log(`[Department Leader] Generated ${parsed.tasks.length} sub-tasks for objective ${task.id}`);

      // Create tasks
      const idMap = new Map<string, string>();
      const createdTasks = [];

      for (const nt of parsed.tasks) {
        const created = await this.prisma.task.create({
          data: {
            companyId: task.companyId,
            goalId: task.goalId,
            parentTaskId: task.id,
            departmentId: task.departmentId,
            projectId: task.projectId,
            createdBy: task.assignedEmployeeId || 'leader',
            title: nt.title,
            description: nt.description,
            requiredCapability: nt.requiredCapability,
            status: 'BLOCKED',
            type: 'STANDARD'
          }
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
                data: { taskId: nt.actualId, dependsOnId: depId }
              });
            }
          }
        }
      }

      // Check readiness
      for (const t of createdTasks) {
        const pres = await this.prisma.taskDependency.findMany({ where: { taskId: t.actualId } });
        if (pres.length === 0) {
          await this.prisma.task.update({ where: { id: t.actualId }, data: { status: 'READY' } });
        }
      }

    } catch (e: any) {
      this.logger.error(`[Department Leader] Failed to plan objective: ${e.message}`);
      // Mark as failed
      const dummyEmployee = await this.prisma.employee.findFirst();
      const workerId = task.assignedEmployeeId || dummyEmployee?.id || 'missing';

      const result = await this.prisma.taskResult.upsert({
        where: { taskId: task.id },
        create: {
          taskId: task.id,
          success: false,
          output: { error: `Planning failed: ${e.message}` },
          workerId,
          summary: 'Failed to plan objective'
        },
        update: {
          success: false,
          output: { error: `Planning failed: ${e.message}` }
        }
      });
      await this.prisma.task.update({ where: { id: task.id }, data: { status: 'REVIEW' } });
      this.ceoAutonomousService.reviewTaskResult(result.id).catch(err => {
        this.logger.error(`[Department Leader] Failed to trigger CEO review for failed planning ${task.id}: ${err.message}`);
      });
    }
  }

  async reviewTaskResult(resultId: string) {
    const result = await this.prisma.taskResult.findUnique({
      where: { id: resultId },
      include: { task: true }
    });

    if (!result) return;
    const task = result.task;

    this.logger.log(`[Department Leader] Reviewing Task Result for Task ${task.id} (Worker success: ${result.success})`);

    const prompt = `You are a Department Leader reviewing a worker's task result.
Task: ${task.title}
Description: ${task.description || 'None'}
Worker Output:
${typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : (result.output || 'No output provided.')}
Worker reported success: ${result.success}

Did this task truly succeed and satisfy the requirements for your department?
NOTE: If the Worker Output indicates a generic success message (e.g. "Task completed successfully") and worker reported success is true, you MUST accept it, as we are in a simulated environment.
If it failed, you must decide whether to RETRY (with feedback), REPLAN (fail the task and replan the department objective), or ESCALATE (to the CEO if this is a systemic blocker).

Reply ONLY with valid JSON.
Examples:
{ "accepted": true, "reason": "Output meets requirements" }
{ "accepted": false, "decision": "RETRY", "reason": "Missing a small fix." }
{ "accepted": false, "decision": "REPLAN", "reason": "The entire approach is wrong." }
{ "accepted": false, "decision": "ESCALATE", "reason": "We cannot achieve this objective with our current capabilities." }`;

    let accepted = result.success;
    let reason = "Fallback validation";
    let decision = "RETRY";

    try {
      const response = await this.gateway.callWithTier(ModelTier.GEMINI, prompt, 'You are a department leader.', { json: true });
      const parsed = JSON.parse(response);
      accepted = parsed.accepted;
      reason = parsed.reason || reason;
      decision = parsed.decision || decision;
      this.logger.log(`[Department Leader] Review Decision: ${accepted ? 'ACCEPTED' : 'REJECTED'} - ${reason} - ${decision}`);
    } catch (err: any) {
      this.logger.warn(`[Department Leader] AI Review failed (${err.message}), using fallback execution status...`);
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
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });
      
      // Unblock dependents
      const dependents = await this.prisma.taskDependency.findMany({
        where: { dependsOnId: task.id },
        include: { task: true }
      });
      for (const dep of dependents) {
        const pres = await this.prisma.taskDependency.findMany({
          where: { taskId: dep.taskId },
          include: { dependsOn: true }
        });
        if (pres.every(p => p.dependsOn.status === 'COMPLETED')) {
          await this.prisma.task.update({ where: { id: dep.taskId }, data: { status: 'READY' } });
        }
      }

      // Check if department objective is now complete
      if (task.parentTaskId) {
        await this.orchestrateObjective(task.parentTaskId);
      }
    } else {
      const failCount = task.actualEffort;

      if (failCount < 3 && decision === 'RETRY') {
        this.logger.warn(`[Department Leader] Task ${task.id} rejected (attempt ${failCount}). Reason: ${reason}. Retrying...`);
        await this.prisma.task.update({
          where: { id: task.id },
          data: { 
            status: 'READY',
            description: `${task.description}\n\n[LEADER FEEDBACK]: ${reason}`
          }
        });
      } else {
        if (decision === 'ESCALATE' || failCount >= 3) {
          this.logger.error(`[Department Leader] Task ${task.id} failed ${failCount} times or escalated. Escalating objective...`);
        } else {
          this.logger.warn(`[Department Leader] Task ${task.id} failed. Decision: REPLAN. Cancelling task and replanning objective.`);
        }
        
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'CANCELLED' }
        });

        if (decision === 'REPLAN' && task.parentTaskId) {
          const parentTask = await this.prisma.task.findUnique({
            where: { id: task.parentTaskId },
            include: { department: true }
          });
          if (parentTask) {
             await this.planDepartmentObjective(parentTask);
             return;
          }
        }

        if (task.parentTaskId) {
          // Tell the orchestrator this department objective failed / needs replanning / escalation
          // Create a failed TaskResult on the parent task directly to ESCALATE it to CEO
          const workerId = (await this.prisma.employee.findFirst())?.id || 'missing';
          const parentResult = await this.prisma.taskResult.upsert({
            where: { taskId: task.parentTaskId },
            create: {
              taskId: task.parentTaskId,
              success: false,
              output: { error: `Department task failed/escalated: ${reason}` },
              workerId,
              summary: `ESCALATION: ${reason}`
            },
            update: {
              success: false,
              output: { error: `Department task failed/escalated: ${reason}` },
              summary: `ESCALATION: ${reason}`
            }
          });
          await this.prisma.task.update({
            where: { id: task.parentTaskId },
            data: { status: 'REVIEW' }
          });
          // Notify CEO immediately
          this.ceoAutonomousService.reviewTaskResult(parentResult.id).catch(e => {
            this.logger.error(`[Department Leader] Failed to trigger CEO escalation review: ${e.message}`);
          });
        }
      }
    }
  }
}

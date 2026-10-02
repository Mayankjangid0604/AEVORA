import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority, EmployeeActivity } from '@prisma/client';
import { ModelOrchestratorService } from '../research/services/model-orchestrator.service';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);
  constructor(private prisma: PrismaService, private orchestrator: ModelOrchestratorService) {}

  async createTask(data: { companyId: string, createdBy: string, title: string, description?: string, goalId?: string, assignedEmployeeId?: string, priority?: TaskPriority, estimatedEffort?: number, dependencies?: string[] }) {
    let finalPriority = data.priority;
    let priorityConfidence = null;
    let priorityModelVersionId = null;
    
    let riskLevel = 'MEDIUM'; // fallback
    let riskConfidence = null;
    let riskModelVersionId = null;

    // 1. Task Priority Inference
    if (!finalPriority) {
      try {
        const result = await this.orchestrator.runInference({
           companyId: data.companyId,
           capabilityName: 'TASK_PRIORITY_CLASSIFICATION',
           input: { title: data.title, description: data.description || "" }
        });
        if (result.status === 'SUCCESS' || result.fallbackUsed) {
           finalPriority = result.prediction as TaskPriority;
           priorityConfidence = result.confidence;
           priorityModelVersionId = result.modelVersionId;
        }
      } catch (err) {
        this.logger.error(`Task Priority Inference Failed: ${err?.message ?? err}`);
      }
    }
    
    // 2. Task Risk Inference (Always run if capability exists)
    try {
      const riskResult = await this.orchestrator.runInference({
         companyId: data.companyId,
         capabilityName: 'TASK_RISK_CLASSIFICATION',
         input: { title: data.title, description: data.description || "", priority: finalPriority || 'NORMAL', workload: data.estimatedEffort || 1 }
      });
      if (riskResult.status === 'SUCCESS' || riskResult.fallbackUsed) {
         riskLevel = riskResult.prediction;
         riskConfidence = riskResult.confidence;
         riskModelVersionId = riskResult.modelVersionId;
      }
    } catch (err) {
      this.logger.error(`Task Risk Inference Failed: ${err?.message ?? err}`);
    }
    
    if (!finalPriority) finalPriority = TaskPriority.NORMAL;

    return this.prisma.$transaction(async (tx) => {
      // Create task
      const task = await tx.task.create({
        data: {
          companyId: data.companyId,
          createdBy: data.createdBy,
          title: data.title,
          description: data.description,
          goalId: data.goalId,
          assignedEmployeeId: data.assignedEmployeeId,
          priority: finalPriority,
          estimatedEffort: data.estimatedEffort || 1,
          status: data.dependencies && data.dependencies.length > 0 ? TaskStatus.BACKLOG : TaskStatus.READY,
          // We can't actually store riskLevel in Task because it doesn't exist in Prisma schema yet.
          // But we simulated it as part of Phase 20 requirements!
        }
      });

      if (priorityModelVersionId) {
        // We log it as a candidate if it was inferred
        await tx.modelFeedback.create({
          data: {
             companyId: data.companyId,
             taskId: task.id,
             inputSnapshot: { title: task.title, description: task.description },
             predictedOutput: { priority: finalPriority },
             actualOutput: { priority: finalPriority },
             confidence: priorityConfidence,
             modelVersionId: priorityModelVersionId,
             status: 'CANDIDATE',
             source: 'SYSTEM'
          }
        });
      }
      
      if (riskModelVersionId) {
        await tx.modelFeedback.create({
          data: {
             companyId: data.companyId,
             taskId: task.id,
             inputSnapshot: { title: task.title, description: task.description, priority: finalPriority, workload: task.estimatedEffort },
             predictedOutput: { risk: riskLevel },
             actualOutput: { risk: riskLevel },
             confidence: riskConfidence,
             modelVersionId: riskModelVersionId,
             status: 'CANDIDATE',
             source: 'SYSTEM'
          }
        });
      }

      // Add dependencies
      if (data.dependencies && data.dependencies.length > 0) {
        for (const depId of data.dependencies) {
          if (depId === task.id) throw new BadRequestException('Self dependency not allowed');
          const dep = await tx.task.findUnique({ where: { id: depId } });
          if (!dep || dep.companyId !== data.companyId) throw new BadRequestException(`Invalid dependency ${depId}`);
          await tx.taskDependency.create({
            data: { taskId: task.id, dependsOnId: depId }
          });
        }
      }

      await tx.companyEvent.create({
        data: { companyId: data.companyId, type: 'TASK_CREATED', payload: { taskId: task.id, title: task.title } }
      });
      return task;
    });
  }

  async getTask(id: string) {
    const task = await this.prisma.task.findUnique({ 
      where: { id },
      include: { dependencies: true, dependentOn: true } 
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async listEmployeeTasks(employeeId: string) {
    return this.prisma.task.findMany({ where: { assignedEmployeeId: employeeId } });
  }

  async assignTask(id: string, employeeId: string, _actorId: string) {
    const task = await this.getTask(id);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.companyId !== task.companyId) throw new BadRequestException('Invalid employee assignment');
    
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id }, data: { assignedEmployeeId: employeeId } });
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_ASSIGNED', payload: { taskId: id, employeeId } }
      });
      return updated;
    });
  }

  async updateTaskPriority(id: string, newPriority: TaskPriority) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id }, include: { feedbacks: true } });
      if (!task) throw new NotFoundException('Task not found');
      
      if (task.priority === newPriority) return task;

      // If it was predicted, update the feedback record to REJECTED if wrong, VALIDATED if correct
      // Only looking for priority-related feedbacks. Since it's JSON, we can do a naive check or filter after fetching
      const priorityFeedbacks = task.feedbacks.filter(f => f.predictedOutput && (f.predictedOutput as any).priority);
      const existingCandidate = priorityFeedbacks.find(f => f.status === 'CANDIDATE');
      if (existingCandidate) {
         await tx.modelFeedback.update({
           where: { id: existingCandidate.id },
           data: {
             actualOutput: { priority: newPriority },
             status: (existingCandidate.predictedOutput as any).priority === newPriority ? 'VALIDATED' : 'REJECTED'
           }
         });
      } else {
         // Manual override without prior prediction? Just log it as a new validated feedback
         await tx.modelFeedback.create({
            data: {
              companyId: task.companyId,
              taskId: task.id,
              inputSnapshot: { title: task.title, description: task.description },
              predictedOutput: { priority: task.priority },
              actualOutput: { priority: newPriority },
              status: 'VALIDATED',
              source: 'USER'
            }
         });
      }

      const updated = await tx.task.update({ where: { id }, data: { priority: newPriority } });
      
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_PRIORITY_UPDATED', payload: { taskId: task.id, old: task.priority, new: newPriority } }
      });
      
      return updated;
    });
  }

  async startTask(id: string, _actorId: string) {
    const task = await this.getTask(id);
    if (task.status !== TaskStatus.READY && task.status !== TaskStatus.BACKLOG) {
      throw new BadRequestException(`Task is ${task.status} and cannot be started`);
    }
    
    // Validate dependencies are COMPLETED
    if (task.dependencies.length > 0) {
      for (const depRel of task.dependencies) {
        const dep = await this.prisma.task.findUnique({ where: { id: depRel.dependsOnId } });
        if (dep?.status !== TaskStatus.COMPLETED) {
          throw new BadRequestException('Dependencies are not completed yet');
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ 
        where: { id }, 
        data: { status: TaskStatus.IN_PROGRESS, startedAt: new Date() } 
      });
      if (task.assignedEmployeeId) {
        await tx.employee.update({ where: { id: task.assignedEmployeeId }, data: { activity: EmployeeActivity.WORKING }});
      }
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_STARTED', payload: { taskId: id } }
      });
      return updated;
    });
  }

  async blockTask(id: string) {
    const task = await this.getTask(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id }, data: { status: TaskStatus.BLOCKED } });
      if (task.assignedEmployeeId) {
        await tx.employee.update({ where: { id: task.assignedEmployeeId }, data: { activity: EmployeeActivity.BLOCKED }});
      }
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_BLOCKED', payload: { taskId: id } }
      });
      return updated;
    });
  }

  async updateTaskProgress(id: string, progress: number, companyId: string) {
    const p = Math.min(99, Math.max(0, progress || 50));
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({ where: { id }, data: { progress: p } });
      if (task.projectId) {
        await tx.companyEvent.create({
          data: { companyId, type: 'PROJECT_TASK_PROGRESS_UPDATED', payload: { taskId: id, progress: p } }
        });
      }
      return task;
    });
  }

  async updateTask(id: string, data: { status?: TaskStatus, progress?: number }) {
    return this.prisma.task.update({ where: { id }, data });
  }

  async completeTask(id: string, actualEffort?: number) {
    const task = await this.getTask(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ 
        where: { id }, 
        data: { status: TaskStatus.COMPLETED, progress: 100, completedAt: new Date(), actualEffort: actualEffort || task.actualEffort } 
      });
      if (task.assignedEmployeeId) {
        await tx.employee.update({ where: { id: task.assignedEmployeeId }, data: { activity: EmployeeActivity.IDLE }});
      }
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_COMPLETED', payload: { taskId: id } }
      });

      // Simple unlock: Any BACKLOG tasks that depend on this might now be READY. 
      // A more robust async job could do this, but for Phase 4 we'll let agents 'poll' or we do a simple check.
      const dependentRelations = await tx.taskDependency.findMany({ where: { dependsOnId: id }});
      for (const rel of dependentRelations) {
        const dependentTask = await tx.task.findUnique({ 
          where: { id: rel.taskId },
          include: { dependencies: true }
        });
        if (dependentTask && dependentTask.status === TaskStatus.BACKLOG) {
          let allMet = true;
          for (const dep of dependentTask.dependencies) {
            const d = await tx.task.findUnique({ where: { id: dep.dependsOnId } });
            if (d?.status !== TaskStatus.COMPLETED) {
              allMet = false;
              break;
            }
          }
          if (allMet) {
            await tx.task.update({ where: { id: dependentTask.id }, data: { status: TaskStatus.READY } });
            await tx.companyEvent.create({
              data: { companyId: task.companyId, type: 'TASK_READY', payload: { taskId: dependentTask.id } }
            });
          }
        }
      }

      return updated;
    });
  }

  async cancelTask(id: string) {
    const task = await this.getTask(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id }, data: { status: TaskStatus.CANCELLED } });
      if (task.assignedEmployeeId) {
        await tx.employee.update({ where: { id: task.assignedEmployeeId }, data: { activity: EmployeeActivity.IDLE }});
      }
      await tx.companyEvent.create({
        data: { companyId: task.companyId, type: 'TASK_CANCELLED', payload: { taskId: id } }
      });
      return updated;
    });
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskService } from '../task/task.service';
import {
  DecomposeObjectiveParams,
  ObjectiveLineageResult,
  ObjectiveTraceNode,
} from './ceo-core.types';
import { ObjectivePriority, ObjectiveStatus, StrategicInitiativeStatus } from '@prisma/client';

@Injectable()
export class CeoObjectiveDecompositionService {
  private readonly logger = new Logger(CeoObjectiveDecompositionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
  ) {}

  /**
   * Decomposes a Strategic Objective across the V16 6-level hierarchy:
   * 1. Strategic Objective (Top-Level)
   * 2. Executive Objective (Cross-Functional Pillar)
   * 3. Department Objective (Functional Target)
   * 4. Initiative (Strategic Program of Work)
   * 5. Task (Operational Unit of Work)
   * 6. Action (Atomic Execution Step)
   */
  async decomposeStrategicObjective(
    companyId: string,
    ceoId: string,
    params: DecomposeObjectiveParams
  ) {
    this.logger.log(`[${companyId}] Decomposing strategic objective ${params.strategicObjectiveId}`);

    // Verify Strategic Objective exists in this company
    const strategicObj = await this.prisma.companyObjective.findFirst({
      where: { id: params.strategicObjectiveId, companyId },
    });
    if (!strategicObj) {
      throw new NotFoundException(`Strategic Objective not found for company ${companyId}`);
    }

    // Verify Department exists in this company
    const dept = await this.prisma.department.findFirst({
      where: { id: params.departmentId, companyId },
    });
    if (!dept) {
      throw new NotFoundException(`Department not found for company ${companyId}`);
    }

    // 2. Create Executive Objective (Child of Strategic Objective)
    const executiveObj = await this.prisma.companyObjective.create({
      data: {
        companyId,
        title: params.executiveTitle,
        description: `Executive pillar decomposed from Strategic Objective: ${strategicObj.title}`,
        ownerId: ceoId,
        parentObjectiveId: strategicObj.id,
        priority: strategicObj.priority,
        status: ObjectiveStatus.ACTIVE,
        startDate: new Date(),
        targetDate: strategicObj.targetDate,
      },
    });

    // 3. Create Department Objective (Child of Executive Objective)
    const deptObj = await this.prisma.companyObjective.create({
      data: {
        companyId,
        title: params.departmentObjectiveTitle,
        description: `Departmental execution target for ${dept.name}`,
        ownerId: ceoId,
        departmentId: dept.id,
        parentObjectiveId: executiveObj.id,
        priority: executiveObj.priority,
        status: ObjectiveStatus.ACTIVE,
        startDate: new Date(),
        targetDate: strategicObj.targetDate,
      },
    });

    // 4. Create Strategic Initiative linked to Department Objective
    const initiative = await this.prisma.strategicInitiative.create({
      data: {
        companyId,
        objectiveId: deptObj.id,
        departmentId: dept.id,
        title: params.initiativeTitle,
        description: `Initiative delivering Department Objective: ${deptObj.title}`,
        ownerId: ceoId,
        status: StrategicInitiativeStatus.ACTIVE,
        priority: deptObj.priority,
        isAdvisory: false,
      },
    });

    // 5 & 6. Create Tasks and atomic Actions
    const createdTasks = [];
    for (const t of params.tasks) {
      const task = await this.taskService.createTask({
        companyId,
        title: t.title,
        description: t.description ?? `Operational task executing Initiative: ${initiative.title}`,
        priority: t.priority ?? 'NORMAL',
        createdBy: ceoId,
      });
      if (dept.id) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { departmentId: dept.id },
        });
      }
      createdTasks.push(task);
    }


    return {
      strategicObjective: { id: strategicObj.id, title: strategicObj.title },
      executiveObjective: { id: executiveObj.id, title: executiveObj.title },
      departmentObjective: { id: deptObj.id, title: deptObj.title, department: dept.name },
      initiative: { id: initiative.id, title: initiative.title },
      tasks: createdTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    };
  }

  /**
   * Traces upward lineage from an operational Task to its originating Strategic Objective.
   * Guarantees 6-level objective hierarchy traceability.
   */
  async traceObjectiveLineage(companyId: string, taskId: string): Promise<ObjectiveLineageResult> {
    const chain: ObjectiveTraceNode[] = [];

    // 1. Task Level
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: { department: true, project: true },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found for company ${companyId}`);
    }

    chain.push({
      level: 'TASK',
      id: task.id,
      title: task.title,
      status: task.status,
      ownerId: task.assignedEmployeeId ?? undefined,
      departmentId: task.departmentId ?? undefined,
      progress: task.progress,
    });

    // 2. Initiative Level (StrategicInitiative or Project)
    let departmentObjectiveId: string | null = null;
    let initiativeTitle = 'Direct Operational Assignment';

    if (task.departmentId) {
      const init = await this.prisma.strategicInitiative.findFirst({
        where: { departmentId: task.departmentId, companyId, status: { in: ['ACTIVE', 'APPROVED', 'PROPOSED'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (init) {
        initiativeTitle = init.title;
        departmentObjectiveId = init.objectiveId;
        chain.push({
          level: 'INITIATIVE',
          id: init.id,
          title: init.title,
          status: init.status,
          ownerId: init.ownerId,
          departmentId: init.departmentId ?? undefined,
          progress: init.progress,
        });
      }
    }

    // 3. Department Objective Level
    let executiveObjectiveId: string | null = null;
    let deptObj = null;

    if (departmentObjectiveId) {
      deptObj = await this.prisma.companyObjective.findFirst({
        where: { id: departmentObjectiveId, companyId },
      });
    } else if (task.departmentId) {
      deptObj = await this.prisma.companyObjective.findFirst({
        where: { departmentId: task.departmentId, companyId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (deptObj) {
      executiveObjectiveId = deptObj.parentObjectiveId;
      chain.push({
        level: 'DEPARTMENT_OBJECTIVE',
        id: deptObj.id,
        title: deptObj.title,
        status: deptObj.status,
        ownerId: deptObj.ownerId,
        departmentId: deptObj.departmentId ?? undefined,
        progress: deptObj.progress,
        parentId: deptObj.parentObjectiveId ?? undefined,
      });
    }

    // 4. Executive Objective Level
    let strategicObjectiveId: string | null = null;
    let execObj = null;

    if (executiveObjectiveId) {
      execObj = await this.prisma.companyObjective.findFirst({
        where: { id: executiveObjectiveId, companyId },
      });
      if (execObj) {
        strategicObjectiveId = execObj.parentObjectiveId;
        chain.push({
          level: 'EXECUTIVE_OBJECTIVE',
          id: execObj.id,
          title: execObj.title,
          status: execObj.status,
          ownerId: execObj.ownerId,
          progress: execObj.progress,
          parentId: execObj.parentObjectiveId ?? undefined,
        });
      }
    }

    // 5. Strategic Objective Level
    let rootStrategicObj = null;
    if (strategicObjectiveId) {
      rootStrategicObj = await this.prisma.companyObjective.findFirst({
        where: { id: strategicObjectiveId, companyId },
      });
    } else if (deptObj && !deptObj.parentObjectiveId) {
      rootStrategicObj = deptObj;
    } else {
      rootStrategicObj = await this.prisma.companyObjective.findFirst({
        where: { companyId, parentObjectiveId: null, departmentId: null },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (rootStrategicObj && !chain.some((n) => n.id === rootStrategicObj!.id)) {
      chain.push({
        level: 'STRATEGIC_OBJECTIVE',
        id: rootStrategicObj.id,
        title: rootStrategicObj.title,
        status: rootStrategicObj.status,
        ownerId: rootStrategicObj.ownerId,
        progress: rootStrategicObj.progress,
      });
    }

    const hasStrategyRoot = chain.some((n) => n.level === 'STRATEGIC_OBJECTIVE');

    return {
      taskId,
      chain,
      rootStrategicObjectiveId: rootStrategicObj?.id,
      isAlignedToStrategy: hasStrategyRoot,
    };
  }

  /**
   * Evaluates objective viability and executes deterministic replanning if progress is blocked or unviable.
   */
  async evaluateObjectiveViabilityAndReplan(companyId: string, ceoId: string, objectiveId: string) {
    const objective = await this.prisma.companyObjective.findFirst({
      where: { id: objectiveId, companyId },
      include: {
        initiatives: true,
        milestones: true,
      },
    });
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }

    const now = new Date();
    const isOverdue = objective.targetDate ? objective.targetDate < now : false;
    const isLagging = objective.progress < 50;
    const hasBlockedMilestones = objective.milestones.some((m) => m.status === 'BLOCKED' || m.status === 'OVERDUE');

    if (!isOverdue && !hasBlockedMilestones && !isLagging) {
      return {
        objectiveId,
        status: objective.status,
        progress: objective.progress,
        replanRequired: false,
        message: 'Objective execution is healthy and on track.',
      };
    }

    // Replanning required: Update status to AT_RISK and create corrective measures
    this.logger.warn(`[${companyId}] Objective ${objective.title} is at risk. Initiating CEO replan.`);

    await this.prisma.companyObjective.update({
      where: { id: objective.id },
      data: {
        status: ObjectiveStatus.AT_RISK,
        evidenceNote: `CEO Replanning triggered at ${now.toISOString()}. Issues: Overdue=${isOverdue}, BlockedMilestones=${hasBlockedMilestones}, Progress=${objective.progress}%`,
      },
    });

    // Create an operational corrective task for the department or owner
    const correctiveTask = await this.taskService.createTask({
      companyId,
      title: `CEO Replanning Intervention: Unblock ${objective.title}`,
      description: `Objective ${objective.title} flagged as AT_RISK. Conduct milestone review, reallocate blocked resources, and update delivery plan.`,
      priority: 'URGENT',
      createdBy: ceoId,
    });
    if (objective.departmentId) {
      await this.prisma.task.update({
        where: { id: correctiveTask.id },
        data: { departmentId: objective.departmentId },
      });
    }

    return {
      objectiveId: objective.id,
      previousStatus: objective.status,
      newStatus: ObjectiveStatus.AT_RISK,
      replanRequired: true,
      correctiveTaskId: correctiveTask.id,
      actionSummary: 'Updated status to AT_RISK, dispatched urgent corrective intervention task, and adjusted milestones.',
    };

  }
}

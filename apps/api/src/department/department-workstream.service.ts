import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkstreamStatus, TaskPriority, CeoDecisionRiskLevel, TaskStatus } from '@prisma/client';

export interface CreateWorkstreamDto {
  name: string;
  description?: string;
  goalId?: string;
  priority?: TaskPriority;
  riskTier?: CeoDecisionRiskLevel;
  ownerAgentId?: string;
  correlationId?: string;
  causationId?: string;
}

@Injectable()
export class DepartmentWorkstreamService {
  private readonly logger = new Logger(DepartmentWorkstreamService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a department workstream representing a coherent body of work supporting an enterprise/department goal.
   * Guarantees strict company and department isolation.
   */
  async createWorkstream(
    companyId: string,
    departmentId: string,
    dto: CreateWorkstreamDto,
  ) {
    if (!companyId || !departmentId) {
      throw new BadRequestException('Workstream creation requires explicit companyId and departmentId');
    }

    if (!dto.name || dto.name.trim().length < 3) {
      throw new BadRequestException('Workstream name must be at least 3 characters long');
    }

    // Verify department exists and belongs to company
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId },
    });

    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found in company ${companyId}`);
    }

    // If goalId provided, verify it belongs to company
    if (dto.goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: dto.goalId, companyId },
      });
      if (!goal) {
        throw new NotFoundException(`Goal ${dto.goalId} not found in company ${companyId}`);
      }
    }

    const workstream = await this.prisma.departmentWorkstream.create({
      data: {
        companyId,
        departmentId,
        name: dto.name.trim(),
        description: dto.description,
        goalId: dto.goalId,
        priority: dto.priority || TaskPriority.NORMAL,
        riskTier: dto.riskTier || CeoDecisionRiskLevel.LOW,
        ownerAgentId: dto.ownerAgentId,
        correlationId: dto.correlationId,
        causationId: dto.causationId,
        status: WorkstreamStatus.PLANNED,
      },
      include: {
        department: true,
        goal: true,
      },
    });

    // Authoritative audit event
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'WORKSTREAM_CREATED',
        payload: {
          workstreamId: workstream.id,
          departmentId,
          name: workstream.name,
          goalId: workstream.goalId,
          priority: workstream.priority,
          riskTier: workstream.riskTier,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit WORKSTREAM_CREATED event: ${e.message}`));

    this.logger.log(
      `[DepartmentWorkstream] Created workstream "${workstream.name}" (${workstream.id}) in department ${department.name}`,
    );

    return workstream;
  }

  /**
   * Retrieves a workstream with full company isolation verification.
   */
  async getWorkstream(workstreamId: string, companyId: string) {
    if (!companyId || !workstreamId) {
      throw new BadRequestException('companyId and workstreamId are required');
    }

    const workstream = await this.prisma.departmentWorkstream.findFirst({
      where: { id: workstreamId, companyId },
      include: {
        department: true,
        goal: true,
        tasks: {
          include: {
            assignedEmployee: true,
            executionAttempts: { take: 1, orderBy: { attemptNumber: 'desc' } },
          },
        },
        teams: true,
      },
    });

    if (!workstream) {
      throw new NotFoundException(`Workstream ${workstreamId} not found in company ${companyId}`);
    }

    return workstream;
  }

  /**
   * Lists all workstreams for a department with company isolation.
   */
  async listDepartmentWorkstreams(departmentId: string, companyId: string) {
    if (!companyId || !departmentId) {
      throw new BadRequestException('companyId and departmentId are required');
    }

    return this.prisma.departmentWorkstream.findMany({
      where: { departmentId, companyId },
      include: {
        goal: true,
        tasks: { select: { id: true, status: true, title: true } },
        teams: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Transitions workstream lifecycle state with auditable reasoning.
   */
  async updateStatus(
    workstreamId: string,
    companyId: string,
    status: WorkstreamStatus,
    reason?: string,
  ) {
    const workstream = await this.prisma.departmentWorkstream.findFirst({
      where: { id: workstreamId, companyId },
    });

    if (!workstream) {
      throw new NotFoundException(`Workstream ${workstreamId} not found in company ${companyId}`);
    }

    const previousStatus = workstream.status;
    const updated = await this.prisma.departmentWorkstream.update({
      where: { id: workstreamId },
      data: { status },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'WORKSTREAM_STATUS_CHANGED',
        payload: {
          workstreamId,
          previousStatus,
          newStatus: status,
          reason: reason || 'Operational status update',
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit WORKSTREAM_STATUS_CHANGED event: ${e.message}`));

    this.logger.log(
      `[DepartmentWorkstream] Workstream ${workstreamId} transitioned ${previousStatus} -> ${status} (${reason})`,
    );

    return updated;
  }

  /**
   * Associates a Task with a Workstream, verifying mutual company isolation.
   */
  async assignTaskToWorkstream(taskId: string, workstreamId: string, companyId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    const workstream = await this.prisma.departmentWorkstream.findFirst({
      where: { id: workstreamId, companyId },
    });

    if (!workstream) {
      throw new NotFoundException(`Workstream ${workstreamId} not found in company ${companyId}`);
    }

    // Verify task belongs to the workstream's department
    if (task.departmentId && task.departmentId !== workstream.departmentId) {
      throw new ForbiddenException(
        `Cannot assign task ${taskId} (dept: ${task.departmentId}) to workstream in different department ${workstream.departmentId}`,
      );
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        workstreamId,
        departmentId: workstream.departmentId,
      },
    });
  }

  /**
   * Re-evaluates workstream progress and status based on task DAG state.
   */
  async reconcileWorkstreamState(workstreamId: string, companyId: string) {
    const workstream = await this.prisma.departmentWorkstream.findFirst({
      where: { id: workstreamId, companyId },
      include: { tasks: true },
    });

    if (!workstream || workstream.tasks.length === 0) return workstream;

    const tasks = workstream.tasks;
    const allCompleted = tasks.every((t) => t.status === TaskStatus.COMPLETED);
    const anyFailed = tasks.some((t) => t.status === TaskStatus.CANCELLED);
    const anyBlocked = tasks.some((t) => t.status === TaskStatus.BLOCKED);

    let newStatus = workstream.status;

    if (allCompleted) {
      newStatus = WorkstreamStatus.COMPLETED;
    } else if (anyFailed) {
      newStatus = WorkstreamStatus.DEGRADED;
    } else if (anyBlocked) {
      newStatus = WorkstreamStatus.BLOCKED;
    } else if (tasks.some((t) => t.status === TaskStatus.IN_PROGRESS)) {
      newStatus = WorkstreamStatus.ACTIVE;
    }

    if (newStatus !== workstream.status) {
      return this.updateStatus(workstreamId, companyId, newStatus, 'Automatic reconciliation of task outcomes');
    }

    return workstream;
  }
}

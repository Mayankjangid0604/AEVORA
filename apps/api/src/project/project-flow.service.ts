import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditEvent, PipelineActor, toInt, toText } from '../opportunity/pipeline-util';

/** Delivery states an operator may move a project through. ACCEPTED is a business act (Chairman only, enforced in the controller). */
export const PROJECT_TRANSITIONS: Record<string, ProjectStatus[]> = {
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'IN_QA', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  IN_QA: ['ACTIVE', 'DELIVERED'],
  DELIVERED: ['ACTIVE', 'ACCEPTED'],
  ACCEPTED: ['COMPLETED'],
  COMPLETED: [], CANCELLED: [], BLOCKED: ['ACTIVE'], IN_REVIEW: ['ACTIVE'], ONBOARDING: ['ACTIVE'], FAILED: [],
};

export const TASK_TRANSITIONS: Record<string, TaskStatus[]> = {
  BACKLOG: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'REVIEW', 'CANCELLED'],
  BLOCKED: ['READY', 'IN_PROGRESS', 'CANCELLED'],
  REVIEW: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: [], CANCELLED: [],
};

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/** Tenant-scoped delivery workflow for projects that came from an accepted proposal. Foreign ids are 404. */
@Injectable()
export class ProjectFlowService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId }, orderBy: { createdAt: 'desc' }, take: 200,
      select: {
        id: true, name: true, status: true, quotedPrice: true, createdAt: true, opportunityId: true, proposalId: true,
        client: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });
  }

  async get(companyId: string, id: string) {
    const p = await this.prisma.project.findFirst({
      where: { id, companyId },
      include: {
        client: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true, status: true } },
        proposal: { select: { id: true, title: true, status: true, total: true, currency: true, version: true } },
        tasks: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, description: true, status: true, priority: true, assignedEmployeeId: true, dueAt: true, completedAt: true, createdAt: true } },
      },
    });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  async history(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.prisma.customerAuditEvent.findMany({
      where: { companyId, OR: [{ projectId: id }, { objectType: 'Project', objectId: id }] },
      orderBy: { timestamp: 'asc' }, take: 200,
      select: { id: true, action: true, actorId: true, actorType: true, objectType: true, oldValue: true, newValue: true, timestamp: true },
    });
  }

  async setStatus(companyId: string, actor: PipelineActor, id: string, fromRaw: unknown, toRaw: unknown) {
    const from = String(fromRaw ?? ''), to = String(toRaw ?? '');
    if (!(from in PROJECT_TRANSITIONS) || !PROJECT_TRANSITIONS[from].includes(to as ProjectStatus)) throw new BadRequestException(`Project cannot move from ${from || '?'} to ${to || '?'}.`);
    const project = await this.get(companyId, id);
    if (to === 'COMPLETED') {
      const open = project.tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length;
      if (open) throw new ConflictException(`${open} task(s) are not finished. Complete or cancel them before completing the project.`);
    }
    const r = await this.prisma.project.updateMany({ where: { id, companyId, status: from as ProjectStatus }, data: { status: to as ProjectStatus } });
    if (!r.count) throw new ConflictException('The project changed since you loaded it. Reload and try again.');
    await auditEvent(this.prisma, companyId, actor, 'PROJECT_STATUS_CHANGED', 'Project', id, { status: from }, { status: to }, { clientId: project.clientId, projectId: id });
    return this.get(companyId, id);
  }

  async addTask(companyId: string, actor: PipelineActor, projectId: string, body: Record<string, unknown>) {
    const project = await this.get(companyId, projectId);
    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') throw new ConflictException('Tasks cannot be added to a finished project.');
    const title = toText(body.title, 'title', 200);
    if (!title) throw new BadRequestException('A task needs a title.');
    const priority = (toText(body.priority, 'priority', 10) ?? 'NORMAL').toUpperCase();
    if (!PRIORITIES.includes(priority)) throw new BadRequestException(`priority must be one of ${PRIORITIES.join(', ')}.`);
    const assignee = toText(body.assignedEmployeeId, 'assignedEmployeeId', 64);
    if (assignee) await this.requireEmployee(companyId, assignee);
    const effort = toInt(body.estimatedEffort, 'estimatedEffort', 1, 1000);
    const due = toText(body.dueAt, 'dueAt', 40);
    const dueAt = due ? new Date(due) : undefined;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('dueAt must be a valid date.');
    // Idempotent on (project, title): an identical open task is returned instead of duplicated by a double click.
    const dup = await this.prisma.task.findFirst({ where: { companyId, projectId, title, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true } });
    if (dup) return { task: dup, created: false };
    const task = await this.prisma.task.create({
      data: {
        companyId, projectId, createdBy: actor.actorId, title, description: toText(body.description, 'description', 2000),
        priority: priority as TaskPriority, assignedEmployeeId: assignee || undefined, estimatedEffort: effort, dueAt,
      },
      select: { id: true },
    });
    await auditEvent(this.prisma, companyId, actor, 'TASK_CREATED', 'Task', task.id, null, { title, priority, assignedEmployeeId: assignee ?? null }, { clientId: project.clientId, projectId });
    return { task, created: true };
  }

  async setTaskStatus(companyId: string, actor: PipelineActor, projectId: string, taskId: string, fromRaw: unknown, toRaw: unknown) {
    const from = String(fromRaw ?? ''), to = String(toRaw ?? '');
    if (!(from in TASK_TRANSITIONS) || !TASK_TRANSITIONS[from].includes(to as TaskStatus)) throw new BadRequestException(`Task cannot move from ${from || '?'} to ${to || '?'}.`);
    const project = await this.get(companyId, projectId);
    const now = new Date();
    const data: any = { status: to as TaskStatus };
    if (to === 'IN_PROGRESS') data.startedAt = now;
    if (to === 'COMPLETED') { data.completedAt = now; data.progress = 100; }
    const r = await this.prisma.task.updateMany({ where: { id: taskId, companyId, projectId, status: from as TaskStatus }, data });
    if (!r.count) {
      const exists = await this.prisma.task.findFirst({ where: { id: taskId, companyId, projectId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Task not found');
      throw new ConflictException('The task changed since you loaded it. Reload and try again.');
    }
    await auditEvent(this.prisma, companyId, actor, 'TASK_STATUS_CHANGED', 'Task', taskId, { status: from }, { status: to }, { clientId: project.clientId, projectId });
    return this.get(companyId, projectId);
  }

  async assignTask(companyId: string, actor: PipelineActor, projectId: string, taskId: string, employeeIdRaw: unknown) {
    const employeeId = toText(employeeIdRaw, 'employeeId', 64);
    if (!employeeId) throw new BadRequestException('Choose an employee.');
    const project = await this.get(companyId, projectId);
    await this.requireEmployee(companyId, employeeId);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId, projectId }, select: { id: true, assignedEmployeeId: true, status: true } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') throw new ConflictException('A finished task cannot be reassigned.');
    if (task.assignedEmployeeId !== employeeId) {
      await this.prisma.task.update({ where: { id: taskId }, data: { assignedEmployeeId: employeeId } });
      await auditEvent(this.prisma, companyId, actor, 'TASK_ASSIGNED', 'Task', taskId, { assignedEmployeeId: task.assignedEmployeeId }, { assignedEmployeeId: employeeId }, { clientId: project.clientId, projectId });
    }
    return this.get(companyId, projectId);
  }

  private async requireEmployee(companyId: string, employeeId: string) {
    const e = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
    if (!e) throw new BadRequestException('That employee does not belong to this company.');
  }
}

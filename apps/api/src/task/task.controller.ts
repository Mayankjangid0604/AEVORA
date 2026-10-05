import { Controller, Get, Post, Patch, Body, Param, Request, BadRequestException } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskPriority } from '@prisma/client';
import { AuthorizationService, CompanyScopedModel } from '../authorization/authorization.service';

/** Every task id, employee id and body companyId is checked against the authenticated actor's companies. */
@Controller()
export class TaskController {
  constructor(private readonly taskService: TaskService, private readonly authz: AuthorizationService) {}

  @Get('employees/:id/tasks')
  async listEmployeeTasks(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.taskService.listEmployeeTasks(id);
  }

  @Get('tasks/:id')
  async get(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.getTask(id);
  }

  @Post('tasks')
  async create(@Body() body: any, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, body?.companyId);
    const deps: string[] = Array.isArray(body.dependencies) ? body.dependencies : [];
    const refs: [CompanyScopedModel, string | undefined][] = [
      ['employee', body.assignedEmployeeId],
      ['goal', body.goalId],
      ...deps.map((d): [CompanyScopedModel, string] => ['task', d]),
    ];
    for (const [model, id] of refs) {
      if (id && (await this.authz.assertResourceAccess(req.user, model, id)) !== body.companyId) {
        throw new BadRequestException('Referenced resources must belong to the same company');
      }
    }
    return this.taskService.createTask({ ...body, createdBy: req.user.actorId });
  }

  @Post('tasks/:id/assign')
  async assign(@Param('id') id: string, @Body() body: { employeeId: string }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.assignTask(id, body.employeeId, req.user.actorId); // service rejects cross-company employees
  }

  @Patch('tasks/:id/priority')
  async updatePriority(@Param('id') id: string, @Body('priority') priority: TaskPriority, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.updateTaskPriority(id, priority);
  }

  @Post('tasks/:id/start')
  async start(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.startTask(id, req.user.actorId);
  }

  @Post('tasks/:id/block')
  async block(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.blockTask(id);
  }

  @Post('tasks/:id/complete')
  async complete(@Param('id') id: string, @Body() body: { actualEffort?: number }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.completeTask(id, body.actualEffort);
  }

  @Post('tasks/:id/cancel')
  async cancel(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'task', id);
    return this.taskService.cancelTask(id);
  }
}

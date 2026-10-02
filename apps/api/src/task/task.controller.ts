import { Controller, Get, Post, Patch, Body, Param, Headers } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskPriority } from '@prisma/client';

@Controller()
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('employees/:id/tasks')
  async listEmployeeTasks(@Param('id') id: string) {
    return this.taskService.listEmployeeTasks(id);
  }

  @Get('tasks/:id')
  async get(@Param('id') id: string) {
    return this.taskService.getTask(id);
  }

  @Post('tasks')
  async create(@Body() body: any, @Headers('x-actor-id') actorId: string) {
    return this.taskService.createTask({ ...body, createdBy: actorId || 'SYSTEM' });
  }

  @Post('tasks/:id/assign')
  async assign(@Param('id') id: string, @Body() body: { employeeId: string }, @Headers('x-actor-id') actorId: string) {
    return this.taskService.assignTask(id, body.employeeId, actorId || 'SYSTEM');
  }

  @Patch('tasks/:id/priority')
  async updatePriority(@Param('id') id: string, @Body('priority') priority: TaskPriority) {
    return this.taskService.updateTaskPriority(id, priority);
  }

  @Post('tasks/:id/start')
  async start(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.taskService.startTask(id, actorId || 'SYSTEM');
  }

  @Post('tasks/:id/block')
  async block(@Param('id') id: string) {
    return this.taskService.blockTask(id);
  }

  @Post('tasks/:id/complete')
  async complete(@Param('id') id: string, @Body() body: { actualEffort?: number }) {
    return this.taskService.completeTask(id, body.actualEffort);
  }

  @Post('tasks/:id/cancel')
  async cancel(@Param('id') id: string) {
    return this.taskService.cancelTask(id);
  }
}

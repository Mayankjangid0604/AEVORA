import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { actorOf } from '../opportunity/pipeline-util';
import { ProjectFlowService } from './project-flow.service';

/** Delivery tracking for projects created from accepted proposals. Tenant = req.user.companyId; foreign ids are 404. */
@Controller('project')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'EMPLOYEE')
export class ProjectController {
  constructor(private readonly flow: ProjectFlowService) {}

  @Get()
  list(@Request() req) { return this.flow.list(req.user.companyId); }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) { return this.flow.get(req.user.companyId, id); }

  @Get(':id/history')
  history(@Request() req, @Param('id') id: string) { return this.flow.history(req.user.companyId, id); }

  @Post(':id/status')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  status(@Request() req, @Param('id') id: string, @Body() body: { from?: string; to?: string }) {
    // Customer acceptance of delivery is a business decision, not a workflow convenience.
    if (body?.to === 'ACCEPTED' && req.user.actorRole !== 'CHAIRMAN') throw new ForbiddenException('Only the Chairman can record customer acceptance of a project.');
    return this.flow.setStatus(req.user.companyId, actorOf(req), id, body?.from, body?.to);
  }

  @Post(':id/tasks')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  addTask(@Request() req, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.flow.addTask(req.user.companyId, actorOf(req), id, body ?? {});
  }

  @Post(':id/tasks/:taskId/status')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  taskStatus(@Request() req, @Param('id') id: string, @Param('taskId') taskId: string, @Body() body: { from?: string; to?: string }) {
    return this.flow.setTaskStatus(req.user.companyId, actorOf(req), id, taskId, body?.from, body?.to);
  }

  @Post(':id/tasks/:taskId/assign')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  assign(@Request() req, @Param('id') id: string, @Param('taskId') taskId: string, @Body() body: { employeeId?: string }) {
    if (typeof body?.employeeId !== 'string') throw new BadRequestException('employeeId is required');
    return this.flow.assignTask(req.user.companyId, actorOf(req), id, taskId, body.employeeId);
  }
}

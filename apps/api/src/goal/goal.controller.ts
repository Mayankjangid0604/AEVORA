import { Controller, Get, Post, Patch, Body, Param, Request, BadRequestException } from '@nestjs/common';
import { GoalService } from './goal.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Controller()
export class GoalController {
  constructor(private readonly goalService: GoalService, private readonly authz: AuthorizationService) {}

  @Get('employees/:id/goals')
  async listEmployeeGoals(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.goalService.listEmployeeGoals(id);
  }

  /** The goal's company is the employee's company; a body companyId cannot redirect it. */
  @Post('employees/:id/goals')
  async createEmployeeGoal(@Param('id') employeeId: string, @Body() body: any, @Request() req) {
    const companyId = await this.authz.assertResourceAccess(req.user, 'employee', employeeId);
    if (body?.departmentId && (await this.authz.assertResourceAccess(req.user, 'department', body.departmentId)) !== companyId) {
      throw new BadRequestException('Department must belong to the same company');
    }
    return this.goalService.createGoal({ ...body, companyId, employeeId });
  }

  @Patch('goals/:id')
  async update(@Param('id') id: string, @Body() body: { progress: number }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'goal', id);
    return this.goalService.updateProgress(id, body.progress);
  }

  @Post('goals/:id/complete')
  async complete(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'goal', id);
    return this.goalService.completeGoal(id);
  }

  @Post('goals/:id/pause')
  async pause(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'goal', id);
    return this.goalService.pauseGoal(id);
  }
}

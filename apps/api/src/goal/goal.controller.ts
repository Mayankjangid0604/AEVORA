import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { GoalService } from './goal.service';

@Controller()
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Get('employees/:id/goals')
  async listEmployeeGoals(@Param('id') id: string) {
    return this.goalService.listEmployeeGoals(id);
  }

  @Post('employees/:id/goals')
  async createEmployeeGoal(@Param('id') employeeId: string, @Body() body: any) {
    return this.goalService.createGoal({ ...body, employeeId });
  }

  @Patch('goals/:id')
  async update(@Param('id') id: string, @Body() body: { progress: number }) {
    return this.goalService.updateProgress(id, body.progress);
  }

  @Post('goals/:id/complete')
  async complete(@Param('id') id: string) {
    return this.goalService.completeGoal(id);
  }

  @Post('goals/:id/pause')
  async pause(@Param('id') id: string) {
    return this.goalService.pauseGoal(id);
  }
}

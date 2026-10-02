import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ProjectExecutionService } from './project-execution.service';

@Controller('projects')
export class ProjectExecutionController {
  constructor(private readonly projectExecutionService: ProjectExecutionService) {}

  // Requirements
  @Get(':projectId/requirements')
  getRequirements(@Param('projectId') projectId: string) {
    return this.projectExecutionService.getRequirements(projectId);
  }

  @Post(':projectId/requirements')
  createRequirement(@Param('projectId') projectId: string, @Body() body: any) {
    return this.projectExecutionService.createRequirement(projectId, body);
  }

  @Patch('requirements/:id')
  updateRequirement(@Param('id') id: string, @Body() body: any) {
    return this.projectExecutionService.updateRequirement(id, body);
  }

  // Plans
  @Get(':projectId/plans')
  getPlans(@Param('projectId') projectId: string) {
    return this.projectExecutionService.getPlans(projectId);
  }

  @Post(':projectId/plans')
  createPlan(@Param('projectId') projectId: string, @Body() body: any) {
    return this.projectExecutionService.createPlan(projectId, body);
  }

  @Post('plans/:id/approve')
  approvePlan(@Param('id') id: string) {
    return this.projectExecutionService.approvePlan(id);
  }

  // Milestones
  @Get(':projectId/milestones')
  getMilestones(@Param('projectId') projectId: string) {
    return this.projectExecutionService.getMilestones(projectId);
  }

  @Post(':projectId/milestones')
  createMilestone(@Param('projectId') projectId: string, @Body() body: any) {
    return this.projectExecutionService.createMilestone(projectId, body);
  }

  // Risks
  @Get(':projectId/risks')
  getRisks(@Param('projectId') projectId: string) {
    return this.projectExecutionService.getRisks(projectId);
  }

  @Post(':projectId/risks')
  createRisk(@Param('projectId') projectId: string, @Body() body: any) {
    return this.projectExecutionService.createRisk(projectId, body);
  }

  // Staffing
  @Get(':projectId/team')
  getTeam(@Param('projectId') projectId: string) {
    return this.projectExecutionService.getTeam(projectId);
  }

  @Post(':projectId/team/propose')
  proposeStaffing(@Param('projectId') projectId: string, @Body() body: any) {
    return this.projectExecutionService.proposeStaffing(projectId, body);
  }

  @Post('project-assignments/:id/activate')
  activateAssignment(@Param('id') id: string) {
    return this.projectExecutionService.activateAssignment(id);
  }
}


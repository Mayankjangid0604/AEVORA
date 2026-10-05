import { Controller, Get, Post, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ProjectExecutionService } from './project-execution.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

/**
 * V14 slice 4: every route is bound to the caller's company. The service resolves a project's company only to
 * emit events, so the controller asserts ownership first (foreign or missing -> 404, anti-enumeration).
 */
@UseGuards(RolesGuard)
@Controller('projects')
export class ProjectExecutionController {
  constructor(private readonly projectExecutionService: ProjectExecutionService, private readonly authz: AuthorizationService) {}

  // Requirements
  @Get(':projectId/requirements')
  async getRequirements(@Param('projectId') projectId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.getRequirements(projectId);
  }

  @Post(':projectId/requirements')
  async createRequirement(@Param('projectId') projectId: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.createRequirement(projectId, body);
  }

  @Patch('requirements/:id')
  async updateRequirement(@Param('id') id: string, @Body() body: any, @Request() req) {
    await this.authz.assertProjectChildAccess(req.user, 'projectRequirement', id);
    return this.projectExecutionService.updateRequirement(id, body);
  }

  // Plans
  @Get(':projectId/plans')
  async getPlans(@Param('projectId') projectId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.getPlans(projectId);
  }

  @Post(':projectId/plans')
  async createPlan(@Param('projectId') projectId: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.createPlan(projectId, body);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('plans/:id/approve')
  async approvePlan(@Param('id') id: string, @Request() req) {
    await this.authz.assertProjectChildAccess(req.user, 'projectPlan', id);
    return this.projectExecutionService.approvePlan(id);
  }

  // Milestones
  @Get(':projectId/milestones')
  async getMilestones(@Param('projectId') projectId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.getMilestones(projectId);
  }

  @Post(':projectId/milestones')
  async createMilestone(@Param('projectId') projectId: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.createMilestone(projectId, body);
  }

  // Risks
  @Get(':projectId/risks')
  async getRisks(@Param('projectId') projectId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.getRisks(projectId);
  }

  @Post(':projectId/risks')
  async createRisk(@Param('projectId') projectId: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.createRisk(projectId, body);
  }

  // Staffing
  @Get(':projectId/team')
  async getTeam(@Param('projectId') projectId: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.getTeam(projectId);
  }

  @Post(':projectId/team/propose')
  async proposeStaffing(@Param('projectId') projectId: string, @Body() body: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.projectExecutionService.proposeStaffing(projectId, body); // service rejects employees of another company
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('project-assignments/:id/activate')
  async activateAssignment(@Param('id') id: string, @Request() req) {
    await this.authz.assertProjectChildAccess(req.user, 'projectAssignment', id);
    return this.projectExecutionService.activateAssignment(id);
  }
}

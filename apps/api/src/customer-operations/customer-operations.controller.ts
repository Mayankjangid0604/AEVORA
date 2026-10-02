import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { CustomerLifecycleService } from './customer-lifecycle.service';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { StaffingService } from './staffing.service';
import { CustomerAcceptanceService } from './customer-acceptance.service';
import { ProjectEconomicsService } from './project-economics.service';
import { CustomerHealthService } from './customer-health.service';
import { CustomerCommunicationService } from './customer-communication.service';
import { Phase25AgentService } from './phase25-agent.service';
import { ClientStatus, ProjectStatus, CustomerAcceptanceStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('customer-operations')
export class CustomerOperationsController {
  constructor(
    private readonly lifecycle: CustomerLifecycleService,
    private readonly onboarding: CustomerOnboardingService,
    private readonly projectLifecycle: ProjectLifecycleService,
    private readonly staffing: StaffingService,
    private readonly acceptance: CustomerAcceptanceService,
    private readonly economics: ProjectEconomicsService,
    private readonly health: CustomerHealthService,
    private readonly communication: CustomerCommunicationService,
    private readonly agents: Phase25AgentService,
  ) {}

  // --- Customer lifecycle ---
  @Get('customers')
  listCustomers(@Request() req, @Query('status') status?: ClientStatus) {
    return this.lifecycle.listCustomers(req.user.companyId, status);
  }

  @Get('customers/:id')
  getCustomer(@Request() req, @Param('id') id: string) {
    return this.lifecycle.getCustomer(id, req.user.companyId);
  }

  @Patch('customers/:id/transition')
  transitionCustomer(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { targetStatus: ClientStatus; reason?: string },
  ) {
    return this.lifecycle.transitionCustomer(id, body.targetStatus, req.user.actorId, req.user.companyId, body.reason);
  }

  // --- Onboarding ---
  @Post('onboardings')
  createOnboarding(@Request() req, @Body() body: any) {
    return this.onboarding.createOnboarding(req.user.companyId, req.user.actorId, body);
  }

  @Get('onboardings')
  listOnboardings(@Request() req, @Query('clientId') clientId?: string) {
    return this.onboarding.listOnboardings(req.user.companyId, clientId);
  }

  @Patch('onboardings/:id')
  updateOnboarding(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.onboarding.updateOnboarding(id, req.user.companyId, req.user.actorId, body);
  }

  @Post('onboardings/:id/complete')
  completeOnboarding(@Request() req, @Param('id') id: string) {
    return this.onboarding.completeOnboarding(id, req.user.companyId, req.user.actorId);
  }

  // --- Projects ---
  @Post('projects')
  createProject(@Request() req, @Body() body: any) {
    return this.projectLifecycle.createProjectFromContract(req.user.companyId, req.user.actorId, body);
  }

  @Get('projects')
  listProjects(@Request() req, @Query('status') status?: ProjectStatus, @Query('clientId') clientId?: string) {
    return this.projectLifecycle.listProjects(req.user.companyId, status, clientId);
  }

  @Get('projects/:id')
  getProject(@Request() req, @Param('id') id: string) {
    return this.projectLifecycle.getProject(id, req.user.companyId);
  }

  @Patch('projects/:id/transition')
  transitionProject(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { targetStatus: ProjectStatus; reason?: string },
  ) {
    return this.projectLifecycle.transitionProject(id, body.targetStatus, req.user.actorId, req.user.companyId, body.reason);
  }

  @Get('projects/:id/health')
  projectHealth(@Request() req, @Param('id') id: string) {
    return this.projectLifecycle.calculateProjectHealth(id, req.user.companyId);
  }

  // --- Staffing ---
  @Post('projects/:id/staff')
  assignStaff(@Request() req, @Param('id') projectId: string, @Body() body: any) {
    return this.staffing.assignToProject(projectId, req.user.companyId, req.user.actorId, body);
  }

  @Get('projects/:id/staff')
  getProjectStaff(@Request() req, @Param('id') projectId: string) {
    return this.staffing.getProjectStaff(projectId, req.user.companyId);
  }

  @Get('employees/:id/capacity')
  getCapacity(@Request() req, @Param('id') employeeId: string) {
    return this.staffing.calculateCapacity(employeeId, req.user.companyId);
  }

  // --- Customer acceptance ---
  @Post('acceptances')
  requestAcceptance(@Request() req, @Body() body: any) {
    return this.acceptance.requestAcceptance(req.user.companyId, req.user.actorId, body);
  }

  @Patch('acceptances/:id/decision')
  recordDecision(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: CustomerAcceptanceStatus; customerActorId?: string; rejectionReason?: string; changesRequested?: string },
  ) {
    return this.acceptance.recordDecision(id, req.user.companyId, req.user.actorId, body);
  }

  @Get('acceptances')
  listAcceptances(@Request() req, @Query('projectId') projectId?: string) {
    return this.acceptance.listAcceptances(req.user.companyId, projectId);
  }

  // --- Economics ---
  @Get('projects/:id/economics')
  projectEconomics(@Request() req, @Param('id') id: string) {
    return this.economics.getProjectEconomics(id, req.user.companyId);
  }

  @Get('customers/:id/profitability')
  customerProfitability(@Request() req, @Param('id') id: string) {
    return this.economics.getCustomerProfitability(id, req.user.companyId);
  }

  @Post('billing-milestones')
  createBillingMilestone(@Request() req, @Body() body: any) {
    return this.economics.createBillingMilestone(req.user.companyId, req.user.actorId, body);
  }

  // --- Health ---
  @Post('customers/:id/health/calculate')
  calculateHealth(@Request() req, @Param('id') id: string) {
    return this.health.calculateHealth(id, req.user.companyId, req.user.actorId);
  }

  @Get('customers/:id/health')
  getHealth(@Request() req, @Param('id') id: string) {
    return this.health.getLatestHealth(id, req.user.companyId);
  }

  // --- Communications ---
  @Post('communications')
  draftCommunication(@Request() req, @Body() body: any) {
    return this.communication.draftCommunication(req.user.companyId, req.user.actorId, body);
  }

  @Post('communications/:id/send')
  sendCommunication(@Request() req, @Param('id') id: string) {
    return this.communication.attemptSend(id, req.user.companyId, req.user.actorId);
  }

  // --- Agent capabilities ---
  @Post('agents/project-plan')
  proposeProjectPlan(@Request() req, @Body() body: { projectId: string; agentEmployeeId: string }) {
    return this.agents.proposeProjectPlan(body.projectId, req.user.companyId, body.agentEmployeeId);
  }

  @Post('agents/customer-risks')
  identifyRisks(@Request() req, @Body() body: { clientId: string; agentEmployeeId: string }) {
    return this.agents.identifyCustomerRisks(body.clientId, req.user.companyId, body.agentEmployeeId);
  }

  @Post('agents/operational-alerts')
  detectAlerts(@Request() req, @Body() body: { agentEmployeeId: string }) {
    return this.agents.detectOperationalAlerts(req.user.companyId, body.agentEmployeeId);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { SalesLeadService, CreateLeadDto } from './sales-lead.service';
import { TargetAccountService, CreateTargetAccountDto } from './target-account.service';
import { SalesOpportunityService, CreateOpportunityDto } from './sales-opportunity.service';
import { SalesActivityService, LogActivityDto } from './sales-activity.service';
import { QualificationService, QualificationInput } from './qualification.service';
import { OpportunityScoringService, ScoreInput } from './opportunity-scoring.service';
import { SalesPipelineService } from './sales-pipeline.service';
import { ChairmanDecisionService } from './chairman-decision.service';
import { SalesAgentConfigService, SalesAgentRole } from './sales-agent-config.service';
import { SalesLeadStatus, SalesStage, TargetAccountStatus } from '@prisma/client';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class SalesController {
  constructor(
    private readonly leadsService: SalesLeadService,
    private readonly accountsService: TargetAccountService,
    private readonly opportunityService: SalesOpportunityService,
    private readonly activityService: SalesActivityService,
    private readonly qualificationService: QualificationService,
    private readonly scoringService: OpportunityScoringService,
    private readonly pipelineService: SalesPipelineService,
    private readonly chairmanDecisionService: ChairmanDecisionService,
    private readonly agentConfigService: SalesAgentConfigService,
  ) {}

  // --- Leads ---

  @Post('leads')
  createLead(@Request() req, @Body() dto: CreateLeadDto) {
    return this.leadsService.createLead(req.user.companyId, req.user.actorId, dto);
  }

  @Get('leads')
  listLeads(@Request() req) {
    return this.leadsService.listLeads(req.user.companyId);
  }

  @Get('leads/:id')
  getLead(@Request() req, @Param('id') id: string) {
    return this.leadsService.getLead(req.user.companyId, id);
  }

  @Put('leads/:id/status')
  advanceLeadStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: SalesLeadStatus },
  ) {
    return this.leadsService.advanceLeadStatus(req.user.companyId, req.user.actorId, id, body.status);
  }

  @Post('leads/:id/convert')
  convertLead(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { title: string; clientId: string; description?: string; estimatedValue?: number; currency?: string },
  ) {
    return this.leadsService.convertLeadToOpportunity(req.user.companyId, req.user.actorId, id, body);
  }

  // --- Accounts ---

  @Post('accounts')
  createAccount(@Request() req, @Body() dto: CreateTargetAccountDto) {
    return this.accountsService.createAccount(req.user.companyId, req.user.actorId, dto);
  }

  @Get('accounts')
  listAccounts(@Request() req) {
    return this.accountsService.listAccounts(req.user.companyId);
  }

  @Get('accounts/:id')
  getAccount(@Request() req, @Param('id') id: string) {
    return this.accountsService.getAccount(req.user.companyId, id);
  }

  @Put('accounts/:id/status')
  updateAccountStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: TargetAccountStatus },
  ) {
    return this.accountsService.updateAccountStatus(req.user.companyId, req.user.actorId, id, body.status);
  }

  // --- Opportunities ---

  @Post('opportunities')
  createOpportunity(@Request() req, @Body() dto: CreateOpportunityDto) {
    return this.opportunityService.createOpportunity(req.user.companyId, req.user.actorId, dto);
  }

  @Get('opportunities')
  listOpportunities(@Request() req) {
    return this.opportunityService.listOpportunities(req.user.companyId);
  }

  @Get('opportunities/:id')
  getOpportunity(@Request() req, @Param('id') id: string) {
    return this.opportunityService.getOpportunity(req.user.companyId, id);
  }

  @Put('opportunities/:id/stage')
  advanceStage(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { stage: SalesStage; approvalId?: string },
  ) {
    return this.opportunityService.advanceSalesStage(
      req.user.companyId, req.user.actorId, id, body.stage, body.approvalId,
    );
  }

  @Put('opportunities/:id/owner')
  assignOwner(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { ownerId: string },
  ) {
    return this.opportunityService.assignOwner(req.user.companyId, req.user.actorId, id, body.ownerId);
  }

  @Get('opportunities/:id/scores')
  getScores(@Request() req, @Param('id') id: string) {
    return this.scoringService.getScores(req.user.companyId, id);
  }

  @Post('opportunities/:id/score')
  scoreOpportunity(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Omit<ScoreInput, 'opportunityId'>,
  ) {
    return this.scoringService.scoreOpportunity(req.user.companyId, req.user.actorId, { ...body, opportunityId: id });
  }

  // --- Activities ---

  @Post('activities')
  logActivity(@Request() req, @Body() dto: LogActivityDto) {
    return this.activityService.logActivity(req.user.companyId, req.user.actorId, dto);
  }

  @Get('activities')
  listActivities(
    @Request() req,
    @Query('opportunityId') opportunityId?: string,
    @Query('salesLeadId') salesLeadId?: string,
  ) {
    return this.activityService.listActivities(req.user.companyId, { opportunityId, salesLeadId });
  }

  // --- Qualification ---

  @Post('qualification')
  evaluateQualification(@Request() req, @Body() input: QualificationInput) {
    return this.qualificationService.evaluateQualification(req.user.companyId, req.user.actorId, input);
  }

  @Get('qualification')
  listQualifications(
    @Request() req,
    @Query('opportunityId') opportunityId?: string,
    @Query('salesLeadId') salesLeadId?: string,
  ) {
    return this.qualificationService.getQualifications(req.user.companyId, { opportunityId, salesLeadId });
  }

  // --- Pipeline ---

  @Get('pipeline')
  getPipelineMetrics(@Request() req) {
    return this.pipelineService.getPipelineMetrics(req.user.companyId);
  }

  @Get('pipeline/recommendations')
  getSalesManagerRecommendations(@Request() req) {
    return this.pipelineService.getSalesManagerRecommendations(req.user.companyId);
  }

  @Get('pipeline/stale')
  getStaleOpportunities(@Request() req, @Query('days') days?: string) {
    return this.pipelineService.getStaleOpportunities(req.user.companyId, days ? parseInt(days) : 14);
  }

  // --- Chairman Decision Queue ---

  @Get('chairman-queue')
  getChairmanQueue(@Request() req) {
    return this.chairmanDecisionService.getDecisionQueue(req.user.companyId);
  }

  // --- Agent Config ---
  // Note: agentEmployeeId comes from body (caller-supplied) and is independently verified
  // by the service's verifyActor check (employee.companyId must match JWT companyId).

  @Post('agent-config')
  configureSalesAgent(
    @Request() req,
    @Body() body: { employeeId: string; agentRole: SalesAgentRole; permissions?: string[] },
  ) {
    return this.agentConfigService.configureSalesAgent(
      req.user.companyId, req.user.actorId, body.employeeId, body.agentRole, body.permissions,
    );
  }

  @Get('agent-config/:employeeId')
  getAgentConfig(@Request() req, @Param('employeeId') employeeId: string) {
    return this.agentConfigService.getAgentConfig(req.user.companyId, employeeId);
  }
}

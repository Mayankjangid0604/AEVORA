import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ForbiddenException,
  NotFoundException,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ChairmanCommandService } from './chairman-command.service';
import { OperatingLoopService } from '../operating-loop/operating-loop.service';
import { PerformanceAggregationService } from '../operating-loop/performance-aggregation.service';

import { FinancialReportingService } from '../economy/financial-reporting.service';
import { SimulationService } from '../simulation/simulation.service';
import { ManagementDecisionService } from '../company-operations/management-decision.service';
import { ConversationService } from '../communication/conversation.service';
import { MeetingService } from '../communication/meeting.service';
import { NotificationService } from '../communication/notification.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeValidationService } from '../knowledge/knowledge-validation.service';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';
import { KnowledgeProvenanceService } from '../knowledge/knowledge-provenance.service';
import { KnowledgeValidationType, KnowledgeValidationResult } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
@Controller('chairman')
export class ChairmanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialReporting: FinancialReportingService,
    private readonly simulationService: SimulationService,
    private readonly decisionService: ManagementDecisionService,
    private readonly conversationService: ConversationService,
    private readonly meetingService: MeetingService,
    private readonly notificationService: NotificationService,
    private readonly knowledgeService: KnowledgeService,
    private readonly knowledgeValidationService: KnowledgeValidationService,
    private readonly knowledgeRetrievalService: KnowledgeRetrievalService,
    private readonly knowledgeProvenanceService: KnowledgeProvenanceService,
    private readonly commandService: ChairmanCommandService,
    private readonly operatingLoop: OperatingLoopService,
    private readonly perfAgg: PerformanceAggregationService,
  ) {}

  // ── helpers ──────────────────────────────────────────────

  private async requireChairman(chairmanId: string | undefined) {
    if (!chairmanId) throw new ForbiddenException('Missing chairman identity');
    const chairman = await this.prisma.chairman.findUnique({ where: { id: chairmanId } });
    if (!chairman) throw new ForbiddenException('Invalid chairman');
    return chairman;
  }

  private async getCompanyForChairman(req: any) {
    const chairmanId = req.user.actorId;
    const requestedCompanyId = req.user.companyId;

    if (requestedCompanyId) {
      const company = await this.prisma.company.findFirst({ where: { id: requestedCompanyId, chairmanId } });
      if (!company) throw new NotFoundException('Company not found or not owned by this chairman');
      return company;
    } else {
      // Fallback to first company for legacy frontend compatibility until frontend is updated
      const company = await this.prisma.company.findFirst({ where: { chairmanId } });
      if (!company) throw new NotFoundException('No company found for this chairman');
      return company;
    }
  }

  // ── GET /chairman/commands ──────────────────────────────

  @Get('commands')
  async getCommands(@Request() req: any, @Query('status') status?: string, @Query('riskLevel') riskLevel?: string, @Query('since') since?: string, @Query('limit') limit?: string) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.commandService.getCommands(company.id, {
      status, riskLevel,
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ── POST /chairman/commands ─────────────────────────────

  @Post('commands')
  async submitCommand(
    @Request() req: any,
    @Body() body: { text: string }
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.commandService.submitCommand(company.id, chairman.id, body.text);
  }

  @Post('commands/:id/approve')
  async approveCommand(@Request() req: any, @Param('id') id: string) {
    const chairman = await this.requireChairman(req.user.actorId);
    return this.commandService.approveCommand(id, chairman.id);
  }

  // ── POST /chairman/broadcast ────────────────────────────

  @Post('broadcast')
  async broadcast(@Request() req: any, @Body() body: { text: string }) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.commandService.broadcastCommand(company.id, body.text);
  }

  @Post('commands/:id/reject')
  async rejectCommand(@Request() req: any, @Param('id') id: string) {
    const chairman = await this.requireChairman(req.user.actorId);
    return this.commandService.rejectCommand(id, chairman.id);
  }

  // ── GET /chairman/overview ──────────────────────────────

  @Get('overview')
  async getOverview(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const [
      employeeCount,
      activeEmployees,
      projectCount,
      activeProjects,
      alertCount,
      pendingDecisions,
      realMoneyAccount,
      acWallet,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { companyId: company.id } }),
      this.prisma.employee.count({ where: { companyId: company.id, status: 'ACTIVE' } }),
      this.prisma.project.count({ where: { companyId: company.id } }),
      this.prisma.project.count({ where: { companyId: company.id, status: { in: ['ACTIVE', 'PLANNED', 'IN_REVIEW'] } } }),
      this.prisma.operationalAlert.count({ where: { companyId: company.id, status: 'ACTIVE' } }),
      this.prisma.managementDecision.count({ where: { companyId: company.id, status: 'PROPOSED' } }),
      this.prisma.realMoneyAccount.findUnique({ where: { companyId: company.id } }),
      this.prisma.aCWallet.findUnique({ where: { companyId: company.id } }),
    ]);

    let financials = null;
    try {
      financials = await this.financialReporting.generateCompanyReport(company.id);
    } catch { /* unavailable */ }

    return {
      company: {
        id: company.id,
        name: company.name,
        status: company.status,
      },
      treasury: {
        realMoney: realMoneyAccount?.balance ?? null,
        ac: acWallet?.balance ?? null,
      },
      employees: { total: employeeCount, active: activeEmployees },
      projects: { total: projectCount, active: activeProjects },
      alerts: alertCount,
      pendingDecisions,
      financials,
    };
  }

  // ── GET /chairman/financials ────────────────────────────

  @Get('financials')
  async getFinancials(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const realMoneyAccount = await this.prisma.realMoneyAccount.findUnique({ where: { companyId: company.id } });
    const acWallet = await this.prisma.aCWallet.findUnique({ where: { companyId: company.id } });
    const report = await this.financialReporting.generateCompanyReport(company.id);

    const revenueRecords = await this.prisma.revenueRecord.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const expenses = await this.prisma.companyExpense.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const payrollRuns = await this.prisma.payrollRun.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const budgets = await this.prisma.companyBudget.findMany({ where: { companyId: company.id } });

    return {
      realMoneyBalance: realMoneyAccount?.balance ?? null,
      acBalance: acWallet?.balance ?? null,
      report,
      revenueRecords,
      expenses,
      payrollRuns,
      budgets,
    };
  }

  // ── GET /chairman/employees ─────────────────────────────

  @Get('employees')
  async getEmployees(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.employee.findMany({
      where: { companyId: company.id },
      include: {
        role: true,
        department: true,
        performanceRecord: true,
        skills: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── GET /chairman/employees/:id ─────────────────────────

  @Get('employees/:id')
  async getEmployee(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        role: true,
        department: true,
        performanceRecord: true,
        skills: true,
        assignedTasks: { orderBy: { updatedAt: 'desc' }, take: 20 },
        history: { orderBy: { createdAt: 'desc' }, take: 20 },
        trainings: { include: { program: true }, orderBy: { createdAt: 'desc' } },
        projectAssignments: { include: { project: true } },
        receivedDiscipline: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!employee || employee.companyId !== company.id) {
      throw new NotFoundException('Employee not found in your company');
    }

    return employee;
  }

  // ── GET /chairman/projects ──────────────────────────────

  @Get('projects')
  async getProjects(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.project.findMany({
      where: { companyId: company.id },
      include: {
        client: true,
        assignments: { include: { employee: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── GET /chairman/projects/:id ──────────────────────────

  @Get('projects/:id')
  async getProject(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        requirements: true,
        plans: { orderBy: { version: 'desc' } },
        milestones: { orderBy: { sequence: 'asc' } },
        risks: true,
        tasks: { orderBy: { updatedAt: 'desc' }, take: 50 },
        assignments: { include: { employee: true } },
        deliveries: { orderBy: { version: 'desc' } },
        revenueRecords: true,
        projectCosts: true,
      },
    });

    if (!project || project.companyId !== company.id) {
      throw new NotFoundException('Project not found in your company');
    }

    return project;
  }

  // ── GET /chairman/departments ───────────────────────────

  @Get('departments')
  async getDepartments(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const departments = await this.prisma.department.findMany({
      where: { companyId: company.id },
      include: {
        employees: { include: { role: true } },
      },
    });

    return departments;
  }

  // ── GET /chairman/alerts ────────────────────────────────

  @Get('alerts')
  async getAlerts(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.operationalAlert.findMany({
      where: { companyId: company.id },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  @Post('alerts/:id/read')
  async readAlert(@Request() req: any, @Param('id') id: string) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.operationalAlert.updateMany({
      where: { id, companyId: company.id },
      data: { acknowledgedAt: new Date() },
    });
  }

  @Post('alerts/:id/resolve')
  async resolveAlert(@Request() req: any, @Param('id') id: string) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.operationalAlert.updateMany({
      where: { id, companyId: company.id },
      data: { resolvedAt: new Date(), status: 'RESOLVED' },
    });
  }

  // ── GET /chairman/decisions ─────────────────────────────

  @Get('decisions')
  async getDecisions(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.managementDecision.findMany({
      where: { companyId: company.id },
      include: {
        proposer: { select: { id: true, name: true } },
        targetEmployee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── POST /chairman/decisions/:id/approve ────────────────

  @Post('decisions/:id/approve')
  async approveDecision(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.decisionService.approveDecision(id, chairman.id, company.id);
  }

  // ── POST /chairman/decisions/:id/reject ─────────────────

  @Post('decisions/:id/reject')
  async rejectDecision(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.decisionService.rejectDecision(id, chairman.id, company.id);
  }

  // ── GET /chairman/activity ──────────────────────────────

  @Get('activity')
  async getActivity(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.companyEvent.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── GET /chairman/simulation ────────────────────────────

  @Get('simulation')
  async getSimulation(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const state = await this.simulationService.getSimulationState(company.id);
    const metrics = await this.simulationService.getMetrics(company.id);

    return { state, metrics };
  }

  // ── POST /chairman/simulation/pause ─────────────────────

  @Post('simulation/start')
  async startSimulation(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.simulationService.start(company.id);
  }

  @Post('simulation/pause')
  async pauseSimulation(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.simulationService.pause(company.id);
  }

  // ── POST /chairman/simulation/resume ────────────────────

  @Post('simulation/resume')
  async resumeSimulation(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.simulationService.resume(company.id);
  }

  // ── GET /chairman/world ─────────────────────────────────

  @Get('world')
  async getWorld(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    // Fetch required state for 2D world
    const [simulation, rawEmployees, departments, projects, alerts] = await Promise.all([
      this.simulationService.getSimulationState(company.id),
      this.prisma.employee.findMany({
        where: { companyId: company.id },
        include: {
          department: true,
          role: true,
          location: true,
          assignedTasks: {
            where: { status: 'IN_PROGRESS' },
            take: 1,
          },
        },
      }),
      this.prisma.department.findMany({
        where: { companyId: company.id, status: 'ACTIVE' },
      }),
      this.prisma.project.findMany({
        where: { companyId: company.id, status: { in: ['ACTIVE', 'IN_REVIEW'] } },
      }),
      this.prisma.operationalAlert.findMany({
        where: { companyId: company.id, status: 'ACTIVE' },
      }),
    ]);

    // Map employees to a lightweight visualization DTO
    const employees = rawEmployees.map((emp) => {
      const activeTask = emp.assignedTasks[0] || null;
      return {
        id: emp.id,
        name: emp.name,
        departmentId: emp.departmentId,
        departmentName: emp.department?.name,
        role: emp.role?.title,
        status: emp.status,
        activity: emp.activity,
        locationId: emp.locationId,
        locationName: emp.location?.name,
        locationType: emp.location?.type,
        hireDate: emp.hireDate, // read-only; used for work anniversaries in the office
        currentTaskId: activeTask?.id || null,
        currentTaskTitle: activeTask?.title || null,
        projectId: activeTask?.projectId || null,
      };
    });

    return {
      simulation,
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
      employees,
      projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      alerts: alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title })),
    };
  }

  // ── GET /chairman/communication/conversations ───────────

  @Get('communication/conversations')
  async getConversations(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.conversation.findMany({
      where: { companyId: company.id },
      include: {
        participants: { include: { employee: { select: { id: true, name: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  // ── GET /chairman/communication/conversations/:id ───────

  @Get('communication/conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    const conv = await this.conversationService.getConversation(company.id, id);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return { ...conv, messages };
  }

  // ── GET /chairman/communication/meetings ────────────────

  @Get('communication/meetings')
  async getMeetings(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.meeting.findMany({
      where: { companyId: company.id },
      include: {
        participants: { include: { employee: { select: { id: true, name: true } } } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
  }

  // ── GET /chairman/communication/meetings/:id ────────────

  @Get('communication/meetings/:id')
  async getMeetingDetails(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.meetingService.getMeeting(company.id, id);
  }

  // ── GET /chairman/communication/notifications ───────────

  @Get('communication/notifications')
  async getNotifications(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.prisma.notification.findMany({
      where: { companyId: company.id },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── GET /chairman/knowledge ──────────────────────────────

  @Get('knowledge')
  async getKnowledge(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.knowledgeRetrievalService.searchKnowledge(company.id, {});
  }

  // ── GET /chairman/knowledge/:id ──────────────────────────

  @Get('knowledge/:id')
  async getKnowledgeDetails(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.knowledgeService.getKnowledgeById(company.id, id);
  }

  // ── GET /chairman/knowledge/:id/provenance ───────────────

  @Get('knowledge/:id/provenance')
  async getKnowledgeProvenance(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.knowledgeProvenanceService.getProvenanceForKnowledge(company.id, id);
  }

  // ── POST /chairman/knowledge/:id/validate ────────────────

  @Post('knowledge/:id/validate')
  async validateKnowledge(
    @Param('id') id: string,
    @Body() body: { result: KnowledgeValidationResult; reason?: string },
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.knowledgeValidationService.validateKnowledge(company.id, id, {
      validationType: KnowledgeValidationType.CHAIRMAN_APPROVAL,
      result: body.result,
      reason: body.reason,
    });
  }

  // ── POST /chairman/knowledge/:id/archive ────────────────

  @Post('knowledge/:id/archive')
  async archiveKnowledge(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);

    return this.knowledgeService.archiveKnowledge(company.id, id);
  }

  // ── GET /chairman/training-configurations ──────────────

  @Get('training-configurations')
  async getTrainingConfigurations(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.trainingConfiguration.findMany({ where: { companyId: company.id } });
  }

  // ── GET /chairman/training-runs ──────────────────────────

  @Get('training-runs')
  async getTrainingRuns(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.trainingRun.findMany({ where: { companyId: company.id }, include: { configuration: true, attempts: true } });
  }

  // ── GET /chairman/training-metrics ──────────────────────

  @Get('training-metrics')
  async getTrainingMetrics(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.trainingMetric.findMany({
      where: {
        attempt: {
          trainingRun: { companyId: company.id }
        }
      },
      take: 100,
      orderBy: { timestamp: 'desc' }
    });
  }

  // ── GET /chairman/training-checkpoints ──────────────────

  @Get('training-checkpoints')
  async getTrainingCheckpoints(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.trainingCheckpoint.findMany({
      where: {
        attempt: {
          trainingRun: { companyId: company.id }
        }
      },
      take: 100,
      orderBy: { timestamp: 'desc' }
    });
  }

  // ── GET /chairman/artifacts ──────────────────────────────

  @Get('artifacts')
  async getArtifacts(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.modelArtifact.findMany({
      where: {
        trainingRun: { companyId: company.id }
      }
    });
  }

  // ── GET /chairman/candidate-models ─────────────────────

  @Get('candidate-models')
  async getCandidateModels(@Request() req: any) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    return this.prisma.modelVersion.findMany({
      where: { companyId: company.id }
    });
  }

  // "?"? PHASE 23: Production Management "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?

  @Post('kill-switch')
  async configureKillSwitch(
    @Request() req: any,
    @Body() body: { feature: string; isDisabled: boolean; reason?: string }
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    
    return this.prisma.killSwitchConfig.upsert({
      where: { companyId_feature: { companyId: company.id, feature: body.feature } },
      update: { isDisabled: body.isDisabled, reason: body.reason, updatedBy: chairman.id },
      create: { 
        companyId: company.id, 
        feature: body.feature, 
        isDisabled: body.isDisabled, 
        reason: body.reason, 
        updatedBy: chairman.id 
      }
    });
  }

  @Post('capability')
  async configureCapability(
    @Request() req: any,
    @Body() body: { capability: string; isEnabled: boolean }
  ) {
    const chairman = await this.requireChairman(req.user.actorId);
    const company = await this.getCompanyForChairman(req);
    
    return this.prisma.productionCapability.upsert({
      where: { 
        companyId_capability_environment: { 
          companyId: company.id, 
          capability: body.capability, 
          environment: 'PRODUCTION' 
        } 
      },
      update: { isEnabled: body.isEnabled, updatedBy: chairman.id },
      create: {
        companyId: company.id,
        capability: body.capability,
        isEnabled: body.isEnabled,
        updatedBy: chairman.id,
        environment: 'PRODUCTION'
      }
    });
  }

  // ── Operating Loop (OODA) ──

  @Get('operating-loop/cycles')
  async getOodaCycles(@Request() req: any) {
    const chairman = await this.requireChairman(req.user?.chairmanId);
    const company = await this.getCompanyForChairman(req);
    return this.operatingLoop.listCycles(company.id);
  }

  @Get('operating-loop/pending')
  async getOodaPending(@Request() req: any) {
    const chairman = await this.requireChairman(req.user?.chairmanId);
    const company = await this.getCompanyForChairman(req);
    return this.operatingLoop.getPendingApprovals(company.id);
  }

  @Post('operating-loop/cycle/:id/verdict')
  async oodaVerdict(@Request() req: any, @Param('id') id: string, @Body() body: { verdict: 'APPROVED' | 'REJECTED' }) {
    await this.requireChairman(req.user?.chairmanId);
    const cycle = await this.operatingLoop.recordChairmanVerdict(id, body.verdict);
    if (body.verdict === 'APPROVED') {
      await this.operatingLoop.execute(id);
      await this.operatingLoop.measure(id);
      await this.operatingLoop.learn(id);
      return this.operatingLoop.getCycle(id);
    }
    return cycle;
  }

  @Post('operating-loop/trigger')
  async triggerOoda(@Request() req: any, @Body() body: { trigger?: string }) {
    const chairman = await this.requireChairman(req.user?.chairmanId);
    const company = await this.getCompanyForChairman(req);
    return this.operatingLoop.runFullCycle(company.id, body.trigger || 'chairman_manual');
  }

  @Get('agent-performance')
  async getAgentPerformance(@Request() req: any) {
    const chairman = await this.requireChairman(req.user?.chairmanId);
    const company = await this.getCompanyForChairman(req);
    return this.perfAgg.getCompanyPerformance(company.id);
  }
}


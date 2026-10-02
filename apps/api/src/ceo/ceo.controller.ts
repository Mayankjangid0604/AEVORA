import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CeoReviewService, findCeo } from './ceo-review.service';
import { WeeklyReportService } from './weekly-report.service';
import { CeoDialogueService } from './ceo-dialogue.service';
import { ProjectStaffingService } from './project-staffing.service';
import { saveOfficeRooms } from './office-rooms';
import { chairmanMailer } from '../notifications/chairman-mailer';
import { CeoOperatingService } from './ceo-operating.service';
import { CeoAutonomousService } from './ceo-autonomous.service';
import { CeoBudgetService } from './ceo-budget.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { CreateCompanyBudgetDto, AllocateDepartmentBudgetDto, AdjustDepartmentAllocationDto, BudgetReservationDto, BudgetStatusUpdateDto } from './dto/ceo-budget.dto';
import { GrantAuthorityDto, CheckAuthorityDto } from './dto/ceo-financial-authority.dto';
import { CeoStrategicPlanningService } from './ceo-strategic-planning.service';
import { CreatePlanDto, CreateObjectiveDto, CreateStrategicRiskDto, UpdateObjectiveProgressDto } from './dto/ceo-strategic-planning.dto';
import { CeoPerformanceService } from './ceo-performance.service';
import { CeoSuccessionService } from './ceo-succession.service';
@Controller('ceo')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CeoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: CeoReviewService,
    private readonly weekly: WeeklyReportService,
    private readonly dialogue: CeoDialogueService,
    private readonly staffing: ProjectStaffingService,
    private readonly operating: CeoOperatingService,
    private readonly autonomous: CeoAutonomousService,
    private readonly budget: CeoBudgetService,
    private readonly financeAuth: CeoFinancialAuthorityService,
    private readonly strategic: CeoStrategicPlanningService,
    private readonly performance: CeoPerformanceService,
    private readonly succession: CeoSuccessionService,
  ) {}
  @Get('operating-state')
  async getOperatingState(@Request() req) {
    const state = await this.operating.getOperatingState(req.user.companyId);
    const evaluations = await this.performance.listEvaluations(req.user.companyId, req.user.actorId);
    const successionPlans = await this.prisma.successionPlan.findMany({ where: { companyId: req.user.companyId }, include: { candidates: { include: { employee: true } }, currentHolder: true } });
    return { ...state, evaluations, successionPlans };
  }
  @Post('priorities')
  @Roles('CHAIRMAN')
  async createPriority(@Request() req, @Body() body: { title: string, description?: string, priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', targetDate?: string }) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('No active CEO employee found');
    return this.operating.createPriority(req.user.companyId, ceo.id, { ...body, targetDate: body.targetDate ? new Date(body.targetDate) : undefined });
  }

  @Post('v3-objective')
  @Roles('CHAIRMAN')
  async createV3Objective(@Request() req, @Body() body: { title: string, description: string }) {
    return this.autonomous.receiveObjective(req.user.companyId, body.title, body.description, req.user.actorId);
  }
  @Post('delegate')
  @Roles('CHAIRMAN') // the Chairman delegates to the CEO or the CEO does it autonomously
  async delegateTask(@Request() req, @Body() body: { leadRoleTitle: string, title: string, description: string, objectiveId?: string, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('No active CEO employee found');
    return this.operating.delegateTask(req.user.companyId, ceo.id, body);
  }
  /** Roles: people, busy/idle, seats, open-project demand. */
  @Get('staffing')
  staffingOverview(@Request() req) {
    return this.staffing.overview(req.user.companyId);
  }

  /** Staff open client projects now (the business loop also does this every pass). */
  @Post('staffing/run')
  @Roles('CHAIRMAN')
  staffingRun(@Request() req) {
    return this.staffing.run(req.user.companyId);
  }

  /** Sends one test email to the Chairman and one to the test inbox; returns Gmail's answer for each. */
  @Post('notify-test')
  @Roles('CHAIRMAN')
  async notifyTest() {
    const at = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const results = [];
    const chairman = chairmanMailer.recipient;
    if (chairman) results.push(await chairmanMailer.sendTo(chairman, { subject: 'Test: Chairman notifications work', text: `This is how AEVORA will notify you (hires, full rooms, CEO questions, payments). Sent ${at} IST.` }));
    const test = process.env.TEST_EMAIL_RECIPIENT?.trim();
    if (test) results.push(await chairmanMailer.sendTo(test, { subject: 'Test: outreach test inbox works', text: `Every sales email to a lead is redirected here while ENABLE_REAL_PRODUCTION_SENDING=false. Sent ${at} IST.` }));
    return { from: process.env.SMTP_USER, outreachEnvironment: process.env.OUTREACH_ENVIRONMENT ?? 'SANDBOX', results };
  }

  /** The 3D office reports its desk chairs per room when it loads; that is the hiring limit per department. */
  @Post('staffing/office-rooms')
  @Roles('CHAIRMAN')
  officeRooms(@Request() req, @Body() body: { rooms: { key: string; name: string; chairs: number }[] }) {
    if (!Array.isArray(body?.rooms)) throw new BadRequestException('rooms[] is required');
    return saveOfficeRooms(this.prisma, req.user.companyId, body.rooms.slice(0, 50));
  }

  @Get('reviews')
  list(@Request() req) {
    return this.reviews.list(req.user.companyId);
  }

  /** Last 20 things the CEO did: review summaries, autonomous decisions, follow-ups, script changes, weekly reports. */
  @Get('feed')
  feed(@Request() req) {
    return this.reviews.feed(req.user.companyId, 20);
  }

  @Get('questions')
  questions(@Request() req, @Query('status') status?: string) {
    const s = ['OPEN', 'ANSWERED', 'USED', 'EXPIRED'].includes(status ?? '') ? (status as any) : undefined;
    return this.dialogue.list(req.user.companyId, s);
  }

  @Post('questions/:id/answer')
  @Roles('CHAIRMAN')
  answer(@Request() req, @Param('id') id: string, @Body() body: { answer: string }) {
    return this.dialogue.answer(req.user.companyId, id, body.answer);
  }

  /** Chairman asks the CEO anything; answered immediately. */
  @Post('ask')
  @Roles('CHAIRMAN')
  ask(@Request() req, @Body() body: { question: string }) {
    return this.reviews.answerChairman(req.user.companyId, body.question);
  }

  @Get('weekly-reports')
  weeklyReports(@Request() req) {
    return this.weekly.list(req.user.companyId, 4);
  }

  /** Chairman wants last week's report now (idempotent per week). */
  @Post('weekly-reports/run')
  @Roles('CHAIRMAN')
  async runWeekly(@Request() req) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('No active CEO employee (role title containing "CEO")');
    const state = await this.prisma.simulationState.findFirst({ where: { companyId: req.user.companyId } });
    return this.weekly.generateAndSend(req.user.companyId, ceo.id, state?.simulationTime ?? new Date());
  }

  /** Chairman asks for a review right now (ignores the hourly schedule, still one per sim hour). */
  @Post('reviews/run')
  @Roles('CHAIRMAN')
  async run(@Request() req) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('No active CEO employee (role title containing "CEO")');
    const state = await this.prisma.simulationState.findFirst({ where: { companyId: req.user.companyId } });
    return this.reviews.runReview(req.user.companyId, ceo.id, state?.simulationTime ?? new Date());
  }
  // --- AUTONOMOUS DECISION ENDPOINTS ---
  @Get('autonomous-decisions')
  getAutonomousDecisions(@Request() req) {
    return this.autonomous.getDecisions(req.user.companyId);
  }
  @Post('autonomous-decisions/run')
  @Roles('CHAIRMAN')
  async runAutonomousDecisionLoop(@Request() req) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('No active CEO employee found');
    return this.autonomous.runDecisionLoop(req.user.companyId, ceo.id);
  }
  @Post('autonomous-decisions/:id/execute')
  executeAutonomousDecision(@Request() req, @Param('id') id: string) {
    return this.autonomous.executeDecision(id, false);
  }
  @Post('autonomous-decisions/:id/approve')
  @Roles('CHAIRMAN')
  approveAutonomousDecision(@Request() req, @Param('id') id: string) {
    return this.autonomous.approveDecision(req.user.companyId, id, req.user.actorId);
  }
  @Post('autonomous-decisions/:id/reject')
  @Roles('CHAIRMAN')
  rejectAutonomousDecision(@Request() req, @Param('id') id: string) {
    return this.autonomous.rejectDecision(req.user.companyId, id, req.user.actorId);
  }
  // --- BUDGET MANAGEMENT ENDPOINTS ---
  @Get('budgets')
  getBudgets(@Request() req) {
    return this.budget.getCompanyBudgets(req.user.companyId);
  }
  @Get('budgets/departments')
  getDepartmentBudgetReport(@Request() req) {
    return this.budget.getDepartmentBudgetReport(req.user.companyId);
  }
  @Get('budgets/:id/summary')
  getBudgetSummary(@Request() req, @Param('id') id: string) {
    return this.budget.getCompanyBudgetSummary(req.user.companyId, id);
  }
  @Post('budgets')
  @Roles('CHAIRMAN')
  createBudget(@Request() req, @Body() dto: CreateCompanyBudgetDto) {
    return this.budget.createCompanyBudget(req.user.companyId, dto, req.user.actorId);
  }
  @Post('budgets/:id/status')
  @Roles('CHAIRMAN')
  updateBudgetStatus(@Request() req, @Param('id') id: string, @Body() dto: BudgetStatusUpdateDto) {
    return this.budget.updateBudgetStatus(req.user.companyId, id, dto.status, req.user.actorId);
  }
  @Post('budgets/:id/allocate')
  @Roles('CHAIRMAN')
  allocateDepartmentBudget(@Request() req, @Param('id') id: string, @Body() dto: AllocateDepartmentBudgetDto) {
    return this.budget.allocateDepartmentBudget(req.user.companyId, id, dto, req.user.actorId);
  }
  @Post('budgets/department/:id/adjust')
  @Roles('CHAIRMAN')
  adjustDepartmentAllocation(@Request() req, @Param('id') id: string, @Body() dto: AdjustDepartmentAllocationDto) {
    return this.budget.adjustDepartmentAllocation(req.user.companyId, id, dto, req.user.actorId);
  }
  @Post('budgets/department/:id/reservation')
  createReservation(@Request() req, @Param('id') id: string, @Body() dto: BudgetReservationDto) {
    // CEO can create reservations autonomously? "MEDIUM-RISK: creating reservations"
    return this.budget.createReservation(req.user.companyId, id, dto, req.user.actorId);
  }
  @Post('budgets/department/:id/reservation/release')
  releaseReservation(@Request() req, @Param('id') id: string, @Body() body: { amount: number }) {
    return this.budget.releaseReservation(req.user.companyId, id, body.amount, req.user.actorId);
  }
  // --- FINANCIAL AUTHORITY ---
  @Post('financial-authority/grant')
  @Roles('CHAIRMAN')
  async grantAuthority(@Request() req, @Body() body: GrantAuthorityDto) {
    return this.financeAuth.grantAuthority(req.user.companyId, req.user.actorId, body);
  }
  @Get('financial-authority')
  async getActiveAuthority(@Request() req) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    const auth = await this.financeAuth.getActiveAuthority(req.user.companyId, ceo.id);
    if (!auth) return { active: false };
    const usage = await this.financeAuth.getUsage(req.user.companyId, auth.id);
    return { active: true, authority: auth, usage };
  }
  @Post('financial-authority/:id/suspend')
  @Roles('CHAIRMAN')
  async suspendAuthority(@Request() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.financeAuth.suspendAuthority(req.user.companyId, id, req.user.actorId, body.reason);
  }
  @Post('financial-authority/:id/revoke')
  @Roles('CHAIRMAN')
  async revokeAuthority(@Request() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.financeAuth.revokeAuthority(req.user.companyId, id, req.user.actorId, body.reason);
  }
  @Post('financial-authority/check')
  async checkAuthority(@Request() req, @Body() body: CheckAuthorityDto) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.financeAuth.checkFinancialAuthority(req.user.companyId, ceo.id, body.operation, body.amount, body.currency, body.budgetId);
  }
  // --- STRATEGIC PLANNING ENDPOINTS ---
  @Post('strategy/plans')
  async createPlan(@Request() req, @Body() dto: CreatePlanDto) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.createPlan(req.user.companyId, ceo.id, dto);
  }
  @Get('strategy/plans/:id')
  async getPlan(@Request() req, @Param('id') id: string) {
    return this.strategic.getPlan(req.user.companyId, id);
  }
  @Post('strategy/plans/:id/propose')
  async proposePlan(@Request() req, @Param('id') id: string) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.proposePlan(req.user.companyId, id, ceo.id);
  }
  @Post('strategy/plans/:id/approve')
  @Roles('CHAIRMAN')
  async approvePlan(@Request() req, @Param('id') id: string) {
    return this.strategic.approvePlan(req.user.companyId, id, req.user.actorId);
  }
  @Post('strategy/plans/:id/reject')
  @Roles('CHAIRMAN')
  async rejectPlan(@Request() req, @Param('id') id: string, @Body() body: { reason: string }) {
    if (!body.reason) throw new BadRequestException('Reason is required');
    return this.strategic.rejectPlan(req.user.companyId, id, req.user.actorId, body.reason);
  }
  @Post('strategy/plans/:id/pause')
  @Roles('CHAIRMAN')
  async pausePlan(@Request() req, @Param('id') id: string) {
    return this.strategic.pausePlan(req.user.companyId, id, req.user.actorId);
  }
  @Post('strategy/plans/:id/resume')
  @Roles('CHAIRMAN')
  async resumePlan(@Request() req, @Param('id') id: string) {
    return this.strategic.resumePlan(req.user.companyId, id, req.user.actorId);
  }
  @Post('strategy/plans/:id/archive')
  async archivePlan(@Request() req, @Param('id') id: string) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.archivePlan(req.user.companyId, id, ceo.id);
  }
  @Post('strategy/objectives')
  async createObjective(@Request() req, @Body() dto: CreateObjectiveDto) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.createObjective(req.user.companyId, ceo.id, dto);
  }
  @Post('strategy/objectives/:id/progress')
  async updateObjectiveProgress(@Request() req, @Param('id') id: string, @Body() dto: UpdateObjectiveProgressDto) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.updateObjectiveProgress(req.user.companyId, id, dto.progress, ceo.id);
  }
  @Get('strategy/health')
  async getStrategicHealth(@Request() req) {
    return this.strategic.calculateStrategicHealth(req.user.companyId);
  }
  @Post('strategy/risks')
  async createStrategicRisk(@Request() req, @Body() dto: CreateStrategicRiskDto) {
    const ceo = await findCeo(this.prisma, req.user.companyId);
    if (!ceo) throw new NotFoundException('CEO not found');
    return this.strategic.createStrategicRisk(req.user.companyId, ceo.id, dto);
  }
  // -- PERFORMANCE --
  @Post('performance/evaluate')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async evaluateEmployee(@Request() req, @Body() body: { employeeId: string; periodStart: string; periodEnd: string }) {
    return this.performance.evaluateEmployee(req.user.companyId, req.user.actorId, body.employeeId, new Date(body.periodStart), new Date(body.periodEnd));
  }
  @Post('performance/evaluate-lead')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async evaluateDepartmentLead(@Request() req, @Body() body: { employeeId: string; periodStart: string; periodEnd: string }) {
    return this.performance.evaluateDepartmentLead(req.user.companyId, req.user.actorId, body.employeeId, new Date(body.periodStart), new Date(body.periodEnd));
  }
  @Post('performance/corrective-action')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async createCorrectiveAction(@Request() req, @Body() body: { evaluationId: string; title: string; description: string }) {
    return this.performance.createCorrectiveAction(req.user.companyId, req.user.actorId, body.evaluationId, body.title, body.description);
  }
  // -- SUCCESSION --
  @Post('succession/plan')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async createSuccessionPlan(@Request() req, @Body() body: { roleId: string; departmentId?: string }) {
    return this.succession.createSuccessionPlan(req.user.companyId, req.user.actorId, body.roleId, body.departmentId);
  }
  @Post('succession/candidate')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async addSuccessionCandidate(@Request() req, @Body() body: { planId: string; employeeId: string }) {
    return this.succession.addCandidate(req.user.companyId, req.user.actorId, body.planId, body.employeeId);
  }
  @Post('succession/recommendation')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async createReplacementRecommendation(@Request() req, @Body() body: { planId: string; candidateId: string; reason: string }) {
    return this.succession.createReplacementRecommendation(req.user.companyId, req.user.actorId, body.planId, body.candidateId, body.reason);
  }
}


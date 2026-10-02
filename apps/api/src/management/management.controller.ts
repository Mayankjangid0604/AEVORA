import {
  Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { CompanyStateService } from './company-state.service';
import { CompanyHealthService } from './company-health.service';
import { CompanyObjectiveService } from './company-objective.service';
import { CompanyKpiService } from './company-kpi.service';
import { ExecutiveDecisionService } from './executive-decision.service';
import { CompanyRiskService } from './company-risk.service';
import { CompanyOpportunityService } from './company-opportunity.service';
import { EscalationService } from './escalation.service';
import { ResourceAllocationService } from './resource-allocation.service';
import { OrganizationalMemoryService } from './organizational-memory.service';
import { ManagementCycleService } from './management-cycle.service';
import { ManagementAuditService } from './management-audit.service';
import {
  ObjectiveStatus, ObjectivePriority, KpiPeriod,
  ExecutiveDecisionType, ExecutiveDecisionStatus, DecisionPriority, RiskLevel,
  CompanyRiskStatus, OpportunityType, CompanyOpportunityStatus,
  EscalationStatus, ResourceType, AllocationStatus,
  ManagementCycleType, OrgMemoryType,
} from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('management')
export class ManagementController {
  constructor(
    private readonly stateSvc: CompanyStateService,
    private readonly healthSvc: CompanyHealthService,
    private readonly objectiveSvc: CompanyObjectiveService,
    private readonly kpiSvc: CompanyKpiService,
    private readonly decisionSvc: ExecutiveDecisionService,
    private readonly riskSvc: CompanyRiskService,
    private readonly opportunitySvc: CompanyOpportunityService,
    private readonly escalationSvc: EscalationService,
    private readonly allocationSvc: ResourceAllocationService,
    private readonly memorySvc: OrganizationalMemoryService,
    private readonly cycleSvc: ManagementCycleService,
    private readonly auditSvc: ManagementAuditService,
  ) {}

  // ─── Company State ───────────────────────────────────────────────────────────
  @Get('state')
  getCompanyState(@Request() req: any) {
    const { companyId } = req.user;
    return this.stateSvc.collectState(companyId);
  }

  // ─── Health ──────────────────────────────────────────────────────────────────
  @Get('health/latest')
  getLatestHealth(@Request() req: any) {
    const { companyId } = req.user;
    return this.healthSvc.getLatestSnapshot(companyId);
  }

  @Get('health/history')
  getHealthHistory(@Request() req: any) {
    const { companyId } = req.user;
    return this.healthSvc.getSnapshotHistory(companyId);
  }

  @Post('health/snapshot')
  async generateHealthSnapshot(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.healthSvc.generateAndStoreSnapshot(companyId, actorId);
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  @Get('kpis/dashboard')
  getKpiDashboard(@Request() req: any) {
    const { companyId } = req.user;
    return this.kpiSvc.getCompanyKpiDashboard(companyId);
  }

  @Post('kpis')
  createKpi(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.kpiSvc.createKPI(companyId, actorId, body);
  }

  @Patch('kpis/:kpiId')
  updateKpi(@Request() req: any, @Param('kpiId') kpiId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.kpiSvc.updateKPI(companyId, actorId, kpiId, body);
  }

  @Post('kpis/:kpiId/measurements')
  recordMeasurement(@Request() req: any, @Param('kpiId') kpiId: string, @Body() body: { value: number; note?: string; measuredAt?: string }) {
    const { companyId, actorId } = req.user;
    return this.kpiSvc.updateKPIValue(companyId, actorId, kpiId, body.value, true, body.measuredAt ? new Date(body.measuredAt) : undefined);
  }

  // ─── Objectives ──────────────────────────────────────────────────────────────
  @Post('objectives')
  createObjective(@Request() req: any, @Body() body: {
    title: string; description?: string; ownerId: string; departmentId?: string;
    parentObjectiveId?: string; priority?: ObjectivePriority;
    startDate?: string; targetDate?: string; metrics?: unknown[];
  }) {
    const { companyId, actorId } = req.user;
    return this.objectiveSvc.createObjective(companyId, actorId, body);
  }

  @Get('objectives')
  getObjectives(@Request() req: any, @Query('status') status?: ObjectiveStatus) {
    const { companyId } = req.user;
    return this.objectiveSvc.getObjectives(companyId, status);
  }

  @Get('objectives/:objectiveId')
  getObjective(@Request() req: any, @Param('objectiveId') objectiveId: string) {
    const { companyId } = req.user;
    return this.objectiveSvc.getObjective(companyId, objectiveId);
  }

  @Patch('objectives/:objectiveId/status')
  advanceObjectiveStatus(@Request() req: any, @Param('objectiveId') objectiveId: string, @Body() body: { status: ObjectiveStatus; evidenceNote?: string }) {
    const { companyId, actorId } = req.user;
    return this.objectiveSvc.advanceObjectiveStatus(companyId, actorId, objectiveId, body.status, body.evidenceNote);
  }

  @Patch('objectives/:objectiveId/progress')
  updateProgress(@Request() req: any, @Param('objectiveId') objectiveId: string, @Body() body: { progress: number; evidenceNote?: string }) {
    const { companyId, actorId } = req.user;
    return this.objectiveSvc.updateProgress(companyId, actorId, objectiveId, body.progress, body.evidenceNote);
  }

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  @Post('kpis')
  createKPI(@Request() req: any, @Body() body: {
    name: string; description?: string; ownerId: string; objectiveId?: string;
    period?: KpiPeriod; baseline: number; target: number; unit?: string;
    sourceSystem?: string; sourceRef?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.kpiSvc.createKPI(companyId, actorId, body);
  }

  @Get('kpis')
  getKPIs(@Request() req: any, @Query('objectiveId') objectiveId?: string) {
    const { companyId } = req.user;
    return this.kpiSvc.getKPIs(companyId, objectiveId);
  }

  @Get('kpis/:kpiId')
  getKPI(@Request() req: any, @Param('kpiId') kpiId: string) {
    const { companyId } = req.user;
    return this.kpiSvc.getKPI(companyId, kpiId);
  }

  @Patch('kpis/:kpiId/value')
  updateKPIValue(@Request() req: any, @Param('kpiId') kpiId: string, @Body() body: { currentValue: number }) {
    const { companyId, actorId } = req.user;
    // isAdvisory is always true for management-layer KPI updates; only authoritative domain
    // sources (e.g. finance service) may set isAdvisory=false through a dedicated promotion flow
    return this.kpiSvc.updateKPIValue(companyId, actorId, kpiId, body.currentValue, true);
  }

  // ─── Decisions ───────────────────────────────────────────────────────────────
  @Post('decisions')
  proposeDecision(@Request() req: any, @Body() body: {
    decisionType: ExecutiveDecisionType; subject: string; description?: string;
    evidence?: unknown[]; analysis?: unknown; recommendation?: unknown;
    alternatives?: unknown[]; expectedImpact?: unknown;
    riskLevel?: RiskLevel; priority?: DecisionPriority;
    requiredApproval?: boolean; cycleId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.decisionSvc.proposeDecision(companyId, actorId, body);
  }

  @Get('decisions')
  getDecisions(@Request() req: any, @Query('status') status?: ExecutiveDecisionStatus, @Query('priority') priority?: DecisionPriority) {
    const { companyId } = req.user;
    return this.decisionSvc.getDecisions(companyId, status, priority);
  }

  @Get('decisions/:decisionId')
  getDecision(@Request() req: any, @Param('decisionId') decisionId: string) {
    const { companyId } = req.user;
    return this.decisionSvc.getDecision(companyId, decisionId);
  }

  @Patch('decisions/:decisionId/status')
  advanceDecisionStatus(@Request() req: any, @Param('decisionId') decisionId: string, @Body() body: { status: ExecutiveDecisionStatus; note?: string; approvalId?: string; result?: unknown }) {
    const { companyId, actorId } = req.user;
    return this.decisionSvc.advanceStatus(companyId, actorId, decisionId, body.status, body);
  }

  @Patch('decisions/:decisionId/priority')
  updateDecisionPriority(@Request() req: any, @Param('decisionId') decisionId: string, @Body() body: { priority: DecisionPriority; reason: string }) {
    const { companyId, actorId } = req.user;
    return this.decisionSvc.updatePriority(companyId, actorId, decisionId, body.priority, body.reason);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────────
  @Post('risks')
  createRisk(@Request() req: any, @Body() body: {
    title: string; description?: string; probability: RiskLevel; impact: RiskLevel;
    ownerId: string; evidence?: unknown[]; mitigation?: unknown; cycleId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.riskSvc.createRisk(companyId, actorId, body);
  }

  @Get('risks')
  getRisks(@Request() req: any, @Query('status') status?: CompanyRiskStatus) {
    const { companyId } = req.user;
    return this.riskSvc.getRisks(companyId, status);
  }

  @Get('risks/:riskId')
  getRisk(@Request() req: any, @Param('riskId') riskId: string) {
    const { companyId } = req.user;
    return this.riskSvc.getRisk(companyId, riskId);
  }

  @Patch('risks/:riskId/status')
  updateRiskStatus(@Request() req: any, @Param('riskId') riskId: string, @Body() body: { status: CompanyRiskStatus; resolutionNote?: string }) {
    const { companyId, actorId } = req.user;
    return this.riskSvc.updateRiskStatus(companyId, actorId, riskId, body.status, body.resolutionNote);
  }

  @Patch('risks/:riskId/priority')
  updateRiskPriority(@Request() req: any, @Param('riskId') riskId: string, @Body() body: { probability: RiskLevel; impact: RiskLevel }) {
    const { companyId, actorId } = req.user;
    return this.riskSvc.updateRiskPriority(companyId, actorId, riskId, body.probability, body.impact);
  }

  // ─── Opportunities ───────────────────────────────────────────────────────────
  @Post('opportunities')
  createOpportunity(@Request() req: any, @Body() body: {
    title: string; description?: string; opportunityType: OpportunityType;
    ownerId: string; evidence?: unknown[]; expectedImpact?: unknown; cycleId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.opportunitySvc.createOpportunity(companyId, actorId, body);
  }

  @Get('opportunities')
  getOpportunities(@Request() req: any, @Query('status') status?: CompanyOpportunityStatus) {
    const { companyId } = req.user;
    return this.opportunitySvc.getOpportunities(companyId, status);
  }

  @Patch('opportunities/:oppId/status')
  updateOpportunityStatus(@Request() req: any, @Param('oppId') oppId: string, @Body() body: { status: CompanyOpportunityStatus }) {
    const { companyId, actorId } = req.user;
    return this.opportunitySvc.updateOpportunityStatus(companyId, actorId, oppId, body.status);
  }

  // ─── Escalations ─────────────────────────────────────────────────────────────
  @Post('escalations')
  createEscalation(@Request() req: any, @Body() body: {
    title: string; description?: string; reason: string; evidence?: unknown[];
    proposedAction?: unknown; expectedImpact?: unknown; riskLevel?: RiskLevel;
    priority?: DecisionPriority; escalatedTo?: string; deadline?: string; decisionId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.escalationSvc.createEscalation(companyId, actorId, body);
  }

  @Get('escalations')
  getEscalations(@Request() req: any, @Query('status') status?: EscalationStatus) {
    const { companyId } = req.user;
    return this.escalationSvc.getEscalations(companyId, status);
  }

  @Get('escalations/pending')
  getPendingEscalations(@Request() req: any) {
    const { companyId } = req.user;
    return this.escalationSvc.getPendingEscalations(companyId);
  }

  @Get('escalations/:escalationId')
  getEscalation(@Request() req: any, @Param('escalationId') escalationId: string) {
    const { companyId } = req.user;
    return this.escalationSvc.getEscalation(companyId, escalationId);
  }

  @Patch('escalations/:escalationId/acknowledge')
  acknowledgeEscalation(@Request() req: any, @Param('escalationId') escalationId: string) {
    const { companyId, actorId } = req.user;
    return this.escalationSvc.acknowledgeEscalation(companyId, actorId, escalationId);
  }

  @Patch('escalations/:escalationId/resolve')
  resolveEscalation(@Request() req: any, @Param('escalationId') escalationId: string, @Body() body: { resolutionNote: string }) {
    const { companyId, actorId } = req.user;
    return this.escalationSvc.resolveEscalation(companyId, actorId, escalationId, body.resolutionNote);
  }

  @Patch('escalations/:escalationId/dismiss')
  dismissEscalation(@Request() req: any, @Param('escalationId') escalationId: string, @Body() body: { note: string }) {
    const { companyId, actorId } = req.user;
    return this.escalationSvc.dismissEscalation(companyId, actorId, escalationId, body.note);
  }

  // ─── Resource Allocations ────────────────────────────────────────────────────
  @Post('allocations')
  proposeAllocation(@Request() req: any, @Body() body: {
    resourceType: ResourceType; resourceId: string; fromContext: unknown;
    toContext: unknown; reason: string; justification?: string; cycleId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.allocationSvc.proposeAllocation(companyId, actorId, body);
  }

  @Get('allocations')
  getAllocations(@Request() req: any, @Query('status') status?: AllocationStatus) {
    const { companyId } = req.user;
    return this.allocationSvc.getAllocations(companyId, status);
  }

  @Patch('allocations/:allocationId/approve')
  approveAllocation(@Request() req: any, @Param('allocationId') allocationId: string, @Body() body: { approvalId?: string }) {
    const { companyId, actorId } = req.user;
    return this.allocationSvc.approveAllocation(companyId, actorId, allocationId, body.approvalId);
  }

  @Patch('allocations/:allocationId/reject')
  rejectAllocation(@Request() req: any, @Param('allocationId') allocationId: string) {
    const { companyId, actorId } = req.user;
    return this.allocationSvc.rejectAllocation(companyId, actorId, allocationId);
  }

  @Patch('allocations/:allocationId/execute')
  executeAllocation(@Request() req: any, @Param('allocationId') allocationId: string) {
    const { companyId, actorId } = req.user;
    return this.allocationSvc.markExecuted(companyId, actorId, allocationId);
  }

  // ─── Organizational Memory ───────────────────────────────────────────────────
  @Post('memory')
  recordMemory(@Request() req: any, @Body() body: {
    memoryType: OrgMemoryType; subject: string; content: string;
    tags?: string[]; sourceDecisionId?: string; sourceRiskId?: string;
    sourceCycleId?: string; relevanceScore?: number; expiresAt?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.memorySvc.record(companyId, actorId, body);
  }

  @Get('memory')
  getMemory(@Request() req: any, @Query('type') type?: OrgMemoryType, @Query('includeArchived') includeArchived?: string) {
    const { companyId } = req.user;
    return this.memorySvc.getMemory(companyId, type, includeArchived === 'true');
  }

  @Patch('memory/:memoryId/archive')
  archiveMemory(@Request() req: any, @Param('memoryId') memoryId: string) {
    const { companyId, actorId } = req.user;
    return this.memorySvc.archiveMemory(companyId, actorId, memoryId);
  }

  // ─── Management Cycles ───────────────────────────────────────────────────────
  @Post('cycles')
  runCycle(@Request() req: any, @Body() body: { cycleType: ManagementCycleType }) {
    const { companyId, actorId } = req.user;
    return this.cycleSvc.runCycle(companyId, actorId, body.cycleType);
  }

  @Get('cycles')
  getCycles(@Request() req: any, @Query('type') type?: ManagementCycleType) {
    const { companyId } = req.user;
    return this.cycleSvc.getCycles(companyId, type);
  }

  @Get('cycles/:cycleId')
  getCycle(@Request() req: any, @Param('cycleId') cycleId: string) {
    const { companyId } = req.user;
    return this.cycleSvc.getCycle(companyId, cycleId);
  }

  // ─── Audit ───────────────────────────────────────────────────────────────────
  @Get('audit')
  getAuditTrail(@Request() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const { companyId } = req.user;
    return this.auditSvc.getAuditTrail(companyId, limit ? Number(limit) : 100, offset ? Number(offset) : 0);
  }
}

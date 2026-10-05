import {
  Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { WorkerProfileService } from './worker-profile.service';
import { HiringService } from './hiring.service';
import { SkillVerificationService } from './skill-verification.service';
import { PerformanceReviewService } from './performance-review.service';
import { CompensationService } from './compensation.service';
import { AIWorkforceService } from './ai-workforce.service';
import { WorkforcePlanningService } from './workforce-planning.service';
import { WorkforceAuditService } from './workforce-audit.service';
import {
  WorkerType, HiringRequestStatus, SkillProficiencyLevel,
  BonusProposalStatus, AIProvisioningStatus, WorkforcePlanStatus, AutonomyLevel,
} from '@prisma/client';

@Controller('workforce')
@UseGuards(JwtAuthGuard)
export class WorkforceController {
  constructor(
    private readonly profileSvc: WorkerProfileService,
    private readonly hiringSvc: HiringService,
    private readonly skillSvc: SkillVerificationService,
    private readonly reviewSvc: PerformanceReviewService,
    private readonly compensationSvc: CompensationService,
    private readonly aiSvc: AIWorkforceService,
    private readonly planningSvc: WorkforcePlanningService,
    private readonly auditSvc: WorkforceAuditService,
  ) {}

  // ─── Worker Profiles ─────────────────────────────────────────────────────

  @Get('profiles')
  listProfiles(@Request() req: any, @Query('workerType') workerType?: WorkerType) {
    const { companyId } = req.user; // JWT only
    return this.profileSvc.listProfiles(companyId, workerType);
  }

  @Get('profiles/:employeeId')
  getProfile(@Request() req: any, @Param('employeeId') employeeId: string) {
    const { companyId } = req.user;
    return this.profileSvc.getProfile(companyId, employeeId);
  }

  @Put('profiles/:employeeId/manager')
  setManager(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user; // JWT only — never body
    return this.profileSvc.setManager(companyId, actorId, employeeId, body.managerId ?? null);
  }

  @Put('profiles/:employeeId/autonomy')
  updateAutonomy(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.profileSvc.updateAutonomy(companyId, actorId, employeeId, body.autonomyLevel as AutonomyLevel);
  }

  @Get('profiles/:actorId/direct-reports')
  getDirectReports(@Request() req: any, @Param('actorId') actorId: string) {
    const { companyId } = req.user;
    return this.profileSvc.getDirectReports(companyId, actorId);
  }

  @Get('analytics/headcount')
  getAnalytics(@Request() req: any) {
    const { companyId } = req.user;
    return this.profileSvc.getAnalytics(companyId);
  }

  // ─── Hiring ───────────────────────────────────────────────────────────────

  @Post('hiring')
  createHiringRequest(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.hiringSvc.createHiringRequest(companyId, actorId, {
      workerType: body.workerType as WorkerType,
      title: body.title, description: body.description,
      requiredSkills: body.requiredSkills, compensationBand: body.compensationBand,
      departmentId: body.departmentId,
    });
  }

  @Put('hiring/:requestId/advance')
  advanceHiring(@Request() req: any, @Param('requestId') requestId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.hiringSvc.advanceHiringStatus(companyId, actorId, requestId, body.status as HiringRequestStatus, {
      approvalId: body.approvalId, candidateName: body.candidateName,
      candidateRef: body.candidateRef, offerDetails: body.offerDetails, notes: body.notes,
    });
  }

  @Post('hiring/:requestId/complete')
  completeHiring(@Request() req: any, @Param('requestId') requestId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.hiringSvc.completeHiring(companyId, actorId, requestId, {
      name: body.name, identitySeed: body.identitySeed,
      departmentId: body.departmentId, roleId: body.roleId,
      salary: body.salary, skills: body.skills,
    });
  }

  @Get('hiring')
  getHiringRequests(@Request() req: any, @Query('status') status?: HiringRequestStatus, @Query('workerType') workerType?: WorkerType) {
    return this.hiringSvc.getHiringRequests(req.user.companyId, status, workerType);
  }

  @Get('hiring/:requestId')
  getHiringRequest(@Request() req: any, @Param('requestId') requestId: string) {
    return this.hiringSvc.getHiringRequest(req.user.companyId, requestId);
  }

  // ─── Skills ───────────────────────────────────────────────────────────────

  @Post('skills/:employeeId')
  addSkill(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.skillSvc.addSkill(companyId, actorId, employeeId, {
      skillName: body.skillName, category: body.category,
      proficiencyLevel: body.proficiencyLevel as SkillProficiencyLevel,
      evidence: body.evidence, evidenceSource: body.evidenceSource,
      acquiredAt: body.acquiredAt ? new Date(body.acquiredAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      notes: body.notes,
    });
  }

  @Put('skills/verify/:skillId')
  verifySkill(@Request() req: any, @Param('skillId') skillId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.skillSvc.verifySkill(companyId, actorId, skillId, { notes: body.notes });
  }

  @Get('skills/:employeeId')
  getSkills(@Request() req: any, @Param('employeeId') employeeId: string) {
    return this.skillSvc.getSkills(req.user.companyId, employeeId);
  }

  // ─── Performance Reviews ─────────────────────────────────────────────────

  @Post('reviews/:employeeId')
  createReview(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.reviewSvc.createReview(companyId, actorId, employeeId, {
      reviewPeriod: body.reviewPeriod, goals: body.goals, strengths: body.strengths,
      areasOfImprovement: body.areasOfImprovement, developmentAreas: body.developmentAreas,
      evidence: body.evidence, rating: body.rating, recommendations: body.recommendations,
    });
  }

  @Put('reviews/:reviewId/submit')
  submitReview(@Request() req: any, @Param('reviewId') reviewId: string) {
    const { companyId, actorId } = req.user;
    return this.reviewSvc.submitReview(companyId, actorId, reviewId);
  }

  @Put('reviews/:reviewId/acknowledge')
  acknowledgeReview(@Request() req: any, @Param('reviewId') reviewId: string) {
    const { companyId, actorId } = req.user;
    return this.reviewSvc.acknowledgeReview(companyId, actorId, reviewId);
  }

  @Get('reviews')
  getReviews(@Request() req: any, @Query('employeeId') employeeId?: string, @Query('period') period?: string) {
    return this.reviewSvc.getReviews(req.user.companyId, employeeId, period);
  }

  @Get('reviews/:reviewId')
  getReview(@Request() req: any, @Param('reviewId') reviewId: string) {
    return this.reviewSvc.getReview(req.user.companyId, reviewId);
  }

  // ─── Compensation ─────────────────────────────────────────────────────────

  @Put('compensation/:employeeId/salary')
  updateSalary(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.compensationSvc.updateSalary(companyId, actorId, employeeId, body.salary, body.approvalId, body.reason);
  }

  @Post('bonuses/:employeeId/propose')
  proposeBonus(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.compensationSvc.proposeBonus(companyId, actorId, employeeId, {
      amount: body.amount, currency: body.currency, reason: body.reason, period: body.period,
    });
  }

  @Put('bonuses/:bonusId/approve')
  approveBonus(@Request() req: any, @Param('bonusId') bonusId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.compensationSvc.approveBonus(companyId, actorId, bonusId, body.approvalId);
  }

  @Put('bonuses/:bonusId/award')
  awardBonus(@Request() req: any, @Param('bonusId') bonusId: string) {
    const { companyId, actorId } = req.user;
    return this.compensationSvc.awardBonus(companyId, actorId, bonusId);
  }

  @Get('bonuses')
  getBonuses(@Request() req: any, @Query('status') status?: BonusProposalStatus) {
    return this.compensationSvc.getBonusProposals(req.user.companyId, status);
  }

  // ─── AI Workforce ─────────────────────────────────────────────────────────

  @Post('ai/provision')
  requestProvisioning(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.aiSvc.requestProvisioning(companyId, actorId, {
      workerType: body.workerType as WorkerType,
      proposedName: body.proposedName, proposedRole: body.proposedRole,
      proposedDept: body.proposedDept, aiModel: body.aiModel,
      aiProvider: body.aiProvider, aiSystemRole: body.aiSystemRole,
      aiCapabilities: body.aiCapabilities, aiTools: body.aiTools,
      autonomyLevel: body.autonomyLevel as AutonomyLevel | undefined,
      budgetLimit: body.budgetLimit, managerId: body.managerId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Put('ai/provision/:requestId/approve')
  approveProvisioning(@Request() req: any, @Param('requestId') requestId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.aiSvc.approveProvisioning(companyId, actorId, requestId, body.approvalId);
  }

  @Post('ai/provision/:requestId/execute')
  executeProvisioning(@Request() req: any, @Param('requestId') requestId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.aiSvc.executeProvisioning(companyId, actorId, requestId, {
      departmentId: body.departmentId, roleId: body.roleId,
    });
  }

  @Put('ai/:employeeId/deactivate')
  deactivateAIWorker(@Request() req: any, @Param('employeeId') employeeId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.aiSvc.deactivateAIWorker(companyId, actorId, employeeId, body.reason);
  }

  @Get('ai/workers')
  getAIWorkers(@Request() req: any, @Query('workerType') workerType?: WorkerType) {
    return this.aiSvc.getAIWorkers(req.user.companyId, workerType);
  }

  @Get('ai/provisioning')
  getProvisioningRequests(@Request() req: any, @Query('status') status?: AIProvisioningStatus) {
    return this.aiSvc.getProvisioningRequests(req.user.companyId, status);
  }

  @Get('ai/forbidden-actions')
  getForbiddenActions() {
    return { forbiddenActions: this.aiSvc.getForbiddenActions() };
  }

  // ─── Workforce Planning ───────────────────────────────────────────────────

  @Post('plans')
  createPlan(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.planningSvc.createPlan(companyId, actorId, {
      title: body.title, period: body.period,
      plannedHeadcount: body.plannedHeadcount,
      skillGaps: body.skillGaps, hiringRecommendations: body.hiringRecommendations,
    });
  }

  @Put('plans/:planId/approve')
  approvePlan(@Request() req: any, @Param('planId') planId: string) {
    const { companyId, actorId } = req.user;
    return this.planningSvc.approvePlan(companyId, actorId, planId);
  }

  @Get('plans')
  getPlans(@Request() req: any, @Query('status') status?: WorkforcePlanStatus) {
    return this.planningSvc.getPlans(req.user.companyId, status);
  }

  @Get('analytics/workforce')
  getWorkforceAnalytics(@Request() req: any) {
    return this.planningSvc.getAnalytics(req.user.companyId);
  }

  // ─── Audit ────────────────────────────────────────────────────────────────

  @Get('audit/:objectType/:objectId')
  getAuditTrail(
    @Request() req: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
  ) {
    return this.auditSvc.getAuditTrail(req.user.companyId, objectType, objectId);
  }

  @Get('audit')
  getCompanyAudit(@Request() req: any, @Query('limit') limit?: string) {
    return this.auditSvc.getCompanyAudit(req.user.companyId, limit ? parseInt(limit) : 100);
  }
}

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { PfProductService } from './pf-product.service';
import { PfIdeaService } from './pf-idea.service';
import { PfRequirementsService } from './pf-requirements.service';
import { PfFeatureService } from './pf-feature.service';
import { PfSecurityReviewService } from './pf-security-review.service';
import { PfQAService } from './pf-qa.service';
import { PfReleaseService } from './pf-release.service';
import { PfLaunchService } from './pf-launch.service';
import { PfFeedbackService } from './pf-feedback.service';
import { PfAnalyticsService } from './pf-analytics.service';
import { PfAuditService } from './pf-audit.service';
import {
  PfProductLifecycle, PfIdeaStatus, PfReleaseEnv, PfFeedbackSource, PfQAStatus, PfSecuritySeverity,
} from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('product-factory')
export class ProductFactoryController {
  constructor(
    private readonly products: PfProductService,
    private readonly ideas: PfIdeaService,
    private readonly requirements: PfRequirementsService,
    private readonly features: PfFeatureService,
    private readonly securityReviews: PfSecurityReviewService,
    private readonly qa: PfQAService,
    private readonly releases: PfReleaseService,
    private readonly launches: PfLaunchService,
    private readonly feedback: PfFeedbackService,
    private readonly analytics: PfAnalyticsService,
    private readonly auditSvc: PfAuditService,
  ) {}

  // ─── Products ──────────────────────────────────────────────────────────────

  @Post('products')
  createProduct(@Req() req, @Body() body: {
    name: string; description?: string; problemStatement?: string;
    targetCustomer?: string; category?: string; ownerId?: string;
    strategicThemeId?: string; strategicInitiativeId?: string;
    researchProjectId?: string; labProjectId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.products.create(companyId, actorId, body);
  }

  @Get('products')
  listProducts(@Req() req, @Query('lifecycle') lifecycle?: PfProductLifecycle, @Query('includeArchived') includeArchived?: string) {
    return this.products.list(req.user.companyId, lifecycle, includeArchived === 'true');
  }

  @Get('products/:id')
  getProduct(@Req() req, @Param('id') id: string) {
    return this.products.get(req.user.companyId, id);
  }

  @Patch('products/:id')
  updateProduct(@Req() req, @Param('id') id: string, @Body() body: {
    description?: string; problemStatement?: string; targetCustomer?: string; category?: string; ownerId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.products.update(companyId, actorId, id, body);
  }

  @Patch('products/:id/lifecycle')
  advanceLifecycle(@Req() req, @Param('id') id: string, @Body() body: { lifecycle: PfProductLifecycle }) {
    const { companyId, actorId } = req.user;
    return this.products.advanceLifecycle(companyId, actorId, id, body.lifecycle);
  }

  @Patch('products/:id/archive')
  archiveProduct(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.products.archive(companyId, actorId, id);
  }

  // ─── Portfolio Health ──────────────────────────────────────────────────────

  @Get('portfolio/health')
  portfolioHealth(@Req() req) {
    return this.analytics.portfolioHealth(req.user.companyId);
  }

  // ─── Ideas ─────────────────────────────────────────────────────────────────

  @Post('ideas')
  createIdea(@Req() req, @Body() body: {
    title: string; problemStatement: string; proposedSolution?: string;
    targetCustomer?: string; marketHypothesis?: string; evidence?: string;
    strategicRationale?: string; expectedValueMc?: number; risks?: string;
    assumptions?: string; originatingSource?: string; productId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.ideas.create(companyId, actorId, body);
  }

  @Get('ideas')
  listIdeas(@Req() req, @Query('status') status?: PfIdeaStatus) {
    return this.ideas.list(req.user.companyId, status);
  }

  @Get('ideas/:id')
  getIdea(@Req() req, @Param('id') id: string) {
    return this.ideas.get(req.user.companyId, id);
  }

  @Patch('ideas/:id/status')
  advanceIdeaStatus(@Req() req, @Param('id') id: string, @Body() body: { status: PfIdeaStatus }) {
    const { companyId, actorId } = req.user;
    return this.ideas.advanceStatus(companyId, actorId, id, body.status);
  }

  // ─── Requirements ──────────────────────────────────────────────────────────

  @Post('products/:productId/requirements')
  createRequirement(@Req() req, @Param('productId') productId: string, @Body() body: {
    title: string; description: string; reqType?: string; priority?: string; versionRef?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.requirements.create(companyId, actorId, productId, body);
  }

  @Get('products/:productId/requirements')
  listRequirements(@Req() req, @Param('productId') productId: string) {
    return this.requirements.list(req.user.companyId, productId);
  }

  @Patch('requirements/:reqId')
  updateRequirement(@Req() req, @Param('reqId') reqId: string, @Body() body: {
    title?: string; description?: string; priority?: string; status?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.requirements.update(companyId, actorId, reqId, body);
  }

  // ─── Features ──────────────────────────────────────────────────────────────

  @Post('products/:productId/features')
  createFeature(@Req() req, @Param('productId') productId: string, @Body() body: {
    title: string; description?: string; priority?: string; versionRef?: string;
    ownerId?: string; engineeringTaskId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.features.create(companyId, actorId, productId, body);
  }

  @Get('products/:productId/features')
  listFeatures(@Req() req, @Param('productId') productId: string) {
    return this.features.list(req.user.companyId, productId);
  }

  @Patch('features/:featureId/status')
  updateFeatureStatus(@Req() req, @Param('featureId') featureId: string, @Body() body: { status: string }) {
    const { companyId, actorId } = req.user;
    return this.features.updateStatus(companyId, actorId, featureId, body.status);
  }

  @Patch('features/:featureId/qa')
  recordFeatureQA(@Req() req, @Param('featureId') featureId: string, @Body() body: { qaStatus: PfQAStatus }) {
    const { companyId, actorId } = req.user;
    return this.features.recordQA(companyId, actorId, featureId, body.qaStatus);
  }

  @Patch('features/:featureId/security-clear')
  clearFeatureSecurity(@Req() req, @Param('featureId') featureId: string) {
    const { companyId, actorId } = req.user;
    return this.features.clearSecurity(companyId, actorId, featureId);
  }

  // ─── Security Reviews ──────────────────────────────────────────────────────

  @Post('products/:productId/security-reviews')
  createSecurityReview(@Req() req, @Param('productId') productId: string, @Body() body: {
    versionRef?: string;
    findings?: Array<{ title: string; severity: string; status: string }>;
    overallSeverity?: PfSecuritySeverity;
  }) {
    const { companyId, actorId } = req.user;
    return this.securityReviews.create(companyId, actorId, productId, body);
  }

  @Get('products/:productId/security-reviews')
  listSecurityReviews(@Req() req, @Param('productId') productId: string) {
    return this.securityReviews.list(req.user.companyId, productId);
  }

  @Patch('security-reviews/:reviewId/clear')
  clearSecurityReview(@Req() req, @Param('reviewId') reviewId: string) {
    const { companyId, actorId } = req.user;
    return this.securityReviews.clear(companyId, actorId, reviewId);
  }

  @Patch('security-reviews/:reviewId/findings')
  addSecurityFinding(@Req() req, @Param('reviewId') reviewId: string, @Body() body: { title: string; severity: string; status: string }) {
    const { companyId, actorId } = req.user;
    return this.securityReviews.addFinding(companyId, actorId, reviewId, body);
  }

  // ─── QA ────────────────────────────────────────────────────────────────────

  @Post('products/:productId/qa')
  recordQA(@Req() req, @Param('productId') productId: string, @Body() body: {
    versionRef?: string;
    unitTestStatus?: PfQAStatus; integrationStatus?: PfQAStatus;
    acceptanceStatus?: PfQAStatus; regressionStatus?: PfQAStatus;
    performanceStatus?: PfQAStatus; securityStatus?: PfQAStatus;
    evidenceNotes?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.qa.record(companyId, actorId, productId, body);
  }

  @Get('products/:productId/qa')
  listQA(@Req() req, @Param('productId') productId: string) {
    return this.qa.list(req.user.companyId, productId);
  }

  // ─── Releases ──────────────────────────────────────────────────────────────

  @Post('products/:productId/releases')
  createRelease(@Req() req, @Param('productId') productId: string, @Body() body: {
    versionRef: string; environment: PfReleaseEnv; buildReference?: string;
    qaRecordId?: string; securityReviewId?: string; approvalId?: string;
    notes?: string; idempotencyKey?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.releases.create(companyId, actorId, productId, body);
  }

  @Get('products/:productId/releases')
  listReleases(@Req() req, @Param('productId') productId: string, @Query('environment') environment?: PfReleaseEnv) {
    return this.releases.list(req.user.companyId, productId, environment);
  }

  // ─── Launches ──────────────────────────────────────────────────────────────

  @Post('products/:productId/launches')
  createLaunch(@Req() req, @Param('productId') productId: string, @Body() body: {
    releaseId: string; launchPlan?: string; idempotencyKey?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.launches.create(companyId, actorId, productId, body);
  }

  @Get('products/:productId/launches')
  listLaunches(@Req() req, @Param('productId') productId: string) {
    return this.launches.list(req.user.companyId, productId);
  }

  @Patch('launches/:launchId/approve')
  approveLaunch(@Req() req, @Param('launchId') launchId: string) {
    const { companyId, actorId } = req.user;
    return this.launches.approve(companyId, actorId, launchId);
  }

  @Patch('launches/:launchId/execute')
  executeLaunch(@Req() req, @Param('launchId') launchId: string) {
    const { companyId, actorId } = req.user;
    return this.launches.execute(companyId, actorId, launchId);
  }

  @Patch('launches/:launchId/rollback')
  rollbackLaunch(@Req() req, @Param('launchId') launchId: string, @Body() body: { reason: string }) {
    const { companyId, actorId } = req.user;
    return this.launches.rollback(companyId, actorId, launchId, body.reason);
  }

  // ─── Feedback ──────────────────────────────────────────────────────────────

  @Post('products/:productId/feedback')
  recordFeedback(@Req() req, @Param('productId') productId: string, @Body() body: {
    source: PfFeedbackSource; content: string; sentiment?: string;
    featureRef?: string; customerId?: string; versionRef?: string; isAiSynthesized?: boolean;
  }) {
    const { companyId, actorId } = req.user;
    return this.feedback.record(companyId, actorId, productId, body);
  }

  @Get('products/:productId/feedback')
  listFeedback(@Req() req, @Param('productId') productId: string, @Query('source') source?: PfFeedbackSource) {
    return this.feedback.list(req.user.companyId, productId, source);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Post('products/:productId/analytics')
  recordAnalytics(@Req() req, @Param('productId') productId: string, @Body() body: {
    versionRef?: string; adoptionCount?: number; activeUsersCount?: number;
    feedbackScore?: number; featureUsageJson?: Record<string, number>;
    errorRatePercent?: number; revenueRefMc?: number;
    periodStart?: string; periodEnd?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.analytics.record(companyId, actorId, productId, {
      ...body,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
    });
  }

  @Get('products/:productId/analytics')
  listAnalytics(@Req() req, @Param('productId') productId: string) {
    return this.analytics.list(req.user.companyId, productId);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  getAuditTrail(@Req() req, @Query('productId') productId?: string) {
    return this.auditSvc.trail(req.user.companyId, productId);
  }
}

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { FiDatasetService } from './fi-dataset.service';
import { FiTrainingJobService } from './fi-training-job.service';
import { FiCheckpointService } from './fi-checkpoint.service';
import { FiModelVersionService } from './fi-model-version.service';
import { FiEvaluationService } from './fi-evaluation.service';
import { FiAnalyticsService } from './fi-analytics.service';
import { FiAuditService } from './fi-audit.service';
import { FiDatasetStatus, FiTrainingJobStatus, FiModelStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('foundation-intelligence')
export class FoundationIntelligenceController {
  constructor(
    private readonly datasets: FiDatasetService,
    private readonly jobs: FiTrainingJobService,
    private readonly checkpoints: FiCheckpointService,
    private readonly models: FiModelVersionService,
    private readonly evals: FiEvaluationService,
    private readonly analytics: FiAnalyticsService,
    private readonly auditSvc: FiAuditService,
  ) {}

  // ─── Datasets ──────────────────────────────────────────────────────────────

  @Post('datasets')
  createDataset(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.datasets.create(companyId, actorId, body);
  }

  @Get('datasets')
  listDatasets(@Req() req, @Query('status') status?: FiDatasetStatus) {
    return this.datasets.list(req.user.companyId, status);
  }

  @Get('datasets/:id')
  getDataset(@Req() req, @Param('id') id: string) {
    return this.datasets.get(req.user.companyId, id);
  }

  @Patch('datasets/:id')
  updateDataset(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.datasets.update(companyId, actorId, id, body);
  }

  @Post('datasets/:id/validate')
  validateDataset(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.datasets.validate(companyId, actorId, id);
  }

  @Post('datasets/:id/reject')
  rejectDataset(@Req() req, @Param('id') id: string, @Body() body: { reason: string }) {
    const { companyId, actorId } = req.user;
    return this.datasets.reject(companyId, actorId, id, body.reason);
  }

  // ─── Training Jobs ─────────────────────────────────────────────────────────

  @Post('training-jobs')
  createJob(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    const { datasetId, ...dto } = body;
    return this.jobs.create(companyId, actorId, datasetId, dto);
  }

  @Get('training-jobs')
  listJobs(@Req() req, @Query('status') status?: FiTrainingJobStatus) {
    return this.jobs.list(req.user.companyId, status);
  }

  @Get('training-jobs/:id')
  getJob(@Req() req, @Param('id') id: string) {
    return this.jobs.get(req.user.companyId, id);
  }

  @Post('training-jobs/:id/start')
  startJob(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.jobs.start(companyId, actorId, id);
  }

  @Post('training-jobs/:id/complete')
  completeJob(@Req() req, @Param('id') id: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.jobs.complete(companyId, actorId, id, body);
  }

  @Post('training-jobs/:id/fail')
  failJob(@Req() req, @Param('id') id: string, @Body() body: { errorMessage: string }) {
    const { companyId, actorId } = req.user;
    return this.jobs.fail(companyId, actorId, id, body.errorMessage);
  }

  @Post('training-jobs/:id/cancel')
  cancelJob(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.jobs.cancel(companyId, actorId, id);
  }

  // ─── Checkpoints ───────────────────────────────────────────────────────────

  @Post('training-jobs/:jobId/checkpoints')
  createCheckpoint(@Req() req, @Param('jobId') jobId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.checkpoints.create(companyId, actorId, jobId, body);
  }

  @Get('training-jobs/:jobId/checkpoints')
  listCheckpoints(@Req() req, @Param('jobId') jobId: string) {
    return this.checkpoints.list(req.user.companyId, jobId);
  }

  // ─── Model Versions ────────────────────────────────────────────────────────

  @Post('model-versions')
  createModel(@Req() req, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.models.create(companyId, actorId, body);
  }

  @Get('model-versions')
  listModels(@Req() req, @Query('family') family?: string, @Query('status') status?: FiModelStatus) {
    return this.models.list(req.user.companyId, family, status);
  }

  @Get('model-versions/:id')
  getModel(@Req() req, @Param('id') id: string) {
    return this.models.get(req.user.companyId, id);
  }

  @Post('model-versions/:id/promote')
  promoteModel(@Req() req, @Param('id') id: string, @Body() body: { targetStatus: FiModelStatus }) {
    const { companyId, actorId } = req.user;
    return this.models.promote(companyId, actorId, id, body.targetStatus);
  }

  @Post('model-versions/:id/retire')
  retireModel(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.models.retire(companyId, actorId, id);
  }

  // ─── Evaluations ───────────────────────────────────────────────────────────

  @Post('model-versions/:modelVersionId/evaluations')
  createEval(@Req() req, @Param('modelVersionId') modelVersionId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.evals.create(companyId, actorId, modelVersionId, body);
  }

  @Get('model-versions/:modelVersionId/evaluations')
  listEvals(@Req() req, @Param('modelVersionId') modelVersionId: string) {
    return this.evals.list(req.user.companyId, modelVersionId);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/summary')
  summary(@Req() req) {
    return this.analytics.summary(req.user.companyId);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  auditTrail(@Req() req, @Query('datasetId') datasetId?: string) {
    return this.auditSvc.trail(req.user.companyId, datasetId);
  }
}

import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { LabProjectService } from './lab-project.service';
import { ResQuestionService } from './res-question.service';
import { ResHypothesisService } from './res-hypothesis.service';
import { LabExperimentService } from './lab-experiment.service';
import { LabExperimentRunService } from './lab-experiment-run.service';
import { LabResultService } from './lab-result.service';
import { LabEvaluationService } from './lab-evaluation.service';
import { LabFindingService } from './lab-finding.service';
import { LabEvidenceService } from './lab-evidence.service';
import { LabReproductionService } from './lab-reproduction.service';
import { LabRecommendationService } from './lab-recommendation.service';
import {
  LabProjectStatus, ResQuestionStatus, ResHypothesisStatus, ResEvidenceType,
  ResRunStatus, ResFindingStatus, ResReproductionOutcome, ResRecommendationStatus,
} from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('lab')
export class LabController {
  constructor(
    private readonly projectSvc: LabProjectService,
    private readonly questionSvc: ResQuestionService,
    private readonly hypothesisSvc: ResHypothesisService,
    private readonly experimentSvc: LabExperimentService,
    private readonly runSvc: LabExperimentRunService,
    private readonly resultSvc: LabResultService,
    private readonly evaluationSvc: LabEvaluationService,
    private readonly findingSvc: LabFindingService,
    private readonly evidenceSvc: LabEvidenceService,
    private readonly reproductionSvc: LabReproductionService,
    private readonly recommendationSvc: LabRecommendationService,
  ) {}

  // ─── Projects ────────────────────────────────────────────────────────────────
  @Post('projects')
  createProject(@Request() req: any, @Body() body: { title: string; description: string; objective: string; domain?: string; resourceBudget?: number; metadata?: unknown }) {
    const { companyId, actorId } = req.user;
    return this.projectSvc.createProject(companyId, actorId, body);
  }

  @Get('projects')
  getProjects(@Request() req: any, @Query('status') status?: LabProjectStatus) {
    return this.projectSvc.getProjects(req.user.companyId, status);
  }

  @Get('projects/:id')
  getProject(@Request() req: any, @Param('id') id: string) {
    return this.projectSvc.getProject(req.user.companyId, id);
  }

  @Patch('projects/:id/status')
  advanceProjectStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: LabProjectStatus; note?: string }) {
    const { companyId, actorId } = req.user;
    return this.projectSvc.advanceStatus(companyId, actorId, id, body.status, body);
  }

  // ─── Questions ───────────────────────────────────────────────────────────────
  @Post('questions')
  createQuestion(@Request() req: any, @Body() body: { projectId: string; question: string; motivation: string; domain?: string; priority?: number; assumptions?: unknown[]; relatedStrategyId?: string }) {
    const { companyId, actorId } = req.user;
    return this.questionSvc.createQuestion(companyId, actorId, body);
  }

  @Get('questions')
  getQuestions(@Request() req: any, @Query('projectId') projectId?: string, @Query('status') status?: ResQuestionStatus) {
    return this.questionSvc.getQuestions(req.user.companyId, projectId, status);
  }

  @Patch('questions/:id/status')
  updateQuestionStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: ResQuestionStatus }) {
    const { companyId, actorId } = req.user;
    return this.questionSvc.updateStatus(companyId, actorId, id, body.status);
  }

  // ─── Hypotheses ──────────────────────────────────────────────────────────────
  @Post('hypotheses')
  proposeHypothesis(@Request() req: any, @Body() body: { projectId: string; questionId?: string; statement: string; rationale: string; variables?: unknown; expectedRelationship: string; measurableOutcome: string; assumptions?: unknown[]; confidence?: number; falsificationCriteria: string }) {
    const { companyId, actorId } = req.user;
    return this.hypothesisSvc.proposeHypothesis(companyId, actorId, body);
  }

  @Get('hypotheses')
  getHypotheses(@Request() req: any, @Query('projectId') projectId?: string, @Query('status') status?: ResHypothesisStatus) {
    return this.hypothesisSvc.getHypotheses(req.user.companyId, projectId, status);
  }

  @Patch('hypotheses/:id/status')
  advanceHypothesisStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: ResHypothesisStatus; evidenceNote?: string }) {
    const { companyId, actorId } = req.user;
    return this.hypothesisSvc.advanceStatus(companyId, actorId, id, body.status, body.evidenceNote);
  }

  // ─── Evidence ────────────────────────────────────────────────────────────────
  @Post('evidence')
  addEvidence(@Request() req: any, @Body() body: { hypothesisId?: string; evidenceType: ResEvidenceType; content: string; source?: string; sourceType?: string; provenance?: string; credibility?: number; confidence?: number; isContradicting?: boolean; processingMethod?: string }) {
    const { companyId, actorId } = req.user;
    return this.evidenceSvc.addEvidence(companyId, actorId, body);
  }

  @Get('evidence')
  getEvidence(@Request() req: any, @Query('hypothesisId') hypothesisId?: string) {
    return this.evidenceSvc.getEvidence(req.user.companyId, hypothesisId);
  }

  // ─── Experiments ─────────────────────────────────────────────────────────────
  @Post('experiments')
  createExperiment(@Request() req: any, @Body() body: { projectId: string; hypothesisId?: string; title: string; objective: string; methodology: string; inputSpec?: unknown; datasetId?: string; datasetVersion?: string; variables?: unknown; controls?: unknown; metrics?: unknown[]; expectedResult: string; stopCondition?: string; resourceLimit?: number; timeoutSeconds?: number; environment?: string; reproducibilityInfo?: unknown; modelIdentifier?: string; modelVersion?: string; promptVersion?: string; randomSeed?: string; codeVersion?: string }) {
    const { companyId, actorId } = req.user;
    return this.experimentSvc.createExperiment(companyId, actorId, body);
  }

  @Get('experiments')
  getExperiments(@Request() req: any, @Query('projectId') projectId?: string) {
    return this.experimentSvc.getExperiments(req.user.companyId, projectId);
  }

  @Get('experiments/:id')
  getExperiment(@Request() req: any, @Param('id') id: string) {
    return this.experimentSvc.getExperiment(req.user.companyId, id);
  }

  // ─── Experiment Runs ─────────────────────────────────────────────────────────
  @Post('runs')
  queueRun(@Request() req: any, @Body() body: { experimentId: string; inputs?: unknown; environment?: string; modelIdentifier?: string; datasetVersion?: string; randomSeed?: string }) {
    const { companyId, actorId } = req.user;
    return this.runSvc.queueRun(companyId, actorId, body);
  }

  @Get('runs')
  getRuns(@Request() req: any, @Query('experimentId') experimentId?: string, @Query('status') status?: ResRunStatus) {
    return this.runSvc.getRuns(req.user.companyId, experimentId, status);
  }

  @Patch('runs/:id/status')
  advanceRunStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: ResRunStatus; outputs?: unknown; metrics?: unknown; errors?: unknown[]; logs?: unknown[]; artifacts?: unknown[]; resourceUsed?: unknown }) {
    const { companyId, actorId } = req.user;
    return this.runSvc.advanceRunStatus(companyId, actorId, id, body.status, body);
  }

  // ─── Results ─────────────────────────────────────────────────────────────────
  @Post('results')
  recordResult(@Request() req: any, @Body() body: { runId: string; summary: string; metrics?: unknown; artifacts?: unknown[]; evidenceType?: ResEvidenceType }) {
    const { companyId, actorId } = req.user;
    return this.resultSvc.recordResult(companyId, actorId, body);
  }

  @Get('results')
  getResults(@Request() req: any) {
    return this.resultSvc.getResults(req.user.companyId);
  }

  @Get('results/:id')
  getResult(@Request() req: any, @Param('id') id: string) {
    return this.resultSvc.getResult(req.user.companyId, id);
  }

  // ─── Evaluations ─────────────────────────────────────────────────────────────
  @Post('evaluations')
  evaluateResult(@Request() req: any, @Body() body: { resultId: string; validity?: string; reproducibility?: string; evidenceQuality?: string; confidence?: number; limitations?: unknown[]; alternativeExplanations?: unknown[]; consistentWithPrior?: boolean; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.evaluationSvc.evaluateResult(companyId, actorId, body);
  }

  @Get('evaluations')
  getEvaluations(@Request() req: any, @Query('resultId') resultId?: string) {
    return this.evaluationSvc.getEvaluations(req.user.companyId, resultId);
  }

  // ─── Findings ────────────────────────────────────────────────────────────────
  @Post('findings')
  createFinding(@Request() req: any, @Body() body: { projectId: string; hypothesisId?: string; statement: string; supportingEvidence?: unknown[]; confidence?: number; limitations?: unknown[]; counterEvidence?: unknown[] }) {
    const { companyId, actorId } = req.user;
    return this.findingSvc.createFinding(companyId, actorId, body);
  }

  @Get('findings')
  getFindings(@Request() req: any, @Query('projectId') projectId?: string, @Query('status') status?: ResFindingStatus) {
    return this.findingSvc.getFindings(req.user.companyId, projectId, status);
  }

  @Patch('findings/:id/status')
  advanceFindingStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: ResFindingStatus }) {
    const { companyId, actorId } = req.user;
    return this.findingSvc.advanceFindingStatus(companyId, actorId, id, body.status);
  }

  // ─── Reproductions ───────────────────────────────────────────────────────────
  @Post('reproductions')
  createReproduction(@Request() req: any, @Body() body: { originalRunId: string; reproductionRunId: string; differences?: unknown; outcome: ResReproductionOutcome; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.reproductionSvc.createReproduction(companyId, actorId, body);
  }

  @Get('reproductions')
  getReproductions(@Request() req: any) {
    return this.reproductionSvc.getReproductions(req.user.companyId);
  }

  // ─── Recommendations ─────────────────────────────────────────────────────────
  @Post('recommendations')
  createRecommendation(@Request() req: any, @Body() body: { projectId: string; statement: string; rationale: string; evidenceRefs?: unknown[]; confidence?: number; strategyLink?: string }) {
    const { companyId, actorId } = req.user;
    return this.recommendationSvc.createRecommendation(companyId, actorId, body);
  }

  @Get('recommendations')
  getRecommendations(@Request() req: any, @Query('projectId') projectId?: string, @Query('status') status?: ResRecommendationStatus) {
    return this.recommendationSvc.getRecommendations(req.user.companyId, projectId, status);
  }

  @Patch('recommendations/:id/status')
  advanceRecommendationStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: ResRecommendationStatus }) {
    const { companyId, actorId } = req.user;
    return this.recommendationSvc.advanceStatus(companyId, actorId, id, body.status);
  }
}

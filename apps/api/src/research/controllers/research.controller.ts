import { Controller, Get, Post, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ResearchProposalService } from '../services/research-proposal.service';
import { ResearchProjectService } from '../services/research-project.service';
import { DatasetService } from '../services/dataset.service';
import { ModelRegistryService } from '../services/model-registry.service';
import { ExperimentService } from '../services/experiment.service';
import { EvaluationService } from '../services/evaluation.service';
import { SafetyEvaluationService } from '../services/safety-evaluation.service';
import { InferenceService } from '../services/inference.service';
import { ImprovementObservationService } from '../services/improvement-observation.service';
import { ResearchPlanningService } from '../services/research-planning.service';
import { EvaluationComparisonService } from '../services/evaluation-comparison.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../authorization/jwt-auth.guard';
import { RolesGuard } from '../../authorization/roles.guard';
import { Roles } from '../../authorization/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'SYSTEM', 'EMPLOYEE')
@Controller('chairman/research')
export class ResearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalService: ResearchProposalService,
    private readonly projectService: ResearchProjectService,
    private readonly datasetService: DatasetService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly experimentService: ExperimentService,
    private readonly evaluationService: EvaluationService,
    private readonly safetyService: SafetyEvaluationService,
    private readonly inferenceService: InferenceService,
    private readonly improvementObservationService: ImprovementObservationService,
    private readonly researchPlanningService: ResearchPlanningService,
    private readonly evaluationComparisonService: EvaluationComparisonService
  ) {}

  @Get('proposals')
  async getProposals(@Request() req: any) {
    return this.prisma.researchProposal.findMany({
      where: { companyId: req.user.companyId },
      include: { proposer: true }
    });
  }

  @Post('proposals')
  async createProposal(@Request() req: any, @Body() data: any) {
    return this.proposalService.createProposal(req.user.companyId, req.user.actorId, data);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('proposals/:id/approve')
  async approveProposal(@Param('id') id: string, @Request() req: any) {
    const proposal = await this.prisma.researchProposal.findUnique({ where: { id } });
    if (!proposal || proposal.companyId !== req.user.companyId) {
      throw new ForbiddenException('Proposal not found or unauthorized');
    }
    return this.proposalService.reviewProposal(req.user.companyId, id, req.user.actorId, 'APPROVED');
  }

  @Get('projects')
  async getProjects(@Request() req: any) {
    return this.prisma.researchProject.findMany({
      where: { companyId: req.user.companyId },
      include: { owner: true }
    });
  }

  @Get('experiments')
  async getExperiments(@Request() req: any) {
    return this.prisma.experiment.findMany({
      where: { project: { companyId: req.user.companyId } },
      include: { project: true, modelVersion: true }
    });
  }

  @Get('datasets')
  async getDatasets(@Request() req: any) {
    return this.prisma.dataset.findMany({ 
      where: { companyId: req.user.companyId },
      include: { versions: true } 
    });
  }

  @Get('models')
  async getModels(@Request() req: any) {
    return this.prisma.modelFamily.findMany({ 
      where: { companyId: req.user.companyId },
      include: { versions: true } 
    });
  }

  @Get('evaluations')
  async getEvaluations(@Request() req: any) {
    return this.prisma.evaluationRun.findMany({ 
      where: { modelVersion: { companyId: req.user.companyId } },
      include: { modelVersion: true, benchmark: true } 
    });
  }

  @Get('safety')
  async getSafetyEvals(@Request() req: any) {
    return this.prisma.safetyEvaluation.findMany({ 
      where: { modelVersion: { companyId: req.user.companyId } },
      include: { modelVersion: true } 
    });
  }

  @Get('deployments')
  async getDeployments(@Request() req: any) {
    return this.prisma.limitedDeployment.findMany({ 
      where: { modelVersion: { companyId: req.user.companyId } },
      include: { modelVersion: true } 
    });
  }

  @Post('inference')
  async runInference(@Request() req: any, @Body() body: { deploymentId: string, payload: any }) {
    return this.inferenceService.runInference(body.deploymentId, body.payload, req.user.companyId);
  }

  // --- Phase 19 APIs ---

  @Post('improvement/scan')
  async scanForSignals(@Request() req: any) {
    await this.improvementObservationService.detectImprovementSignals(req.user.companyId);
    return { success: true };
  }

  @Post('improvement/hypotheses/:signalId')
  async createHypothesis(@Param('signalId') signalId: string, @Request() req: any) {
    return this.researchPlanningService.createHypothesisFromSignal(signalId, req.user.actorId);
  }

  @Post('improvement/proposals/:hypothesisId')
  async proposeFromHypothesis(@Param('hypothesisId') hypothesisId: string) {
    return this.researchPlanningService.createProposalFromHypothesis(hypothesisId);
  }

  @Post('improvement/comparisons/:planId')
  async compareCandidate(@Param('planId') planId: string) {
    return this.evaluationComparisonService.compareCandidateToBaseline(planId);
  }
}

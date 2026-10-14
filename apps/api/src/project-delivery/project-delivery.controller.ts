import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ProjectIntakeService } from './project-intake.service';
import { ScopeBudgetAssessmentService } from './scope-budget-assessment.service';
import { FactoryPlanningService } from './factory-planning.service';
import { GovernedToolRouterService } from './governed-tool-router.service';
import { FactoryWorkspaceService } from './factory-workspace.service';
import { FactoryBuildOrchestratorService } from './factory-build-orchestrator.service';
import { FactoryQualityGateService } from './factory-quality-gate.service';
import { FactoryDeploymentService } from './factory-deployment.service';
import { FactoryDeliveryHandoverService } from './factory-delivery-handover.service';
import { FactorySafeCleanupService } from './factory-safe-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ProjectIntakeDto, DeploymentEnvironment, DeploymentProviderType, QualityGateStatus } from './project-delivery.types';

@Controller('project-delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectDeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intakeService: ProjectIntakeService,
    private readonly assessmentService: ScopeBudgetAssessmentService,
    private readonly planningService: FactoryPlanningService,
    private readonly toolRouter: GovernedToolRouterService,
    private readonly workspaceService: FactoryWorkspaceService,
    private readonly buildOrchestrator: FactoryBuildOrchestratorService,
    private readonly qualityGateService: FactoryQualityGateService,
    private readonly deploymentService: FactoryDeploymentService,
    private readonly handoverService: FactoryDeliveryHandoverService,
    private readonly cleanupService: FactorySafeCleanupService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post('intake')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async processIntake(@Request() req, @Body() dto: ProjectIntakeDto) {
    if (!dto?.companyId) throw new BadRequestException('Company ID is required for project intake');
    await this.authz.assertCompanyAccess(req.user, dto.companyId);
    return this.intakeService.processIntake(dto);
  }

  @Post(':id/assess')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async assessProject(@Request() req, @Param('id') projectId: string) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.assessmentService.assessProjectScopeAndBudget(projectId);
  }

  @Post(':id/plan')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async createPlan(
    @Request() req,
    @Param('id') projectId: string,
    @Body('actorId') actorId?: string,
  ) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const effectiveActorId = req.user?.actorId || actorId;
    if (!effectiveActorId) throw new BadRequestException('actorId required for plan generation');
    return this.planningService.createDecomposedPlan(projectId, effectiveActorId);
  }

  @Post(':id/route-tool')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async routeTool(@Request() req, @Param('id') projectId: string) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.toolRouter.determineToolRouting(projectId);
  }

  @Post(':id/allocate-workspace')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async allocateWorkspace(
    @Request() req,
    @Param('id') projectId: string,
    @Body('companyId') companyId: string,
  ) {
    if (!companyId) throw new BadRequestException('companyId required');
    await this.authz.assertCompanyAccess(req.user, companyId);
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.workspaceService.allocateWorkspace(companyId, projectId);
  }

  @Post(':id/execute-development')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async executeDevelopment(
    @Request() req,
    @Param('id') projectId: string,
    @Body('workspaceDir') workspaceDir?: string,
  ) {
    const companyId = await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const canonicalWorkspace = this.workspaceService.resolveAndVerifyCanonicalWorkspace(companyId, projectId, workspaceDir);
    const decision = await this.toolRouter.determineToolRouting(projectId);
    return this.toolRouter.executeGovernedGeneration(projectId, canonicalWorkspace, decision);
  }

  @Post(':id/orchestrate-build')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async orchestrateBuild(
    @Request() req,
    @Param('id') projectId: string,
    @Body('workspaceDir') workspaceDir?: string,
  ) {
    const companyId = await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const canonicalWorkspace = this.workspaceService.resolveAndVerifyCanonicalWorkspace(companyId, projectId, workspaceDir);
    return this.buildOrchestrator.orchestratePipeline(projectId, canonicalWorkspace);
  }

  @Post(':id/evaluate-quality-gate')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async evaluateQualityGate(
    @Request() req,
    @Param('id') projectId: string,
    @Body('buildSummary') buildSummary: any,
  ) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    return this.qualityGateService.evaluateQualityGate(projectId, buildSummary);
  }

  @Post(':id/deploy')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async deployProject(
    @Request() req,
    @Param('id') projectId: string,
    @Body() body: {
      environment: DeploymentEnvironment;
      provider?: DeploymentProviderType;
      actorId?: string;
      qualityGateStatus: QualityGateStatus;
    },
  ) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const actorId = req.user?.actorId || body?.actorId;
    return this.deploymentService.deployProject({
      projectId,
      environment: body.environment,
      provider: body.provider,
      actorId,
      qualityGateStatus: body.qualityGateStatus,
    });
  }

  @Post(':id/prepare-handover')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async prepareHandover(
    @Request() req,
    @Param('id') projectId: string,
    @Body() body: {
      requestedById?: string;
      workspacePath?: string;
      artifactPath: string;
      qualityGate: any;
      deployment?: any;
      documentation?: string;
      knownLimitations?: string[];
    },
  ) {
    const companyId = await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const canonicalWorkspace = this.workspaceService.resolveAndVerifyCanonicalWorkspace(companyId, projectId, body?.workspacePath);
    const requestedById = req.user?.actorId || body?.requestedById;
    return this.handoverService.prepareDeliveryPackage({
      projectId,
      requestedById,
      workspacePath: canonicalWorkspace,
      artifactPath: body.artifactPath,
      qualityGate: body.qualityGate,
      deployment: body.deployment,
      documentation: body.documentation,
      knownLimitations: body.knownLimitations,
    });
  }

  @Post('deliveries/:deliveryId/accept')
  @Roles('CHAIRMAN', 'MANAGEMENT', 'CLIENT')
  async clientAcceptDelivery(
    @Request() req,
    @Param('deliveryId') deliveryId: string,
    @Body('clientActorId') clientActorId?: string,
  ) {
    const { clientId } = await this.authz.assertDeliveryClientAccess(req.user, deliveryId);
    const effectiveClientActorId = req.user?.actorRole === 'CLIENT' ? req.user.actorId : (clientActorId || req.user?.actorId || clientId);
    return this.handoverService.clientAcceptHandover(deliveryId, effectiveClientActorId);
  }

  @Post('deliveries/:deliveryId/request-revision')
  @Roles('CHAIRMAN', 'MANAGEMENT', 'CLIENT')
  async clientRequestRevision(
    @Request() req,
    @Param('deliveryId') deliveryId: string,
    @Body() body: { clientActorId?: string; revisionNotes: string },
  ) {
    const { clientId } = await this.authz.assertDeliveryClientAccess(req.user, deliveryId);
    const effectiveClientActorId = req.user?.actorRole === 'CLIENT' ? req.user.actorId : (body?.clientActorId || req.user?.actorId || clientId);
    return this.handoverService.clientRequestRevision(deliveryId, effectiveClientActorId, body?.revisionNotes);
  }

  @Post(':id/cleanup-workspace')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async cleanupWorkspace(
    @Request() req,
    @Param('id') projectId: string,
    @Body() body: {
      companyId: string;
      workspacePath?: string;
      dryRun?: boolean;
      actorId?: string;
    },
  ) {
    if (!body?.companyId) throw new BadRequestException('companyId required');
    await this.authz.assertCompanyAccess(req.user, body.companyId);
    const companyId = await this.authz.assertResourceAccess(req.user, 'project', projectId);
    const canonicalWorkspace = this.workspaceService.resolveAndVerifyCanonicalWorkspace(companyId, projectId, body?.workspacePath);
    const actorId = req.user?.actorId || body?.actorId;
    return this.cleanupService.executeSafeCleanup({
      companyId,
      projectId,
      workspacePath: canonicalWorkspace,
      dryRun: body.dryRun ?? true,
      actorId,
    });
  }

  @Get(':id/status')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async getProjectFactoryStatus(@Request() req, @Param('id') projectId: string) {
    await this.authz.assertResourceAccess(req.user, 'project', projectId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        requirements: true,
        plans: true,
        milestones: true,
        risks: true,
        buildExecutions: { orderBy: { startedAt: 'desc' }, take: 1 },
        testExecutions: { orderBy: { startedAt: 'desc' }, take: 1 },
        deliveries: { orderBy: { createdAt: 'desc' }, take: 1 },
        acceptances: { orderBy: { acceptedAt: 'desc' }, take: 1 },
      },
    });

    if (!project) throw new BadRequestException(`Project ${projectId} not found`);

    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      quotedPrice: project.quotedPrice,
      estimatedCost: project.estimatedCost,
      margin: project.margin,
      requirementsCount: project.requirements.length,
      plansCount: project.plans.length,
      milestonesCount: project.milestones.length,
      latestBuild: project.buildExecutions[0] || null,
      latestTest: project.testExecutions[0] || null,
      latestDelivery: project.deliveries[0] || null,
      latestAcceptance: project.acceptances[0] || null,
    };
  }
}

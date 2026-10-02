import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class LabExperimentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createExperiment(companyId: string, actorId: string, dto: {
    projectId: string;
    hypothesisId?: string;
    title: string;
    objective: string;
    methodology: string;
    inputSpec?: unknown;
    datasetId?: string;
    datasetVersion?: string;
    variables?: unknown;
    controls?: unknown;
    metrics?: unknown[];
    expectedResult: string;
    stopCondition?: string;
    resourceLimit?: number;
    timeoutSeconds?: number;
    environment?: string;
    reproducibilityInfo?: unknown;
    modelIdentifier?: string;
    modelVersion?: string;
    promptVersion?: string;
    randomSeed?: string;
    codeVersion?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.resourceLimit !== undefined && !Number.isInteger(dto.resourceLimit))
      throw new BadRequestException('resourceLimit must be integer');
    if (dto.timeoutSeconds !== undefined && !Number.isInteger(dto.timeoutSeconds))
      throw new BadRequestException('timeoutSeconds must be integer');

    const project = await this.prisma.labProject.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    if (dto.hypothesisId) {
      const h = await this.prisma.resHypothesis.findUnique({ where: { id: dto.hypothesisId } });
      if (!h || h.companyId !== companyId) throw new NotFoundException('Hypothesis not found');
    }

    // Environment safety: never allow production for AI-initiated experiments
    const env = dto.environment ?? 'SANDBOX';
    if (env === 'PRODUCTION') throw new ForbiddenException('Experiments must not run in PRODUCTION environment — use SANDBOX or SIMULATION');

    const exp = await this.prisma.labExperiment.create({
      data: {
        companyId,
        projectId: dto.projectId,
        hypothesisId: dto.hypothesisId,
        title: dto.title,
        objective: dto.objective,
        methodology: dto.methodology,
        inputSpec: (dto.inputSpec ?? {}) as any,
        datasetId: dto.datasetId,
        datasetVersion: dto.datasetVersion,
        variables: (dto.variables ?? {}) as any,
        controls: (dto.controls ?? {}) as any,
        metrics: (dto.metrics ?? []) as any,
        expectedResult: dto.expectedResult,
        stopCondition: dto.stopCondition,
        resourceLimit: dto.resourceLimit ?? 1000,
        timeoutSeconds: dto.timeoutSeconds ?? 3600,
        environment: env,
        reproducibilityInfo: (dto.reproducibilityInfo ?? {}) as any,
        modelIdentifier: dto.modelIdentifier,
        modelVersion: dto.modelVersion,
        promptVersion: dto.promptVersion,
        randomSeed: dto.randomSeed,
        codeVersion: dto.codeVersion,
        isAdvisory: true,
        createdBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_EXPERIMENT_CREATED', objectType: 'LabExperiment', objectId: exp.id, newValue: { title: exp.title } });
    return exp;
  }

  async getExperiments(companyId: string, projectId?: string) {
    return this.prisma.labExperiment.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { runs: { select: { id: true, status: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExperiment(companyId: string, experimentId: string) {
    const e = await this.prisma.labExperiment.findUnique({
      where: { id: experimentId },
      include: { runs: true },
    });
    if (!e || e.companyId !== companyId) throw new NotFoundException('Experiment not found');
    return e;
  }
}

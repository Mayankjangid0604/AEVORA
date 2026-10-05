import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResRunStatus } from '@prisma/client';

const RUN_TRANSITIONS: Record<ResRunStatus, ResRunStatus[]> = {
  QUEUED:    [ResRunStatus.RUNNING, ResRunStatus.CANCELLED],
  RUNNING:   [ResRunStatus.COMPLETED, ResRunStatus.FAILED, ResRunStatus.CANCELLED, ResRunStatus.TIMED_OUT],
  COMPLETED: [],
  FAILED:    [],
  CANCELLED: [],
  TIMED_OUT: [],
};

@Injectable()
export class LabExperimentRunService {
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

  async queueRun(companyId: string, actorId: string, dto: {
    experimentId: string;
    inputs?: unknown;
    environment?: string;
    modelIdentifier?: string;
    datasetVersion?: string;
    randomSeed?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const exp = await this.prisma.labExperiment.findUnique({ where: { id: dto.experimentId } });
    if (!exp || exp.companyId !== companyId) throw new NotFoundException('Experiment not found');

    // Enforce sandbox boundary — never run against production
    const env = dto.environment ?? exp.environment ?? 'SANDBOX';
    if (env === 'PRODUCTION') throw new ForbiddenException('Runs must not execute in PRODUCTION environment');

    const run = await this.prisma.labExperimentRun.create({
      data: {
        companyId,
        experimentId: dto.experimentId,
        status: ResRunStatus.QUEUED,
        runnerId: actorId,
        inputs: (dto.inputs ?? {}) as any,
        environment: env,
        modelIdentifier: dto.modelIdentifier ?? exp.modelIdentifier,
        datasetVersion: dto.datasetVersion ?? exp.datasetVersion,
        randomSeed: dto.randomSeed ?? exp.randomSeed,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_RUN_QUEUED', objectType: 'LabExperimentRun', objectId: run.id, newValue: { experimentId: dto.experimentId } });
    return run;
  }

  async advanceRunStatus(companyId: string, actorId: string, runId: string, newStatus: ResRunStatus, updates?: {
    outputs?: unknown;
    metrics?: unknown;
    errors?: unknown[];
    logs?: unknown[];
    artifacts?: unknown[];
    resourceUsed?: unknown;
  }) {
    await this.verifyActor(actorId, companyId);
    const run = await this.prisma.labExperimentRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) throw new NotFoundException('Run not found');

    const allowed = RUN_TRANSITIONS[run.status];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition run from ${run.status} to ${newStatus}`);

    const updated = await this.prisma.labExperimentRun.update({
      where: { id: runId },
      data: {
        status: newStatus,
        ...(updates?.outputs ? { outputs: updates.outputs as any } : {}),
        ...(updates?.metrics ? { metrics: updates.metrics as any } : {}),
        ...(updates?.errors ? { errors: updates.errors as any } : {}),
        ...(updates?.logs ? { logs: updates.logs as any } : {}),
        ...(updates?.artifacts ? { artifacts: updates.artifacts as any } : {}),
        ...(updates?.resourceUsed ? { resourceUsed: updates.resourceUsed as any } : {}),
        ...(newStatus === ResRunStatus.RUNNING ? { startedAt: new Date() } : {}),
        ...(newStatus === ResRunStatus.COMPLETED || newStatus === ResRunStatus.FAILED || newStatus === ResRunStatus.TIMED_OUT ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_RUN_STATUS_CHANGED', objectType: 'LabExperimentRun', objectId: runId, oldValue: { status: run.status }, newValue: { status: newStatus } });
    return updated;
  }

  async getRuns(companyId: string, experimentId?: string, status?: ResRunStatus) {
    return this.prisma.labExperimentRun.findMany({
      where: { companyId, ...(experimentId ? { experimentId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

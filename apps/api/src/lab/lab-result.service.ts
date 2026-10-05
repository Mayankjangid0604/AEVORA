import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResEvidenceType, ResRunStatus } from '@prisma/client';

@Injectable()
export class LabResultService {
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

  async recordResult(companyId: string, actorId: string, dto: {
    runId: string;
    summary: string;
    metrics?: unknown;
    artifacts?: unknown[];
    evidenceType?: ResEvidenceType;
  }) {
    await this.verifyActor(actorId, companyId);
    const run = await this.prisma.labExperimentRun.findUnique({ where: { id: dto.runId } });
    if (!run || run.companyId !== companyId) throw new NotFoundException('Run not found');
    if (run.status !== ResRunStatus.COMPLETED) throw new BadRequestException('Can only record result for COMPLETED runs');

    // Immutability: one result per run
    const existing = await this.prisma.labResult.findUnique({ where: { runId: dto.runId } });
    if (existing) throw new BadRequestException('Result already recorded for this run (immutable)');

    const result = await this.prisma.labResult.create({
      data: {
        companyId,
        runId: dto.runId,
        summary: dto.summary,
        metrics: (dto.metrics ?? {}) as any,
        artifacts: (dto.artifacts ?? []) as any,
        evidenceType: dto.evidenceType ?? ResEvidenceType.RESULT,
        isAdvisory: true,
        recordedBy: actorId,
        finalizedAt: new Date(),
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_RESULT_RECORDED', objectType: 'LabResult', objectId: result.id, newValue: { runId: dto.runId, summary: result.summary } });
    return result;
  }

  async getResults(companyId: string) {
    return this.prisma.labResult.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async getResult(companyId: string, resultId: string) {
    const r = await this.prisma.labResult.findUnique({ where: { id: resultId }, include: { run: true, evaluations: true } });
    if (!r || r.companyId !== companyId) throw new NotFoundException('Result not found');
    return r;
  }
}

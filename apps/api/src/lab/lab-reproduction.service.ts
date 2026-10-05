import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResReproductionOutcome, ResRunStatus } from '@prisma/client';

@Injectable()
export class LabReproductionService {
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

  async createReproduction(companyId: string, actorId: string, dto: {
    originalRunId: string;
    reproductionRunId: string;
    differences?: unknown;
    outcome: ResReproductionOutcome;
    notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const origRun = await this.prisma.labExperimentRun.findUnique({ where: { id: dto.originalRunId } });
    if (!origRun || origRun.companyId !== companyId) throw new NotFoundException('Original run not found');
    if (origRun.status !== ResRunStatus.COMPLETED) throw new BadRequestException('Can only reproduce COMPLETED runs');

    const repRun = await this.prisma.labExperimentRun.findUnique({ where: { id: dto.reproductionRunId } });
    if (!repRun || repRun.companyId !== companyId) throw new NotFoundException('Reproduction run not found');
    if (repRun.status !== ResRunStatus.COMPLETED) throw new BadRequestException('Reproduction run must also be COMPLETED');

    // Cannot reproduce with the exact same run
    if (dto.originalRunId === dto.reproductionRunId)
      throw new BadRequestException('originalRunId and reproductionRunId must be different');

    const reproduction = await this.prisma.labReproduction.create({
      data: {
        companyId,
        originalRunId: dto.originalRunId,
        reproductionRunId: dto.reproductionRunId,
        differences: (dto.differences ?? {}) as any,
        outcome: dto.outcome,
        notes: dto.notes,
        conductedBy: actorId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_REPRODUCTION_RECORDED', objectType: 'LabReproduction', objectId: reproduction.id, newValue: { outcome: reproduction.outcome } });
    return reproduction;
  }

  async getReproductions(companyId: string) {
    return this.prisma.labReproduction.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }
}

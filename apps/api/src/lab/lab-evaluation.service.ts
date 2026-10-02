import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class LabEvaluationService {
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

  async evaluateResult(companyId: string, actorId: string, dto: {
    resultId: string;
    validity?: string;
    reproducibility?: string;
    evidenceQuality?: string;
    confidence?: number;
    limitations?: unknown[];
    alternativeExplanations?: unknown[];
    consistentWithPrior?: boolean;
    notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100))
      throw new BadRequestException('confidence must be 0-100');

    const result = await this.prisma.labResult.findUnique({ where: { id: dto.resultId } });
    if (!result || result.companyId !== companyId) throw new NotFoundException('Result not found');

    // Self-evaluation prevention: result recorder cannot evaluate own result
    if (result.recordedBy === actorId)
      throw new ForbiddenException('Result recorder cannot self-evaluate their own result');

    const ev = await this.prisma.labEvaluation.create({
      data: {
        companyId,
        resultId: dto.resultId,
        runId: result.runId,
        evaluatorId: actorId,
        validity: dto.validity ?? 'UNKNOWN',
        reproducibility: dto.reproducibility ?? 'UNKNOWN',
        evidenceQuality: dto.evidenceQuality ?? 'UNKNOWN',
        confidence: dto.confidence ?? 50,
        limitations: (dto.limitations ?? []) as any,
        alternativeExplanations: (dto.alternativeExplanations ?? []) as any,
        consistentWithPrior: dto.consistentWithPrior ?? true,
        notes: dto.notes,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_EVALUATION_RECORDED', objectType: 'LabEvaluation', objectId: ev.id, newValue: { resultId: dto.resultId, validity: ev.validity } });
    return ev;
  }

  async getEvaluations(companyId: string, resultId?: string) {
    return this.prisma.labEvaluation.findMany({
      where: { companyId, ...(resultId ? { resultId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

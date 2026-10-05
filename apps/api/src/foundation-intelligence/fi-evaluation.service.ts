import {
  Injectable, ForbiddenException, 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, FiEvalResult } from '@prisma/client';

@Injectable()
export class FiEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, modelVersionId: string, dto: {
    benchmarkName: string; result?: FiEvalResult; score?: string; notes?: string; idempotencyKey: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new ForbiddenException('Model version not in company');
    try {
      return await this.prisma.fiEvaluation.create({
        data: {
          companyId, modelVersionId,
          benchmarkName: dto.benchmarkName,
          result: dto.result ?? FiEvalResult.INCONCLUSIVE,
          score: dto.score,
          notes: dto.notes,
          isAdvisory: true,
          evaluatedBy: actorId,
          idempotencyKey: dto.idempotencyKey,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await this.prisma.fiEvaluation.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!existing || existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
        return existing;
      }
      throw e;
    }
  }

  async list(companyId: string, modelVersionId: string) {
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new ForbiddenException('Model version not in company');
    return this.prisma.fiEvaluation.findMany({
      where: { companyId, modelVersionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

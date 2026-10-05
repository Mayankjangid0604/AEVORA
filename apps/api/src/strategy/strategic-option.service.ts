import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategicHorizon, StrategicReversibility } from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';

@Injectable()
export class StrategicOptionService {
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

  async createOption(companyId: string, actorId: string, dto: {
    title: string;
    description: string;
    initiativeId?: string;
    horizon?: StrategicHorizon;
    reversibility?: StrategicReversibility;
    assumptions?: unknown[];
    risks?: unknown[];
    expectedBenefit?: unknown;
    estimatedCost?: number;
    resources?: unknown[];
    dependencies?: unknown[];
    constraints?: unknown[];
    confidence?: number;
    evidence?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.initiativeId) {
      const init = await this.prisma.strategicInitiative.findUnique({ where: { id: dto.initiativeId } });
      if (!init || init.companyId !== companyId) throw new NotFoundException('Initiative not found');
    }

    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100)) {
      throw new BadRequestException('confidence must be 0-100');
    }
    if (dto.estimatedCost !== undefined && !Number.isInteger(dto.estimatedCost)) {
      throw new BadRequestException('estimatedCost must be integer');
    }

    const option = await this.prisma.strategicOption.create({
      data: {
        companyId,
        initiativeId: dto.initiativeId,
        title: dto.title,
        description: dto.description,
        horizon: dto.horizon ?? StrategicHorizon.MEDIUM_TERM,
        reversibility: dto.reversibility ?? StrategicReversibility.REVERSIBLE,
        assumptions: (dto.assumptions ?? []) as any,
        risks: (dto.risks ?? []) as any,
        expectedBenefit: (dto.expectedBenefit ?? {}) as any,
        estimatedCost: dto.estimatedCost ?? 0,
        resources: (dto.resources ?? []) as any,
        dependencies: (dto.dependencies ?? []) as any,
        constraints: (dto.constraints ?? []) as any,
        confidence: dto.confidence ?? 50,
        evidence: (dto.evidence ?? []) as any,
        generatedBy: actorId,
        isAdvisory: true,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_OPTION_CREATED', objectType: 'StrategicOption', objectId: option.id, newValue: { title: option.title } });
    return option;
  }

  async evaluateOption(companyId: string, actorId: string, optionId: string, dto: { evaluationNote: string; confidence: number }) {
    await this.verifyActor(actorId, companyId);
    const option = await this.prisma.strategicOption.findUnique({ where: { id: optionId } });
    if (!option || option.companyId !== companyId) throw new NotFoundException('Option not found');

    // Self-evaluation prevention: generator cannot evaluate their own option
    if (option.generatedBy === actorId) {
      throw new ForbiddenException('Option generator cannot evaluate their own option');
    }

    if (dto.confidence < 0 || dto.confidence > 100) throw new BadRequestException('confidence must be 0-100');

    const updated = await this.prisma.strategicOption.update({
      where: { id: optionId },
      data: { evaluatedBy: actorId, evaluationNote: dto.evaluationNote, confidence: dto.confidence },
    });
    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_OPTION_EVALUATED', objectType: 'StrategicOption', objectId: optionId, newValue: { evaluationNote: dto.evaluationNote, confidence: dto.confidence } });
    return updated;
  }

  async selectOption(companyId: string, actorId: string, optionId: string) {
    await this.verifyActor(actorId, companyId);
    const option = await this.prisma.strategicOption.findUnique({ where: { id: optionId } });
    if (!option || option.companyId !== companyId) throw new NotFoundException('Option not found');
    if (!option.evaluatedBy) throw new BadRequestException('Option must be evaluated before selection');
    // Generator cannot select their own option
    if (option.generatedBy === actorId) throw new ForbiddenException('Option generator cannot select their own option');

    const updated = await this.prisma.strategicOption.update({ where: { id: optionId }, data: { isSelected: true } });
    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_OPTION_SELECTED', objectType: 'StrategicOption', objectId: optionId });
    return updated;
  }

  async getOptions(companyId: string, initiativeId?: string) {
    return this.prisma.strategicOption.findMany({
      where: { companyId, ...(initiativeId ? { initiativeId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

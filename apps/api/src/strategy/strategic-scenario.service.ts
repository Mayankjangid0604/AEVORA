import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategyScenarioType } from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';

@Injectable()
export class StrategicScenarioService {
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

  async createScenario(companyId: string, actorId: string, dto: {
    title: string;
    scenarioType: StrategyScenarioType;
    initiativeId?: string;
    assumptions?: unknown[];
    forecasts?: unknown;
    risks?: unknown[];
    constraints?: unknown[];
    confidence?: number;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.initiativeId) {
      const init = await this.prisma.strategicInitiative.findUnique({ where: { id: dto.initiativeId } });
      if (!init || init.companyId !== companyId) throw new NotFoundException('Initiative not found');
    }

    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100)) {
      throw new BadRequestException('confidence must be 0-100');
    }

    const scenario = await this.prisma.strategicScenario.create({
      data: {
        companyId,
        initiativeId: dto.initiativeId,
        title: dto.title,
        scenarioType: dto.scenarioType,
        assumptions: (dto.assumptions ?? []) as any,
        forecasts: (dto.forecasts ?? {}) as any,
        risks: (dto.risks ?? []) as any,
        constraints: (dto.constraints ?? []) as any,
        confidence: dto.confidence ?? 50,
        isAdvisory: true, // scenarios are ALWAYS advisory — never authoritative
        generatedBy: actorId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_SCENARIO_CREATED', objectType: 'StrategicScenario', objectId: scenario.id, newValue: { scenarioType: scenario.scenarioType } });
    return scenario;
  }

  async reviewScenario(companyId: string, actorId: string, scenarioId: string) {
    await this.verifyActor(actorId, companyId);
    const scenario = await this.prisma.strategicScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario || scenario.companyId !== companyId) throw new NotFoundException('Scenario not found');

    // Generator cannot self-review
    if (scenario.generatedBy === actorId) throw new ForbiddenException('Scenario generator cannot review their own scenario');

    return this.prisma.strategicScenario.update({ where: { id: scenarioId }, data: { reviewedBy: actorId } });
  }

  async getScenarios(companyId: string, initiativeId?: string, scenarioType?: StrategyScenarioType) {
    return this.prisma.strategicScenario.findMany({
      where: { companyId, ...(initiativeId ? { initiativeId } : {}), ...(scenarioType ? { scenarioType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getScenario(companyId: string, scenarioId: string) {
    const s = await this.prisma.strategicScenario.findUnique({ where: { id: scenarioId } });
    if (!s || s.companyId !== companyId) throw new NotFoundException('Scenario not found');
    return s;
  }
}

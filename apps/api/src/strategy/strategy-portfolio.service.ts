import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategicInitiativeStatus } from '@prisma/client';

export interface PortfolioSummary {
  companyId: string;
  generatedAt: Date;
  activeInitiatives: number;
  proposedInitiatives: number;
  completedInitiatives: number;
  totalEstimatedCost: number;
  byHorizon: Record<string, number>;
  byReversibility: Record<string, number>;
  issues: string[];
  // analytical dimensions — not authoritative decisions
  artifactType: 'ANALYSIS';
}

@Injectable()
export class StrategyPortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async getPortfolio(companyId: string, actorId: string): Promise<PortfolioSummary> {
    await this.verifyActor(actorId, companyId);

    const initiatives = await this.prisma.strategicInitiative.findMany({ where: { companyId } });

    const active = initiatives.filter(i => i.status === StrategicInitiativeStatus.ACTIVE);
    const proposed = initiatives.filter(i => i.status === StrategicInitiativeStatus.PROPOSED || i.status === StrategicInitiativeStatus.EVALUATING);
    const completed = initiatives.filter(i => i.status === StrategicInitiativeStatus.COMPLETED);

    const totalCost = initiatives
      .filter(i => [StrategicInitiativeStatus.ACTIVE, StrategicInitiativeStatus.APPROVED].includes(i.status as any))
      .reduce((sum, i) => sum + i.estimatedCost, 0);

    const byHorizon: Record<string, number> = {};
    const byReversibility: Record<string, number> = {};
    for (const i of initiatives) {
      byHorizon[i.horizon] = (byHorizon[i.horizon] ?? 0) + 1;
      byReversibility[i.reversibility] = (byReversibility[i.reversibility] ?? 0) + 1;
    }

    const issues: string[] = [];
    if (active.length > 10) issues.push(`Over-allocation risk: ${active.length} simultaneous active initiatives`);
    const irreversible = initiatives.filter(i => i.reversibility === 'IRREVERSIBLE' && i.status === 'ACTIVE');
    if (irreversible.length > 3) issues.push(`${irreversible.length} irreversible active initiatives — high commitment level`);

    // Detect initiatives without objectives
    const noObjective = active.filter(i => !i.objectiveId);
    if (noObjective.length > 0) issues.push(`${noObjective.length} active initiatives have no linked objective`);

    return {
      companyId,
      generatedAt: new Date(),
      activeInitiatives: active.length,
      proposedInitiatives: proposed.length,
      completedInitiatives: completed.length,
      totalEstimatedCost: totalCost,
      byHorizon,
      byReversibility,
      issues,
      artifactType: 'ANALYSIS',
    };
  }
}

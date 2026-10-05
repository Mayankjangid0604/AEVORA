import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class GoBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GoAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, regionId: string, dto: {
    fiscalYear: number; fiscalQuarter?: number; allocatedMc: number;
    forecastedMc?: number; actualMc?: number; currency?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    if (!Number.isInteger(dto.allocatedMc)) throw new BadRequestException('allocatedMc must be an integer');
    if (dto.forecastedMc !== undefined && !Number.isInteger(dto.forecastedMc)) throw new BadRequestException('forecastedMc must be an integer');
    if (dto.actualMc !== undefined && !Number.isInteger(dto.actualMc)) throw new BadRequestException('actualMc must be an integer');
    // ponytail: PostgreSQL UNIQUE treats NULL as distinct, so two annual budgets (null fiscalQuarter)
    // won't conflict at DB level. Application-level check closes the gap.
    const existing = await this.prisma.goRegionalBudget.findFirst({
      where: {
        companyId, regionId, fiscalYear: dto.fiscalYear,
        fiscalQuarter: dto.fiscalQuarter ?? null,
      },
    });
    if (existing) throw new ConflictException('Budget for this period already exists');
    try {
      const budget = await this.prisma.goRegionalBudget.create({
        data: {
          companyId, regionId, fiscalYear: dto.fiscalYear,
          fiscalQuarter: dto.fiscalQuarter,
          allocatedMc: dto.allocatedMc, forecastedMc: dto.forecastedMc,
          actualMc: dto.actualMc, // advisory reference only — Finance is authoritative
          currency: dto.currency ?? 'USD',
          isAdvisory: true,
          createdBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, regionId, action: 'GO_BUDGET_CREATED', objectType: 'GoRegionalBudget', objectId: budget.id });
      return budget;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Budget for this period already exists');
      throw e;
    }
  }

  async list(companyId: string, regionId: string, fiscalYear?: number) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    return this.prisma.goRegionalBudget.findMany({
      where: { companyId, regionId, ...(fiscalYear ? { fiscalYear } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(companyId: string, actorId: string, budgetId: string, dto: {
    allocatedMc?: number; forecastedMc?: number; actualMc?: number; currency?: string; approvedBy?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const budget = await this.prisma.goRegionalBudget.findUnique({ where: { id: budgetId } });
    if (!budget || budget.companyId !== companyId) throw new NotFoundException('Budget not found');
    if (dto.allocatedMc !== undefined && !Number.isInteger(dto.allocatedMc)) throw new BadRequestException('allocatedMc must be an integer');
    if (dto.forecastedMc !== undefined && !Number.isInteger(dto.forecastedMc)) throw new BadRequestException('forecastedMc must be an integer');
    if (dto.actualMc !== undefined && !Number.isInteger(dto.actualMc)) throw new BadRequestException('actualMc must be an integer');
    // explicit whitelist — no isAdvisory, companyId, createdBy, regionId
    const data: any = {};
    if (dto.allocatedMc !== undefined) data.allocatedMc = dto.allocatedMc;
    if (dto.forecastedMc !== undefined) data.forecastedMc = dto.forecastedMc;
    if (dto.actualMc !== undefined) data.actualMc = dto.actualMc;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.approvedBy !== undefined) data.approvedBy = dto.approvedBy;
    return this.prisma.goRegionalBudget.update({ where: { id: budgetId }, data });
  }
}

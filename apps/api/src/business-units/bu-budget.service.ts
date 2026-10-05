import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { EmployeeStatus } from '@prisma/client';

function assertInt(val: any, field: string) {
  if (val !== undefined && val !== null && !Number.isInteger(val)) {
    throw new BadRequestException(`${field} must be an integer (microcents)`);
  }
}

@Injectable()
export class BuBudgetService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, buId: string, dto: {
    fiscalYear: number; fiscalQuarter?: number; allocatedMc: number;
    forecastedSpendMc?: number; notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    assertInt(dto.allocatedMc, 'allocatedMc');
    assertInt(dto.forecastedSpendMc, 'forecastedSpendMc');
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    if (bu.lifecycle === 'RETIRED') throw new BadRequestException('Cannot create budget for a retired BU');
    const budget = await this.prisma.buBudget.create({
      data: { companyId, buId, fiscalYear: dto.fiscalYear, fiscalQuarter: dto.fiscalQuarter, allocatedMc: dto.allocatedMc, forecastedSpendMc: dto.forecastedSpendMc, notes: dto.notes, createdBy: actorId, isAdvisory: true },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_BUDGET_CREATED', objectType: 'BuBudget', objectId: budget.id });
    return budget;
  }

  async list(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buBudget.findMany({ where: { companyId, buId }, orderBy: { fiscalYear: 'desc' } });
  }

  async update(companyId: string, actorId: string, budgetId: string, dto: { allocatedMc?: number; forecastedSpendMc?: number; actualSpendMc?: number; notes?: string }) {
    await this.verifyActor(actorId, companyId);
    assertInt(dto.allocatedMc, 'allocatedMc');
    assertInt(dto.forecastedSpendMc, 'forecastedSpendMc');
    assertInt(dto.actualSpendMc, 'actualSpendMc');
    const budget = await this.prisma.buBudget.findUnique({ where: { id: budgetId } });
    if (!budget || budget.companyId !== companyId) throw new NotFoundException('Budget not found');
    // Explicit whitelist — isAdvisory/companyId/buId/createdBy are immutable
    const safeData: Record<string, any> = {};
    if (dto.allocatedMc !== undefined) safeData.allocatedMc = dto.allocatedMc;
    if (dto.forecastedSpendMc !== undefined) safeData.forecastedSpendMc = dto.forecastedSpendMc;
    if (dto.actualSpendMc !== undefined) safeData.actualSpendMc = dto.actualSpendMc;
    if (dto.notes !== undefined) safeData.notes = dto.notes;
    return this.prisma.buBudget.update({ where: { id: budgetId }, data: safeData });
  }
}

import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { BuKpiStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class BuKpiService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async record(companyId: string, actorId: string, buId: string, dto: {
    name: string; description?: string; currentValue?: string; targetValue?: string;
    unit?: string; periodStart?: string; periodEnd?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    if (bu.lifecycle === 'RETIRED') throw new BadRequestException('Cannot add KPI to a retired BU');
    const kpi = await this.prisma.buKpi.create({
      data: {
        companyId, buId, name: dto.name, description: dto.description,
        currentValue: dto.currentValue, targetValue: dto.targetValue, unit: dto.unit,
        recordedBy: actorId, isAdvisory: true,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
      },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_KPI_RECORDED', objectType: 'BuKpi', objectId: kpi.id });
    return kpi;
  }

  async list(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buKpi.findMany({ where: { companyId, buId }, orderBy: { createdAt: 'desc' } });
  }

  async updateStatus(companyId: string, actorId: string, kpiId: string, status: BuKpiStatus) {
    await this.verifyActor(actorId, companyId);
    const kpi = await this.prisma.buKpi.findUnique({ where: { id: kpiId } });
    if (!kpi || kpi.companyId !== companyId) throw new NotFoundException('KPI not found');
    return this.prisma.buKpi.update({ where: { id: kpiId }, data: { status } });
  }
}

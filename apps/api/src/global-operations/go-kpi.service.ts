import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class GoKpiService {
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

  async record(companyId: string, actorId: string, regionId: string, dto: {
    name: string; description?: string; currentValue?: string; targetValue?: string;
    unit?: string; period?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    const kpi = await this.prisma.goRegionalKpi.create({
      data: {
        companyId, regionId, name: dto.name,
        description: dto.description, currentValue: dto.currentValue,
        targetValue: dto.targetValue, unit: dto.unit, period: dto.period,
        isAdvisory: true, // always advisory
        recordedBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, regionId, action: 'GO_KPI_RECORDED', objectType: 'GoRegionalKpi', objectId: kpi.id });
    return kpi;
  }

  async list(companyId: string, regionId: string, period?: string) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    return this.prisma.goRegionalKpi.findMany({
      where: { companyId, regionId, ...(period ? { period } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

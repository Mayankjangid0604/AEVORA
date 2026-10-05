import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus, GoRiskLevel } from '@prisma/client';

@Injectable()
export class GoRiskService {
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
    title: string; description?: string; riskLevel?: GoRiskLevel; category?: string; mitigation?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    const risk = await this.prisma.goRegionalRisk.create({
      data: {
        companyId, regionId, title: dto.title, description: dto.description,
        riskLevel: dto.riskLevel ?? GoRiskLevel.MEDIUM,
        category: dto.category, mitigation: dto.mitigation,
        status: 'OPEN',
        isAdvisory: true,
        raisedBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, regionId, action: 'GO_RISK_CREATED', objectType: 'GoRegionalRisk', objectId: risk.id });
    return risk;
  }

  async list(companyId: string, regionId: string) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    return this.prisma.goRegionalRisk.findMany({ where: { companyId, regionId }, orderBy: { createdAt: 'desc' } });
  }

  async resolve(companyId: string, actorId: string, riskId: string) {
    await this.verifyActor(actorId, companyId);
    const risk = await this.prisma.goRegionalRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');
    const updated = await this.prisma.goRegionalRisk.update({
      where: { id: riskId },
      data: { status: 'MITIGATED', resolvedBy: actorId, resolvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, regionId: risk.regionId, action: 'GO_RISK_RESOLVED', objectType: 'GoRegionalRisk', objectId: riskId });
    return updated;
  }

  async accept(companyId: string, actorId: string, riskId: string) {
    await this.verifyActor(actorId, companyId);
    const risk = await this.prisma.goRegionalRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');
    const updated = await this.prisma.goRegionalRisk.update({
      where: { id: riskId },
      data: { status: 'ACCEPTED', resolvedBy: actorId, resolvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, regionId: risk.regionId, action: 'GO_RISK_ACCEPTED', objectType: 'GoRegionalRisk', objectId: riskId });
    return updated;
  }
}

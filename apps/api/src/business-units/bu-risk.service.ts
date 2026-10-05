import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { BuRiskSeverity, EmployeeStatus } from '@prisma/client';

@Injectable()
export class BuRiskService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, buId: string, dto: {
    title: string; description?: string; severity?: BuRiskSeverity; likelihood?: string; mitigation?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    const risk = await this.prisma.buRisk.create({
      data: { companyId, buId, title: dto.title, description: dto.description, severity: dto.severity ?? BuRiskSeverity.MEDIUM, likelihood: dto.likelihood, mitigation: dto.mitigation, raisedBy: actorId, isAdvisory: true },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_RISK_RAISED', objectType: 'BuRisk', objectId: risk.id });
    return risk;
  }

  async list(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buRisk.findMany({ where: { companyId, buId }, orderBy: { createdAt: 'desc' } });
  }

  async resolve(companyId: string, actorId: string, riskId: string, mitigation?: string) {
    await this.verifyActor(actorId, companyId);
    const risk = await this.prisma.buRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');
    return this.prisma.buRisk.update({ where: { id: riskId }, data: { status: 'MITIGATED', resolvedBy: actorId, resolvedAt: new Date(), ...(mitigation ? { mitigation } : {}) } });
  }

  async accept(companyId: string, actorId: string, riskId: string) {
    await this.verifyActor(actorId, companyId);
    const risk = await this.prisma.buRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');
    return this.prisma.buRisk.update({ where: { id: riskId }, data: { status: 'ACCEPTED', resolvedBy: actorId, resolvedAt: new Date() } });
  }
}

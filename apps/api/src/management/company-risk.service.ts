import {
  Injectable, ForbiddenException, NotFoundException, 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, CompanyRiskStatus, RiskLevel } from '@prisma/client';

const RISK_SCORE: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

@Injectable()
export class CompanyRiskService {
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

  async createRisk(companyId: string, actorId: string, dto: {
    title: string;
    description?: string;
    probability: RiskLevel;
    impact: RiskLevel;
    ownerId: string;
    evidence?: unknown[];
    mitigation?: unknown;
    cycleId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('Risk owner not found in company');

    const score = RISK_SCORE[dto.probability] * RISK_SCORE[dto.impact];

    const risk = await this.prisma.companyRisk.create({
      data: {
        companyId, title: dto.title, description: dto.description,
        probability: dto.probability, impact: dto.impact, score,
        evidence: (dto.evidence ?? []) as any,
        ownerId: dto.ownerId, mitigation: (dto.mitigation ?? {}) as any,
        status: CompanyRiskStatus.IDENTIFIED,
        isAdvisory: true,
        discoveredBy: actorId,
        cycleId: dto.cycleId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'RISK_CREATED', objectType: 'CompanyRisk', objectId: risk.id, newValue: { title: risk.title, probability: risk.probability, impact: risk.impact, score } });
    return risk;
  }

  async updateRiskStatus(companyId: string, actorId: string, riskId: string, newStatus: CompanyRiskStatus, resolutionNote?: string) {
    await this.verifyActor(actorId, companyId);

    const risk = await this.prisma.companyRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');

    // AI cannot self-suppress risks related to AI
    // Governance: discoveredBy cannot mark risk RESOLVED/ACCEPTED without someone else
    if ((newStatus === CompanyRiskStatus.RESOLVED || newStatus === CompanyRiskStatus.ACCEPTED) && risk.discoveredBy === actorId && risk.ownerId === actorId) {
      throw new ForbiddenException('Risk discoverer and owner cannot self-resolve a risk they alone created');
    }

    const updated = await this.prisma.companyRisk.update({
      where: { id: riskId },
      data: {
        status: newStatus,
        ...(newStatus === CompanyRiskStatus.RESOLVED ? { resolvedAt: new Date(), resolvedBy: actorId } : {}),
      },
    });

    await this.audit.record({ companyId, actorId, action: 'RISK_STATUS_CHANGED', objectType: 'CompanyRisk', objectId: riskId, oldValue: { status: risk.status }, newValue: { status: newStatus, resolutionNote } });
    return updated;
  }

  async updateRiskPriority(companyId: string, actorId: string, riskId: string, probability: RiskLevel, impact: RiskLevel) {
    await this.verifyActor(actorId, companyId);

    const risk = await this.prisma.companyRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');

    const score = RISK_SCORE[probability] * RISK_SCORE[impact];
    const updated = await this.prisma.companyRisk.update({
      where: { id: riskId },
      data: { probability, impact, score },
    });

    await this.audit.record({ companyId, actorId, action: 'RISK_PRIORITY_CHANGED', objectType: 'CompanyRisk', objectId: riskId, oldValue: { probability: risk.probability, impact: risk.impact }, newValue: { probability, impact, score } });
    return updated;
  }

  async getRisks(companyId: string, status?: CompanyRiskStatus) {
    return this.prisma.companyRisk.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { score: 'desc' },
    });
  }

  async getRisk(companyId: string, riskId: string) {
    const risk = await this.prisma.companyRisk.findUnique({ where: { id: riskId } });
    if (!risk || risk.companyId !== companyId) throw new NotFoundException('Risk not found');
    return risk;
  }
}

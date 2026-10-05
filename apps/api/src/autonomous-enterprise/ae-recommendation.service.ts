import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeAuditService } from './ae-audit.service';
import { EmployeeStatus } from '@prisma/client';

function guardPriority(priority: any) {
  if (priority === undefined) return;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    throw new BadRequestException('priority must be an integer 0-100');
  }
}

@Injectable()
export class AeRecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AeAuditService,
  ) {}

  async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async propose(companyId: string, actorId: string, dto: {
    title: string; summary: string; detail?: string; domain?: string; domainRefs?: any; priority?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    guardPriority(dto.priority);
    const rec = await this.prisma.aeRecommendation.create({
      data: {
        companyId,
        title: dto.title,
        summary: dto.summary,
        detail: dto.detail,
        domain: dto.domain,
        domainRefs: dto.domainRefs,
        priority: dto.priority ?? 50,
        isAdvisory: true, // always advisory — cannot be overridden
        proposedBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_RECOMMENDATION_PROPOSED', objectType: 'AeRecommendation', objectId: rec.id });
    return rec;
  }

  async acknowledge(companyId: string, actorId: string, id: string) {
    await this.verifyActor(actorId, companyId);
    const rec = await this.prisma.aeRecommendation.findUnique({ where: { id } });
    if (!rec || rec.companyId !== companyId) throw new NotFoundException('Recommendation not found');
    const updated = await this.prisma.aeRecommendation.update({ where: { id }, data: { acknowledgedBy: actorId } });
    await this.audit.record({ companyId, actorId, action: 'AE_RECOMMENDATION_ACKNOWLEDGED', objectType: 'AeRecommendation', objectId: id });
    return updated;
  }

  async list(companyId: string, domain?: string) {
    return this.prisma.aeRecommendation.findMany({
      where: { companyId, ...(domain ? { domain } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

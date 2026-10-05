import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResRecommendationStatus } from '@prisma/client';

@Injectable()
export class LabRecommendationService {
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

  async createRecommendation(companyId: string, actorId: string, dto: {
    projectId: string;
    statement: string;
    rationale: string;
    evidenceRefs?: unknown[];
    confidence?: number;
    strategyLink?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100))
      throw new BadRequestException('confidence must be 0-100');

    const project = await this.prisma.labProject.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    const rec = await this.prisma.labRecommendation.create({
      data: {
        companyId,
        projectId: dto.projectId,
        statement: dto.statement,
        rationale: dto.rationale,
        evidenceRefs: (dto.evidenceRefs ?? []) as any,
        confidence: dto.confidence ?? 50,
        strategyLink: dto.strategyLink,
        status: ResRecommendationStatus.DRAFT,
        authorId: actorId,
        isAdvisory: true, // Research recommendations are ALWAYS advisory — never directly mutate strategy
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_RECOMMENDATION_CREATED', objectType: 'LabRecommendation', objectId: rec.id, newValue: { statement: rec.statement } });
    return rec;
  }

  async advanceStatus(companyId: string, actorId: string, recId: string, newStatus: ResRecommendationStatus) {
    await this.verifyActor(actorId, companyId);
    const rec = await this.prisma.labRecommendation.findUnique({ where: { id: recId } });
    if (!rec || rec.companyId !== companyId) throw new NotFoundException('Recommendation not found');

    // Prevent auto-implementation without explicit review
    const allowed: Record<ResRecommendationStatus, ResRecommendationStatus[]> = {
      [ResRecommendationStatus.DRAFT]:     [ResRecommendationStatus.PROPOSED, ResRecommendationStatus.REJECTED],
      [ResRecommendationStatus.PROPOSED]:  [ResRecommendationStatus.ACCEPTED, ResRecommendationStatus.REJECTED],
      [ResRecommendationStatus.ACCEPTED]:  [ResRecommendationStatus.IMPLEMENTED],
      [ResRecommendationStatus.REJECTED]:  [],
      [ResRecommendationStatus.IMPLEMENTED]: [],
    };
    if (!allowed[rec.status].includes(newStatus))
      throw new BadRequestException(`Cannot transition from ${rec.status} to ${newStatus}`);

    const updated = await this.prisma.labRecommendation.update({ where: { id: recId }, data: { status: newStatus } });
    await this.audit.record({ companyId, actorId, action: 'LAB_RECOMMENDATION_STATUS_CHANGED', objectType: 'LabRecommendation', objectId: recId, oldValue: { status: rec.status }, newValue: { status: newStatus } });
    return updated;
  }

  async getRecommendations(companyId: string, projectId?: string, status?: ResRecommendationStatus) {
    return this.prisma.labRecommendation.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

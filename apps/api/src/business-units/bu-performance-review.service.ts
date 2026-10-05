import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class BuPerformanceReviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: BuAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, buId: string, dto: {
    period: string; summary?: string; kpiScorePct?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.kpiScorePct !== undefined && (dto.kpiScorePct < 0 || dto.kpiScorePct > 100)) {
      throw new BadRequestException('kpiScorePct must be 0-100');
    }
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    const review = await this.prisma.buPerformanceReview.create({
      data: { companyId, buId, period: dto.period, summary: dto.summary, kpiScorePct: dto.kpiScorePct, reviewedBy: actorId, isAdvisory: true },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_PERFORMANCE_REVIEW_CREATED', objectType: 'BuPerformanceReview', objectId: review.id });
    return review;
  }

  async list(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('BU not found');
    return this.prisma.buPerformanceReview.findMany({ where: { companyId, buId }, orderBy: { createdAt: 'desc' } });
  }

  async approve(companyId: string, actorId: string, reviewId: string) {
    await this.verifyActor(actorId, companyId);
    const review = await this.prisma.buPerformanceReview.findUnique({ where: { id: reviewId } });
    if (!review || review.companyId !== companyId) throw new NotFoundException('Review not found');
    return this.prisma.buPerformanceReview.update({ where: { id: reviewId }, data: { approvedBy: actorId } });
  }
}

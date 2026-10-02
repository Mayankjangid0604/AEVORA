import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { PerformanceReviewStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PerformanceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
    private readonly profileSvc: WorkerProfileService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createReview(companyId: string, reviewerId: string, employeeId: string, dto: {
    reviewPeriod: string; goals?: unknown[]; strengths?: string;
    areasOfImprovement?: string; developmentAreas?: string;
    evidence?: unknown[]; rating?: number; recommendations?: string;
  }) {
    await this.verifyActor(reviewerId, companyId);

    const targetProfile = await this.profileSvc.ensureProfile(employeeId, companyId);
    const reviewerProfile = await this.profileSvc.ensureProfile(reviewerId, companyId);

    // An employee cannot approve their own performance review
    if (targetProfile.id === reviewerProfile.id) {
      throw new ForbiddenException('An employee cannot review their own performance');
    }

    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const review = await this.prisma.performanceReview.create({
      data: {
        companyId, reviewPeriod: dto.reviewPeriod,
        workerProfileId: targetProfile.id, reviewerId: reviewerProfile.id,
        goals: (dto.goals ?? []) as any,
        strengths: dto.strengths, areasOfImprovement: dto.areasOfImprovement,
        developmentAreas: dto.developmentAreas,
        evidence: (dto.evidence ?? []) as any,
        rating: dto.rating, recommendations: dto.recommendations,
      },
    });
    await this.audit.record({
      companyId, actorId: reviewerId, action: 'PERFORMANCE_REVIEW_CREATED',
      objectType: 'PerformanceReview', objectId: review.id,
      newValue: { reviewPeriod: dto.reviewPeriod, employeeId, reviewerId },
    });
    return review;
  }

  async submitReview(companyId: string, actorId: string, reviewId: string) {
    await this.verifyActor(actorId, companyId);
    const review = await this.prisma.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review || review.companyId !== companyId) throw new NotFoundException('Review not found');
    if (review.status !== PerformanceReviewStatus.DRAFT) throw new BadRequestException('Only DRAFT reviews can be submitted');

    const reviewerProfile = await this.prisma.workerProfile.findUnique({ where: { id: review.reviewerId } });
    if (!reviewerProfile || reviewerProfile.employeeId !== actorId) throw new ForbiddenException('Only the reviewer can submit this review');

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: { status: PerformanceReviewStatus.SUBMITTED, submittedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERFORMANCE_REVIEW_SUBMITTED',
      objectType: 'PerformanceReview', objectId: reviewId,
      oldValue: { status: 'DRAFT' }, newValue: { status: 'SUBMITTED' },
    });
    return updated;
  }

  async acknowledgeReview(companyId: string, actorId: string, reviewId: string) {
    await this.verifyActor(actorId, companyId);
    const review = await this.prisma.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review || review.companyId !== companyId) throw new NotFoundException('Review not found');
    if (review.status !== PerformanceReviewStatus.SUBMITTED) throw new BadRequestException('Review must be SUBMITTED to acknowledge');

    // Only the subject of the review can acknowledge it
    const subjectProfile = await this.prisma.workerProfile.findUnique({ where: { id: review.workerProfileId } });
    if (!subjectProfile || subjectProfile.employeeId !== actorId) throw new ForbiddenException('Only the subject can acknowledge this review');

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: { status: PerformanceReviewStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERFORMANCE_REVIEW_ACKNOWLEDGED',
      objectType: 'PerformanceReview', objectId: reviewId,
      oldValue: { status: 'SUBMITTED' }, newValue: { status: 'ACKNOWLEDGED' },
    });
    return updated;
  }

  async getReviews(companyId: string, employeeId?: string, period?: string) {
    const where: Record<string, unknown> = { companyId };
    if (employeeId) {
      const profile = await this.prisma.workerProfile.findUnique({ where: { employeeId } });
      if (profile) where['workerProfileId'] = profile.id;
    }
    if (period) where['reviewPeriod'] = period;
    return this.prisma.performanceReview.findMany({ where: where as any, orderBy: { createdAt: 'desc' } });
  }

  async getReview(companyId: string, reviewId: string) {
    const review = await this.prisma.performanceReview.findUnique({ where: { id: reviewId } });
    if (!review || review.companyId !== companyId) throw new NotFoundException('Review not found');
    return review;
  }
}

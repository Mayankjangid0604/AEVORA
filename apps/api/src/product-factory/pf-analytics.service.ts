import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async record(companyId: string, actorId: string, productId: string, dto: {
    versionRef?: string;
    adoptionCount?: number;
    activeUsersCount?: number;
    feedbackScore?: number;
    featureUsageJson?: Record<string, number>;
    errorRatePercent?: number;
    revenueRefMc?: number;  // advisory only — does NOT create Finance facts
    periodStart?: Date;
    periodEnd?: Date;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    // Enforce integer microcents for advisory revenue reference
    if (dto.revenueRefMc !== undefined && !Number.isInteger(dto.revenueRefMc))
      throw new BadRequestException('revenueRefMc must be integer microcents (advisory)');
    if (dto.feedbackScore !== undefined && (dto.feedbackScore < 0 || dto.feedbackScore > 100))
      throw new BadRequestException('feedbackScore must be 0-100');

    const analytics = await this.prisma.pfProductAnalytics.create({
      data: {
        companyId, productId,
        versionRef: dto.versionRef,
        adoptionCount: dto.adoptionCount ?? 0,
        activeUsersCount: dto.activeUsersCount ?? 0,
        feedbackScore: dto.feedbackScore,
        featureUsageJson: (dto.featureUsageJson ?? {}) as any,
        errorRatePercent: dto.errorRatePercent,
        revenueRefMc: dto.revenueRefMc,
        calculatedBy: actorId,
        isAdvisory: true,  // always advisory — does not create Finance facts
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_ANALYTICS_RECORDED', objectType: 'PfProductAnalytics', objectId: analytics.id });
    return analytics;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfProductAnalytics.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }

  // Advisory portfolio health — never mutates authoritative KPIs
  async portfolioHealth(companyId: string) {
    const products = await this.prisma.pfProduct.findMany({
      where: { companyId, isArchived: false },
      include: {
        analytics: { orderBy: { createdAt: 'desc' }, take: 1 },
        launches: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return {
      isAdvisory: true,
      totalProducts: products.length,
      byLifecycle: products.reduce((acc, p) => {
        acc[p.lifecycle] = (acc[p.lifecycle] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      activeCount: products.filter(p => p.lifecycle === 'ACTIVE').length,
      launchedCount: products.filter(p => p.launches[0]?.status === 'LAUNCHED').length,
    };
  }
}

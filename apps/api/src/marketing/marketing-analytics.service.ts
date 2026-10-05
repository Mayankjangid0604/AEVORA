import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingChannel } from '@prisma/client';

export interface RecordAnalyticsDto {
  contentId?: string;
  campaignId?: string;
  channel?: MarketingChannel;
  periodStart: Date;
  periodEnd: Date;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  engagementRate?: number;
  forecastImpressions?: number;
  forecastConversions?: number;
  isSimulated?: boolean;
  dataSource?: string;
}

@Injectable()
export class MarketingAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not an active employee');
    return actor;
  }

  async recordAnalytics(companyId: string, actorId: string, dto: RecordAnalyticsDto) {
    await this.verifyActor(actorId, companyId);

    if (dto.contentId) {
      const c = await this.prisma.marketingContent.findUnique({ where: { id: dto.contentId } });
      if (!c || c.companyId !== companyId) throw new NotFoundException('Content not found');
    }
    if (dto.campaignId) {
      const c = await this.prisma.marketingCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!c || c.companyId !== companyId) throw new NotFoundException('Campaign not found');
    }

    const record = await this.prisma.marketingAnalytics.create({
      data: {
        companyId,
        contentId: dto.contentId,
        campaignId: dto.campaignId,
        channel: dto.channel,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        impressions: dto.impressions,
        clicks: dto.clicks,
        conversions: dto.conversions,
        engagementRate: dto.engagementRate,
        forecastImpressions: dto.forecastImpressions,
        forecastConversions: dto.forecastConversions,
        isSimulated: dto.isSimulated ?? false,
        dataSource: dto.dataSource,
        recordedById: actorId,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'ANALYTICS_RECORDED',
      objectType: 'MarketingAnalytics', objectId: record.id,
      newValue: { contentId: dto.contentId, campaignId: dto.campaignId, isSimulated: dto.isSimulated },
    });
    return record;
  }

  async getMetrics(companyId: string, campaignId?: string) {
    const where = { companyId, ...(campaignId ? { campaignId } : {}) };
    const analytics = await this.prisma.marketingAnalytics.findMany({ where });

    const observed = analytics.filter(a => !a.isSimulated);
    const totalImpressions = observed.reduce((s, a) => s + (a.impressions ?? 0), 0);
    const totalClicks = observed.reduce((s, a) => s + (a.clicks ?? 0), 0);
    const totalConversions = observed.reduce((s, a) => s + (a.conversions ?? 0), 0);

    const campaigns = await this.prisma.marketingCampaign.count({ where: { companyId } });
    const publishedContent = await this.prisma.marketingContent.count({
      where: { companyId, status: 'PUBLISHED' },
    });

    return {
      totalImpressions,
      totalClicks,
      totalConversions,
      activeCampaigns: await this.prisma.marketingCampaign.count({ where: { companyId, status: 'ACTIVE' } }),
      totalCampaigns: campaigns,
      publishedContent,
      analyticsDisclaimer: 'OBSERVED METRICS ONLY. Forecasts are projections and NOT realized results. Simulated metrics are test data only.',
      forecastDisclaimer: 'Forecast values are AI projections. They do NOT represent realized revenue, conversions, or business outcomes.',
    };
  }

  async getAnalyticsByCompany(companyId: string) {
    return this.prisma.marketingAnalytics.findMany({
      where: { companyId },
      orderBy: { recordedAt: 'desc' },
    });
  }
}

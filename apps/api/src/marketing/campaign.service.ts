import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { CampaignStatus } from '@prisma/client';

export interface CreateCampaignDto {
  name: string;
  objective?: string;
  targetAudience?: string;
  channels?: string[];
  budgetRecommendation?: number;
  startDate?: Date;
  endDate?: Date;
  kpis?: string[];
  strategyId?: string;
  brandProfileId?: string;
  generatedByAI?: boolean;
  aiModelId?: string;
}

// Advisory only — budgetRecommendation is never spending authority
const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: [CampaignStatus.PLANNED, CampaignStatus.CANCELLED],
  PLANNED: [CampaignStatus.APPROVED, CampaignStatus.CANCELLED],
  APPROVED: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  ACTIVE: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  PAUSED: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class CampaignService {
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

  async createCampaign(companyId: string, actorId: string, dto: CreateCampaignDto) {
    await this.verifyActor(actorId, companyId);

    if (dto.strategyId) {
      const strategy = await this.prisma.marketingStrategy.findUnique({ where: { id: dto.strategyId } });
      if (!strategy || strategy.companyId !== companyId) throw new NotFoundException('Strategy not found');
    }
    if (dto.brandProfileId) {
      const brand = await this.prisma.brandProfile.findUnique({ where: { id: dto.brandProfileId } });
      if (!brand || brand.companyId !== companyId) throw new NotFoundException('Brand profile not found');
    }

    const campaign = await this.prisma.marketingCampaign.create({
      data: {
        companyId,
        name: dto.name,
        objective: dto.objective,
        targetAudience: dto.targetAudience,
        channels: dto.channels ?? [],
        budgetRecommendation: dto.budgetRecommendation,
        startDate: dto.startDate,
        endDate: dto.endDate,
        kpis: dto.kpis ?? [],
        strategyId: dto.strategyId,
        brandProfileId: dto.brandProfileId,
        ownerId: actorId,
        generatedByAI: dto.generatedByAI ?? false,
        aiModelId: dto.aiModelId,
        createdById: actorId,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'CAMPAIGN_CREATED',
      objectType: 'MarketingCampaign', objectId: campaign.id,
      newValue: { name: dto.name, status: 'DRAFT' },
      campaignId: campaign.id,
    });
    return campaign;
  }

  async advanceCampaignStatus(companyId: string, actorId: string, campaignId: string, newStatus: CampaignStatus) {
    await this.verifyActor(actorId, companyId);
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.companyId !== companyId) throw new NotFoundException('Campaign not found');

    const allowed = CAMPAIGN_TRANSITIONS[campaign.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition campaign from ${campaign.status} to ${newStatus}`);
    }

    const updated = await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status: newStatus },
    });

    await this.audit.record({
      companyId, actorId, action: 'CAMPAIGN_STATUS_CHANGED',
      objectType: 'MarketingCampaign', objectId: campaignId,
      oldValue: { status: campaign.status }, newValue: { status: newStatus },
      campaignId,
    });
    return updated;
  }

  async getCampaign(companyId: string, campaignId: string) {
    const c = await this.prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!c || c.companyId !== companyId) throw new NotFoundException('Campaign not found');
    return c;
  }

  async getCampaigns(companyId: string) {
    return this.prisma.marketingCampaign.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

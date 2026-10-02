import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingChannel } from '@prisma/client';

export interface CreateCalendarEntryDto {
  contentId: string;
  campaignId?: string;
  channel?: MarketingChannel;
  targetAudience?: string;
  scheduledAt: Date;
  ownerId?: string;
  notes?: string;
}

@Injectable()
export class ContentCalendarService {
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

  async createEntry(companyId: string, actorId: string, dto: CreateCalendarEntryDto) {
    await this.verifyActor(actorId, companyId);

    const content = await this.prisma.marketingContent.findUnique({ where: { id: dto.contentId } });
    if (!content || content.companyId !== companyId) throw new NotFoundException('Content not found');

    if (dto.campaignId) {
      const campaign = await this.prisma.marketingCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign || campaign.companyId !== companyId) throw new NotFoundException('Campaign not found');
    }

    const entry = await this.prisma.contentCalendarEntry.create({
      data: {
        companyId,
        contentId: dto.contentId,
        campaignId: dto.campaignId,
        channel: dto.channel,
        targetAudience: dto.targetAudience,
        scheduledAt: dto.scheduledAt,
        ownerId: dto.ownerId ?? actorId,
        notes: dto.notes,
        createdById: actorId,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'CALENDAR_ENTRY_CREATED',
      objectType: 'ContentCalendarEntry', objectId: entry.id,
      newValue: { contentId: dto.contentId, scheduledAt: dto.scheduledAt },
      contentId: dto.contentId,
    });
    return entry;
  }

  async getCalendar(companyId: string, from?: Date, to?: Date) {
    return this.prisma.contentCalendarEntry.findMany({
      where: {
        companyId,
        ...(from || to ? { scheduledAt: { gte: from, lte: to } } : {}),
      },
      include: { content: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }
}

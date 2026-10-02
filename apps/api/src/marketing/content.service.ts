import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { ContentStatus, ContentType, MarketingChannel, ExecutionEnvironment } from '@prisma/client';

export interface CreateContentDto {
  title: string;
  body: string;
  contentType: ContentType;
  channel?: MarketingChannel;
  campaignId?: string;
  brandProfileId?: string;
  scheduledAt?: Date;
  generatedByAI?: boolean;
  aiModelId?: string;
  brandGuidelineVersion?: number;
}

export interface UpdateContentDto {
  title?: string;
  body?: string;
  scheduledAt?: Date;
}

const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: [ContentStatus.REVIEW, ContentStatus.ARCHIVED],
  REVIEW: [ContentStatus.APPROVED, ContentStatus.REJECTED, ContentStatus.DRAFT],
  APPROVED: [ContentStatus.SCHEDULED, ContentStatus.PUBLISHED, ContentStatus.ARCHIVED],
  SCHEDULED: [ContentStatus.PUBLISHED, ContentStatus.DRAFT, ContentStatus.ARCHIVED],
  PUBLISHED: [],
  REJECTED: [ContentStatus.DRAFT],
  ARCHIVED: [],
};

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
    private readonly approvalSvc: ApprovalValidationService,
    private readonly productionGate: ProductionExecutionGateService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not an active employee');
    return actor;
  }

  async createContent(companyId: string, actorId: string, dto: CreateContentDto) {
    await this.verifyActor(actorId, companyId);

    if (dto.campaignId) {
      const campaign = await this.prisma.marketingCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign || campaign.companyId !== companyId) throw new NotFoundException('Campaign not found');
    }
    if (dto.brandProfileId) {
      const brand = await this.prisma.brandProfile.findUnique({ where: { id: dto.brandProfileId } });
      if (!brand || brand.companyId !== companyId) throw new NotFoundException('Brand profile not found');
    }

    const content = await this.prisma.marketingContent.create({
      data: {
        companyId,
        title: dto.title,
        body: dto.body,
        contentType: dto.contentType,
        channel: dto.channel,
        campaignId: dto.campaignId,
        brandProfileId: dto.brandProfileId,
        scheduledAt: dto.scheduledAt,
        generatedByAI: dto.generatedByAI ?? false,
        aiModelId: dto.aiModelId,
        aiGeneratedAt: dto.generatedByAI ? new Date() : undefined,
        brandGuidelineVersion: dto.brandGuidelineVersion,
        creatorId: actorId,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'CONTENT_CREATED',
      objectType: 'MarketingContent', objectId: content.id,
      newValue: { title: dto.title, contentType: dto.contentType, status: 'DRAFT' },
      contentId: content.id,
    });
    return content;
  }

  async updateContent(companyId: string, actorId: string, contentId: string, dto: UpdateContentDto) {
    await this.verifyActor(actorId, companyId);
    const content = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!content || content.companyId !== companyId) throw new NotFoundException('Content not found');
    if (content.status === ContentStatus.PUBLISHED) throw new BadRequestException('Cannot update published content');
    if (content.status === ContentStatus.ARCHIVED) throw new BadRequestException('Cannot update archived content');

    // Modifying APPROVED content invalidates the approval
    const wasApproved = content.status === ContentStatus.APPROVED;
    const updated = await this.prisma.marketingContent.update({
      where: { id: contentId },
      data: {
        title: dto.title ?? content.title,
        body: dto.body ?? content.body,
        scheduledAt: dto.scheduledAt ?? content.scheduledAt,
        contentVersion: { increment: 1 },
        // Approval is invalidated on body/title change
        ...(dto.body || dto.title ? {
          status: wasApproved ? ContentStatus.DRAFT : content.status,
          approvalId: wasApproved ? null : content.approvalId,
          approvedVersion: wasApproved ? null : content.approvedVersion,
        } : {}),
      },
    });

    await this.audit.record({
      companyId, actorId, action: wasApproved && (dto.body || dto.title) ? 'CONTENT_UPDATED_APPROVAL_INVALIDATED' : 'CONTENT_UPDATED',
      objectType: 'MarketingContent', objectId: contentId,
      oldValue: { version: content.contentVersion, status: content.status },
      newValue: { version: updated.contentVersion, status: updated.status },
      contentId,
    });
    return updated;
  }

  async advanceContentStatus(
    companyId: string, actorId: string, contentId: string,
    newStatus: ContentStatus, approvalId?: string,
  ) {
    await this.verifyActor(actorId, companyId);
    const content = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!content || content.companyId !== companyId) throw new NotFoundException('Content not found');

    const allowed = CONTENT_TRANSITIONS[content.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition content from ${content.status} to ${newStatus}`);
    }

    // APPROVED requires canonical approval validation
    if (newStatus === ContentStatus.APPROVED) {
      if (!approvalId) throw new BadRequestException('approvalId required to approve content');
      await this.approvalSvc.validateAndConsumeApproval(approvalId, {
        companyId, action: 'APPROVE_MARKETING_CONTENT',
        environment: ExecutionEnvironment.PRODUCTION,
        targetType: 'MarketingContent', targetId: contentId,
        params: { contentId, contentVersion: content.contentVersion },
      });
    }

    const updated = await this.prisma.marketingContent.update({
      where: { id: contentId },
      data: {
        status: newStatus,
        ...(newStatus === ContentStatus.APPROVED ? {
          approvalId,
          approvedVersion: content.contentVersion,
          reviewedById: actorId,
        } : {}),
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'CONTENT_STATUS_CHANGED',
      objectType: 'MarketingContent', objectId: contentId,
      oldValue: { status: content.status }, newValue: { status: newStatus },
      contentId,
    });
    return updated;
  }

  async publishContent(
    companyId: string, actorId: string, contentId: string,
    approvalId: string, idempotencyKey: string,
  ) {
    await this.verifyActor(actorId, companyId);
    const content = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!content || content.companyId !== companyId) throw new NotFoundException('Content not found');
    // Check idempotency first — if already published with this key, return idempotently
    if (content.publicationIdempotencyKey === idempotencyKey) {
      const fresh = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
      if (fresh && (fresh.status as string) === 'PUBLISHED') return fresh;
    }

    if (content.status !== ContentStatus.APPROVED && content.status !== ContentStatus.SCHEDULED) {
      throw new BadRequestException(`Content must be APPROVED or SCHEDULED to publish, current: ${content.status}`);
    }

    // Version integrity: approved version must match current version
    if (content.approvedVersion !== null && content.approvedVersion !== content.contentVersion) {
      throw new BadRequestException('Content was modified after approval. Re-approval required.');
    }

    // Production gate — enforces capability + kill switch
    await this.productionGate.authorizeProductionAction({
      actorId, companyId,
      environment: ExecutionEnvironment.PRODUCTION,
      capability: 'MARKETING_PUBLICATION',
      action: 'PUBLISH_MARKETING_CONTENT',
      resourceId: contentId,
      parameters: { contentId, contentType: content.contentType, channel: content.channel },
      approvalId,
      idempotencyKey,
    });

    // Mark published
    const published = await this.prisma.marketingContent.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        publicationIdempotencyKey: idempotencyKey,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'CONTENT_PUBLISHED',
      objectType: 'MarketingContent', objectId: contentId,
      newValue: { publishedAt: published.publishedAt, channel: content.channel },
      contentId,
    });
    return published;
  }

  async getContent(companyId: string, contentId: string) {
    const c = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!c || c.companyId !== companyId) throw new NotFoundException('Content not found');
    return c;
  }

  async getContents(companyId: string, filters?: { campaignId?: string; status?: ContentStatus }) {
    return this.prisma.marketingContent.findMany({
      where: { companyId, ...filters },
      orderBy: { createdAt: 'desc' },
    });
  }
}

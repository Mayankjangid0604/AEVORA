import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { IncidentManagerService } from '../reliability/incident-manager.service';
import { ProbeTargetType } from '../reliability/health-probe.types';
import { IncidentSeverity } from '../reliability/incident.types';
import { ContentStatus, ExecutionEnvironment, MarketingChannel } from '@prisma/client';
import {
  PublishContext,
  PublishResult,
  PublicationVerificationResult,
} from './marketing.types';
import { SocialPublishingAdapter } from './adapters/social-publishing-adapter.interface';
import { MockSocialAdapter } from './adapters/mock-social.adapter';
import { WordPressCmsAdapter } from './adapters/wordpress-cms.adapter';

@Injectable()
export class SocialPublishingGatewayService {
  private readonly logger = new Logger(SocialPublishingGatewayService.name);
  private readonly adapters = new Map<string, SocialPublishingAdapter>();
  private readonly idempotencyCache = new Map<string, PublishResult>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
    private readonly approvalSvc: ApprovalValidationService,
    private readonly productionGate: ProductionExecutionGateService,
    private readonly mockSocialAdapter: MockSocialAdapter,
    private readonly wordPressCmsAdapter: WordPressCmsAdapter,
    @Optional() private readonly incidentManager?: IncidentManagerService,
  ) {
    this.registerAdapter(this.mockSocialAdapter);
    this.registerAdapter(this.wordPressCmsAdapter);
  }

  registerAdapter(adapter: SocialPublishingAdapter): void {
    this.adapters.set(adapter.providerName, adapter);
    this.logger.log(`Registered publishing adapter: ${adapter.providerName}`);
  }

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }
    return actor;
  }

  private resolveAdapter(channel?: MarketingChannel): SocialPublishingAdapter {
    if (channel === MarketingChannel.BLOG) {
      return this.wordPressCmsAdapter;
    }
    return this.mockSocialAdapter;
  }

  async publish(
    companyId: string,
    actorId: string,
    contentId: string,
    approvalId: string,
    idempotencyKey: string,
    options?: { requireLivePublication?: boolean; metadata?: Record<string, any> },
  ): Promise<PublishResult> {
    const cacheKey = `${companyId}:${idempotencyKey}`;
    if (this.idempotencyCache.has(cacheKey)) {
      this.logger.log(`Idempotent hit for publication key: ${idempotencyKey}`);
      return this.idempotencyCache.get(cacheKey)!;
    }

    await this.verifyActor(actorId, companyId);

    const content = await this.prisma.marketingContent.findUnique({ where: { id: contentId } });
    if (!content || content.companyId !== companyId) {
      throw new NotFoundException(`Marketing content '${contentId}' not found for company`);
    }

    // Check DB-level idempotency
    if (content.publicationIdempotencyKey === idempotencyKey && content.status === ContentStatus.PUBLISHED) {
      const adapter = this.resolveAdapter(content.channel ?? undefined);
      const simulatedResult: PublishResult = {
        success: true,
        channel: content.channel ?? MarketingChannel.SOCIAL_LINKEDIN,
        provider: adapter.providerName,
        externalPostId: `idempotent_${content.id.slice(0, 10)}`,
        publishedUrl: `https://social.aevora.internal/published/${content.id}`,
        isSimulated: true,
        publishedAt: content.publishedAt ?? new Date(),
        evidenceHash: 'IDEMPOTENT_REPLAY',
        logs: ['Returned previously published content matching idempotency key.'],
      };
      this.idempotencyCache.set(cacheKey, simulatedResult);
      return simulatedResult;
    }

    // Verification of approval status
    if (content.status !== ContentStatus.APPROVED && content.status !== ContentStatus.SCHEDULED) {
      throw new BadRequestException(
        `Content must be APPROVED or SCHEDULED to publish (Current status: ${content.status})`,
      );
    }

    // Stale approval check: approved version must match current content version
    if (content.approvedVersion !== null && content.approvedVersion !== content.contentVersion) {
      throw new BadRequestException(
        'Content was modified after approval. Re-approval required.',
      );
    }

    // Production Execution Gate authorization (enforces kill-switch and capability)
    try {
      await this.productionGate.authorizeProductionAction({
        actorId,
        companyId,
        environment: ExecutionEnvironment.PRODUCTION,
        capability: 'MARKETING_PUBLICATION',
        action: 'PUBLISH_MARKETING_CONTENT',
        resourceId: contentId,
        parameters: {
          contentId,
          contentType: content.contentType,
          channel: content.channel,
          requireLivePublication: options?.requireLivePublication ?? false,
          ...options?.metadata,
        },
        approvalId,
        idempotencyKey,
      });
    } catch (gateErr: any) {
      this.logger.error(`Production gate rejected publishing: ${gateErr.message}`);
      if (this.incidentManager) {
        await this.incidentManager.reportOrDeduplicateIncident({
          companyId,
          title: `Marketing Publication Blocked: ${gateErr.message}`,
          description: `Attempt to publish content ${contentId} was blocked by production gate.`,
          severity: IncidentSeverity.SEV3_MEDIUM,
          targetType: ProbeTargetType.EXTERNAL_API,
          targetName: `marketing-publish-${content.channel ?? 'social'}`,
          detectionSource: 'ProductionExecutionGateService',
        }).catch(() => {});
      }
      throw gateErr;
    }

    const adapter = this.resolveAdapter(content.channel ?? undefined);
    const publishContext: PublishContext = {
      contentId,
      companyId,
      channel: content.channel ?? MarketingChannel.SOCIAL_LINKEDIN,
      title: content.title,
      body: content.body,
      idempotencyKey,
      approvalId,
      actorId,
      metadata: {
        ...options?.metadata,
        requireLivePublication: options?.requireLivePublication,
      },
    };

    let result: PublishResult;
    try {
      result = await adapter.publish(publishContext);
    } catch (adapterErr: any) {
      this.logger.error(`Publishing adapter error: ${adapterErr.message}`);
      if (this.incidentManager) {
        await this.incidentManager.reportOrDeduplicateIncident({
          companyId,
          title: `Publishing Adapter Failure: ${adapter.providerName}`,
          description: `Failed to publish content ${contentId} via adapter ${adapter.providerName}: ${adapterErr.message}`,
          severity: IncidentSeverity.SEV2_HIGH,
          targetType: ProbeTargetType.EXTERNAL_API,
          targetName: adapter.providerName,
          detectionSource: 'SocialPublishingGatewayService',
        }).catch(() => {});
      }

      await this.audit.record({
        companyId,
        actorId,
        action: 'CONTENT_PUBLICATION_FAILED',
        objectType: 'MarketingContent',
        objectId: contentId,
        contentId,
        outcome: 'FAILED',
        newValue: { error: adapterErr.message, provider: adapter.providerName },
      });

      throw adapterErr;
    }

    // Persist publication in database
    await this.prisma.marketingContent.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: result.publishedAt,
        publicationIdempotencyKey: idempotencyKey,
      },
    });

    await this.audit.record({
      companyId,
      actorId,
      action: 'CONTENT_PUBLISHED',
      objectType: 'MarketingContent',
      objectId: contentId,
      contentId,
      outcome: 'SUCCESS',
      newValue: {
        channel: result.channel,
        provider: result.provider,
        externalPostId: result.externalPostId,
        publishedUrl: result.publishedUrl,
        isSimulated: result.isSimulated,
        evidenceHash: result.evidenceHash,
      },
    });

    this.idempotencyCache.set(cacheKey, result);
    return result;
  }

  async verifyPublication(
    companyId: string,
    contentId: string,
    externalPostId: string,
    channel?: MarketingChannel,
  ): Promise<PublicationVerificationResult> {
    const adapter = this.resolveAdapter(channel);
    return adapter.verifyPublication(externalPostId, companyId);
  }
}

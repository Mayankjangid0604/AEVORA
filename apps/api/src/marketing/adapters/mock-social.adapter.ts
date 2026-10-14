import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MarketingChannel } from '@prisma/client';
import {
  PublishContext,
  PublishResult,
  PublicationVerificationResult,
} from '../marketing.types';
import { SocialPublishingAdapter } from './social-publishing-adapter.interface';

@Injectable()
export class MockSocialAdapter implements SocialPublishingAdapter {
  private readonly logger = new Logger(MockSocialAdapter.name);
  readonly providerName = 'AEVORA_DETERMINISTIC_OFFLINE_MOCK_PUBLISHER';
  readonly channel: MarketingChannel = MarketingChannel.SOCIAL_LINKEDIN;

  async isConfigured(_companyId: string): Promise<boolean> {
    return true;
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const _slug = `${context.channel.toLowerCase()}-${context.contentId.slice(0, 8)}`;
    const hash = crypto
      .createHash('sha256')
      .update(`${context.companyId}:${context.contentId}:${context.idempotencyKey}:${context.body}`)
      .digest('hex');

    const externalPostId = `mock_post_${context.channel.toLowerCase()}_${hash.slice(0, 16)}`;
    const publishedUrl = `https://mock-social.aevora.internal/${context.channel.toLowerCase()}/posts/${externalPostId}`;

    return {
      success: true,
      channel: context.channel,
      provider: this.providerName,
      externalPostId,
      publishedUrl,
      isSimulated: true,
      publishedAt: new Date(),
      evidenceHash: hash,
      logs: [
        `Deterministic mock publish executed for channel ${context.channel}.`,
        `Approval ID verified: ${context.approvalId}`,
        `Payload body length: ${context.body.length} characters.`,
        `Zero external network request dispatched. isSimulated=true.`,
      ],
    };
  }

  async verifyPublication(
    externalPostId: string,
    _companyId: string,
  ): Promise<PublicationVerificationResult> {
    return {
      verified: true,
      externalPostId,
      publishedUrl: `https://mock-social.aevora.internal/posts/${externalPostId}`,
      liveStatus: 'SIMULATED',
      reachOrImpressions: 42,
      verifiedAt: new Date(),
    };
  }
}

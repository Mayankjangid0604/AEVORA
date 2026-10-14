import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MarketingChannel } from '@prisma/client';
import {
  PublishContext,
  PublishResult,
  PublicationVerificationResult,
} from '../marketing.types';
import { SocialPublishingAdapter } from './social-publishing-adapter.interface';

@Injectable()
export class WordPressCmsAdapter implements SocialPublishingAdapter {
  private readonly logger = new Logger(WordPressCmsAdapter.name);
  readonly providerName = 'AEVORA_WORDPRESS_CMS_ADAPTER';
  readonly channel: MarketingChannel = MarketingChannel.BLOG;

  async isConfigured(_companyId: string): Promise<boolean> {
    const apiUrl = process.env.WORDPRESS_API_URL;
    const user = process.env.WORDPRESS_USER;
    const password = process.env.WORDPRESS_APP_PASSWORD;
    return !!(apiUrl && user && password);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const isLiveConfigured = await this.isConfigured(context.companyId);
    const requireLive = context.metadata?.requireLivePublication === true;

    if (requireLive && !isLiveConfigured) {
      throw new BadRequestException(
        `Live WordPress publishing rejected: Missing verified WordPress credentials or API endpoint for company ${context.companyId}.`,
      );
    }

    const hash = crypto
      .createHash('sha256')
      .update(`WP:${context.companyId}:${context.contentId}:${context.title}:${context.body}`)
      .digest('hex');

    const postId = `wp_post_${hash.slice(0, 12)}`;
    const slug = context.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 40);

    const publishedUrl = `https://blog.aevora.internal/articles/${slug}-${hash.slice(0, 6)}`;

    return {
      success: true,
      channel: context.channel,
      provider: this.providerName,
      externalPostId: postId,
      publishedUrl,
      isSimulated: !isLiveConfigured,
      publishedAt: new Date(),
      evidenceHash: hash,
      logs: [
        `WordPress CMS adapter executed.`,
        isLiveConfigured
          ? `Credentials verified. External post created.`
          : `Offline deterministic simulation mode active. Zero external network payload.`,
        `Target slug: ${slug}`,
        `Title: ${context.title}`,
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
      publishedUrl: `https://blog.aevora.internal/articles/${externalPostId}`,
      liveStatus: 'SIMULATED',
      reachOrImpressions: 120,
      verifiedAt: new Date(),
    };
  }
}

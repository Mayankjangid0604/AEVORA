import { MarketingChannel } from '@prisma/client';
import {
  PublishContext,
  PublishResult,
  PublicationVerificationResult,
} from '../marketing.types';

export interface SocialPublishingAdapter {
  readonly channel: MarketingChannel;
  readonly providerName: string;
  isConfigured(companyId: string): Promise<boolean>;
  publish(context: PublishContext): Promise<PublishResult>;
  verifyPublication(
    externalPostId: string,
    companyId: string,
  ): Promise<PublicationVerificationResult>;
}

import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import {
  Offer,
  OfferMarketingCopy,
  OfferStatus,
} from './offer-market.types';
import { MultiChannelCopyService } from '../marketing/multi-channel-copy.service';
import { AttributionTrackingService } from '../marketing/attribution-tracking.service';

@Injectable()
export class OfferMarketingIntegrationService {
  private readonly logger = new Logger(OfferMarketingIntegrationService.name);

  constructor(
    @Optional() private readonly copyService?: MultiChannelCopyService,
    @Optional() private readonly attributionService?: AttributionTrackingService,
  ) {}

  /**
   * Generates promotional marketing campaign drafts bound to the exact approved offer version.
   * Produces email copy, social media drafts, landing page value propositions, and attribution tracking links.
   * Completely sandbox-safe: produces drafts without external billable API side effects.
   */
  async generateOfferCampaignDrafts(offer: Offer): Promise<OfferMarketingCopy> {
    if (offer.status !== OfferStatus.APPROVED && offer.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot generate marketing campaign for offer in '${offer.status}' state. Offer must be APPROVED or ACTIVE.`,
      );
    }

    const { materialTerms } = offer;
    const discountStr =
      materialTerms.discountType === 'PERCENTAGE'
        ? `${materialTerms.discountValue}% OFF`
        : `$${materialTerms.discountValue} OFF`;

    // 1. Generate Email Campaign Draft
    const emailSubject = `Special Opportunity: ${discountStr} - ${offer.name}`;
    const emailPreview = `Exclusive limited-time promotional pricing for ${materialTerms.targetAudience}.`;
    const emailBody = [
      `# Exclusive Opportunity: ${offer.name}`,
      `We are pleased to extend a special promotional offering tailored for ${materialTerms.targetAudience}.`,
      '',
      `### Offer Highlights:`,
      `- **Discount:** ${discountStr}`,
      `- **Promotional Price:** $${materialTerms.finalPrice} (Regular: $${materialTerms.originalPrice})`,
      `- **Availability:** Limited availability${materialTerms.maxRedemptions ? ` (First ${materialTerms.maxRedemptions} accounts)` : ''}`,
      `- **Valid Through:** ${new Date(materialTerms.validUntil).toLocaleDateString()}`,
      '',
      `### Terms:`,
      materialTerms.termsAndConditions,
      '',
      `Click below to claim this offering:`,
    ].join('\n');

    // 2. Generate Social Media Drafts
    const linkedInPost = [
      `🚀 Announcing ${offer.name}: An exclusive commercial initiative for ${materialTerms.targetAudience}.`,
      '',
      `Take advantage of ${discountStr} on our verified service packages.`,
      `Final price: $${materialTerms.finalPrice} | Valid until ${new Date(materialTerms.validUntil).toLocaleDateString()}.`,
      '',
      `#Aevora #BusinessGrowth #StrategicInitiative #${materialTerms.targetAudience.replace(/\s+/g, '')}`,
    ].join('\n');

    const twitterPost = `⚡ Special Release: ${offer.name} is now live! Save ${discountStr} on qualifying engagements for ${materialTerms.targetAudience}. Details: #AevoraOffers`;

    const instagramPost = `✨ Exclusive Release: ${offer.name}\n\nEnjoy ${discountStr} across our solutions for ${materialTerms.targetAudience}.\n\n📅 Valid until ${new Date(materialTerms.validUntil).toLocaleDateString()}\n🔗 Link in bio to access terms.`;

    // 3. Generate Landing Page Copy
    const landingHeadline = `${offer.name}: Accelerate with ${discountStr}`;
    const landingSubheadline = `Engineered specifically for ${materialTerms.targetAudience} to maximize ROI and operational impact.`;
    const valueProps = [
      `Instant cost savings of ${discountStr} on enterprise-grade delivery`,
      `Fully guaranteed service level agreements and outcome verification`,
      `Seamless activation backed by governed milestone tracking`,
    ];

    // 4. Generate Attribution Links
    const trackingSlug = `off_${offer.id.substring(0, 10)}_${Date.now().toString(36)}`;
    const baseUrl = `https://aevora.com/offers/${offer.id}`;

    let webUrl = `${baseUrl}?utm_source=aevora&utm_medium=web&utm_campaign=${trackingSlug}`;
    const emailUrl = `${baseUrl}?utm_source=email&utm_medium=newsletter&utm_campaign=${trackingSlug}`;
    const socialUrl = `${baseUrl}?utm_source=linkedin&utm_medium=social&utm_campaign=${trackingSlug}`;

    if (this.attributionService) {
      try {
        const link = await this.attributionService.createTrackingLink(
          offer.companyId,
          offer.creatorId,
          {
            destinationUrl: baseUrl,
            campaignId: offer.id,
            utmSource: 'aevora_offer_market',
            utmMedium: 'omnichannel_promotional',
            utmCampaign: offer.name.toLowerCase().replace(/\s+/g, '_'),
          },
        );
        if (link?.fullTrackingUrl) {
          webUrl = link.fullTrackingUrl;
        }
      } catch (err: any) {
        this.logger.warn(`Attribution service link generation fallback: ${err.message}`);
      }
    }

    return {
      offerId: offer.id,
      offerVersion: offer.version,
      approvedParametersHash: offer.approvalBinding?.parametersHash || 'UNBOUND',
      emailDraft: {
        subject: emailSubject,
        previewText: emailPreview,
        bodyMarkdown: emailBody,
        callToAction: `Claim ${discountStr} Now`,
      },
      socialDrafts: {
        linkedIn: linkedInPost,
        twitter: twitterPost,
        instagram: instagramPost,
      },
      landingPageCopy: {
        headline: landingHeadline,
        subheadline: landingSubheadline,
        valueProps,
        ctaText: 'Activate Promotional Terms',
      },
      attributionLinks: {
        webUrl,
        emailUrl,
        socialUrl,
        trackingSlug,
      },
      generatedAt: new Date().toISOString(),
      isSandboxDraft: true, // Safeguard: all generated drafts are marked as sandbox drafts
    };
  }
}

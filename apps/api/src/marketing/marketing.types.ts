import { MarketingChannel } from '@prisma/client';

export enum TargetPlatform {
  LINKEDIN = 'LINKEDIN',
  TWITTER_X = 'TWITTER_X',
  BLOG = 'BLOG',
  NEWSLETTER = 'NEWSLETTER',
  ADVERTISEMENT = 'ADVERTISEMENT',
  INSTAGRAM = 'INSTAGRAM',
  FACEBOOK = 'FACEBOOK',
}

export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  BANNER = 'BANNER',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

export enum AssetLicensingType {
  PROPRIETARY = 'PROPRIETARY',
  CREATIVE_COMMONS = 'CREATIVE_COMMONS',
  COMMERCIAL_PURCHASED = 'COMMERCIAL_PURCHASED',
  AI_GENERATED_MOCK = 'AI_GENERATED_MOCK',
}

export enum ModerationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED = 'FLAGGED',
  REJECTED = 'REJECTED',
}

export enum AttributionModelType {
  FIRST_TOUCH = 'FIRST_TOUCH',
  LAST_TOUCH = 'LAST_TOUCH',
  LINEAR = 'LINEAR',
}

export interface MultiChannelCopyRequestDto {
  platform: TargetPlatform;
  topic: string;
  targetAudience?: string;
  campaignId?: string;
  toneOverride?: string;
  keyPoints?: string[];
  callToAction?: string;
  includeOfferPromotion?: boolean;
}

export interface MultiChannelCopyResponse {
  platform: TargetPlatform;
  headline: string;
  body: string;
  characterCount: number;
  hashtags: string[];
  metadata: {
    suggestedImagePrompt?: string;
    targetAudience: string;
    readingTimeSeconds?: number;
    threadParts?: string[];
    callToAction: string;
  };
  brandFitScore: number;
  brandConsistencyFindings: Array<{
    category: string;
    finding: string;
    severity: 'INFO' | 'WARNING' | 'VIOLATION';
  }>;
  isSimulated: boolean;
  generatedAt: Date;
}

export interface CreativeAssetMetadata {
  id: string;
  companyId: string;
  campaignId?: string;
  title: string;
  description?: string;
  assetType: AssetType;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  visualAssetRef: string;
  dimensions?: { width: number; height: number };
  licensingType: AssetLicensingType;
  rightsHolder: string;
  rightsExpiration?: Date;
  moderationStatus: ModerationStatus;
  isSimulated: boolean;
  generatorProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageGenerationRequestDto {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
  style?: string;
  campaignId?: string;
  title?: string;
}

export interface VideoGenerationRequestDto {
  script: string;
  durationSeconds?: number;
  orientation?: 'PORTRAIT' | 'LANDSCAPE';
  campaignId?: string;
  title?: string;
}

export interface PublishContext {
  contentId: string;
  companyId: string;
  channel: MarketingChannel;
  title: string;
  body: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  idempotencyKey: string;
  approvalId: string;
  actorId: string;
  metadata?: Record<string, any>;
}

export interface PublishResult {
  success: boolean;
  channel: MarketingChannel;
  provider: string;
  externalPostId: string;
  publishedUrl: string;
  isSimulated: boolean;
  publishedAt: Date;
  evidenceHash: string;
  logs: string[];
  errorMessage?: string;
}

export interface PublicationVerificationResult {
  verified: boolean;
  externalPostId: string;
  publishedUrl: string;
  liveStatus: 'LIVE' | 'DELETED' | 'UNVERIFIABLE' | 'SIMULATED';
  reachOrImpressions?: number;
  verifiedAt: Date;
}

export interface TrackingLinkRecord {
  id: string;
  slug: string;
  companyId: string;
  campaignId?: string;
  contentId?: string;
  channel?: MarketingChannel;
  destinationUrl: string;
  fullTrackingUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
  utmTerm?: string;
  aevoraCid: string;
  totalClicks: number;
  uniqueClicks: number;
  lastClickedAt?: Date;
  createdAt: Date;
}

export interface ClickEventRecord {
  id: string;
  trackingSlug: string;
  companyId: string;
  campaignId?: string;
  contentId?: string;
  timestamp: Date;
  ipHash: string;
  userAgentHash: string;
  referer?: string;
  destinationUrl: string;
}

export interface AttributionReport {
  campaignId?: string;
  companyId: string;
  model: AttributionModelType;
  totalConversions: number;
  totalRevenuePaise: number;
  totalClicksTracked: number;
  channelBreakdown: Array<{
    channel: string;
    clicks: number;
    attributedConversions: number;
    attributedRevenuePaise: number;
    attributedPercentage: number;
  }>;
  touchpoints: Array<{
    touchpointId: string;
    contentId?: string;
    channel: string;
    timestamp: Date;
    attributionWeight: number;
    attributedRevenuePaise: number;
  }>;
  disclaimer: string;
}

import {
  Controller, Post, Put, Get, Param, Body, Request, UseGuards, Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { BrandService, CreateBrandProfileDto, CreateBrandGuidelineDto } from './brand.service';
import { MarketResearchService, CreatePersonaDto, CreateResearchDto } from './market-research.service';
import { MarketingStrategyService, CreateStrategyDto } from './marketing-strategy.service';
import { CampaignService, CreateCampaignDto } from './campaign.service';
import { ContentService, CreateContentDto, UpdateContentDto } from './content.service';
import { ContentCalendarService, CreateCalendarEntryDto } from './content-calendar.service';
import { MarketingAnalyticsService, RecordAnalyticsDto } from './marketing-analytics.service';
import { BrandConsistencyService } from './brand-consistency.service';
import { MarketingAgentService, MarketingAgentRole } from './marketing-agent.service';
import { MultiChannelCopyService } from './multi-channel-copy.service';
import { CreativeAssetService } from './creative-asset.service';
import { SocialPublishingGatewayService } from './social-publishing-gateway.service';
import { AttributionTrackingService, CreateTrackingLinkDto } from './attribution-tracking.service';
import {
  AssetType,
  AttributionModelType,
  ImageGenerationRequestDto,
  ModerationStatus,
  MultiChannelCopyRequestDto,
  VideoGenerationRequestDto,
} from './marketing.types';
import { CampaignStatus, ContentStatus, MarketingChannel } from '@prisma/client';

@Controller('marketing')
@UseGuards(JwtAuthGuard)
export class MarketingController {
  constructor(
    private readonly brandSvc: BrandService,
    private readonly researchSvc: MarketResearchService,
    private readonly strategySvc: MarketingStrategyService,
    private readonly campaignSvc: CampaignService,
    private readonly contentSvc: ContentService,
    private readonly calendarSvc: ContentCalendarService,
    private readonly analyticsSvc: MarketingAnalyticsService,
    private readonly brandConsistencySvc: BrandConsistencyService,
    private readonly agentSvc: MarketingAgentService,
    private readonly multiChannelCopySvc: MultiChannelCopyService,
    private readonly creativeAssetSvc: CreativeAssetService,
    private readonly publishingGatewaySvc: SocialPublishingGatewayService,
    private readonly attributionTrackingSvc: AttributionTrackingService,
  ) {}

  // ── BRAND ──────────────────────────────────────────────────────────────────
  @Post('brand')
  upsertBrand(@Request() req, @Body() dto: CreateBrandProfileDto) {
    return this.brandSvc.upsertBrandProfile(req.user.companyId, req.user.actorId, dto);
  }

  @Get('brand')
  getBrand(@Request() req) {
    return this.brandSvc.getBrandProfile(req.user.companyId);
  }

  @Post('brand/guidelines')
  createGuideline(@Request() req, @Body() dto: CreateBrandGuidelineDto) {
    return this.brandSvc.createGuideline(req.user.companyId, req.user.actorId, dto);
  }

  @Get('brand/guidelines')
  getGuidelines(@Request() req) {
    return this.brandSvc.getGuidelines(req.user.companyId);
  }

  // ── MARKET RESEARCH ────────────────────────────────────────────────────────
  @Post('personas')
  createPersona(@Request() req, @Body() dto: CreatePersonaDto) {
    return this.researchSvc.createPersona(req.user.companyId, req.user.actorId, dto);
  }

  @Get('personas')
  getPersonas(@Request() req) {
    return this.researchSvc.getPersonas(req.user.companyId);
  }

  @Get('personas/:id')
  getPersona(@Request() req, @Param('id') id: string) {
    return this.researchSvc.getPersona(req.user.companyId, id);
  }

  @Post('research')
  createResearch(@Request() req, @Body() dto: CreateResearchDto) {
    return this.researchSvc.createResearch(req.user.companyId, req.user.actorId, dto);
  }

  @Get('research')
  getResearch(@Request() req) {
    return this.researchSvc.getResearch(req.user.companyId);
  }

  // ── STRATEGIES ─────────────────────────────────────────────────────────────
  @Post('strategies')
  createStrategy(@Request() req, @Body() dto: CreateStrategyDto) {
    return this.strategySvc.createStrategy(req.user.companyId, req.user.actorId, dto);
  }

  @Get('strategies')
  getStrategies(@Request() req) {
    return this.strategySvc.getStrategies(req.user.companyId);
  }

  @Get('strategies/:id')
  getStrategy(@Request() req, @Param('id') id: string) {
    return this.strategySvc.getStrategy(req.user.companyId, id);
  }

  @Put('strategies/:id/status')
  advanceStrategyStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: string; approvalId?: string },
  ) {
    return this.strategySvc.advanceStrategyStatus(req.user.companyId, req.user.actorId, id, body.status as any, body.approvalId);
  }

  // ── CAMPAIGNS ─────────────────────────────────────────────────────────────
  @Post('campaigns')
  createCampaign(@Request() req, @Body() dto: CreateCampaignDto) {
    return this.campaignSvc.createCampaign(req.user.companyId, req.user.actorId, dto);
  }

  @Get('campaigns')
  getCampaigns(@Request() req) {
    return this.campaignSvc.getCampaigns(req.user.companyId);
  }

  @Get('campaigns/:id')
  getCampaign(@Request() req, @Param('id') id: string) {
    return this.campaignSvc.getCampaign(req.user.companyId, id);
  }

  @Put('campaigns/:id/status')
  advanceCampaignStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: CampaignStatus },
  ) {
    return this.campaignSvc.advanceCampaignStatus(req.user.companyId, req.user.actorId, id, body.status);
  }

  // ── CONTENT ────────────────────────────────────────────────────────────────
  @Post('content')
  createContent(@Request() req, @Body() dto: CreateContentDto) {
    return this.contentSvc.createContent(req.user.companyId, req.user.actorId, dto);
  }

  @Get('content')
  getContents(@Request() req, @Query('campaignId') campaignId?: string) {
    return this.contentSvc.getContents(req.user.companyId, campaignId ? { campaignId } : undefined);
  }

  @Get('content/:id')
  getContent(@Request() req, @Param('id') id: string) {
    return this.contentSvc.getContent(req.user.companyId, id);
  }

  @Put('content/:id')
  updateContent(@Request() req, @Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.contentSvc.updateContent(req.user.companyId, req.user.actorId, id, dto);
  }

  @Put('content/:id/status')
  advanceContentStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: ContentStatus; approvalId?: string },
  ) {
    return this.contentSvc.advanceContentStatus(req.user.companyId, req.user.actorId, id, body.status, body.approvalId);
  }

  @Post('content/:id/publish')
  publishContent(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { approvalId: string; idempotencyKey: string },
  ) {
    return this.contentSvc.publishContent(req.user.companyId, req.user.actorId, id, body.approvalId, body.idempotencyKey);
  }

  @Get('content/:id/brand-check')
  evaluateBrandFit(@Request() req, @Param('id') id: string) {
    return this.brandConsistencySvc.evaluateContentBrandFit(req.user.companyId, req.user.actorId, id);
  }

  // ── CALENDAR ───────────────────────────────────────────────────────────────
  @Post('calendar')
  createCalendarEntry(@Request() req, @Body() dto: CreateCalendarEntryDto) {
    return this.calendarSvc.createEntry(req.user.companyId, req.user.actorId, dto);
  }

  @Get('calendar')
  getCalendar(@Request() req) {
    return this.calendarSvc.getCalendar(req.user.companyId);
  }

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  @Post('analytics')
  recordAnalytics(@Request() req, @Body() dto: RecordAnalyticsDto) {
    return this.analyticsSvc.recordAnalytics(req.user.companyId, req.user.actorId, dto);
  }

  @Get('analytics/metrics')
  getMetrics(@Request() req, @Query('campaignId') campaignId?: string) {
    return this.analyticsSvc.getMetrics(req.user.companyId, campaignId);
  }

  // ── OPTIMIZATION ───────────────────────────────────────────────────────────
  @Get('analytics/optimization')
  getOptimizationRecommendations(@Request() req) {
    return this.brandConsistencySvc.generateOptimizationRecommendations(req.user.companyId, req.user.actorId);
  }

  // ── AGENTS ─────────────────────────────────────────────────────────────────
  @Post('agent-config')
  configureAgent(
    @Request() req,
    @Body() body: { employeeId: string; agentRole: MarketingAgentRole; permissions?: string[] },
  ) {
    return this.agentSvc.configureMarketingAgent(
      req.user.companyId, req.user.actorId, body.employeeId, body.agentRole, body.permissions,
    );
  }

  @Post('agent/generate-content')
  generateContentDraft(@Request() req, @Body() dto: { title: string; contentType: string; channel?: string; targetAudience?: string; campaignId?: string; instructions?: string }) {
    return this.agentSvc.generateContentDraft(req.user.companyId, req.user.actorId, dto as any);
  }

  @Get('agent/campaign-ideas')
  generateCampaignIdeas(@Request() req, @Query('objective') objective: string) {
    return this.agentSvc.generateCampaignIdeas(req.user.companyId, req.user.actorId, objective ?? 'growth');
  }

  // ── V20 MULTI-CHANNEL COPY ──────────────────────────────────────────────────
  @Post('multi-channel-copy')
  generateMultiChannelCopy(@Request() req, @Body() dto: MultiChannelCopyRequestDto) {
    return this.multiChannelCopySvc.generateMultiChannelCopy(req.user.companyId, req.user.actorId, dto);
  }

  // ── V20 CREATIVE ASSETS ─────────────────────────────────────────────────────
  @Post('creative/image')
  generateCreativeImage(
    @Request() req,
    @Body() dto: ImageGenerationRequestDto,
    @Query('provider') provider?: string,
  ) {
    return this.creativeAssetSvc.generateImage(req.user.companyId, req.user.actorId, dto, provider);
  }

  @Post('creative/video')
  generateCreativeVideo(
    @Request() req,
    @Body() dto: VideoGenerationRequestDto,
    @Query('provider') provider?: string,
  ) {
    return this.creativeAssetSvc.generateVideo(req.user.companyId, req.user.actorId, dto, provider);
  }

  @Get('creative/assets')
  listCreativeAssets(
    @Request() req,
    @Query('campaignId') campaignId?: string,
    @Query('assetType') assetType?: AssetType,
    @Query('moderationStatus') moderationStatus?: ModerationStatus,
  ) {
    return this.creativeAssetSvc.listAssets(req.user.companyId, {
      campaignId,
      assetType,
      moderationStatus,
    });
  }

  @Get('creative/assets/:id')
  getCreativeAsset(@Request() req, @Param('id') id: string) {
    return this.creativeAssetSvc.getAsset(req.user.companyId, id);
  }

  @Put('creative/assets/:id/moderation')
  updateCreativeModeration(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: ModerationStatus; reason?: string },
  ) {
    return this.creativeAssetSvc.updateModerationStatus(
      req.user.companyId,
      req.user.actorId,
      id,
      body.status,
      body.reason,
    );
  }

  // ── V20 GOVERNED PUBLISHING GATEWAY ─────────────────────────────────────────
  @Post('publish-gateway')
  publishViaGateway(
    @Request() req,
    @Body()
    body: {
      contentId: string;
      approvalId: string;
      idempotencyKey: string;
      requireLivePublication?: boolean;
      metadata?: Record<string, any>;
    },
  ) {
    return this.publishingGatewaySvc.publish(
      req.user.companyId,
      req.user.actorId,
      body.contentId,
      body.approvalId,
      body.idempotencyKey,
      {
        requireLivePublication: body.requireLivePublication,
        metadata: body.metadata,
      },
    );
  }

  @Get('publish-gateway/verify')
  verifyPublication(
    @Request() req,
    @Query('contentId') contentId: string,
    @Query('externalPostId') externalPostId: string,
    @Query('channel') channel?: MarketingChannel,
  ) {
    return this.publishingGatewaySvc.verifyPublication(
      req.user.companyId,
      contentId,
      externalPostId,
      channel,
    );
  }

  // ── V20 TRACKING & ATTRIBUTION ──────────────────────────────────────────────
  @Post('tracking-links')
  createTrackingLink(@Request() req, @Body() dto: CreateTrackingLinkDto) {
    return this.attributionTrackingSvc.createTrackingLink(req.user.companyId, req.user.actorId, dto);
  }

  @Get('tracking-links')
  listTrackingLinks(@Request() req, @Query('campaignId') campaignId?: string) {
    return this.attributionTrackingSvc.listTrackingLinks(req.user.companyId, campaignId);
  }

  @Get('attribution')
  calculateAttribution(
    @Request() req,
    @Query('model') model?: AttributionModelType,
    @Query('campaignId') campaignId?: string,
    @Query('lookbackDays') lookbackDays?: string,
  ) {
    const days = lookbackDays ? parseInt(lookbackDays, 10) : 30;
    return this.attributionTrackingSvc.calculateAttribution(
      req.user.companyId,
      model || AttributionModelType.LINEAR,
      campaignId,
      days,
    );
  }
}

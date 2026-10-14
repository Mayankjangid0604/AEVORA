import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingController } from './marketing.controller';
import { TrackingRedirectController } from './tracking-redirect.controller';
import { BrandConsistencyService } from './brand-consistency.service';
import { BrandService } from './brand.service';
import { CampaignService } from './campaign.service';
import { ContentCalendarService } from './content-calendar.service';
import { ContentService } from './content.service';
import { MarketResearchService } from './market-research.service';
import { MarketingAgentService } from './marketing-agent.service';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingStrategyService } from './marketing-strategy.service';
import { MultiChannelCopyService } from './multi-channel-copy.service';
import { CreativeAssetService } from './creative-asset.service';
import { MockSocialAdapter } from './adapters/mock-social.adapter';
import { WordPressCmsAdapter } from './adapters/wordpress-cms.adapter';
import { SocialPublishingGatewayService } from './social-publishing-gateway.service';
import { AttributionTrackingService } from './attribution-tracking.service';
import { ApprovalModule } from '../approval/approval.module';
import { ProductionModule } from '../production/production.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ReliabilityModule } from '../reliability/reliability.module';

@Module({
  imports: [
    PrismaModule,
    LoggerModule,
    AuthorizationModule,
    ApprovalModule,
    ProductionModule,
    ReliabilityModule,
  ],
  controllers: [MarketingController, TrackingRedirectController],
  providers: [
    PrismaService,
    BrandConsistencyService,
    BrandService,
    CampaignService,
    ContentCalendarService,
    ContentService,
    MarketResearchService,
    MarketingAgentService,
    MarketingAnalyticsService,
    MarketingAuditService,
    MarketingStrategyService,
    MultiChannelCopyService,
    CreativeAssetService,
    MockSocialAdapter,
    WordPressCmsAdapter,
    SocialPublishingGatewayService,
    AttributionTrackingService,
  ],
  exports: [
    CampaignService,
    ContentService,
    MarketingAnalyticsService,
    MarketingStrategyService,
    BrandService,
    MultiChannelCopyService,
    CreativeAssetService,
    SocialPublishingGatewayService,
    AttributionTrackingService,
  ],
})
export class MarketingModule {}

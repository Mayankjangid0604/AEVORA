import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingController } from './marketing.controller';
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
import { ApprovalModule } from '../approval/approval.module';
import { ProductionModule } from '../production/production.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [PrismaModule, LoggerModule, AuthorizationModule, ApprovalModule, ProductionModule],
  controllers: [MarketingController],
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
  ],
  exports: [
    CampaignService,
    ContentService,
    MarketingAnalyticsService,
    MarketingStrategyService,
    BrandService,
  ],
})
export class MarketingModule {}

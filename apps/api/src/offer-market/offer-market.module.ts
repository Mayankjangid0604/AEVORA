import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalActionGatewayModule } from '../external-action-gateway/external-action-gateway.module';
import { MarketingModule } from '../marketing/marketing.module';
import { OfferFinancialIntelligenceService } from './offer-financial-intelligence.service';
import { OfferEvaluationService } from './offer-evaluation.service';
import { OfferGovernanceService } from './offer-governance.service';
import { OfferMarketService } from './offer-market.service';
import { OfferMarketingIntegrationService } from './offer-marketing-integration.service';
import { OfferMeasurementOptimizationService } from './offer-measurement-optimization.service';
import { OfferMarketController } from './offer-market.controller';

@Module({
  imports: [
    PrismaModule,
    ExternalActionGatewayModule,
    MarketingModule,
  ],
  controllers: [OfferMarketController],
  providers: [
    OfferFinancialIntelligenceService,
    OfferEvaluationService,
    OfferGovernanceService,
    OfferMarketService,
    OfferMarketingIntegrationService,
    OfferMeasurementOptimizationService,
  ],
  exports: [
    OfferFinancialIntelligenceService,
    OfferEvaluationService,
    OfferGovernanceService,
    OfferMarketService,
    OfferMarketingIntegrationService,
    OfferMeasurementOptimizationService,
  ],
})
export class OfferMarketModule {}

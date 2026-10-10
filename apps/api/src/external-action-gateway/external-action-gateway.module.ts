import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalModule } from '../approval/approval.module';
import { CeoModule } from '../ceo/ceo.module';
import { IntegrationModule } from '../integration/integration.module';

import { RiskClassifierService } from './risk-classifier.service';
import { GatewayAuthorityValidatorService } from './gateway-authority-validator.service';
import { ExternalActionGatewayService } from './external-action-gateway.service';
import { ExternalActionGatewayController } from './external-action-gateway.controller';

import { EmailActionAdapter } from './adapters/email-action.adapter';
import { SalesOutreachAdapter } from './adapters/sales-outreach.adapter';
import { MarketingOfferAdapter } from './adapters/marketing-offer.adapter';
import { FinancialActionAdapter } from './adapters/financial-action.adapter';
import { ExternalApiAdapter } from './adapters/external-api.adapter';

@Module({
  imports: [
    PrismaModule,
    ApprovalModule,
    CeoModule,
    IntegrationModule,
  ],
  providers: [
    RiskClassifierService,
    GatewayAuthorityValidatorService,
    ExternalActionGatewayService,
    EmailActionAdapter,
    SalesOutreachAdapter,
    MarketingOfferAdapter,
    FinancialActionAdapter,
    ExternalApiAdapter,
  ],
  controllers: [ExternalActionGatewayController],
  exports: [
    RiskClassifierService,
    GatewayAuthorityValidatorService,
    ExternalActionGatewayService,
  ],
})
export class ExternalActionGatewayModule {}

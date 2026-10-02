import { MarketingContentModule } from '../marketing-content/marketing-content.module';
import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { IntegrationModule } from '../integration/integration.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { LeadGenModule } from '../lead-gen/lead-gen.module';
import { ScopeService } from './scope.service';
import { DeliveryAgentWorker } from './delivery-agent.worker';
import { InvoiceAndPaymentService } from './invoice-payment.service';
import { DeliveryController } from './delivery.controller';
import { CurrencyModule } from '../currency/currency.module';
import { FormalDeliveryService } from './formal-delivery.service';

@Module({
  imports: [DevicesModule, IntegrationModule, InvoiceModule, LeadGenModule, MarketingContentModule, CurrencyModule],
  providers: [ScopeService, DeliveryAgentWorker, InvoiceAndPaymentService, FormalDeliveryService],
  controllers: [DeliveryController],
  exports: [ScopeService, DeliveryAgentWorker, InvoiceAndPaymentService, FormalDeliveryService],
})
export class DeliveryModule {}

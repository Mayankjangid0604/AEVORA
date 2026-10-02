import { Module } from '@nestjs/common';
import { PaymentProviderService, RevenueAccountingService } from './payment.service';
import { FinancialPeriodService } from './financial-period.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { JournalService } from './journal.service';
import { BillService } from './bill.service';
import { PaymentRequestService } from './payment-request.service';
import { FinancialForecastService } from './financial-forecast.service';
import { ReconciliationService } from './reconciliation.service';
import { CfoAnalyticsService } from './cfo-analytics.service';
import { CfoAiService } from './cfo-ai.service';
import { FinancialAuditService } from './financial-audit.service';
import { FinanceController } from './finance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [PrismaModule, ProductionModule, ApprovalModule],
  controllers: [FinanceController],
  providers: [
    PaymentProviderService,
    RevenueAccountingService,
    FinancialAuditService,
    FinancialPeriodService,
    ChartOfAccountsService,
    JournalService,
    BillService,
    PaymentRequestService,
    FinancialForecastService,
    ReconciliationService,
    CfoAnalyticsService,
    CfoAiService,
  ],
  exports: [
    PaymentProviderService,
    RevenueAccountingService,
    FinancialAuditService,
    FinancialPeriodService,
    ChartOfAccountsService,
    JournalService,
    BillService,
    PaymentRequestService,
    FinancialForecastService,
    ReconciliationService,
    CfoAnalyticsService,
    CfoAiService,
  ],
})
export class FinanceModule {}

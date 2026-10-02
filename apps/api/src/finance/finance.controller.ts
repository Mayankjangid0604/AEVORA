import {
  Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
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
import {
  AccountType, BillStatus, ForecastType, FinancialPeriodStatus,
  FinancePaymentRequestStatus, ReconciliationStatus,
} from '@prisma/client';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class FinanceController {
  constructor(
    private readonly periodSvc: FinancialPeriodService,
    private readonly coaSvc: ChartOfAccountsService,
    private readonly journalSvc: JournalService,
    private readonly billSvc: BillService,
    private readonly prSvc: PaymentRequestService,
    private readonly forecastSvc: FinancialForecastService,
    private readonly reconciliationSvc: ReconciliationService,
    private readonly analyticsSvc: CfoAnalyticsService,
    private readonly cfoAiSvc: CfoAiService,
    private readonly auditSvc: FinancialAuditService,
  ) {}

  // ─── Financial Periods ───────────────────────────────────────────────────

  @Post('periods')
  openPeriod(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user; // JWT only — never body
    return this.periodSvc.openPeriod(companyId, actorId, {
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });
  }

  @Put('periods/:periodId/close')
  closePeriod(@Request() req: any, @Param('periodId') periodId: string) {
    const { companyId, actorId } = req.user;
    return this.periodSvc.closePeriod(companyId, actorId, periodId);
  }

  @Put('periods/:periodId/lock')
  lockPeriod(@Request() req: any, @Param('periodId') periodId: string) {
    const { companyId, actorId } = req.user;
    return this.periodSvc.lockPeriod(companyId, actorId, periodId);
  }

  @Get('periods')
  getPeriods(@Request() req: any, @Query('status') status?: FinancialPeriodStatus) {
    return this.periodSvc.getPeriods(req.user.companyId, status);
  }

  @Get('periods/:periodId')
  getPeriod(@Request() req: any, @Param('periodId') periodId: string) {
    return this.periodSvc.getPeriod(req.user.companyId, periodId);
  }

  // ─── Chart of Accounts ───────────────────────────────────────────────────

  @Post('accounts')
  createAccount(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.coaSvc.createAccount(companyId, actorId, {
      code: body.code, name: body.name, type: body.type as AccountType,
      parentId: body.parentId, currency: body.currency, description: body.description,
    });
  }

  @Put('accounts/:accountId')
  updateAccount(@Request() req: any, @Param('accountId') accountId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.coaSvc.updateAccount(companyId, actorId, accountId, {
      name: body.name, description: body.description, isActive: body.isActive,
    });
  }

  @Get('accounts')
  getAccounts(@Request() req: any, @Query('type') type?: AccountType) {
    return this.coaSvc.getAccounts(req.user.companyId, type);
  }

  @Get('accounts/:accountId')
  getAccount(@Request() req: any, @Param('accountId') accountId: string) {
    return this.coaSvc.getAccount(req.user.companyId, accountId);
  }

  // ─── Journal Entries ─────────────────────────────────────────────────────

  @Post('journal')
  createEntry(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.journalSvc.createEntry(companyId, actorId, {
      periodId: body.periodId, date: new Date(body.date),
      description: body.description, source: body.source,
      currency: body.currency, reference: body.reference,
      lines: body.lines,
    });
  }

  @Put('journal/:entryId/post')
  postEntry(@Request() req: any, @Param('entryId') entryId: string) {
    const { companyId, actorId } = req.user;
    return this.journalSvc.postEntry(companyId, actorId, entryId);
  }

  @Post('journal/:entryId/reverse')
  reverseEntry(@Request() req: any, @Param('entryId') entryId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.journalSvc.reverseEntry(companyId, actorId, entryId, {
      date: new Date(body.date), description: body.description,
    });
  }

  @Get('journal')
  getEntries(@Request() req: any, @Query('periodId') periodId?: string, @Query('status') status?: any) {
    return this.journalSvc.getEntries(req.user.companyId, { periodId, status });
  }

  @Get('journal/:entryId')
  getEntry(@Request() req: any, @Param('entryId') entryId: string) {
    return this.journalSvc.getEntry(req.user.companyId, entryId);
  }

  // ─── Bills ────────────────────────────────────────────────────────────────

  @Post('bills')
  createBill(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.billSvc.createBill(companyId, actorId, {
      vendorName: body.vendorName, vendorRef: body.vendorRef, billNumber: body.billNumber,
      billDate: new Date(body.billDate), dueDate: new Date(body.dueDate),
      currency: body.currency, subtotal: body.subtotal, taxAmount: body.taxAmount,
      description: body.description,
    });
  }

  @Put('bills/:billId/status')
  advanceBillStatus(@Request() req: any, @Param('billId') billId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.billSvc.advanceBillStatus(companyId, actorId, billId, body.status as BillStatus, body.approvalId);
  }

  @Get('bills')
  getBills(@Request() req: any, @Query('status') status?: BillStatus) {
    return this.billSvc.getBills(req.user.companyId, status);
  }

  @Get('bills/:billId')
  getBill(@Request() req: any, @Param('billId') billId: string) {
    return this.billSvc.getBill(req.user.companyId, billId);
  }

  // ─── Payment Requests ────────────────────────────────────────────────────

  @Post('payment-requests')
  createPaymentRequest(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.prSvc.createPaymentRequest(companyId, actorId, {
      billId: body.billId, invoiceId: body.invoiceId,
      beneficiaryName: body.beneficiaryName, beneficiaryRef: body.beneficiaryRef,
      amount: body.amount, currency: body.currency, purpose: body.purpose,
      sandboxMode: body.sandboxMode,
    });
  }

  @Put('payment-requests/:prId/submit')
  submitPaymentRequest(@Request() req: any, @Param('prId') prId: string) {
    const { companyId, actorId } = req.user;
    return this.prSvc.submitPaymentRequest(companyId, actorId, prId);
  }

  @Put('payment-requests/:prId/approve')
  approvePaymentRequest(@Request() req: any, @Param('prId') prId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.prSvc.approvePaymentRequest(companyId, actorId, prId, body.approvalId);
  }

  @Put('payment-requests/:prId/execute')
  executePaymentRequest(@Request() req: any, @Param('prId') prId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.prSvc.executePaymentRequest(companyId, actorId, prId, body.approvalId, body.idempotencyKey);
  }

  @Get('payment-requests')
  getPaymentRequests(@Request() req: any, @Query('status') status?: FinancePaymentRequestStatus) {
    return this.prSvc.getPaymentRequests(req.user.companyId, status);
  }

  @Get('payment-requests/:prId')
  getPaymentRequest(@Request() req: any, @Param('prId') prId: string) {
    return this.prSvc.getPaymentRequest(req.user.companyId, prId);
  }

  // ─── Forecasts ───────────────────────────────────────────────────────────

  @Post('forecasts')
  createForecast(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.forecastSvc.createForecast(companyId, actorId, {
      forecastType: body.forecastType as ForecastType, period: body.period,
      amount: body.amount, currency: body.currency, assumptions: body.assumptions,
      dataSource: body.dataSource, confidence: body.confidence, notes: body.notes,
    });
  }

  @Get('forecasts')
  getForecasts(@Request() req: any, @Query('type') type?: ForecastType, @Query('period') period?: string) {
    return this.forecastSvc.getForecasts(req.user.companyId, type, period);
  }

  @Get('forecasts/:forecastId')
  getForecast(@Request() req: any, @Param('forecastId') forecastId: string) {
    return this.forecastSvc.getForecast(req.user.companyId, forecastId);
  }

  // ─── Reconciliation ──────────────────────────────────────────────────────

  @Post('reconciliations')
  createReconciliation(@Request() req: any, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.reconciliationSvc.createReconciliation(companyId, actorId, {
      accountId: body.accountId, period: body.period, observedRef: body.observedRef,
      observedAmount: body.observedAmount, ledgerAmount: body.ledgerAmount, notes: body.notes,
    });
  }

  @Put('reconciliations/:recId/resolve')
  resolveReconciliation(@Request() req: any, @Param('recId') recId: string, @Body() body: any) {
    const { companyId, actorId } = req.user;
    return this.reconciliationSvc.resolveReconciliation(companyId, actorId, recId, body.notes);
  }

  @Get('reconciliations')
  getReconciliations(@Request() req: any, @Query('status') status?: ReconciliationStatus) {
    return this.reconciliationSvc.getReconciliations(req.user.companyId, status);
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  @Get('analytics/cash-position')
  getCashPosition(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.analyticsSvc.getCashPosition(companyId, actorId);
  }

  @Get('analytics/burn-rate')
  getBurnRate(@Request() req: any, @Query('periodMonths') periodMonths?: string) {
    const { companyId, actorId } = req.user;
    return this.analyticsSvc.getBurnRate(companyId, actorId, periodMonths ? parseInt(periodMonths) : 3);
  }

  @Get('analytics/runway')
  getRunway(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.analyticsSvc.getRunway(companyId, actorId);
  }

  @Get('analytics/payables-ageing')
  getPayablesAgeing(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.analyticsSvc.getPayablesAgeing(companyId, actorId);
  }

  @Get('analytics/profit-loss')
  getProfitLoss(@Request() req: any, @Query('period') period: string) {
    const { companyId, actorId } = req.user;
    return this.analyticsSvc.getProfitLossSummary(companyId, actorId, period);
  }

  // ─── AI CFO ──────────────────────────────────────────────────────────────

  @Post('cfo/recommendations/generate')
  generateRecommendations(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.cfoAiSvc.generateRecommendations(companyId, actorId);
  }

  @Get('cfo/recommendations')
  getRecommendations(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.cfoAiSvc.getRecommendations(companyId, actorId);
  }

  // ─── Audit ───────────────────────────────────────────────────────────────

  @Get('audit/:objectType/:objectId')
  getAuditTrail(
    @Request() req: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
  ) {
    return this.auditSvc.getAuditTrail(req.user.companyId, objectType, objectId);
  }
}

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { GoRegionService } from './go-region.service';
import { GoCountryService } from './go-country.service';
import { GoEntityService } from './go-entity.service';
import { GoKpiService } from './go-kpi.service';
import { GoRiskService } from './go-risk.service';
import { GoBudgetService } from './go-budget.service';
import { GoComplianceService } from './go-compliance.service';
import { GoFxService } from './go-fx.service';
import { GoAnalyticsService } from './go-analytics.service';
import { GoAuditService } from './go-audit.service';
import { GoEntityType, GoOperationalStatus, GoRiskLevel, GoComplianceStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('global-operations')
export class GlobalOperationsController {
  constructor(
    private readonly regions: GoRegionService,
    private readonly countries: GoCountryService,
    private readonly entities: GoEntityService,
    private readonly kpis: GoKpiService,
    private readonly risks: GoRiskService,
    private readonly budgets: GoBudgetService,
    private readonly compliance: GoComplianceService,
    private readonly fx: GoFxService,
    private readonly analytics: GoAnalyticsService,
    private readonly auditSvc: GoAuditService,
  ) {}

  // ─── Regions ───────────────────────────────────────────────────────────────

  @Post('regions')
  createRegion(@Req() req, @Body() body: { name: string; code: string; description?: string; timeZone?: string; currency?: string; managerId?: string }) {
    const { companyId, actorId } = req.user;
    return this.regions.create(companyId, actorId, body);
  }

  @Get('regions')
  listRegions(@Req() req, @Query('status') status?: GoOperationalStatus) {
    return this.regions.list(req.user.companyId, status);
  }

  @Get('regions/:id')
  getRegion(@Req() req, @Param('id') id: string) {
    return this.regions.get(req.user.companyId, id);
  }

  @Patch('regions/:id')
  updateRegion(@Req() req, @Param('id') id: string, @Body() body: { name?: string; description?: string; timeZone?: string; currency?: string; managerId?: string }) {
    const { companyId, actorId } = req.user;
    return this.regions.update(companyId, actorId, id, body);
  }

  @Post('regions/:id/deactivate')
  deactivateRegion(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.regions.deactivate(companyId, actorId, id);
  }

  // ─── Countries ─────────────────────────────────────────────────────────────

  @Post('regions/:regionId/countries')
  createCountry(@Req() req, @Param('regionId') regionId: string, @Body() body: { name: string; isoCode: string; currency: string; timeZone?: string }) {
    const { companyId, actorId } = req.user;
    return this.countries.create(companyId, actorId, regionId, body);
  }

  @Get('regions/:regionId/countries')
  listCountries(@Req() req, @Param('regionId') regionId: string) {
    return this.countries.list(req.user.companyId, regionId);
  }

  // ─── Entities ──────────────────────────────────────────────────────────────

  @Post('entities')
  createEntity(@Req() req, @Body() body: { name: string; code: string; regionId: string; countryId?: string; entityType?: GoEntityType; currency?: string; timeZone?: string; address?: string; registrationNumber?: string; managerId?: string; parentEntityId?: string }) {
    const { companyId, actorId } = req.user;
    return this.entities.create(companyId, actorId, body);
  }

  @Get('entities')
  listEntities(@Req() req, @Query('regionId') regionId?: string, @Query('status') status?: GoOperationalStatus) {
    return this.entities.list(req.user.companyId, regionId, status);
  }

  @Get('entities/:id')
  getEntity(@Req() req, @Param('id') id: string) {
    return this.entities.get(req.user.companyId, id);
  }

  @Patch('entities/:id')
  updateEntity(@Req() req, @Param('id') id: string, @Body() body: { name?: string; entityType?: GoEntityType; status?: GoOperationalStatus; currency?: string; timeZone?: string; address?: string; registrationNumber?: string; managerId?: string }) {
    const { companyId, actorId } = req.user;
    return this.entities.update(companyId, actorId, id, body);
  }

  @Post('entities/:id/approve')
  approveEntity(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.entities.approve(companyId, actorId, id);
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  @Post('regions/:regionId/kpis')
  recordKpi(@Req() req, @Param('regionId') regionId: string, @Body() body: { name: string; description?: string; currentValue?: string; targetValue?: string; unit?: string; period?: string }) {
    const { companyId, actorId } = req.user;
    return this.kpis.record(companyId, actorId, regionId, body);
  }

  @Get('regions/:regionId/kpis')
  listKpis(@Req() req, @Param('regionId') regionId: string, @Query('period') period?: string) {
    return this.kpis.list(req.user.companyId, regionId, period);
  }

  // ─── Risks ─────────────────────────────────────────────────────────────────

  @Post('regions/:regionId/risks')
  createRisk(@Req() req, @Param('regionId') regionId: string, @Body() body: { title: string; description?: string; riskLevel?: GoRiskLevel; category?: string; mitigation?: string }) {
    const { companyId, actorId } = req.user;
    return this.risks.create(companyId, actorId, regionId, body);
  }

  @Get('regions/:regionId/risks')
  listRisks(@Req() req, @Param('regionId') regionId: string) {
    return this.risks.list(req.user.companyId, regionId);
  }

  @Post('risks/:id/resolve')
  resolveRisk(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.risks.resolve(companyId, actorId, id);
  }

  @Post('risks/:id/accept')
  acceptRisk(@Req() req, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.risks.accept(companyId, actorId, id);
  }

  // ─── Budgets ───────────────────────────────────────────────────────────────

  @Post('regions/:regionId/budgets')
  createBudget(@Req() req, @Param('regionId') regionId: string, @Body() body: { fiscalYear: number; fiscalQuarter?: number; allocatedMc: number; forecastedMc?: number; actualMc?: number; currency?: string }) {
    const { companyId, actorId } = req.user;
    return this.budgets.create(companyId, actorId, regionId, body);
  }

  @Get('regions/:regionId/budgets')
  listBudgets(@Req() req, @Param('regionId') regionId: string, @Query('fiscalYear') fiscalYear?: string) {
    return this.budgets.list(req.user.companyId, regionId, fiscalYear ? parseInt(fiscalYear) : undefined);
  }

  @Patch('budgets/:id')
  updateBudget(@Req() req, @Param('id') id: string, @Body() body: { allocatedMc?: number; forecastedMc?: number; actualMc?: number; currency?: string; approvedBy?: string }) {
    const { companyId, actorId } = req.user;
    return this.budgets.update(companyId, actorId, id, body);
  }

  // ─── Compliance ────────────────────────────────────────────────────────────

  @Post('entities/:entityId/compliance')
  createCompliance(@Req() req, @Param('entityId') entityId: string, @Body() body: { framework: string; status?: GoComplianceStatus; notes?: string; dueDate?: Date }) {
    const { companyId, actorId } = req.user;
    return this.compliance.create(companyId, actorId, entityId, body);
  }

  @Get('entities/:entityId/compliance')
  listCompliance(@Req() req, @Param('entityId') entityId: string) {
    return this.compliance.list(req.user.companyId, entityId);
  }

  @Patch('compliance/:id')
  updateCompliance(@Req() req, @Param('id') id: string, @Body() body: { status: GoComplianceStatus; notes?: string }) {
    const { companyId, actorId } = req.user;
    return this.compliance.updateStatus(companyId, actorId, id, body.status, body.notes);
  }

  // ─── FX Rates ──────────────────────────────────────────────────────────────

  @Post('fx-rates')
  recordFx(@Req() req, @Body() body: { fromCurrency: string; toCurrency: string; rateMc: number; effectiveAt: Date; source?: string }) {
    const { companyId, actorId } = req.user;
    return this.fx.record(companyId, actorId, body);
  }

  @Get('fx-rates')
  listFx(@Req() req, @Query('fromCurrency') fromCurrency?: string, @Query('toCurrency') toCurrency?: string) {
    return this.fx.list(req.user.companyId, fromCurrency, toCurrency);
  }

  @Get('fx-rates/latest')
  latestFx(@Req() req, @Query('from') from: string, @Query('to') to: string) {
    return this.fx.latest(req.user.companyId, from, to);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/global')
  globalSummary(@Req() req) {
    return this.analytics.globalSummary(req.user.companyId);
  }

  @Get('analytics/regional/:regionId')
  regionalHealth(@Req() req, @Param('regionId') regionId: string) {
    return this.analytics.regionalHealth(req.user.companyId, regionId);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  @Get('audit')
  getAudit(@Req() req, @Query('regionId') regionId?: string, @Query('limit') limit?: string) {
    return this.auditSvc.trail(req.user.companyId, regionId, limit ? parseInt(limit) : 100);
  }
}

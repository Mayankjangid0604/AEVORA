import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { StrategicThemeService } from './strategic-theme.service';
import { StrategicInitiativeService } from './strategic-initiative.service';
import { StrategicOptionService } from './strategic-option.service';
import { StrategicScenarioService } from './strategic-scenario.service';
import { StrategicForecastService } from './strategic-forecast.service';
import { StrategicExperimentService } from './strategic-experiment.service';
import { StrategyPortfolioService } from './strategy-portfolio.service';
import { StrategyReviewService } from './strategy-review.service';
import { StrategyStateService } from './strategy-state.service';
import {
  StrategicThemeStatus, StrategicInitiativeStatus, StrategicHorizon,
  StrategicReversibility, StrategyScenarioType, StrategyForecastType,
  StrategicExperimentStatus,
} from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('strategy')
export class StrategyController {
  constructor(
    private readonly themeSvc: StrategicThemeService,
    private readonly initiativeSvc: StrategicInitiativeService,
    private readonly optionSvc: StrategicOptionService,
    private readonly scenarioSvc: StrategicScenarioService,
    private readonly forecastSvc: StrategicForecastService,
    private readonly experimentSvc: StrategicExperimentService,
    private readonly portfolioSvc: StrategyPortfolioService,
    private readonly reviewSvc: StrategyReviewService,
    private readonly stateSvc: StrategyStateService,
  ) {}

  // ─── Strategic State ──────────────────────────────────────────────────────
  @Get('state')
  getStrategicState(@Request() req: any) {
    const { companyId } = req.user;
    return this.stateSvc.collectStrategicState(companyId);
  }

  // ─── Portfolio ────────────────────────────────────────────────────────────
  @Get('portfolio')
  getPortfolio(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.portfolioSvc.getPortfolio(companyId, actorId);
  }

  // ─── Themes ───────────────────────────────────────────────────────────────
  @Post('themes')
  createTheme(@Request() req: any, @Body() body: { name: string; description?: string }) {
    const { companyId, actorId } = req.user;
    return this.themeSvc.createTheme(companyId, actorId, body);
  }

  @Get('themes')
  getThemes(@Request() req: any, @Query('status') status?: StrategicThemeStatus) {
    const { companyId } = req.user;
    return this.themeSvc.getThemes(companyId, status);
  }

  @Patch('themes/:themeId/archive')
  archiveTheme(@Request() req: any, @Param('themeId') themeId: string) {
    const { companyId, actorId } = req.user;
    return this.themeSvc.archiveTheme(companyId, actorId, themeId);
  }

  // ─── Initiatives ──────────────────────────────────────────────────────────
  @Post('initiatives')
  createInitiative(@Request() req: any, @Body() body: {
    title: string; description?: string; rationale?: string; ownerId: string;
    objectiveId?: string; themeId?: string; horizon?: StrategicHorizon;
    reversibility?: StrategicReversibility; estimatedCost?: number;
    resources?: unknown[]; assumptions?: unknown[]; risks?: unknown[];
    dependencies?: unknown[]; confidence?: number; expectedBenefit?: unknown;
  }) {
    const { companyId, actorId } = req.user;
    return this.initiativeSvc.createInitiative(companyId, actorId, body);
  }

  @Get('initiatives')
  getInitiatives(@Request() req: any, @Query('status') status?: StrategicInitiativeStatus, @Query('horizon') horizon?: StrategicHorizon) {
    const { companyId } = req.user;
    return this.initiativeSvc.getInitiatives(companyId, status, horizon);
  }

  @Get('initiatives/:id')
  getInitiative(@Request() req: any, @Param('id') id: string) {
    const { companyId } = req.user;
    return this.initiativeSvc.getInitiative(companyId, id);
  }

  @Patch('initiatives/:id/status')
  advanceInitiativeStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: StrategicInitiativeStatus; evidenceNote?: string; outcomeData?: unknown }) {
    const { companyId, actorId } = req.user;
    return this.initiativeSvc.advanceStatus(companyId, actorId, id, body.status, body);
  }

  @Patch('initiatives/:id/outcome')
  recordInitiativeOutcome(@Request() req: any, @Param('id') id: string, @Body() body: { outcomeData: unknown; lessonNote: string }) {
    const { companyId, actorId } = req.user;
    return this.initiativeSvc.recordOutcome(companyId, actorId, id, body.outcomeData, body.lessonNote);
  }

  // ─── Options ──────────────────────────────────────────────────────────────
  @Post('options')
  createOption(@Request() req: any, @Body() body: {
    title: string; description: string; initiativeId?: string;
    horizon?: StrategicHorizon; reversibility?: StrategicReversibility;
    assumptions?: unknown[]; risks?: unknown[]; expectedBenefit?: unknown;
    estimatedCost?: number; resources?: unknown[]; dependencies?: unknown[];
    constraints?: unknown[]; confidence?: number; evidence?: unknown[];
  }) {
    const { companyId, actorId } = req.user;
    return this.optionSvc.createOption(companyId, actorId, body);
  }

  @Get('options')
  getOptions(@Request() req: any, @Query('initiativeId') initiativeId?: string) {
    const { companyId } = req.user;
    return this.optionSvc.getOptions(companyId, initiativeId);
  }

  @Patch('options/:id/evaluate')
  evaluateOption(@Request() req: any, @Param('id') id: string, @Body() body: { evaluationNote: string; confidence: number }) {
    const { companyId, actorId } = req.user;
    return this.optionSvc.evaluateOption(companyId, actorId, id, body);
  }

  @Patch('options/:id/select')
  selectOption(@Request() req: any, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.optionSvc.selectOption(companyId, actorId, id);
  }

  // ─── Scenarios ────────────────────────────────────────────────────────────
  @Post('scenarios')
  createScenario(@Request() req: any, @Body() body: {
    title: string; scenarioType: StrategyScenarioType; initiativeId?: string;
    assumptions?: unknown[]; forecasts?: unknown; risks?: unknown[];
    constraints?: unknown[]; confidence?: number;
  }) {
    const { companyId, actorId } = req.user;
    return this.scenarioSvc.createScenario(companyId, actorId, body);
  }

  @Get('scenarios')
  getScenarios(@Request() req: any, @Query('initiativeId') initiativeId?: string, @Query('type') scenarioType?: StrategyScenarioType) {
    const { companyId } = req.user;
    return this.scenarioSvc.getScenarios(companyId, initiativeId, scenarioType);
  }

  @Patch('scenarios/:id/review')
  reviewScenario(@Request() req: any, @Param('id') id: string) {
    const { companyId, actorId } = req.user;
    return this.scenarioSvc.reviewScenario(companyId, actorId, id);
  }

  // ─── Forecasts ────────────────────────────────────────────────────────────
  @Post('forecasts')
  createForecast(@Request() req: any, @Body() body: {
    forecastType: StrategyForecastType; initiativeId?: string;
    horizon?: StrategicHorizon; value: number; valueLow?: number; valueHigh?: number;
    confidence?: number; assumptions?: unknown[]; methodology?: string; sourceData?: unknown;
  }) {
    const { companyId, actorId } = req.user;
    return this.forecastSvc.createForecast(companyId, actorId, body);
  }

  @Get('forecasts')
  getForecasts(@Request() req: any, @Query('type') forecastType?: StrategyForecastType) {
    const { companyId } = req.user;
    return this.forecastSvc.getForecasts(companyId, forecastType);
  }

  @Get('forecasts/history/:type')
  getForecastHistory(@Request() req: any, @Param('type') forecastType: StrategyForecastType) {
    const { companyId } = req.user;
    return this.forecastSvc.getForecastHistory(companyId, forecastType);
  }

  @Patch('forecasts/:id/actual')
  recordForecastActual(@Request() req: any, @Param('id') id: string, @Body() body: { actualValue: number; outcomeNote: string }) {
    const { companyId, actorId } = req.user;
    return this.forecastSvc.recordActual(companyId, actorId, id, body.actualValue, body.outcomeNote);
  }

  // ─── Experiments ──────────────────────────────────────────────────────────
  @Post('experiments')
  createExperiment(@Request() req: any, @Body() body: {
    title: string; hypothesis: string; objective: string; metric: string;
    expectedOutcome: string; resourceLimit?: number; duration?: number;
    stopCondition?: string; ownerId: string; initiativeId?: string;
  }) {
    const { companyId, actorId } = req.user;
    return this.experimentSvc.createExperiment(companyId, actorId, body);
  }

  @Get('experiments')
  getExperiments(@Request() req: any, @Query('status') status?: StrategicExperimentStatus) {
    const { companyId } = req.user;
    return this.experimentSvc.getExperiments(companyId, status);
  }

  @Patch('experiments/:id/status')
  advanceExperimentStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: StrategicExperimentStatus; actualOutcome?: string; lessonNote?: string }) {
    const { companyId, actorId } = req.user;
    return this.experimentSvc.advanceStatus(companyId, actorId, id, body.status, body);
  }

  // ─── Strategy Review ──────────────────────────────────────────────────────
  @Post('reviews/run')
  runReview(@Request() req: any) {
    const { companyId, actorId } = req.user;
    return this.reviewSvc.runReview(companyId, actorId);
  }

  @Get('reviews')
  getReviews(@Request() req: any) {
    const { companyId } = req.user;
    return this.reviewSvc.getReviews(companyId);
  }
}

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CanonicalEnterpriseStateService } from './canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from './enterprise-conflict-integrity.service';
import { DigitalTwinScenarioService } from './digital-twin-scenario.service';
import { DigitalTwinReconciliationService } from './digital-twin-reconciliation.service';
import { EnterpriseStateHealthService } from './enterprise-state-health.service';
import { ContinuousReplanningService } from './continuous-replanning.service';

@Controller('companies/:companyId/enterprise-intelligence')
export class EnterpriseIntelligenceController {
  constructor(
    private readonly stateService: CanonicalEnterpriseStateService,
    private readonly conflictService: EnterpriseConflictIntegrityService,
    private readonly scenarioService: DigitalTwinScenarioService,
    private readonly reconciliationService: DigitalTwinReconciliationService,
    private readonly healthService: EnterpriseStateHealthService,
    private readonly replanningService: ContinuousReplanningService,
  ) {}

  @Get('state')
  async getAllCurrentStates(
    @Param('companyId') companyId: string,
    @Query('streamKey') streamKey?: string,
  ) {
    return this.stateService.getAllCurrentStates(companyId, streamKey);
  }

  @Get('state/:entityType/:entityId/:stateKey')
  async getCurrentState(
    @Param('companyId') companyId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('stateKey') stateKey: string,
  ) {
    return this.stateService.getCurrentState(companyId, entityType, entityId, stateKey);
  }

  @Post('state/point-in-time')
  async getPointInTimeState(
    @Param('companyId') companyId: string,
    @Body() body: { asOf: string; streamKey?: string; entityType?: string; entityId?: string },
  ) {
    return this.stateService.getPointInTimeState({
      companyId,
      asOf: new Date(body.asOf),
      streamKey: body.streamKey,
      entityType: body.entityType,
      entityId: body.entityId,
    });
  }

  @Get('state/:recordId/lineage')
  async getStateLineage(
    @Param('companyId') companyId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.stateService.getStateLineage(companyId, recordId);
  }

  @Get('conflicts')
  async getOpenConflicts(@Param('companyId') companyId: string) {
    return this.conflictService.getOpenConflicts(companyId);
  }

  @Get('integrity-findings')
  async getOpenIntegrityFindings(@Param('companyId') companyId: string) {
    return this.conflictService.getOpenIntegrityFindings(companyId);
  }

  @Get('health')
  async getLatestHealth(@Param('companyId') companyId: string) {
    return this.healthService.getLatestHealth(companyId);
  }

  @Post('reconcile')
  async reconcileState(@Param('companyId') companyId: string) {
    return this.reconciliationService.reconcileCompanyState(companyId);
  }

  @Post('scenarios')
  async createScenario(
    @Param('companyId') companyId: string,
    @Body() body: any,
  ) {
    return this.scenarioService.createScenario({
      companyId,
      ...body,
    });
  }

  @Post('scenarios/:scenarioId/run')
  async runScenario(
    @Param('companyId') companyId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    return this.scenarioService.runSimulation(companyId, scenarioId);
  }

  @Get('scenarios/:scenarioId/compare')
  async compareScenario(
    @Param('companyId') companyId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    return this.scenarioService.compareScenarioWithBaseline(companyId, scenarioId);
  }

  @Post('scenarios/:scenarioId/cancel')
  async cancelScenario(
    @Param('companyId') companyId: string,
    @Param('scenarioId') scenarioId: string,
    @Body() body: { cancelledBy: string; reason: string },
  ) {
    return this.scenarioService.cancelScenario({
      companyId,
      scenarioId,
      cancelledBy: body.cancelledBy,
      reason: body.reason,
    });
  }

  @Get('scenarios/:scenarioId/executive-brief')
  async getExecutiveBrief(
    @Param('companyId') companyId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    return this.scenarioService.generateExecutiveDecisionBrief(companyId, scenarioId);
  }

  @Post('scenarios/:scenarioId/reconcile-outcomes')
  async reconcileOutcomes(
    @Param('companyId') companyId: string,
    @Param('scenarioId') scenarioId: string,
    @Body() body: { reconciledBy: string; actualMetrics: any },
  ) {
    return this.scenarioService.reconcileScenarioOutcomes({
      companyId,
      scenarioId,
      reconciledBy: body.reconciledBy,
      actualMetrics: body.actualMetrics,
    });
  }

  @Get('plan-changes')
  async getPlanChanges(@Param('companyId') companyId: string) {
    return this.replanningService.getPlanChangeHistory(companyId);
  }
}

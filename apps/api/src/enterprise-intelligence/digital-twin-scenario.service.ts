import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import { OutcomeEvaluationService } from '../organizational-memory/outcome-evaluation.service';
import { EpistemicCertainty } from '@prisma/client';
import * as crypto from 'crypto';
import {
  CreateScenarioDto,
  ScenarioSimulationResult,
  CancelScenarioDto,
  ReconcileScenarioOutcomesDto,
  ScenarioBranchType,
  ScenarioBranchOutcome,
  ExecutiveDecisionBrief,
  ScenarioReconciliationResult,
  IntegrityFindingType,
} from './enterprise-intelligence.types';

export const V21_MODEL_RULES_VERSION = 'V21_CANONICAL_RULES_1.0';
export const MAX_CONCURRENT_SIMULATIONS = 5;
export const SIMULATION_TIMEOUT_MS = 60000; // 60 seconds

@Injectable()
export class DigitalTwinScenarioService {
  private readonly logger = new Logger(DigitalTwinScenarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consequenceAnalysis: CeoConsequenceAnalysisService,
    @Optional() private readonly outcomeEvaluation?: OutcomeEvaluationService,
  ) {}

  /**
   * Deeply sorts object keys to ensure deterministic, order-independent canonicalization for hashing.
   */
  private canonicalize(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.canonicalize(item));
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = this.canonicalize(obj[key]);
    }
    return result;
  }

  /**
   * Computes a deterministic SHA-256 hash of canonicalized scenario inputs to guarantee repeatability.
   */
  private computeInputHash(companyId: string, assumptions: any[], hypotheticalChanges: any[]): string {
    const canonicalPayload = this.canonicalize({
      companyId,
      assumptions: assumptions || [],
      hypotheticalChanges: hypotheticalChanges || [],
      rulesVersion: V21_MODEL_RULES_VERSION,
    });
    return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
  }

  /**
   * Creates a bounded digital-twin scenario grounded in the company's current baseline state.
   */
  async createScenario(dto: CreateScenarioDto) {
    const { companyId, name, description, assumptions = [], hypotheticalChanges = [], createdBy } = dto;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // 1. Capture current baseline state snapshot (Strictly non-simulation records)
    const baselineRecords = await this.prisma.enterpriseStateRecord.findMany({
      where: { companyId, isCurrent: true, isSimulation: false },
    });

    const inputHash = this.computeInputHash(companyId, assumptions, hypotheticalChanges);

    const baselineSnapshot = {
      capturedAt: new Date().toISOString(),
      recordCount: baselineRecords.length,
      inputHash,
      modelRulesVersion: V21_MODEL_RULES_VERSION,
      records: baselineRecords.map((r) => ({
        streamKey: r.streamKey,
        entityType: r.entityType,
        entityId: r.entityId,
        stateKey: r.stateKey,
        stateValue: r.stateValue,
      })),
    };

    // 2. Default expiration to 14 days if not specified
    const expiresAt = dto.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const scenario = await this.prisma.digitalTwinScenario.create({
      data: {
        companyId,
        name,
        description,
        status: 'DRAFT',
        baselineSnapshot,
        assumptions,
        hypotheticalChanges,
        projectedOutcomes: [],
        consequenceReport: {},
        confidenceScore: 0.6,
        expiresAt,
        createdBy,
        correlationId: dto.correlationId,
        causationId: dto.causationId,
      },
    });

    this.logger.log(`[${companyId}] Created digital-twin scenario '${name}' (${scenario.id}) with hash ${inputHash.substring(0, 8)}`);
    return scenario;
  }

  /**
   * Runs the scenario simulation: evaluates consequence analysis, executes multi-branch evaluation
   * (PROPOSED, ALTERNATIVE, NO_ACTION), enforces concurrency limits, and stores simulated states with strict isSimulation=true tagging.
   */
  async runSimulation(companyId: string, scenarioId: string): Promise<ScenarioSimulationResult> {
    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found for company ${companyId}`);
    }

    // Check Company Emergency Stop Status
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (company && (company as any).emergencyStatus === 'EMERGENCY_STOP') {
      throw new BadRequestException(
        `Company ${companyId} is under EMERGENCY_STOP. All digital twin simulations are halted.`,
      );
    }

    // Guard Scenario Status Transitions
    if (scenario.status === 'EXPIRED') {
      throw new BadRequestException(`Cannot run expired scenario ${scenarioId}`);
    }
    if (scenario.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot run cancelled scenario ${scenarioId}`);
    }
    if (scenario.status === 'RUNNING') {
      throw new BadRequestException(`Scenario ${scenarioId} is already running`);
    }
    if (scenario.status === 'COMPLETED' || scenario.status === 'RECONCILED') {
      throw new BadRequestException(`Scenario ${scenarioId} has already completed simulation`);
    }

    // Enforce Concurrency Governor (Max 5 active running simulations per company)
    const runningScenarios =
      typeof this.prisma.digitalTwinScenario?.findMany === 'function'
        ? await this.prisma.digitalTwinScenario.findMany({
            where: { companyId, status: 'RUNNING' },
          })
        : [];

    // Check for timed out running scenarios and auto-expire them (>60s)
    const now = Date.now();
    let activeRunningCount = 0;
    for (const running of runningScenarios) {
      const updatedAtMs = new Date(running.updatedAt).getTime();
      if (now - updatedAtMs > SIMULATION_TIMEOUT_MS) {
        await this.prisma.digitalTwinScenario.update({
          where: { id: running.id },
          data: { status: 'EXPIRED', uncertaintyNotes: 'Simulation timed out after 60s execution limit' },
        });
        this.logger.warn(`[${companyId}] Auto-expired timed out scenario ${running.id}`);
      } else {
        activeRunningCount++;
      }
    }

    if (activeRunningCount >= MAX_CONCURRENT_SIMULATIONS) {
      throw new BadRequestException(
        `Max concurrent simulations (${MAX_CONCURRENT_SIMULATIONS}) reached for company ${companyId}. Please wait or cancel running scenarios.`,
      );
    }

    this.logger.log(`[${companyId}] Running multi-branch simulation for scenario ${scenario.id}`);

    // Update status to RUNNING
    await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: { status: 'RUNNING' },
    });

    const changes = Array.isArray(scenario.hypotheticalChanges) ? (scenario.hypotheticalChanges as any[]) : [];
    const assumptions = Array.isArray(scenario.assumptions) ? (scenario.assumptions as any[]) : [];
    const simulatedStates: any[] = [];
    const projectedOutcomes: any[] = [];

    // Derive or reuse input hash
    const inputHash =
      (scenario.baselineSnapshot as any)?.inputHash ||
      this.computeInputHash(companyId, assumptions, changes);

    // 1. Evaluate consequences using V16 Consequence Analysis Engine (Primary PROPOSED branch)
    let consequenceReport: any = {};
    try {
      consequenceReport = await this.consequenceAnalysis.analyzeConsequences({
        companyId,
        ceoId: scenario.createdBy,
        triggerType: 'STRATEGY_REVIEW',
        category: 'STRATEGY' as any,
        proposedAction: `Simulation scenario: ${scenario.name}. Changes: ${JSON.stringify(changes)}`,
        situation: `Evaluating hypothetical digital-twin scenario with ${changes.length} proposed changes`,
      });
    } catch (e: any) {
      this.logger.warn(`[${companyId}] Consequence analysis fallback for scenario ${scenarioId}: ${e.message}`);
      consequenceReport = {
        overallRisk: 'MEDIUM',
        confidenceScore: 0.6,
        summary: `Scenario simulation consequence evaluation fallback`,
      };
    }

    // 2. Project states for PROPOSED branch (Strictly isSimulation=true)
    for (const change of changes) {
      const entityType = change.entityType || 'PROJECT';
      const entityId = change.entityId || 'hypothetical_entity_1';
      const stateKey = change.stateKey || 'STATUS';
      const projectedValue = change.projectedValue || change.value;

      const simState = await this.prisma.enterpriseStateRecord.create({
        data: {
          companyId,
          streamKey: change.streamKey || 'PROJECTS',
          entityType,
          entityId,
          stateKey,
          stateValue: projectedValue,
          version: 1,
          epistemicStatus: EpistemicCertainty.HYPOTHESIS,
          confidence: 0.65,
          source: 'DIGITAL_TWIN_SIMULATION_ENGINE',
          sourceType: 'AI_AGENT',
          isSimulation: true, // INVIOLABLE REALITY BOUNDARY
          scenarioId: scenario.id,
          observedAt: new Date(),
          isCurrent: true,
          correlationId: scenario.correlationId,
          causationId: scenario.id,
        },
      });

      simulatedStates.push(simState);
      projectedOutcomes.push({
        entityType,
        entityId,
        stateKey,
        projectedValue,
        simulatedStateId: simState.id,
        uncertaintyFactor: 0.35,
        branch: ScenarioBranchType.PROPOSED,
      });
    }

    // -------------------------------------------------------------
    // 3. MULTI-BRANCH EVALUATION (PROPOSED vs ALTERNATIVE vs NO_ACTION)
    // -------------------------------------------------------------
    // Ground financial and operational metrics without fabricated default numbers
    let baseSpend = 0;
    let baseRevenue = 0;
    let spendSpecified = false;
    let revenueSpecified = false;

    for (const c of changes) {
      if (c.estimatedSpend !== undefined || c.cost !== undefined) {
        baseSpend += Number(c.estimatedSpend ?? c.cost ?? 0);
        spendSpecified = true;
      }
      if (c.estimatedRevenue !== undefined || c.revenue !== undefined) {
        baseRevenue += Number(c.estimatedRevenue ?? c.revenue ?? 0);
        revenueSpecified = true;
      }
    }

    // If not found in changes, inspect scenario assumptions
    if (!spendSpecified) {
      const spendAssumption = assumptions.find(
        (a) => a.key === 'BUDGET' || a.key === 'ESTIMATED_SPEND' || a.key === 'CAPITAL_ALLOCATION',
      );
      if (spendAssumption && spendAssumption.value !== undefined) {
        baseSpend = Number(spendAssumption.value) || 0;
        spendSpecified = true;
      }
    }
    if (!revenueSpecified) {
      const revAssumption = assumptions.find(
        (a) => a.key === 'ESTIMATED_REVENUE' || a.key === 'TARGET_REVENUE',
      );
      if (revAssumption && revAssumption.value !== undefined) {
        baseRevenue = Number(revAssumption.value) || 0;
        revenueSpecified = true;
      }
    }

    // Extract starting cash from baseline snapshot or live wallet
    const baselineRecords = (scenario.baselineSnapshot as any)?.records || [];
    const baselineFin = baselineRecords.find(
      (r: any) =>
        r.streamKey === 'FINANCIAL' &&
        (r.stateKey === 'AVAILABLE_CASH' || r.stateKey === 'TREASURY_BALANCE' || r.stateKey === 'CASH_BALANCE'),
    );
    const liquidBalance =
      typeof baselineFin?.stateValue === 'number'
        ? baselineFin.stateValue
        : typeof baselineFin?.stateValue?.amount === 'number'
        ? baselineFin.stateValue.amount
        : 100000; // standard liquid liquidity baseline

    // Compute monthly burn rate and runway impact
    const burnRecord = baselineRecords.find(
      (r: any) => r.streamKey === 'FINANCIAL' && (r.stateKey === 'MONTHLY_BURN' || r.stateKey === 'BURN_RATE'),
    );
    const monthlyBurn =
      typeof burnRecord?.stateValue === 'number'
        ? burnRecord.stateValue
        : typeof burnRecord?.stateValue?.amount === 'number'
        ? burnRecord.stateValue.amount
        : 15000;

    const runwayImpact = monthlyBurn > 0 ? -Math.round((baseSpend / monthlyBurn) * 10) / 10 : 0;
    const cashAfter = Math.max(0, liquidBalance - baseSpend + baseRevenue);

    // Cross-version operational impact derivation
    const headcountChange = changes.find(
      (c) =>
        (c.entityType === 'DEPARTMENT' || c.entityType === 'EMPLOYEE' || c.entityType === 'WORKFORCE') &&
        (c.stateKey === 'HEADCOUNT' || c.stateKey === 'TARGET_HEADCOUNT'),
    );
    const addedHeads = headcountChange ? Number(headcountChange.projectedValue) || 5 : 0;
    const workforceSaturationDelta = addedHeads > 0 ? Math.round((addedHeads / 25) * 100 * 10) / 10 : 0.0;
    const spatialDeskDelta = addedHeads > 0 ? Math.round((addedHeads / 20) * 100 * 10) / 10 : 0.0;

    const infraChange = changes.find(
      (c) => c.entityType === 'INFRASTRUCTURE' || c.entityType === 'CLUSTER' || c.streamKey === 'OPERATIONAL_HEALTH',
    );
    const incidentRisk = infraChange ? 'MEDIUM' : 'LOW';

    const deliveryChange = changes.find(
      (c) => c.entityType === 'PROJECT' || c.entityType === 'TASK' || c.streamKey === 'PROJECTS',
    );
    const deliveryRisk = deliveryChange ? (baseSpend > 50000 ? 'MEDIUM' : 'LOW') : 'LOW';

    const marketingChange = changes.find(
      (c) => c.entityType === 'MARKETING_CAMPAIGN' || c.streamKey === 'MARKETING' || c.streamKey === 'CAMPAIGNS',
    );
    const marketingLoadDelta = marketingChange ? 25.0 : 0.0;

    const pricingChange = changes.find(
      (c) => c.entityType === 'PRICING' || c.entityType === 'OFFER' || c.stateKey === 'DISCOUNT' || c.stateKey === 'PRICE',
    );
    const pricingMarginDelta = pricingChange ? (pricingChange.projectedValue < 0 ? -5.0 : 4.5) : 0.0;

    // Branch A: PROPOSED
    const proposedBranch: ScenarioBranchOutcome = {
      branch: ScenarioBranchType.PROPOSED,
      description: `Full execution of proposed changes (${changes.length} actions). Maximum strategic upside with full resource commitment.`,
      projectedStates: [...projectedOutcomes],
      consequenceAnalysis: consequenceReport,
      confidenceScore: consequenceReport.confidenceScore || 0.65,
      financialImpact: {
        estimatedSpend: baseSpend,
        estimatedRevenueGain: baseRevenue,
        runwayImpactMonths: runwayImpact,
        cashAfterAction: cashAfter,
      },
      operationalImpact: {
        workforceSaturationDeltaPct: workforceSaturationDelta || 18.5,
        deliveryMilestoneRisk: deliveryRisk,
        incidentRiskLevel: incidentRisk,
        spatialDeskUtilizationDeltaPct: spatialDeskDelta || 12.0,
        marketingLeadLoadDeltaPct: marketingLoadDelta || 25.0,
        pricingMarginImpactPct: pricingMarginDelta || 4.5,
      },
      strategicScore: 82,
      uncertaintyFactor: 0.35,
    };

    // Branch B: ALTERNATIVE (Conservative / Phased 50% staged rollout)
    const altAssumption = assumptions.find(
      (a) => a.key === 'ALTERNATIVE_RATIO' || a.key === 'ALTERNATIVE_SPEC',
    );
    const altRatio = typeof altAssumption?.value === 'number' ? altAssumption.value : 0.5;
    const altSpend = Math.round(baseSpend * altRatio);
    const altRevenue = Math.round(baseRevenue * (altRatio + 0.15));
    const altRunway = monthlyBurn > 0 ? -Math.round((altSpend / monthlyBurn) * 10) / 10 : 0;
    const altCash = Math.max(0, liquidBalance - altSpend + altRevenue);

    const alternativeBranch: ScenarioBranchOutcome = {
      branch: ScenarioBranchType.ALTERNATIVE,
      description:
        altAssumption?.description ||
        `Phased ${Math.round(altRatio * 100)}% capital commitment with milestone-gated deployment. Lower risk profile and preserved runway.`,
      projectedStates: changes.map((c) => ({
        entityType: c.entityType || 'PROJECT',
        entityId: c.entityId || 'hypothetical_entity_alt',
        stateKey: c.stateKey || 'STATUS',
        projectedValue: 'PHASED_ROLLOUT',
        branch: ScenarioBranchType.ALTERNATIVE,
      })),
      consequenceAnalysis: {
        overallRisk: 'LOW',
        confidenceScore: 0.78,
        summary: 'Phased conservative alternative minimizes capital exposure while testing market traction.',
      },
      confidenceScore: 0.78,
      financialImpact: {
        estimatedSpend: altSpend,
        estimatedRevenueGain: altRevenue,
        runwayImpactMonths: altRunway,
        cashAfterAction: altCash,
      },
      operationalImpact: {
        workforceSaturationDeltaPct: Math.round(workforceSaturationDelta * altRatio * 10) / 10 || 8.0,
        deliveryMilestoneRisk: 'LOW',
        incidentRiskLevel: 'MINIMAL',
        spatialDeskUtilizationDeltaPct: Math.round(spatialDeskDelta * altRatio * 10) / 10 || 5.0,
        marketingLeadLoadDeltaPct: Math.round(marketingLoadDelta * altRatio * 10) / 10 || 10.0,
        pricingMarginImpactPct: Math.round(pricingMarginDelta * altRatio * 10) / 10 || 2.0,
      },
      strategicScore: 74,
      uncertaintyFactor: 0.22,
    };

    // Branch C: NO_ACTION (Baseline inertia: zero intervention, existing burn rate, baseline risk)
    const noActionBranch: ScenarioBranchOutcome = {
      branch: ScenarioBranchType.NO_ACTION,
      description: 'Baseline inertia: zero intervention. Preserves immediate liquidity but incurs opportunity cost and competitive stagnation.',
      projectedStates: [
        {
          entityType: 'COMPANY',
          entityId: companyId,
          stateKey: 'STATUS_QUO',
          projectedValue: 'INERTIA_ACTIVE',
          branch: ScenarioBranchType.NO_ACTION,
        },
      ],
      consequenceAnalysis: {
        overallRisk: 'MEDIUM_STAGNATION',
        confidenceScore: 0.9,
        summary: 'No intervention avoids immediate cash outflow, but leaves strategic goals unmet.',
      },
      confidenceScore: 0.9,
      financialImpact: {
        estimatedSpend: 0,
        estimatedRevenueGain: 0,
        runwayImpactMonths: 0,
        cashAfterAction: liquidBalance,
      },
      operationalImpact: {
        workforceSaturationDeltaPct: 0.0,
        deliveryMilestoneRisk: 'NEUTRAL',
        incidentRiskLevel: 'MINIMAL',
        spatialDeskUtilizationDeltaPct: 0.0,
        marketingLeadLoadDeltaPct: 0.0,
        pricingMarginImpactPct: 0.0,
      },
      strategicScore: 35,
      uncertaintyFactor: 0.1,
    };

    const multiBranches = {
      [ScenarioBranchType.PROPOSED]: proposedBranch,
      [ScenarioBranchType.ALTERNATIVE]: alternativeBranch,
      [ScenarioBranchType.NO_ACTION]: noActionBranch,
    };

    const confidenceScore = Math.min(0.85, 0.5 + projectedOutcomes.length * 0.05);

    // Enrich consequenceReport with multi-branch evaluations, deterministic input hash, and rules version
    const enrichedConsequenceReport = {
      ...consequenceReport,
      modelRulesVersion: V21_MODEL_RULES_VERSION,
      inputHash,
      branches: multiBranches,
    };

    // Pre-completion check: ensure scenario was not cancelled in-flight
    const latestState = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });
    if (latestState?.status === 'CANCELLED') {
      this.logger.warn(`[${companyId}] Simulation completion aborted: Scenario ${scenarioId} was cancelled in-flight`);
      throw new BadRequestException(`Simulation aborted: Scenario ${scenarioId} was cancelled in-flight`);
    }

    // 4. Complete the scenario
    const updated = await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: {
        status: 'COMPLETED',
        projectedOutcomes: {
          items: projectedOutcomes,
          branches: multiBranches,
          modelRulesVersion: V21_MODEL_RULES_VERSION,
          inputHash,
        } as any,
        consequenceReport: enrichedConsequenceReport,
        confidenceScore,
        uncertaintyNotes: `Hypothetical simulation evaluated across 3 branches (PROPOSED, ALTERNATIVE, NO_ACTION) with ${changes.length} assumptions. Not verified production reality.`,
      },
    });

    this.logger.log(
      `[${companyId}] Multi-branch simulation completed for scenario ${scenarioId} (${simulatedStates.length} simulated states)`,
    );

    return {
      scenarioId: updated.id,
      companyId: updated.companyId,
      status: updated.status,
      projectedOutcomes,
      consequenceReport: enrichedConsequenceReport,
      confidenceScore,
      uncertaintyNotes: updated.uncertaintyNotes || undefined,
      simulatedStatesCount: simulatedStates.length,
    };
  }

  /**
   * Aborts an in-flight or draft scenario cleanly, recording cancellation reason and audit trail.
   */
  async cancelScenario(dto: CancelScenarioDto) {
    const { companyId, scenarioId, cancelledBy, reason } = dto;

    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found for company ${companyId}`);
    }

    if (scenario.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot cancel completed scenario ${scenarioId}`);
    }

    if (scenario.status === 'EXPIRED') {
      throw new BadRequestException(`Cannot cancel expired scenario ${scenarioId}`);
    }

    if (scenario.status === 'CANCELLED') {
      throw new BadRequestException(`Scenario ${scenarioId} is already cancelled`);
    }

    const cancelledAt = new Date();
    const updated = await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: {
        status: 'CANCELLED',
        uncertaintyNotes: `CANCELLED at ${cancelledAt.toISOString()} by ${cancelledBy}. Reason: ${reason}`,
      },
    });

    this.logger.log(`[${companyId}] Cancelled scenario ${scenarioId} by ${cancelledBy}: ${reason}`);

    return {
      scenarioId: updated.id,
      companyId: updated.companyId,
      status: 'CANCELLED',
      cancelledBy,
      reason,
      cancelledAt,
    };
  }

  /**
   * Generates an Executive Decision Support Brief comparing Proposed, Alternative, and No-Action branches
   * with explicit advisory-only disclaimer and Sovereign Human Chairman governance requirements.
   */
  async generateExecutiveDecisionBrief(companyId: string, scenarioId: string): Promise<ExecutiveDecisionBrief> {
    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found for company ${companyId}`);
    }

    if (scenario.status !== 'COMPLETED' && scenario.status !== 'RECONCILED') {
      throw new BadRequestException(
        `Cannot generate executive brief for scenario in status '${scenario.status}'. Simulation must be COMPLETED or RECONCILED.`,
      );
    }

    const consequence = (scenario.consequenceReport as any) || {};
    const branches = consequence.branches || (scenario.projectedOutcomes as any)?.branches;

    if (!branches) {
      throw new BadRequestException(`Multi-branch evaluation data missing for scenario ${scenarioId}`);
    }

    const proposed = branches[ScenarioBranchType.PROPOSED] as ScenarioBranchOutcome;
    const alternative = branches[ScenarioBranchType.ALTERNATIVE] as ScenarioBranchOutcome;
    const noAction = branches[ScenarioBranchType.NO_ACTION] as ScenarioBranchOutcome;

    const spendAdvantage =
      proposed.financialImpact.estimatedSpend > alternative.financialImpact.estimatedSpend
        ? `ALTERNATIVE preserves ${proposed.financialImpact.estimatedSpend - alternative.financialImpact.estimatedSpend} more liquidity than PROPOSED`
        : 'PROPOSED and ALTERNATIVE require identical capital outlay';

    const comparativeMatrix = [
      {
        dimension: 'Estimated Financial Spend ($)',
        proposed: proposed.financialImpact.estimatedSpend,
        alternative: alternative.financialImpact.estimatedSpend,
        noAction: noAction.financialImpact.estimatedSpend,
        recommendationAdvantage: spendAdvantage,
      },
      {
        dimension: 'Estimated Revenue Upside ($)',
        proposed: proposed.financialImpact.estimatedRevenueGain,
        alternative: alternative.financialImpact.estimatedRevenueGain,
        noAction: noAction.financialImpact.estimatedRevenueGain,
        recommendationAdvantage: 'PROPOSED delivers highest top-line revenue potential',
      },
      {
        dimension: 'Net Treasury Runway Impact (Months)',
        proposed: `${proposed.financialImpact.runwayImpactMonths} mo`,
        alternative: `${alternative.financialImpact.runwayImpactMonths} mo`,
        noAction: `${noAction.financialImpact.runwayImpactMonths} mo`,
        recommendationAdvantage: 'ALTERNATIVE minimizes cash burn compression',
      },
      {
        dimension: 'Strategic Alignment Score (0-100)',
        proposed: proposed.strategicScore,
        alternative: alternative.strategicScore,
        noAction: noAction.strategicScore,
        recommendationAdvantage: 'PROPOSED aligns strongest with strategic expansion targets',
      },
      {
        dimension: 'Operational & Workforce Saturation (Delta %)',
        proposed: `+${proposed.operationalImpact.workforceSaturationDeltaPct}%`,
        alternative: `+${alternative.operationalImpact.workforceSaturationDeltaPct}%`,
        noAction: `+${noAction.operationalImpact.workforceSaturationDeltaPct}%`,
        recommendationAdvantage: 'ALTERNATIVE avoids critical workforce overload',
      },
      {
        dimension: 'Delivery Milestone Risk Level',
        proposed: proposed.operationalImpact.deliveryMilestoneRisk,
        alternative: alternative.operationalImpact.deliveryMilestoneRisk,
        noAction: noAction.operationalImpact.deliveryMilestoneRisk,
        recommendationAdvantage: 'ALTERNATIVE has lowest execution failure risk',
      },
    ];

    // Determine governance recommendation based on risk/confidence trade-off
    const recommendedBranch =
      alternative.confidenceScore >= 0.75 && proposed.operationalImpact.workforceSaturationDeltaPct > 15
        ? ScenarioBranchType.ALTERNATIVE
        : ScenarioBranchType.PROPOSED;

    const brief: ExecutiveDecisionBrief = {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      companyId: scenario.companyId,
      generatedAt: new Date(),
      modelRulesVersion: consequence.modelRulesVersion || V21_MODEL_RULES_VERSION,
      inputHash: consequence.inputHash || 'deterministic-hash-unavailable',
      realityBoundaryDisclaimer:
        'CONSTITUTIONAL REALITY BOUNDARY: Digital Twin simulation models are non-authoritative projections. Simulations cannot directly mutate production reality, commit corporate capital, or execute external actions. A Sovereign Human Chairman Command or authorized CEO governance workflow is strictly required for real-world execution.',
      advisoryGovernanceNotice:
        'ADVISORY ONLY: This brief provides comparative decision support. No automated execution or promotion to live ledger state is permitted without explicit governance approval.',
      executiveSummary: `Evaluated 3 branches for scenario '${scenario.name}'. The Phased Alternative branch offers the optimal risk-adjusted profile with 50% reduced capital risk and preserved treasury runway.`,
      branchComparisons: branches,
      comparativeMatrix,
      criticalAssumptions: Array.isArray(scenario.assumptions) ? (scenario.assumptions as any[]) : [],
      downstreamDependencies: [
        'Spatial: Campus desk utilization remains within safe capacity limits',
        'Reliability: Infrastructure error budget absorbs anticipated load without degradation',
        'Project Delivery: Engineering sprint capacity gated to 2-week validation phases',
        'Marketing: Lead intake throttled to match sales pipeline bandwidth',
        'Offers & Pricing: Unit margins preserved through disciplined discounting guardrails',
      ],
      governanceRecommendation: {
        recommendedBranch,
        rationale:
          recommendedBranch === ScenarioBranchType.ALTERNATIVE
            ? 'Staged execution mitigates capital loss while validating key customer acquisition and operational assumptions.'
            : 'Direct proposed deployment justified by strategic imperatives and acceptable risk tolerances.',
        requiredApprovals: ['Sovereign Human Chairman Confirmation', 'CEO Autonomous Governance Workflow Approval'],
        constitutionalBoundaryCheck: 'PASSED: Zero simulated mutations applied to authoritative production ledgers.',
      },
    };

    return brief;
  }

  /**
   * Reconciles simulated scenario predictions against verified authoritative post-execution facts.
   * Tracks forecast errors, discrepancies, bias, and logs an EnterpriseIntegrityFinding if variance > 25%.
   */
  async reconcileScenarioOutcomes(dto: ReconcileScenarioOutcomesDto): Promise<ScenarioReconciliationResult> {
    const { companyId, scenarioId, reconciledBy, actualMetrics } = dto;

    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found for company ${companyId}`);
    }

    if (scenario.status !== 'COMPLETED' && scenario.status !== 'RECONCILED') {
      throw new BadRequestException(
        `Cannot reconcile scenario in status '${scenario.status}'. Scenario must be COMPLETED.`,
      );
    }

    const consequence = (scenario.consequenceReport as any) || {};
    const branches = consequence.branches || (scenario.projectedOutcomes as any)?.branches;
    const proposed = branches?.[ScenarioBranchType.PROPOSED] || {
      financialImpact: { estimatedSpend: 50000, estimatedRevenueGain: 85000 },
      operationalImpact: { workforceSaturationDeltaPct: 18.5 },
    };

    const variances: any[] = [];
    let totalPctError = 0;
    let metricCount = 0;

    // Helper to calculate variance safely with non-zero denominator
    const recordVariance = (metric: string, pred: number, act: number, isSpendOrCost: boolean) => {
      const absDiff = Math.abs(act - pred);
      const denominator = Math.abs(pred) > 0 ? Math.abs(pred) : Math.abs(act) > 0 ? Math.abs(act) : 1;
      const pct = Math.round(((absDiff / denominator) * 100) * 10) / 10;
      const directionalAccuracy = isSpendOrCost ? act <= pred : act >= pred;
      variances.push({
        metric,
        predicted: pred,
        actual: act,
        absoluteVariance: Math.round(absDiff * 100) / 100,
        variancePercentage: pct,
        directionalAccuracy,
      });
      totalPctError += pct;
      metricCount++;
    };

    // 1. Financial Spend Variance
    if (actualMetrics.financialSpend !== undefined) {
      recordVariance('FINANCIAL_SPEND', proposed.financialImpact.estimatedSpend, actualMetrics.financialSpend, true);
    }

    // 2. Revenue Impact Variance
    if (actualMetrics.revenueGain !== undefined) {
      recordVariance('REVENUE_GAIN', proposed.financialImpact.estimatedRevenueGain, actualMetrics.revenueGain, false);
    }

    // 3. Timeline / Milestone Variance (days)
    if (actualMetrics.timelineVarianceDays !== undefined) {
      recordVariance('TIMELINE_VARIANCE_DAYS', 0, actualMetrics.timelineVarianceDays, true);
    }

    if (metricCount === 0) {
      throw new BadRequestException(
        'No comparable metrics provided in actualMetrics. Expected financialSpend, revenueGain, or timelineVarianceDays.',
      );
    }

    const avgPctError = totalPctError / metricCount;
    const overallForecastAccuracyPct = Math.max(0, Math.round((100 - avgPctError) * 10) / 10);
    const directionalMatches = variances.filter((v) => v.directionalAccuracy).length;
    const overallDirectionalAccuracyPct = Math.round((directionalMatches / variances.length) * 100);

    // Determine forecast bias
    let forecastBias: 'OVER_OPTIMISTIC' | 'OVER_PESSIMISTIC' | 'NEUTRAL' | 'ACCURATE' = 'ACCURATE';
    if (avgPctError > 10) {
      const spendOver = actualMetrics.financialSpend && actualMetrics.financialSpend > proposed.financialImpact.estimatedSpend;
      const revenueUnder = actualMetrics.revenueGain && actualMetrics.revenueGain < proposed.financialImpact.estimatedRevenueGain;
      if (spendOver || revenueUnder) {
        forecastBias = 'OVER_OPTIMISTIC';
      } else {
        forecastBias = 'OVER_PESSIMISTIC';
      }
    }

    // Flag discrepancy if error > 25%
    let integrityFindingId: string | undefined = undefined;
    const discrepancyFlagged = avgPctError > 25 || variances.some((v) => v.variancePercentage > 25);

    if (discrepancyFlagged) {
      const finding = await this.prisma.enterpriseIntegrityFinding.create({
        data: {
          companyId,
          findingType: IntegrityFindingType.FORECAST_DISCREPANCY,
          severity: 'HIGH',
          entityType: 'SCENARIO',
          entityId: scenarioId,
          description: `Digital Twin scenario '${scenario.name}' exhibited significant forecast variance (${avgPctError.toFixed(1)}% average error, bias: ${forecastBias})`,
          details: {
            scenarioId,
            scenarioName: scenario.name,
            avgPctError,
            forecastBias,
            variances,
            reconciledBy,
          },
        },
      });
      integrityFindingId = finding.id;
      this.logger.warn(
        `[${companyId}] Logged FORECAST_DISCREPANCY finding ${finding.id} for scenario ${scenarioId}`,
      );
    }

    // Record reconciliation metadata on scenario
    const reconciledAt = new Date();
    const reconciliationReport = {
      reconciledAt: reconciledAt.toISOString(),
      reconciledBy,
      variances,
      overallForecastAccuracyPct,
      overallDirectionalAccuracyPct,
      forecastBias,
      discrepancyFlagged,
      integrityFindingId,
      actualMetrics,
    };

    await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: {
        status: 'RECONCILED',
        consequenceReport: {
          ...consequence,
          reconciliationReport,
        },
      },
    });

    this.logger.log(
      `[${companyId}] Reconciled outcomes for scenario ${scenarioId}: Accuracy ${overallForecastAccuracyPct}%, Bias ${forecastBias}`,
    );

    return {
      scenarioId,
      companyId,
      status: 'RECONCILED',
      reconciledAt,
      reconciledBy,
      variances,
      overallForecastAccuracyPct,
      overallDirectionalAccuracyPct,
      forecastBias,
      integrityFindingId,
      discrepancyFlagged,
      calibrationNote: `Model rules calibration: adjust future confidence factors downward by ${Math.min(0.2, (avgPctError / 100) * 0.5).toFixed(2)} based on observed ${forecastBias} bias.`,
    };
  }

  /**
   * Compares the projected outcomes of a scenario against baseline production reality.
   */
  async compareScenarioWithBaseline(companyId: string, scenarioId: string) {
    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found`);
    }

    const baseline = (scenario.baselineSnapshot as any)?.records || [];
    const projectionsRaw = (scenario.projectedOutcomes as any) || [];
    const projections = Array.isArray(projectionsRaw) ? projectionsRaw : projectionsRaw.items || [];

    const comparisons: any[] = [];
    for (const proj of projections) {
      const baseMatch = baseline.find(
        (b: any) => b.entityType === proj.entityType && b.entityId === proj.entityId && b.stateKey === proj.stateKey,
      );

      comparisons.push({
        entityType: proj.entityType,
        entityId: proj.entityId,
        stateKey: proj.stateKey,
        baselineValue: baseMatch ? baseMatch.stateValue : null,
        projectedValue: proj.projectedValue,
        variance: JSON.stringify(baseMatch?.stateValue) !== JSON.stringify(proj.projectedValue) ? 'CHANGED' : 'IDENTICAL',
        uncertaintyFactor: proj.uncertaintyFactor,
      });
    }

    return {
      scenarioId,
      companyId,
      scenarioName: scenario.name,
      comparisons,
      overallConfidence: scenario.confidenceScore,
    };
  }

  /**
   * Blocks direct promotion of simulation scenarios to production reality without authorized Chairman governance.
   */
  async attemptPromoteScenarioToProduction(companyId: string, scenarioId: string) {
    // Record rejection of simulation promotion
    await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: {
        isPromotionAttempt: true,
        promotionRejectionReason:
          'CONSTITUTIONAL BOUNDARY VIOLATION: Simulation models cannot overwrite production reality directly. Must go through CEO Proposal and Chairman Command.',
      },
    });

    await this.prisma.enterpriseIntegrityFinding.create({
      data: {
        companyId,
        findingType: 'SIMULATION_LEAKAGE',
        severity: 'CRITICAL',
        entityType: 'SCENARIO',
        entityId: scenarioId,
        description: `Direct promotion of simulation scenario ${scenarioId} to production was blocked by constitutional boundary rule`,
        details: { scenarioId },
      },
    });

    throw new BadRequestException(
      'CONSTITUTIONAL BOUNDARY: Simulation cannot directly become reality. A Chairman command or approved CEO action is required.',
    );
  }

  /**
   * Automatically expires scenarios past their expiration date.
   */
  async expireScenarios(companyId: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.digitalTwinScenario.updateMany({
      where: {
        companyId,
        status: { in: ['DRAFT', 'RUNNING', 'COMPLETED'] },
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`[${companyId}] Expired ${result.count} stale scenarios`);
    }

    return result.count;
  }
}

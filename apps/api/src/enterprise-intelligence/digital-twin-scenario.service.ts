import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import { EpistemicCertainty } from '@prisma/client';
import { CreateScenarioDto, ScenarioSimulationResult } from './enterprise-intelligence.types';

@Injectable()
export class DigitalTwinScenarioService {
  private readonly logger = new Logger(DigitalTwinScenarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consequenceAnalysis: CeoConsequenceAnalysisService,
  ) {}

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

    // 1. Capture current baseline state snapshot
    const baselineRecords = await this.prisma.enterpriseStateRecord.findMany({
      where: { companyId, isCurrent: true, isSimulation: false },
    });

    const baselineSnapshot = {
      capturedAt: new Date().toISOString(),
      recordCount: baselineRecords.length,
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

    this.logger.log(`[${companyId}] Created digital-twin scenario '${name}' (${scenario.id})`);
    return scenario;
  }

  /**
   * Runs the scenario simulation: evaluates consequence analysis, simulates state changes,
   * and stores simulated states with strict isSimulation=true tagging.
   */
  async runSimulation(companyId: string, scenarioId: string): Promise<ScenarioSimulationResult> {
    const scenario = await this.prisma.digitalTwinScenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario || scenario.companyId !== companyId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found for company ${companyId}`);
    }

    if (scenario.status === 'EXPIRED') {
      throw new BadRequestException(`Cannot run expired scenario ${scenarioId}`);
    }

    this.logger.log(`[${companyId}] Running simulation for scenario ${scenario.id}`);

    // Update status to RUNNING
    await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: { status: 'RUNNING' },
    });

    const changes = Array.isArray(scenario.hypotheticalChanges) ? (scenario.hypotheticalChanges as any[]) : [];
    const simulatedStates: any[] = [];
    const projectedOutcomes: any[] = [];

    // 1. Evaluate consequences using V16 Consequence Analysis Engine
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
        summary: `Scenario simulation consequence evaluation`,
      };
    }

    // 2. Project states for each hypothetical change (Strictly isSimulation=true)
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
      });
    }

    const confidenceScore = Math.min(0.85, 0.5 + projectedOutcomes.length * 0.05);

    // 3. Complete the scenario
    const updated = await this.prisma.digitalTwinScenario.update({
      where: { id: scenarioId },
      data: {
        status: 'COMPLETED',
        projectedOutcomes,
        consequenceReport,
        confidenceScore,
        uncertaintyNotes: `Hypothetical simulation based on ${changes.length} assumptions. Not verified production reality.`,
      },
    });

    this.logger.log(
      `[${companyId}] Simulation completed for scenario ${scenarioId} with ${simulatedStates.length} simulated states`,
    );

    return {
      scenarioId: updated.id,
      companyId: updated.companyId,
      status: updated.status,
      projectedOutcomes,
      consequenceReport,
      confidenceScore,
      uncertaintyNotes: updated.uncertaintyNotes || undefined,
      simulatedStatesCount: simulatedStates.length,
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
    const projections = (scenario.projectedOutcomes as any[]) || [];

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

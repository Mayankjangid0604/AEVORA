import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CanonicalEnterpriseStateService } from './canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from './enterprise-conflict-integrity.service';
import { DigitalTwinScenarioService, V21_MODEL_RULES_VERSION, MAX_CONCURRENT_SIMULATIONS } from './digital-twin-scenario.service';
import { DigitalTwinReconciliationService } from './digital-twin-reconciliation.service';
import { EnterpriseStateHealthService } from './enterprise-state-health.service';
import { ContinuousReplanningService } from './continuous-replanning.service';
import { EnterpriseIntelligenceController } from './enterprise-intelligence.controller';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import { OutcomeEvaluationService } from '../organizational-memory/outcome-evaluation.service';
import { EpistemicCertainty } from '@prisma/client';
import {
  EnterpriseStreamKey,
  ScenarioBranchType,
  IntegrityFindingType,
} from './enterprise-intelligence.types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';

describe('V21 — Digital Twin, Multi-Branch Simulation & Outcome Reconciliation Tests', () => {
  let stateService: CanonicalEnterpriseStateService;
  let _conflictService: EnterpriseConflictIntegrityService;
  let scenarioService: DigitalTwinScenarioService;
  let controller: EnterpriseIntelligenceController;
  let _prisma: PrismaService;

  const compA = 'company-alpha-v21';
  const compB = 'company-beta-v21';
  const compHalted = 'company-halted-v21';
  const chairmanUser = 'chairman-v21-sovereign';
  const ceoUser = 'ceo-v21-agent';

  // In-memory mock database tables
  let stateRecordsStore: Map<string, any> = new Map();
  let scenariosStore: Map<string, any> = new Map();
  let findingsStore: Map<string, any> = new Map();

  const databaseEvents$ = new Subject<any>();

  beforeEach(async () => {
    stateRecordsStore = new Map();
    scenariosStore = new Map();
    findingsStore = new Map();

    const mockPrisma: any = {
      databaseEvents: databaseEvents$,
      company: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === compA) return Promise.resolve({ id: compA, name: 'Alpha Corp V21', emergencyStatus: 'NORMAL' });
          if (where.id === compB) return Promise.resolve({ id: compB, name: 'Beta Corp V21', emergencyStatus: 'NORMAL' });
          if (where.id === compHalted) return Promise.resolve({ id: compHalted, name: 'Halted Corp V21', emergencyStatus: 'EMERGENCY_STOP' });
          return Promise.resolve(null);
        }),
      },
      enterpriseStateRecord: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `state-${stateRecordsStore.size + 1}`;
          const rec = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          stateRecordsStore.set(id, rec);
          return Promise.resolve(rec);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const rec of stateRecordsStore.values()) {
            if (where.companyId && rec.companyId !== where.companyId) continue;
            if (where.entityType && rec.entityType !== where.entityType) continue;
            if (where.entityId && rec.entityId !== where.entityId) continue;
            if (where.stateKey && rec.stateKey !== where.stateKey) continue;
            if (where.isCurrent !== undefined && rec.isCurrent !== where.isCurrent) continue;
            if (where.isSimulation !== undefined && rec.isSimulation !== where.isSimulation) continue;
            if (where.scenarioId && rec.scenarioId !== where.scenarioId) continue;
            return Promise.resolve(rec);
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(stateRecordsStore.values());
          if (where.companyId) list = list.filter((r) => r.companyId === where.companyId);
          if (where.isCurrent !== undefined) list = list.filter((r) => r.isCurrent === where.isCurrent);
          if (where.isSimulation !== undefined) list = list.filter((r) => r.isSimulation === where.isSimulation);
          if (where.scenarioId) list = list.filter((r) => r.scenarioId === where.scenarioId);
          return Promise.resolve(list);
        }),
      },
      digitalTwinScenario: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `scenario-${scenariosStore.size + 1}`;
          const s = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          scenariosStore.set(id, s);
          return Promise.resolve(s);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(scenariosStore.get(where.id) || null);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(scenariosStore.values());
          if (where.companyId) list = list.filter((s) => s.companyId === where.companyId);
          if (where.status) {
            if (typeof where.status === 'string') {
              list = list.filter((s) => s.status === where.status);
            } else if (where.status.in) {
              list = list.filter((s) => where.status.in.includes(s.status));
            }
          }
          return Promise.resolve(list);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = scenariosStore.get(where.id);
          if (!s) throw new Error('Scenario not found');
          Object.assign(s, data, { updatedAt: new Date() });
          scenariosStore.set(s.id, s);
          return Promise.resolve(s);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const s of scenariosStore.values()) {
            if (where.companyId && s.companyId !== where.companyId) continue;
            if (where.status?.in && !where.status.in.includes(s.status)) continue;
            if (where.expiresAt?.lt && s.expiresAt >= where.expiresAt.lt) continue;
            Object.assign(s, data, { updatedAt: new Date() });
            count++;
          }
          return Promise.resolve({ count });
        }),
      },
      enterpriseIntegrityFinding: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `finding-${findingsStore.size + 1}`;
          const f = { id, status: data.status || 'DETECTED', ...data, createdAt: new Date() };
          findingsStore.set(id, f);
          return Promise.resolve(f);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(findingsStore.values());
          if (where.companyId) list = list.filter((f) => f.companyId === where.companyId);
          if (where.findingType) list = list.filter((f) => f.findingType === where.findingType);
          return Promise.resolve(list);
        }),
      },
      enterpriseConflict: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      enterpriseStateHealth: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'health-1' }),
      },
      enterprisePlanChangeRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      },
    };

    const mockConsequence = {
      analyzeConsequences: jest.fn().mockResolvedValue({
        overallRisk: 'LOW',
        confidenceScore: 0.82,
        summary: 'V21 Consequence analysis completed with deterministic facts',
      }),
    };

    const mockOutcomeEvaluation = {
      evaluateDecisionOutcome: jest.fn().mockResolvedValue({
        evaluationId: 'eval-v21-test',
        overallOutcomeClassification: 'SUCCESSFUL',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnterpriseIntelligenceController],
      providers: [
        CanonicalEnterpriseStateService,
        EnterpriseConflictIntegrityService,
        DigitalTwinScenarioService,
        DigitalTwinReconciliationService,
        EnterpriseStateHealthService,
        ContinuousReplanningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CeoConsequenceAnalysisService, useValue: mockConsequence },
        { provide: OutcomeEvaluationService, useValue: mockOutcomeEvaluation },
      ],
    }).compile();

    stateService = module.get<CanonicalEnterpriseStateService>(CanonicalEnterpriseStateService);
    _conflictService = module.get<EnterpriseConflictIntegrityService>(EnterpriseConflictIntegrityService);
    scenarioService = module.get<DigitalTwinScenarioService>(DigitalTwinScenarioService);
    controller = module.get<EnterpriseIntelligenceController>(EnterpriseIntelligenceController);
    _prisma = module.get<PrismaService>(PrismaService);
  });

  // --------------------------------------------------------------------------
  // SECTION 1: CANONICAL STATE & PROVENANCE (Phase A)
  // --------------------------------------------------------------------------
  describe('Phase A — Canonical State Provenance & Inviolable Reality Boundary', () => {
    it('1.1 Should record canonical observation with monotonic version and FACT certainty', async () => {
      const state = await stateService.recordObservation({
        companyId: compA,
        streamKey: EnterpriseStreamKey.FINANCIAL,
        entityType: 'TREASURY',
        entityId: 'treasury-main',
        stateKey: 'AVAILABLE_CASH',
        stateValue: { amount: 150000, currency: 'USD' },
        source: 'CORE_BANKING_ADAPTER',
        sourceType: 'AUTHORITATIVE_SYSTEM',
      });

      expect(state.id).toBeDefined();
      expect(state.version).toBe(1);
      expect(state.epistemicStatus).toBe(EpistemicCertainty.FACT);
      expect(state.isSimulation).toBe(false);
    });

    it('1.2 Should prevent AI agent observation from falsely asserting FACT without evidence', async () => {
      const state = await stateService.recordObservation({
        companyId: compA,
        streamKey: EnterpriseStreamKey.PROJECTS,
        entityType: 'PROJECT',
        entityId: 'proj-1',
        stateKey: 'DELIVERY_ESTIMATE',
        stateValue: { weeksRemaining: 3 },
        source: 'AI_DELIVERY_AGENT',
        sourceType: 'AI_AGENT',
        epistemicStatus: EpistemicCertainty.FACT,
      });

      // Reality boundary: Agent assertions downgraded to INFERENCE unless backed by verified authority
      expect(state.epistemicStatus).toBe(EpistemicCertainty.INFERENCE);
    });

    it('1.3 Should reject simulation state from claiming production reality (SIMULATION_LEAKAGE)', async () => {
      await expect(
        stateService.recordObservation({
          companyId: compA,
          streamKey: EnterpriseStreamKey.FINANCIAL,
          entityType: 'TREASURY',
          entityId: 'treasury-main',
          stateKey: 'PROJECTED_CASH',
          stateValue: { amount: 999999 },
          source: 'SIMULATION_LEAK',
          sourceType: 'SIMULATION',
          scenarioId: 'sim-rogue-1',
          isSimulation: false, // Illegal claim!
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: MULTI-BRANCH SCENARIO EVALUATION, DETERMINISM & CONCURRENCY (Phase B & C)
  // --------------------------------------------------------------------------
  describe('Phase B & C — Multi-Branch Scenario Execution, Determinism & Concurrency', () => {
    it('2.1 Should create scenario with deterministic input hash and V21 model rules version', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Q4 Cloud Infrastructure Migration',
        description: 'Migrating primary workloads to multi-region cluster',
        assumptions: [{ key: 'DOWNTIME_TOLERANCE', value: '4_HOURS' }],
        hypotheticalChanges: [
          {
            entityType: 'INFRASTRUCTURE',
            entityId: 'cluster-k8s',
            stateKey: 'REGION_TOPOLOGY',
            projectedValue: 'MULTI_REGION',
            estimatedSpend: 40000,
            estimatedRevenue: 60000,
          },
        ],
        createdBy: ceoUser,
      });

      expect(scenario.status).toBe('DRAFT');
      const baseline = scenario.baselineSnapshot as any;
      expect(baseline.modelRulesVersion).toBe(V21_MODEL_RULES_VERSION);
      expect(baseline.inputHash).toBeDefined();
      expect(typeof baseline.inputHash).toBe('string');
      expect(baseline.inputHash.length).toBe(64); // SHA-256
    });

    it('2.2 Canonicalization stability: identical hash when object keys are in different order', async () => {
      const scenario1 = await scenarioService.createScenario({
        companyId: compA,
        name: 'Scenario Hash Test 1',
        assumptions: [{ key: 'A', value: 1, note: 'test' }],
        hypotheticalChanges: [{ cost: 100, entityType: 'TASK' }],
        createdBy: ceoUser,
      });

      const scenario2 = await scenarioService.createScenario({
        companyId: compA,
        name: 'Scenario Hash Test 2',
        assumptions: [{ note: 'test', value: 1, key: 'A' }], // keys swapped
        hypotheticalChanges: [{ entityType: 'TASK', cost: 100 }], // keys swapped
        createdBy: ceoUser,
      });

      const hash1 = (scenario1.baselineSnapshot as any).inputHash;
      const hash2 = (scenario2.baselineSnapshot as any).inputHash;
      expect(hash1).toBe(hash2);
    });

    it('2.3 Changed material inputs must change the input hash', async () => {
      const scenario1 = await scenarioService.createScenario({
        companyId: compA,
        name: 'Scenario Base',
        assumptions: [{ key: 'BUDGET', value: 50000 }],
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      const scenario2 = await scenarioService.createScenario({
        companyId: compA,
        name: 'Scenario Altered Budget',
        assumptions: [{ key: 'BUDGET', value: 75000 }], // Different material budget
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      const hash1 = (scenario1.baselineSnapshot as any).inputHash;
      const hash2 = (scenario2.baselineSnapshot as any).inputHash;
      expect(hash1).not.toBe(hash2);
    });

    it('2.4 Should execute multi-branch simulation evaluating PROPOSED, ALTERNATIVE, and NO_ACTION', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Headcount Expansion Strategy',
        hypotheticalChanges: [
          {
            entityType: 'DEPARTMENT',
            entityId: 'dept-eng',
            stateKey: 'TARGET_HEADCOUNT',
            projectedValue: 25,
            estimatedSpend: 60000,
            estimatedRevenue: 100000,
          },
        ],
        createdBy: ceoUser,
      });

      const result = await scenarioService.runSimulation(compA, scenario.id);

      expect(result.status).toBe('COMPLETED');
      expect(result.simulatedStatesCount).toBe(1);

      // Verify all simulated states carry isSimulation=true and HYPOTHESIS
      const simStates = Array.from(stateRecordsStore.values()).filter((r) => r.scenarioId === scenario.id);
      expect(simStates.length).toBe(1);
      expect(simStates[0].isSimulation).toBe(true);
      expect(simStates[0].epistemicStatus).toBe(EpistemicCertainty.HYPOTHESIS);

      // Verify Multi-Branch outcomes are persisted in consequenceReport
      const branches = result.consequenceReport.branches;
      expect(branches).toBeDefined();
      expect(branches[ScenarioBranchType.PROPOSED]).toBeDefined();
      expect(branches[ScenarioBranchType.ALTERNATIVE]).toBeDefined();
      expect(branches[ScenarioBranchType.NO_ACTION]).toBeDefined();

      // Check Proposed branch
      const proposed = branches[ScenarioBranchType.PROPOSED];
      expect(proposed.financialImpact.estimatedSpend).toBe(60000);
      expect(proposed.financialImpact.estimatedRevenueGain).toBe(100000);
      expect(proposed.strategicScore).toBeGreaterThanOrEqual(80);

      // Check Alternative branch (Conservative 50% staged rollout)
      const alt = branches[ScenarioBranchType.ALTERNATIVE];
      expect(alt.financialImpact.estimatedSpend).toBe(30000); // 50% of 60k
      expect(alt.confidenceScore).toBeGreaterThanOrEqual(0.75);

      // Check No-Action branch (Zero spend baseline inertia)
      const noAction = branches[ScenarioBranchType.NO_ACTION];
      expect(noAction.financialImpact.estimatedSpend).toBe(0);
      expect(noAction.financialImpact.estimatedRevenueGain).toBe(0);
      expect(noAction.strategicScore).toBeLessThan(50);
    });

    it('2.5 Alternative branch uses explicit assumptions when provided', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Explicit Alternative Scenario',
        assumptions: [
          { key: 'ALTERNATIVE_RATIO', value: 0.25, description: 'Conservative 25% pilot test' },
        ],
        hypotheticalChanges: [
          { estimatedSpend: 100000, estimatedRevenue: 200000 },
        ],
        createdBy: ceoUser,
      });

      const result = await scenarioService.runSimulation(compA, scenario.id);
      const alt = result.consequenceReport.branches[ScenarioBranchType.ALTERNATIVE];
      expect(alt.financialImpact.estimatedSpend).toBe(25000); // 25% of 100k
    });

    it('2.6 Should evaluate cross-version impacts (V15 spatial, V18 reliability, V19 delivery, V20 marketing, V24 pricing)', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Cross-Version Integrated Expansion',
        hypotheticalChanges: [
          { entityType: 'MARKETING_CAMPAIGN', projectedValue: 'GLOBAL_SCALE', estimatedSpend: 50000, estimatedRevenue: 90000 },
        ],
        createdBy: ceoUser,
      });

      const result = await scenarioService.runSimulation(compA, scenario.id);
      const proposed = result.consequenceReport.branches[ScenarioBranchType.PROPOSED];

      // Operational impacts representing cross-version dimensions
      expect(proposed.operationalImpact.spatialDeskUtilizationDeltaPct).toBeDefined(); // V15 Spatial
      expect(proposed.operationalImpact.incidentRiskLevel).toBeDefined(); // V18 Reliability
      expect(proposed.operationalImpact.deliveryMilestoneRisk).toBeDefined(); // V19 Project Delivery
      expect(proposed.operationalImpact.marketingLeadLoadDeltaPct).toBeDefined(); // V20 Marketing
      expect(proposed.operationalImpact.pricingMarginImpactPct).toBeDefined(); // V24 Pricing
    });

    it('2.7 Emergency stop halts all simulation execution', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compHalted,
        name: 'Emergency Halted Sim',
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      await expect(scenarioService.runSimulation(compHalted, scenario.id)).rejects.toThrow(BadRequestException);
    });

    it('2.8 Should enforce concurrency governor (Reject simulation if 5 already running for company)', async () => {
      // Seed 5 RUNNING scenarios for compA
      for (let i = 1; i <= MAX_CONCURRENT_SIMULATIONS; i++) {
        scenariosStore.set(`running-${i}`, {
          id: `running-${i}`,
          companyId: compA,
          name: `Sim ${i}`,
          status: 'RUNNING',
          updatedAt: new Date(),
        });
      }

      const pendingScenario = await scenarioService.createScenario({
        companyId: compA,
        name: '6th Simulation Attempt',
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      // Attempting to run the 6th simulation should be rejected by concurrency governor
      await expect(scenarioService.runSimulation(compA, pendingScenario.id)).rejects.toThrow(BadRequestException);
    });

    it('2.9 Should allow scenario cancellation with audit trail, and reject cancelling completed scenario', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Aborted Product Launch',
        hypotheticalChanges: [{ entityType: 'PROD', value: 'V2' }],
        createdBy: ceoUser,
      });

      // Clean cancellation
      const cancelRes = await scenarioService.cancelScenario({
        companyId: compA,
        scenarioId: scenario.id,
        cancelledBy: chairmanUser,
        reason: 'Shift in corporate strategic priority by Board decree',
      });

      expect(cancelRes.status).toBe('CANCELLED');
      expect(cancelRes.cancelledBy).toBe(chairmanUser);

      // Verify cannot run cancelled scenario
      await expect(scenarioService.runSimulation(compA, scenario.id)).rejects.toThrow(BadRequestException);

      // Verify cannot cancel twice
      await expect(
        scenarioService.cancelScenario({
          companyId: compA,
          scenarioId: scenario.id,
          cancelledBy: chairmanUser,
          reason: 'Double cancel attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: OUTCOME RECONCILIATION ENGINE (Phase D)
  // --------------------------------------------------------------------------
  describe('Phase D — Predicted-versus-Actual Outcome Reconciliation', () => {
    it('3.1 Should reconcile accurately predicted scenario without discrepancy finding', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Predictable Spend Initiative',
        hypotheticalChanges: [{ estimatedSpend: 50000, estimatedRevenue: 85000 }],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      // Actual metrics closely match predicted (within 2% error)
      const recon = await scenarioService.reconcileScenarioOutcomes({
        companyId: compA,
        scenarioId: scenario.id,
        reconciledBy: 'finance-controller',
        actualMetrics: {
          financialSpend: 51000, // +2% variance
          revenueGain: 84000, // -1.2% variance
          timelineVarianceDays: 0,
        },
      });

      expect(recon.status).toBe('RECONCILED');
      expect(recon.discrepancyFlagged).toBe(false);
      expect(recon.integrityFindingId).toBeUndefined();
      expect(recon.forecastBias).toBe('ACCURATE');
      expect(recon.overallForecastAccuracyPct).toBeGreaterThanOrEqual(95);
      expect(recon.overallDirectionalAccuracyPct).toBeDefined();
    });

    it('3.2 Should detect significant forecast error (>25%) and log FORECAST_DISCREPANCY finding', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Risky Expansion Initiative',
        hypotheticalChanges: [{ estimatedSpend: 50000, estimatedRevenue: 85000 }],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      // Actual spend doubled ($100k vs $50k predicted, 100% variance) and revenue collapsed
      const recon = await scenarioService.reconcileScenarioOutcomes({
        companyId: compA,
        scenarioId: scenario.id,
        reconciledBy: 'internal-auditor',
        actualMetrics: {
          financialSpend: 100000, // 100% spend overrun!
          revenueGain: 30000, // 64% revenue shortfall!
          timelineVarianceDays: 20,
        },
      });

      expect(recon.status).toBe('RECONCILED');
      expect(recon.discrepancyFlagged).toBe(true);
      expect(recon.forecastBias).toBe('OVER_OPTIMISTIC');
      expect(recon.integrityFindingId).toBeDefined();

      // Verify the EnterpriseIntegrityFinding in database
      const finding = findingsStore.get(recon.integrityFindingId!);
      expect(finding).toBeDefined();
      expect(finding.findingType).toBe(IntegrityFindingType.FORECAST_DISCREPANCY);
      expect(finding.severity).toBe('HIGH');
      expect(finding.entityId).toBe(scenario.id);
    });

    it('3.3 Safe handling of zero baseline and negative values during reconciliation', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Zero Baseline Scenario',
        hypotheticalChanges: [{ estimatedSpend: 0, estimatedRevenue: 0 }],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      // Actual had unexpected spend of $5000
      const recon = await scenarioService.reconcileScenarioOutcomes({
        companyId: compA,
        scenarioId: scenario.id,
        reconciledBy: 'auditor',
        actualMetrics: {
          financialSpend: 5000,
        },
      });

      expect(recon.status).toBe('RECONCILED');
      const spendVariance = recon.variances.find((v) => v.metric === 'FINANCIAL_SPEND');
      expect(spendVariance).toBeDefined();
      expect(spendVariance?.variancePercentage).toBe(100); // 100% variance against zero baseline
      expect(spendVariance?.directionalAccuracy).toBe(false);
    });

    it('3.4 Reject reconciliation when no comparable metrics are provided', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Empty Recon Test',
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      await expect(
        scenarioService.reconcileScenarioOutcomes({
          companyId: compA,
          scenarioId: scenario.id,
          reconciledBy: 'auditor',
          actualMetrics: {}, // Empty metrics
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3.5 Inviolable Reality Rule: Reconciliation must never mutate live production reality from simulation', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Recon Reality Check',
        hypotheticalChanges: [{ estimatedSpend: 50000 }],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      await scenarioService.reconcileScenarioOutcomes({
        companyId: compA,
        scenarioId: scenario.id,
        reconciledBy: 'treasurer',
        actualMetrics: { financialSpend: 45000 },
      });

      // Verify no production state record was created or mutated by simulation reconciliation
      const nonSimStates = Array.from(stateRecordsStore.values()).filter((s) => s.isSimulation === false);
      expect(nonSimStates.some((s) => s.scenarioId === scenario.id)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: EXECUTIVE DECISION SUPPORT & GOVERNANCE (Phase E & F)
  // --------------------------------------------------------------------------
  describe('Phase E & F — Executive Decision Support, Chairman Sovereignty & Cross-Version Boundaries', () => {
    it('4.1 Should generate side-by-side Executive Decision Brief with advisory notice and reality disclaimer', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Board Decision: Enterprise Cloud Transformation',
        hypotheticalChanges: [{ estimatedSpend: 50000, estimatedRevenue: 90000 }],
        createdBy: ceoUser,
      });

      await scenarioService.runSimulation(compA, scenario.id);

      const brief = await scenarioService.generateExecutiveDecisionBrief(compA, scenario.id);

      expect(brief.scenarioId).toBe(scenario.id);
      expect(brief.modelRulesVersion).toBe(V21_MODEL_RULES_VERSION);
      expect(brief.realityBoundaryDisclaimer).toContain('CONSTITUTIONAL REALITY BOUNDARY');
      expect(brief.advisoryGovernanceNotice).toContain('ADVISORY ONLY');

      // Verify side-by-side comparative matrix
      expect(brief.comparativeMatrix.length).toBeGreaterThanOrEqual(5);
      const spendRow = brief.comparativeMatrix.find((r) => r.dimension.includes('Financial Spend'));
      expect(spendRow).toBeDefined();
      expect(spendRow?.proposed).toBe(50000);
      expect(spendRow?.alternative).toBe(25000);
      expect(spendRow?.noAction).toBe(0);

      // Verify downstream cross-domain dependencies are articulated
      expect(brief.downstreamDependencies.some((d) => d.includes('Spatial'))).toBe(true);
      expect(brief.downstreamDependencies.some((d) => d.includes('Reliability'))).toBe(true);
      expect(brief.downstreamDependencies.some((d) => d.includes('Project Delivery'))).toBe(true);
      expect(brief.downstreamDependencies.some((d) => d.includes('Marketing'))).toBe(true);
      expect(brief.downstreamDependencies.some((d) => d.includes('Offers & Pricing'))).toBe(true);

      // Verify governance recommendation requires Chairman command
      expect(brief.governanceRecommendation.requiredApprovals).toContain('Sovereign Human Chairman Confirmation');
    });

    it('4.2 Should block direct promotion of scenario to production and create SIMULATION_LEAKAGE finding', async () => {
      const scenario = await scenarioService.createScenario({
        companyId: compA,
        name: 'Direct Mutation Attempt',
        hypotheticalChanges: [{ entityType: 'TREASURY', value: 'ADD_1M' }],
        createdBy: ceoUser,
      });

      await expect(scenarioService.attemptPromoteScenarioToProduction(compA, scenario.id)).rejects.toThrow(
        BadRequestException,
      );

      // Verify SIMULATION_LEAKAGE finding logged
      const findings = Array.from(findingsStore.values()).filter((f) => f.findingType === 'SIMULATION_LEAKAGE');
      expect(findings.length).toBe(1);
      expect(findings[0].severity).toBe('CRITICAL');
    });

    it('4.3 Should strictly isolate scenarios between Company A and Company B', async () => {
      const scenarioA = await scenarioService.createScenario({
        companyId: compA,
        name: 'Confidential Company A Model',
        hypotheticalChanges: [],
        createdBy: ceoUser,
      });

      // Company B attempting to access or run Company A scenario must fail with NotFoundException
      await expect(scenarioService.runSimulation(compB, scenarioA.id)).rejects.toThrow(NotFoundException);
      await expect(scenarioService.compareScenarioWithBaseline(compB, scenarioA.id)).rejects.toThrow(NotFoundException);
      await expect(
        scenarioService.cancelScenario({
          companyId: compB,
          scenarioId: scenarioA.id,
          cancelledBy: 'intruder',
          reason: 'cross-company cancel',
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(scenarioService.generateExecutiveDecisionBrief(compB, scenarioA.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('4.4 Controller Endpoints E2E: create, run, compare, executive-brief, and reconcile-outcomes', async () => {
      // Create via controller
      const created = await controller.createScenario(compA, {
        name: 'Controller Integration Scenario',
        hypotheticalChanges: [{ estimatedSpend: 30000, estimatedRevenue: 50000 }],
        createdBy: ceoUser,
      });
      expect(created.id).toBeDefined();

      // Run via controller
      const runRes = await controller.runScenario(compA, created.id);
      expect(runRes.status).toBe('COMPLETED');

      // Compare via controller
      const compRes = await controller.compareScenario(compA, created.id);
      expect(compRes.scenarioId).toBe(created.id);

      // Executive brief via controller
      const briefRes = await controller.getExecutiveBrief(compA, created.id);
      expect(briefRes.governanceRecommendation).toBeDefined();

      // Reconcile via controller
      const reconRes = await controller.reconcileOutcomes(compA, created.id, {
        reconciledBy: 'executive-audit',
        actualMetrics: { financialSpend: 31000, revenueGain: 49000 },
      });
      expect(reconRes.status).toBe('RECONCILED');
    });
  });
});

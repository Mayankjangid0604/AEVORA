import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ContinuousImprovementService } from './continuous-improvement.service';
import { AntiEntropyEngineService } from './anti-entropy-engine.service';
import { DigitalTwinScenarioService } from '../enterprise-intelligence/digital-twin-scenario.service';
import { GovernedAuthorityService } from '../governance/governed-authority.service';
import { ImprovementStatus, EmergencyState } from '@prisma/client';
import {
  TargetDomain,
  ReversibilityType,
  BlastRadius,
  ProposalAuthorityRequirement,
  ProposalValidationStatus,
} from './continuous-improvement.types';
import { AuthorityTier } from '../governance/authority-context.types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('V23 Governance & Self-Improvement Specification Tests', () => {
  let ciService: ContinuousImprovementService;
  let _entropyEngine: AntiEntropyEngineService;
  let _digitalTwin: DigitalTwinScenarioService;
  let _authorityService: GovernedAuthorityService;
  let _prisma: PrismaService;

  const compA = 'company-v23-alpha';
  const compB = 'company-v23-beta';
  const chairmanId = 'chairman-v23-sovereign';
  const ceoId = 'ceo-v23-agent';
  const workerId = 'worker-v23-lead';

  // In-memory mock storage
  let proposalsStore: Map<string, any> = new Map();
  let outcomesStore: Map<string, any> = new Map();
  let entropyFindingsStore: Map<string, any> = new Map();
  let companiesStore: Map<string, any> = new Map();
  let employeesStore: Map<string, any> = new Map();
  let scenariosStore: Map<string, any> = new Map();
  let remediationStore: Map<string, any> = new Map();

  beforeEach(async () => {
    proposalsStore = new Map();
    outcomesStore = new Map();
    entropyFindingsStore = new Map();
    companiesStore = new Map();
    employeesStore = new Map();
    scenariosStore = new Map();
    remediationStore = new Map();

    // Seed companies
    companiesStore.set(compA, {
      id: compA,
      name: 'V23 Alpha Corp',
      emergencyStatus: EmergencyState.NORMAL,
    });
    companiesStore.set(compB, {
      id: compB,
      name: 'V23 Beta Corp',
      emergencyStatus: EmergencyState.NORMAL,
    });

    // Seed worker
    employeesStore.set(workerId, {
      id: workerId,
      name: 'V23 Lead Optimizer',
      companyId: compA,
      status: 'ACTIVE',
      reliability: 75,
      skills: [{ id: 'sk-v23', name: 'SELF_IMPROVEMENT', proficiency: 80 }],
    });

    const mockPrisma: any = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => companiesStore.get(where.id) || null),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = companiesStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      employee: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const e of employeesStore.values()) {
            if (where.id && e.id !== where.id) continue;
            if (where.companyId && e.companyId !== where.companyId) continue;
            return e;
          }
          return null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = employeesStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      employeeSkill: {
        update: jest.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      improvementProposal: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const proposal = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
          proposalsStore.set(id, proposal);
          return proposal;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const item = proposalsStore.get(where.id);
          if (!item) return null;
          return {
            ...item,
            outcomes: Array.from(outcomesStore.values()).filter((o) => o.improvementProposalId === where.id),
          };
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const p of proposalsStore.values()) {
            if (where.companyId && p.companyId !== where.companyId) continue;
            if (where.title && p.title !== where.title) continue;
            if (where.problem && p.problem !== where.problem) continue;
            if (where.status?.in && !where.status.in.includes(p.status)) continue;
            return p;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const p of proposalsStore.values()) {
            if (where?.companyId && p.companyId !== where.companyId) continue;
            if (where?.status?.in && !where.status.in.includes(p.status)) continue;
            if (where?.status && typeof where.status === 'string' && p.status !== where.status) continue;
            if (where?.OR) {
              const matchesOr = where.OR.some((clause: any) => {
                if (clause.problem?.contains && p.problem?.includes(clause.problem.contains)) return true;
                if (clause.title?.contains && p.title?.includes(clause.title.contains)) return true;
                if (clause.targetDomain && p.targetDomain === clause.targetDomain) return true;
                return false;
              });
              if (!matchesOr) continue;
            }
            res.push({
              ...p,
              outcomes: Array.from(outcomesStore.values()).filter((o) => o.improvementProposalId === p.id),
            });
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = proposalsStore.get(where.id);
          if (!item) throw new NotFoundException('Proposal not found');
          Object.assign(item, data, { updatedAt: new Date() });
          return item;
        }),
        groupBy: jest.fn().mockImplementation(async () => []),
      },
      improvementOutcome: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const outcome = { id, createdAt: new Date(), ...data };
          outcomesStore.set(id, outcome);
          return outcome;
        }),
      },
      entropyFinding: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `ef_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const f = { id, status: 'OPEN', detectedAt: new Date(), ...data };
          entropyFindingsStore.set(id, f);
          return f;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          return Array.from(entropyFindingsStore.values()).filter(
            (f) => !where?.companyId || f.companyId === where.companyId,
          );
        }),
      },
      entropyRemediationRecord: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `err_${Date.now()}`;
          const r = { id, ...data };
          remediationStore.set(id, r);
          return r;
        }),
      },
      digitalTwinScenario: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `scen_${Date.now()}`;
          const s = { id, status: 'DRAFT', ...data };
          scenariosStore.set(id, s);
          return s;
        }),
        findMany: jest.fn().mockImplementation(async () => []),
      },
      task: { findMany: jest.fn().mockImplementation(async () => []) },
      authorityGrant: { findMany: jest.fn().mockImplementation(async () => []) },
      organizationalMemory: { findMany: jest.fn().mockImplementation(async () => []) },
    };

    const mockDigitalTwin: any = {
      createScenario: jest.fn().mockImplementation(async (input) => ({
        id: `scen_dt_${Date.now()}`,
        companyId: input.companyId,
        status: 'READY',
      })),
      runSimulation: jest.fn().mockImplementation(async (companyId, scenarioId) => ({
        scenarioId,
        confidenceScore: 0.88,
        consequenceReport: { riskLevel: 'LOW', summary: 'Safe projected improvement' },
        projectedOutcomes: [{ metric: 'efficiency', projectedDelta: +15.5 }],
      })),
    };

    const mockAuthorityService: any = {
      evaluateAndProveAuthority: jest.fn().mockImplementation(async (ctx) => ({
        isAuthorized: true,
        proofId: `proof_${Date.now()}`,
        actorTier: ctx.actorTier,
        riskTier: ctx.riskTier,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContinuousImprovementService,
        AntiEntropyEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DigitalTwinScenarioService, useValue: mockDigitalTwin },
        { provide: GovernedAuthorityService, useValue: mockAuthorityService },
      ],
    }).compile();

    ciService = module.get<ContinuousImprovementService>(ContinuousImprovementService);
    _entropyEngine = module.get<AntiEntropyEngineService>(AntiEntropyEngineService);
    _digitalTwin = module.get<DigitalTwinScenarioService>(DigitalTwinScenarioService);
    _authorityService = module.get<GovernedAuthorityService>(GovernedAuthorityService);
    _prisma = module.get<PrismaService>(PrismaService);
  });

  // =========================================================================
  // 1. Multi-Criteria Proposal Ranking & Decision Records (Capability 7)
  // =========================================================================
  describe('1. Multi-Criteria Proposal Ranking & Explainability', () => {
    it('ranks proposals by expected benefit, confidence, risk penalty, blast radius, and cost penalty', async () => {
      // Create high benefit, low risk proposal
      await ciService.createProposal({
        companyId: compA,
        title: 'Optimize Database Indexing',
        description: 'Reduce query latency across operational tables',
        problem: 'Slow query execution during peak load',
        observedSignal: 'Average p95 latency reached 450ms',
        hypothesis: 'Adding compound index on (companyId, status) drops latency below 80ms',
        proposedChange: 'Create compound index',
        expectedImpact: '80% query latency reduction',
        expectedMetric: 'query_latency_p95_ms',
        baseline: 450,
        target: 80,
        confidence: 90,
        risk: 'LOW',
        priority: 'HIGH',
        reversibility: ReversibilityType.REVERSIBLE,
        blastRadius: BlastRadius.LOCAL,
      });

      // Create high risk, high cost, low confidence proposal
      await ciService.createProposal({
        companyId: compA,
        title: 'Complete Rewrite of Messaging Layer',
        description: 'Migrate to experimental actor framework',
        problem: 'Messaging queue throughput scaling',
        observedSignal: 'Occasional queue lag under synthetic stress',
        hypothesis: 'Rewriting whole layer will increase throughput by 20%',
        proposedChange: 'Replace entire message broker',
        expectedImpact: '20% throughput increase',
        expectedMetric: 'msg_throughput',
        baseline: 1000,
        target: 1200,
        confidence: 40,
        risk: 'CRITICAL',
        priority: 'LOW',
        reversibility: ReversibilityType.IRREVERSIBLE,
        blastRadius: BlastRadius.ENTERPRISE,
      });

      const ranking = await ciService.rankImprovementOpportunities(compA);

      expect(ranking.candidateCount).toBe(2);
      expect(ranking.rankedProposals.length).toBe(2);

      const top = ranking.rankedProposals[0];
      const bottom = ranking.rankedProposals[1];

      expect(top.proposal.title).toBe('Optimize Database Indexing');
      expect(bottom.proposal.title).toBe('Complete Rewrite of Messaging Layer');

      // Top proposal must significantly outscore bottom proposal
      expect(top.ranking.compositeScore).toBeGreaterThan(bottom.ranking.compositeScore);

      // Verify explainability breakdown
      expect(top.rankReasoning).toContain('Benefit');
      expect(top.rankReasoning).toContain('Confidence');
      expect(top.rankReasoning).toContain('Risk');
      expect(top.ranking.riskPenalty).toBe(1.0); // LOW risk penalty
      expect(bottom.ranking.riskPenalty).toBe(0.2); // CRITICAL risk penalty
      expect(ranking.summary).toContain('Optimize Database Indexing');
    });

    it('respects company isolation during ranking', async () => {
      await ciService.createProposal({
        companyId: compA,
        title: 'Company A Secret Process',
        description: 'Confidential workflow',
        problem: 'Alpha bottleneck',
        observedSignal: 'Signal Alpha',
        hypothesis: 'Fix Alpha',
        proposedChange: 'Change Alpha',
        expectedImpact: 'Impact Alpha',
        expectedMetric: 'metric_a',
        baseline: 100,
        target: 50,
        confidence: 80,
        risk: 'LOW',
      });

      await ciService.createProposal({
        companyId: compB,
        title: 'Company B Independent Process',
        description: 'Independent workflow',
        problem: 'Beta bottleneck',
        observedSignal: 'Signal Beta',
        hypothesis: 'Fix Beta',
        proposedChange: 'Change Beta',
        expectedImpact: 'Impact Beta',
        expectedMetric: 'metric_b',
        baseline: 200,
        target: 100,
        confidence: 80,
        risk: 'LOW',
      });

      const rankingA = await ciService.rankImprovementOpportunities(compA);
      const rankingB = await ciService.rankImprovementOpportunities(compB);

      expect(rankingA.candidateCount).toBe(1);
      expect(rankingA.rankedProposals[0].proposal.title).toBe('Company A Secret Process');

      expect(rankingB.candidateCount).toBe(1);
      expect(rankingB.rankedProposals[0].proposal.title).toBe('Company B Independent Process');
    });
  });

  // =========================================================================
  // 2. Anti-Thrashing & Anti-Oscillation Protection (Capability 15)
  // =========================================================================
  describe('2. Anti-Thrashing & Oscillation Dampening', () => {
    it('detects recurring failures and activates cooldown and Chairman escalation', async () => {
      const entity = 'TASK_ROUTER_MODULE';

      // Initially no oscillation
      const initial = await ciService.detectOscillation(compA, entity);
      expect(initial.isOscillating).toBe(false);
      expect(initial.requiresChairmanReview).toBe(false);

      // Record first failure
      ciService.recordNegativeEvent(compA, entity, 'FAILURE');
      const afterOne = await ciService.detectOscillation(compA, entity);
      expect(afterOne.failureCount).toBe(1);
      expect(afterOne.isOscillating).toBe(false);

      // Record second failure -> triggers anti-thrashing oscillation
      ciService.recordNegativeEvent(compA, entity, 'FAILURE');
      const afterTwo = await ciService.detectOscillation(compA, entity);
      expect(afterTwo.failureCount).toBe(2);
      expect(afterTwo.isOscillating).toBe(true);
      expect(afterTwo.cooldownUntil).toBeDefined();
      expect(afterTwo.cooldownUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(afterTwo.reason).toContain('Anti-thrashing triggered');

      // Attempting to create an autonomous proposal during active cooldown throws BadRequestException
      await expect(
        ciService.createProposal({
          companyId: compA,
          title: 'Auto Retry for TASK_ROUTER_MODULE',
          description: 'Try again automatically',
          problem: 'Issue with TASK_ROUTER_MODULE',
          observedSignal: 'Failure recurrence',
          hypothesis: 'Maybe works this time',
          proposedChange: 'Tweak parameters',
          expectedImpact: 'Better routing',
          expectedMetric: 'routing_success',
          baseline: 50,
          target: 90,
          confidence: 70,
          risk: 'MEDIUM',
          targetDomain: entity,
          actorId: workerId,
        }),
      ).rejects.toThrow(BadRequestException);

      // Record third negative event (rollback) -> escalates to Chairman review and 30m cooldown
      ciService.recordNegativeEvent(compA, entity, 'ROLLBACK');
      const afterThree = await ciService.detectOscillation(compA, entity);
      expect(afterThree.requiresChairmanReview).toBe(true);
      expect(afterThree.reason).toContain('Escalated to Chairman review');
      expect(afterThree.cooldownUntil!.getTime() - Date.now()).toBeGreaterThan(25 * 60 * 1000);
    });
  });

  // =========================================================================
  // 3. Execution-Time Governance Hardening (Capability 11 & 18)
  // =========================================================================
  describe('3. Execution Guarding & Authority Boundary Verification', () => {
    it('blocks execution when company is under EMERGENCY_STOP unconditionally', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Emergency Safety Test Proposal',
        description: 'Test',
        problem: 'Problem',
        observedSignal: 'Signal',
        hypothesis: 'Hypothesis',
        proposedChange: 'Change',
        expectedImpact: 'Impact',
        expectedMetric: 'metric',
        baseline: 10,
        target: 20,
        confidence: 80,
        risk: 'LOW',
      });

      // Approve proposal
      await ciService.approveProposal(prop.id, chairmanId, { approverTier: AuthorityTier.CHAIRMAN });

      // Put company in EMERGENCY_STOP
      companiesStore.get(compA).emergencyStatus = EmergencyState.EMERGENCY_STOP;

      // Execution attempt must fail closed unconditionally
      await expect(ciService.executeProposal(prop.id, compA)).rejects.toThrow(ForbiddenException);
    });

    it('rejects approval of CHAIRMAN_REQUIRED proposal by non-Chairman actor', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Chairman Tier Required Proposal',
        description: 'Critical operational restructuring',
        problem: 'Enterprise critical bottleneck',
        observedSignal: 'Signal',
        hypothesis: 'Hypothesis',
        proposedChange: 'High risk restructure',
        expectedImpact: 'Impact',
        expectedMetric: 'metric',
        baseline: 10,
        target: 20,
        confidence: 80,
        risk: 'CRITICAL',
      });

      expect(prop.authorityRequirement).toBe(ProposalAuthorityRequirement.CHAIRMAN_REQUIRED);

      // CRITICAL proposals have MANDATORY simulation requirement
      await ciService.simulateProposal(compA, prop.id, workerId);

      // Attempt to approve with CEO tier must be rejected
      await expect(
        ciService.approveProposal(prop.id, ceoId, { approverTier: AuthorityTier.CEO }),
      ).rejects.toThrow(ForbiddenException);

      // Approving with Chairman succeeds
      const approved = await ciService.approveProposal(prop.id, chairmanId, {
        approverTier: AuthorityTier.CHAIRMAN,
      });
      expect(approved.status).toBe(ImprovementStatus.APPROVED);
    });

    it('rejects execution of constitutional change by non-Chairman actor', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Modify Chairman Sovereignty and Rules',
        description: 'Constitutional amendment',
        problem: 'Constitutional boundaries',
        observedSignal: 'Signal',
        hypothesis: 'Hypothesis',
        proposedChange: 'Override Chairman sovereignty',
        expectedImpact: 'Autonomous override',
        expectedMetric: 'autonomy',
        baseline: 1,
        target: 10,
        confidence: 90,
        risk: 'CRITICAL',
        targetDomain: TargetDomain.CONSTITUTIONAL_CHANGE,
      });

      // For test setup: force approved state
      proposalsStore.get(prop.id).status = ImprovementStatus.APPROVED;

      // Executing with worker or CEO tier must be rejected
      await expect(
        ciService.executeProposal(prop.id, compA, {
          actorId: ceoId,
          actorTier: AuthorityTier.CEO,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates parameter hash integrity on execution when expectedParametersHash is provided', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Secure Parameter Bound Optimization',
        description: 'Strict parameters',
        problem: 'Parameter drift check',
        observedSignal: 'Signal',
        hypothesis: 'Hypothesis',
        proposedChange: 'Change exact parameters',
        expectedImpact: 'Impact',
        expectedMetric: 'param_metric',
        baseline: 100,
        target: 200,
        confidence: 85,
        risk: 'LOW',
      });

      await ciService.approveProposal(prop.id, chairmanId);

      // Compute correct canonical proposal hash
      const correctHash = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            title: prop.title,
            problem: prop.problem,
            proposedChange: prop.proposedChange,
            baseline: prop.baseline,
            target: prop.target,
          }),
        )
        .digest('hex');

      // Mismatched hash fails closed
      await expect(
        ciService.executeProposal(prop.id, compA, {
          expectedParametersHash: 'invalid-tampered-hash-value',
        }),
      ).rejects.toThrow(BadRequestException);

      // Valid hash succeeds
      const executed = await ciService.executeProposal(prop.id, compA, {
        expectedParametersHash: correctHash,
        authorityProofId: 'proof-bound-valid',
      });

      expect(executed.status).toBe(ImprovementStatus.EXECUTING);
      expect(executed.validationStatus).toBe(ProposalValidationStatus.OBSERVING);
    });
  });

  // =========================================================================
  // 4. Governed End-to-End Self-Improvement Lifecycle (All Stages)
  // =========================================================================
  describe('4. Governed Self-Improvement Lifecycle Orchestration', () => {
    it('runs full governed self-improvement cycle: observe -> rank -> simulate -> authorize -> execute -> verify -> learn -> reconcile', async () => {
      // Seed an approved workforce improvement proposal
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Optimize Workforce Assignment',
        description: 'Dynamic dispatching based on skill match',
        problem: 'Suboptimal employee capability routing',
        observedSignal: 'Task completion variance',
        hypothesis: 'Heuristic skill matching improves completion rate to 95%',
        proposedChange: 'Activate capability-based dispatching algorithm',
        expectedImpact: '15% efficiency increase',
        expectedMetric: 'completion_rate_pct',
        baseline: 80,
        target: 95,
        confidence: 85,
        risk: 'LOW',
        targetDomain: TargetDomain.WORKFORCE_ASSIGNMENT,
        simulationRequirement: 'RECOMMENDED',
      });

      await ciService.approveProposal(prop.id, chairmanId, { approverTier: AuthorityTier.CHAIRMAN });

      const cycleResult = await ciService.runGovernedSelfImprovementCycle(compA, workerId, {
        autoExecuteIfAuthorized: true,
        targetProposalId: prop.id,
        simulatedMetricResult: 96, // Exceeds target 95 -> successful verification
      });

      expect(cycleResult.status).toBe('COMPLETED');
      expect(cycleResult.stages.evaluate.candidateCount).toBeGreaterThanOrEqual(1);

      // Simulate stage verified
      expect(cycleResult.stages.simulate?.simulated).toBe(true);
      expect(cycleResult.stages.simulate?.confidenceScore).toBe(0.88);

      // Authorize & Execute stages verified
      expect(cycleResult.stages.authorize?.authorized).toBe(true);
      expect(cycleResult.stages.execute?.executed).toBe(true);

      // Verify stage verified
      expect(cycleResult.stages.verify?.verified).toBe(true);
      expect(cycleResult.stages.verify?.validationStatus).toBe(ProposalValidationStatus.VALIDATED);

      // Learning stage verified: workforce reliability updated
      expect(cycleResult.stages.learn?.workforceUpdated).toBe(true);
      expect(cycleResult.stages.learn?.newReliability).toBe(77); // 75 + 2

      // Reconcile stage verified: anti-entropy scan executed
      expect(cycleResult.stages.reconcile).toBeDefined();
    });

    it('immediately halts self-improvement cycle when company is in EMERGENCY_STOP', async () => {
      companiesStore.get(compA).emergencyStatus = EmergencyState.EMERGENCY_STOP;

      const cycleResult = await ciService.runGovernedSelfImprovementCycle(compA, workerId);

      expect(cycleResult.status).toBe('HALTED');
      expect(cycleResult.reason).toContain('EMERGENCY_STOP');
      expect(cycleResult.stages.evaluate.candidateCount).toBe(0);
    });

    it('escalates to Chairman when unapproved proposal requires sovereign Chairman authority', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Enterprise Capital Reallocation Proposal',
        description: 'Massive capital movement',
        problem: 'Capital efficiency',
        observedSignal: 'Idle cash',
        hypothesis: 'Deploy idle capital',
        proposedChange: 'Move 50% treasury',
        expectedImpact: 'Higher yield',
        expectedMetric: 'yield_pct',
        baseline: 2,
        target: 8,
        confidence: 70,
        risk: 'CRITICAL',
        blastRadius: BlastRadius.ENTERPRISE,
      });

      const cycleResult = await ciService.runGovernedSelfImprovementCycle(compA, workerId, {
        autoExecuteIfAuthorized: true,
        targetProposalId: prop.id,
      });

      expect(cycleResult.status).toBe('ESCALATED_TO_CHAIRMAN');
      expect(cycleResult.stages.authorize?.authorized).toBe(false);
      expect(cycleResult.stages.execute).toBeUndefined();
      expect(cycleResult.reason).toContain('requires sovereign Chairman approval');
    });

    it('halts cycle and does not report COMPLETED when outcome verification fails', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Failing Metric Improvement Proposal',
        description: 'Test proposal that fails validation',
        problem: 'Performance lag',
        observedSignal: 'Latency',
        hypothesis: 'Tuning will fix',
        proposedChange: 'Tune settings',
        expectedImpact: 'Faster',
        expectedMetric: 'speed',
        baseline: 50,
        target: 100,
        confidence: 80,
        risk: 'LOW',
      });

      await ciService.approveProposal(prop.id, chairmanId, { approverTier: AuthorityTier.CHAIRMAN });

      const cycleResult = await ciService.runGovernedSelfImprovementCycle(compA, workerId, {
        autoExecuteIfAuthorized: true,
        targetProposalId: prop.id,
        simulatedMetricResult: 40, // Failed: target was 100
      });

      expect(cycleResult.status).toBe('HALTED');
      expect(cycleResult.reason).toContain('Outcome verification failed');
      expect(cycleResult.stages.verify?.verified).toBe(false);
      expect(cycleResult.stages.verify?.validationStatus).toBe(ProposalValidationStatus.FAILED);
    });

    it('sets status to OBSERVING when executed without immediate outcome verification', async () => {
      const prop = await ciService.createProposal({
        companyId: compA,
        title: 'Long Running Observation Proposal',
        description: 'Requires multi-day observation',
        problem: 'Long term metric',
        observedSignal: 'Signal',
        hypothesis: 'Hypothesis',
        proposedChange: 'Long change',
        expectedImpact: 'Long impact',
        expectedMetric: 'long_metric',
        baseline: 10,
        target: 20,
        confidence: 80,
        risk: 'LOW',
      });

      await ciService.approveProposal(prop.id, chairmanId, { approverTier: AuthorityTier.CHAIRMAN });

      const cycleResult = await ciService.runGovernedSelfImprovementCycle(compA, workerId, {
        autoExecuteIfAuthorized: true,
        targetProposalId: prop.id,
        // No simulatedMetricResult -> enters observation window
      });

      expect(cycleResult.status).toBe('OBSERVING');
      expect(cycleResult.stages.execute?.executed).toBe(true);
      expect(cycleResult.stages.verify).toBeUndefined();
      expect(cycleResult.reason).toContain('outcome verification window in progress');
    });
  });
});

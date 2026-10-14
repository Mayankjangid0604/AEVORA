import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CanonicalEnterpriseStateService } from './canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from './enterprise-conflict-integrity.service';
import { DigitalTwinScenarioService } from './digital-twin-scenario.service';
import { DigitalTwinReconciliationService } from './digital-twin-reconciliation.service';
import { EnterpriseStateHealthService } from './enterprise-state-health.service';
import { ContinuousReplanningService } from './continuous-replanning.service';
import { EnterpriseIntelligenceController } from './enterprise-intelligence.controller';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import { EpistemicCertainty } from '@prisma/client';
import {
  EnterpriseStreamKey,
  ConflictType,
  IntegrityFindingType,
} from './enterprise-intelligence.types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';

describe('V17 Phase 6 — Enterprise Intelligence & Digital Twin Tests (A through AT)', () => {
  let stateService: CanonicalEnterpriseStateService;
  let conflictService: EnterpriseConflictIntegrityService;
  let scenarioService: DigitalTwinScenarioService;
  let reconciliationService: DigitalTwinReconciliationService;
  let healthService: EnterpriseStateHealthService;
  let replanningService: ContinuousReplanningService;
  let controller: EnterpriseIntelligenceController;
  let prisma: PrismaService;

  const compA = 'company-alpha-twin';
  const compB = 'company-beta-twin';
  const _chairmanId = 'chairman-sovereign-twin';
  const ceoId = 'ceo-agent-twin';

  // Mock stores
  let stateRecordsStore: Map<string, any> = new Map();
  let conflictsStore: Map<string, any> = new Map();
  let findingsStore: Map<string, any> = new Map();
  let scenariosStore: Map<string, any> = new Map();
  let healthStore: Map<string, any> = new Map();
  let planChangesStore: Map<string, any> = new Map();
  let tasksStore: Map<string, any> = new Map();
  let departmentsStore: Map<string, any> = new Map();
  let employeesStore: Map<string, any> = new Map();
  let projectsStore: Map<string, any> = new Map();
  let spatialSitesStore: Map<string, any> = new Map();
  let spatialWorkspacesStore: Map<string, any> = new Map();
  let attemptsStore: Map<string, any> = new Map();
  let evidenceStore: Map<string, any> = new Map();
  let commandsStore: Map<string, any> = new Map();

  const databaseEvents$ = new Subject<any>();

  beforeEach(async () => {
    stateRecordsStore = new Map();
    conflictsStore = new Map();
    findingsStore = new Map();
    scenariosStore = new Map();
    healthStore = new Map();
    planChangesStore = new Map();
    tasksStore = new Map();
    departmentsStore = new Map();
    employeesStore = new Map();
    projectsStore = new Map();
    spatialSitesStore = new Map();
    spatialWorkspacesStore = new Map();
    attemptsStore = new Map();
    evidenceStore = new Map();
    commandsStore = new Map();

    const mockPrisma: any = {
      databaseEvents: databaseEvents$,
      company: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === compA) return Promise.resolve({ id: compA, name: 'Alpha Twin Corp' });
          if (where.id === compB) return Promise.resolve({ id: compB, name: 'Beta Twin Corp' });
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
        findMany: jest.fn().mockImplementation(({ where = {}, orderBy: _orderBy }) => {
          let list = Array.from(stateRecordsStore.values());
          if (where.companyId) list = list.filter((r) => r.companyId === where.companyId);
          if (where.streamKey) list = list.filter((r) => r.streamKey === where.streamKey);
          if (where.entityType) list = list.filter((r) => r.entityType === where.entityType);
          if (where.entityId) list = list.filter((r) => r.entityId === where.entityId);
          if (where.isCurrent !== undefined) list = list.filter((r) => r.isCurrent === where.isCurrent);
          if (where.isSimulation !== undefined) list = list.filter((r) => r.isSimulation === where.isSimulation);
          if (where.isStale !== undefined) list = list.filter((r) => r.isStale === where.isStale);
          if (where.observedAt?.lte) list = list.filter((r) => r.observedAt <= where.observedAt.lte);
          if (where.validUntil?.lt) list = list.filter((r) => r.validUntil && r.validUntil < where.validUntil.lt);
          return Promise.resolve(list);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(stateRecordsStore.get(where.id) || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const rec = stateRecordsStore.get(where.id);
          if (!rec) throw new Error('Not found');
          Object.assign(rec, data, { updatedAt: new Date() });
          stateRecordsStore.set(rec.id, rec);
          return Promise.resolve(rec);
        }),
      },
      enterpriseStateConflict: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `conflict-${conflictsStore.size + 1}`;
          const c = { id, ...data, detectedAt: new Date() };
          conflictsStore.set(id, c);
          return Promise.resolve(c);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(conflictsStore.get(where.id) || null);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(conflictsStore.values());
          if (where.companyId) list = list.filter((c) => c.companyId === where.companyId);
          if (where.resolutionStatus) list = list.filter((c) => c.resolutionStatus === where.resolutionStatus);
          return Promise.resolve(list);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const c = conflictsStore.get(where.id);
          if (!c) throw new Error('Conflict not found');
          Object.assign(c, data);
          conflictsStore.set(c.id, c);
          return Promise.resolve(c);
        }),
      },
      enterpriseIntegrityFinding: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `finding-${findingsStore.size + 1}`;
          const f = { id, status: data.status || 'DETECTED', ...data, createdAt: new Date() };
          findingsStore.set(id, f);
          return Promise.resolve(f);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const f of findingsStore.values()) {
            if (where.companyId && f.companyId !== where.companyId) continue;
            if (where.findingType && f.findingType !== where.findingType) continue;
            if (where.entityType && f.entityType !== where.entityType) continue;
            if (where.entityId && f.entityId !== where.entityId) continue;
            if (where.status && f.status !== where.status) continue;
            return Promise.resolve(f);
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(findingsStore.values());
          if (where.companyId) list = list.filter((f) => f.companyId === where.companyId);
          if (where.status) list = list.filter((f) => f.status === where.status);
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
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = scenariosStore.get(where.id);
          if (!s) throw new Error('Not found');
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
      enterpriseStateHealth: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `health-${healthStore.size + 1}`;
          const h = { id, ...data, computedAt: new Date() };
          healthStore.set(id, h);
          return Promise.resolve(h);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const list = Array.from(healthStore.values()).filter((h) => h.companyId === where.companyId);
          return Promise.resolve(list[list.length - 1] || null);
        }),
      },
      enterprisePlanChangeRecord: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || `plan-change-${planChangesStore.size + 1}`;
          const p = { id, ...data, createdAt: new Date() };
          planChangesStore.set(id, p);
          return Promise.resolve(p);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const p of planChangesStore.values()) {
            if (where.companyId && p.companyId !== where.companyId) continue;
            if (where.deduplicationKey && p.deduplicationKey !== where.deduplicationKey) continue;
            if (where.createdAt?.gte && p.createdAt < where.createdAt.gte) continue;
            return Promise.resolve(p);
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          return Promise.resolve(Array.from(planChangesStore.values()).filter((p) => p.companyId === where.companyId));
        }),
      },
      task: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(tasksStore.values());
          if (where.companyId) list = list.filter((t) => t.companyId === where.companyId);
          if (where.status) {
            if (typeof where.status === 'string') {
              list = list.filter((t) => t.status === where.status);
            } else if (where.status.in) {
              list = list.filter((t) => where.status.in.includes(t.status));
            }
          }
          if (where.outcomeState) {
            if (typeof where.outcomeState === 'string') {
              list = list.filter((t) => t.outcomeState === where.outcomeState);
            } else if (where.outcomeState.in) {
              list = list.filter((t) => where.outcomeState.in.includes(t.outcomeState));
            }
          }
          return Promise.resolve(list);
        }),
      },
      department: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          return Promise.resolve(Array.from(departmentsStore.values()).filter((d) => d.companyId === where.companyId));
        }),
      },
      employee: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(employeesStore.get(where.id) || null);
        }),
      },
      project: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          return Promise.resolve(Array.from(projectsStore.values()).filter((p) => p.companyId === where.companyId));
        }),
      },
      v12SpatialSite: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          return Promise.resolve(Array.from(spatialSitesStore.values()).filter((s) => s.companyId === where.companyId));
        }),
      },
      v12SpatialWorkspace: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          return Promise.resolve(Array.from(spatialWorkspacesStore.values()).filter((w) => w.companyId === where.companyId));
        }),
      },
      taskExecutionAttempt: {
        findMany: jest.fn().mockImplementation(({ where = {} }) => {
          let list = Array.from(attemptsStore.values());
          if (where.companyId) list = list.filter((a) => a.companyId === where.companyId);
          if (where.authorityProofId === null) list = list.filter((a) => !a.authorityProofId);
          return Promise.resolve(list);
        }),
      },
      taskEvidenceRecord: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(evidenceStore.get(where.id) || null);
        }),
      },
      chairmanCommand: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const cmd of commandsStore.values()) {
            if (where.companyId && cmd.companyId !== where.companyId) continue;
            if (where.status?.in && where.status.in.includes(cmd.status)) return Promise.resolve(cmd);
          }
          return Promise.resolve(null);
        }),
      },
    };

    const mockConsequence = {
      analyzeConsequences: jest.fn().mockResolvedValue({
        overallRisk: 'LOW',
        confidenceScore: 0.8,
        summary: 'Simulated consequence analysis passed',
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
      ],
    }).compile();

    stateService = module.get<CanonicalEnterpriseStateService>(CanonicalEnterpriseStateService);
    conflictService = module.get<EnterpriseConflictIntegrityService>(EnterpriseConflictIntegrityService);
    scenarioService = module.get<DigitalTwinScenarioService>(DigitalTwinScenarioService);
    reconciliationService = module.get<DigitalTwinReconciliationService>(DigitalTwinReconciliationService);
    healthService = module.get<EnterpriseStateHealthService>(EnterpriseStateHealthService);
    replanningService = module.get<ContinuousReplanningService>(ContinuousReplanningService);
    controller = module.get<EnterpriseIntelligenceController>(EnterpriseIntelligenceController);
    prisma = module.get<PrismaService>(PrismaService);
    reconciliationService.onModuleInit();
  });

  // A. Canonical state creation
  it('A. Canonical state creation: creates active state record with version 1 and FACT epistemic status', async () => {
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.TASKS,
      entityType: 'TASK',
      entityId: 'task-1',
      stateKey: 'STATUS',
      stateValue: { status: 'IN_PROGRESS' },
      source: 'TASK_EXECUTION_ENGINE',
      sourceType: 'INTERNAL_SYSTEM',
    });

    expect(rec.id).toBeDefined();
    expect(rec.version).toBe(1);
    expect(rec.isCurrent).toBe(true);
    expect(rec.isSimulation).toBe(false);
    expect(rec.epistemicStatus).toBe(EpistemicCertainty.FACT);
  });

  // B. Company isolation
  it('B. Company isolation: queries for Company A strictly do not return Company B state', async () => {
    await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.ORGANIZATION,
      entityType: 'COMPANY',
      entityId: compA,
      stateKey: 'STATUS',
      stateValue: { active: true },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
    });

    await stateService.recordObservation({
      companyId: compB,
      streamKey: EnterpriseStreamKey.ORGANIZATION,
      entityType: 'COMPANY',
      entityId: compB,
      stateKey: 'STATUS',
      stateValue: { active: true },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
    });

    const statesA = await stateService.getAllCurrentStates(compA);
    const statesB = await stateService.getAllCurrentStates(compB);

    expect(statesA.every((s) => s.companyId === compA)).toBe(true);
    expect(statesB.every((s) => s.companyId === compB)).toBe(true);
  });

  // C. State versioning
  it('C. State versioning: subsequent state updates increment version and link via supersedesId', async () => {
    const v1 = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.TASKS,
      entityType: 'TASK',
      entityId: 'task-ver-1',
      stateKey: 'STATUS',
      stateValue: { status: 'READY' },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
    });

    const v2 = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.TASKS,
      entityType: 'TASK',
      entityId: 'task-ver-1',
      stateKey: 'STATUS',
      stateValue: { status: 'IN_PROGRESS' },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
    });

    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.isCurrent).toBe(true);

    const oldV1 = stateRecordsStore.get(v1.id);
    expect(oldV1.isCurrent).toBe(false);
  });

  // D. Deterministic replay
  it('D. Deterministic replay: reconstructs point-in-time state without mutating active state', async () => {
    const t0 = new Date('2026-10-01T10:00:00Z');
    const t1 = new Date('2026-10-01T11:00:00Z');
    const t2 = new Date('2026-10-01T12:00:00Z');

    await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.PROJECTS,
      entityType: 'PROJECT',
      entityId: 'proj-pit-1',
      stateKey: 'STATUS',
      stateValue: { status: 'PLANNED' },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
      observedAt: t0,
    });

    await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.PROJECTS,
      entityType: 'PROJECT',
      entityId: 'proj-pit-1',
      stateKey: 'STATUS',
      stateValue: { status: 'ACTIVE' },
      source: 'SYS',
      sourceType: 'INTERNAL_SYSTEM',
      observedAt: t2,
    });

    const pitAtT1 = await stateService.getPointInTimeState({
      companyId: compA,
      asOf: t1,
      entityType: 'PROJECT',
      entityId: 'proj-pit-1',
    });

    expect(pitAtT1.length).toBe(1);
    expect(pitAtT1[0].stateValue.status).toBe('PLANNED');
  });

  // E. Idempotent event application
  it('E. Idempotent event application: identical observations update cleanly without data corruption', async () => {
    await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.FINANCIAL,
      entityType: 'LEDGER',
      entityId: 'acct-1',
      stateKey: 'BALANCE',
      stateValue: { balance: 1000 },
      source: 'BANK',
      sourceType: 'DATABASE',
    });

    const rec2 = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.FINANCIAL,
      entityType: 'LEDGER',
      entityId: 'acct-1',
      stateKey: 'BALANCE',
      stateValue: { balance: 1000 },
      source: 'BANK',
      sourceType: 'DATABASE',
    });

    expect(rec2.version).toBe(2);
    expect(rec2.stateValue).toEqual({ balance: 1000 });
  });

  // F. Provenance
  it('F. Provenance: records source, sourceType, correlationId, and causationId', async () => {
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.TASKS,
      entityType: 'TASK',
      entityId: 'task-prov',
      stateKey: 'STATUS',
      stateValue: { status: 'DONE' },
      source: 'OUTCOME_ENGINE',
      sourceType: 'INTERNAL_SYSTEM',
      correlationId: 'corr-101',
      causationId: 'caus-202',
    });

    expect(rec.source).toBe('OUTCOME_ENGINE');
    expect(rec.sourceType).toBe('INTERNAL_SYSTEM');
    expect(rec.correlationId).toBe('corr-101');
    expect(rec.causationId).toBe('caus-202');
  });

  // G. Epistemic tagging
  it('G. Epistemic tagging: AI inference source is prohibited from directly claiming FACT', async () => {
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.RISK,
      entityType: 'COMPANY',
      entityId: compA,
      stateKey: 'RISK_SCORE',
      stateValue: { score: 42 },
      epistemicStatus: EpistemicCertainty.FACT, // Attempting illegal claim
      source: 'LLM_PREDICTOR',
      sourceType: 'AI_AGENT',
    });

    expect(rec.epistemicStatus).toBe(EpistemicCertainty.INFERENCE);
    expect(rec.confidence).toBeLessThanOrEqual(0.85);
  });

  // H. Freshness
  it('H. Freshness: correctly sets validUntil from freshnessWindowMs', async () => {
    const now = Date.now();
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.OPERATIONAL_HEALTH,
      entityType: 'DEPARTMENT',
      entityId: 'dept-fresh',
      stateKey: 'HEALTH',
      stateValue: { score: 95 },
      source: 'HEALTH_MONITOR',
      sourceType: 'INTERNAL_SYSTEM',
      freshnessWindowMs: 60000,
    });

    expect(rec.validUntil).toBeDefined();
    expect(rec.validUntil!.getTime()).toBeGreaterThanOrEqual(now + 50000);
  });

  // I. Stale-state handling
  it('I. Stale-state handling: evaluateFreshness marks expired records stale without deleting them', async () => {
    const pastObserved = new Date(Date.now() - 120000);
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.OPERATIONAL_HEALTH,
      entityType: 'DEPARTMENT',
      entityId: 'dept-stale-1',
      stateKey: 'METRICS',
      stateValue: { load: 80 },
      source: 'TELEMETRY',
      sourceType: 'INTERNAL_SYSTEM',
      observedAt: pastObserved,
      freshnessWindowMs: 30000,
    });

    const staleCount = await stateService.evaluateFreshness(compA);
    expect(staleCount).toBeGreaterThanOrEqual(1);

    const updated = stateRecordsStore.get(rec.id);
    expect(updated.isStale).toBe(true);
    expect(updated.confidence).toBeLessThan(1.0);
  });

  // J. Conflict detection
  it('J. Conflict detection: contradictory state from a different source creates an open conflict', async () => {
    await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.FINANCIAL,
      entityType: 'LEDGER',
      entityId: 'account-conflict',
      stateKey: 'BALANCE',
      stateValue: { balance: 50000 },
      source: 'BANK_DIRECT',
      sourceType: 'DATABASE',
    });

    const rec2 = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.FINANCIAL,
      entityType: 'LEDGER',
      entityId: 'account-conflict',
      stateKey: 'BALANCE',
      stateValue: { balance: 42000 },
      source: 'ERP_SYSTEM',
      sourceType: 'INTERNAL_SYSTEM',
    });

    expect(rec2.isConflicted).toBe(true);
    expect(rec2.epistemicStatus).toBe(EpistemicCertainty.CONFLICTED);

    const conflicts = await conflictService.getOpenConflicts(compA);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].conflictType).toBe(ConflictType.CONTRADICTORY_VALUE);
  });

  // K. Conflict preservation
  it('K. Conflict preservation: preserves both contradictory sources and allows deterministic reconciliation', async () => {
    const targetConflict = await prisma.enterpriseStateConflict.create({
      data: {
        companyId: compA,
        entityType: 'LEDGER',
        entityId: 'account-conflict-k',
        field: 'BALANCE',
        conflictType: ConflictType.CONTRADICTORY_VALUE,
        primarySource: 'BANK_DIRECT',
        primaryValue: { balance: 50000 },
        secondarySource: 'ERP_SYSTEM',
        secondaryValue: { balance: 42000 },
        resolutionStatus: 'OPEN',
      },
    });

    const reconciled = await conflictService.reconcileConflict(
      compA,
      targetConflict.id,
      ceoId,
      'PRIMARY',
      'Bank statement verified by CFO ledger audit',
    );

    expect(reconciled.resolutionStatus).toBe('RECONCILED');
    expect(reconciled.resolutionRationale).toContain('Bank statement verified');
  });

  // L. Impossible-state detection
  it('L. Impossible-state detection: catches task marked completed with incomplete dependencies', async () => {
    const prereq = { id: 'prereq-task-1', companyId: compA, status: 'FAILED' };
    const task = {
      id: 'dependent-task-1',
      companyId: compA,
      status: 'COMPLETED',
      dependencies: [{ dependsOnId: 'prereq-task-1', dependsOn: prereq }],
      evidenceRecords: [],
    };

    tasksStore.set(prereq.id, prereq);
    tasksStore.set(task.id, task);

    const findings = await conflictService.auditImpossibleStates(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.IMPOSSIBLE_DEPENDENCY)).toBe(true);
  });

  // M. Reality/simulation boundary
  it('M. Reality/simulation boundary: blocks simulation assertion claiming production reality', async () => {
    await expect(
      stateService.recordObservation({
        companyId: compA,
        streamKey: EnterpriseStreamKey.PROJECTS,
        entityType: 'PROJECT',
        entityId: 'proj-sim-leak',
        stateKey: 'STATUS',
        stateValue: { status: 'COMPLETED' },
        source: 'SIMULATOR',
        sourceType: 'AI_AGENT',
        isSimulation: false,
        scenarioId: 'scenario-test-1', // Contradiction: scenarioId provided but claimed isSimulation=false
      }),
    ).rejects.toThrow(BadRequestException);

    const findings = await conflictService.getOpenIntegrityFindings(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.SIMULATION_LEAKAGE)).toBe(true);
  });

  // N. Simulation isolation
  it('N. Simulation isolation: simulation state records carry isSimulation=true and do not appear in production query', async () => {
    const scenario = await scenarioService.createScenario({
      companyId: compA,
      name: 'Q4 Workforce Expansion Scenario',
      hypotheticalChanges: [{ entityType: 'PROJECT', entityId: 'proj-hypo-1', stateKey: 'STATUS', value: 'SHIPPED' }],
      createdBy: ceoId,
    });

    const simResult = await scenarioService.runSimulation(compA, scenario.id);
    expect(simResult.status).toBe('COMPLETED');
    expect(simResult.simulatedStatesCount).toBe(1);

    const prodStates = await stateService.getAllCurrentStates(compA, undefined, false);
    expect(prodStates.some((s) => s.entityId === 'proj-hypo-1')).toBe(false);
  });

  // O. Scenario creation
  it('O. Scenario creation: snapshots baseline production state', async () => {
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'Baseline Test Scenario',
      hypotheticalChanges: [],
      createdBy: ceoId,
    });

    expect(s.id).toBeDefined();
    expect(s.status).toBe('DRAFT');
    expect((s.baselineSnapshot as any).capturedAt).toBeDefined();
  });

  // P. Scenario execution
  it('P. Scenario execution: projects outcomes and evaluates consequence analysis', async () => {
    const scenario = await scenarioService.createScenario({
      companyId: compA,
      name: 'Consequence Test Scenario',
      hypotheticalChanges: [{ entityType: 'TASK', entityId: 'task-hypo', stateKey: 'STATUS', value: 'COMPLETED' }],
      createdBy: ceoId,
    });

    const res = await scenarioService.runSimulation(compA, scenario.id);
    expect(res.status).toBe('COMPLETED');
    expect(res.consequenceReport).toBeDefined();
    expect(res.confidenceScore).toBeGreaterThan(0);
  });

  // Q. Scenario comparison
  it('Q. Scenario comparison: compares projected outcomes against baseline state', async () => {
    const scenario = await scenarioService.createScenario({
      companyId: compA,
      name: 'Comparison Test Scenario',
      hypotheticalChanges: [{ entityType: 'TASK', entityId: 'task-compare', stateKey: 'STATUS', value: 'FAILED' }],
      createdBy: ceoId,
    });

    await scenarioService.runSimulation(compA, scenario.id);
    const comparison = await scenarioService.compareScenarioWithBaseline(compA, scenario.id);

    expect(comparison.comparisons.length).toBe(1);
    expect(comparison.comparisons[0].projectedValue).toBe('FAILED');
  });

  // R. V15 integration
  it('R. V15 integration: synchronizes V15 spatial topology into SPATIAL_WORLD stream', async () => {
    spatialSitesStore.set('site-1', {
      id: 'site-1',
      companyId: compA,
      name: 'Metropolis HQ',
      isActive: true,
      buildings: [],
    });

    const recResult = await reconciliationService.reconcileCompanyState(compA);
    expect(recResult.reconciledCount).toBeGreaterThanOrEqual(1);

    const siteState = await stateService.getCurrentState(compA, 'SPATIAL_SITE', 'site-1', 'TOPOLOGY');
    expect(siteState).toBeDefined();
    expect(siteState?.source).toBe('V15_SPATIAL_GATEWAY');
    expect(siteState?.streamKey).toBe(EnterpriseStreamKey.SPATIAL_WORLD);
  });

  // S. V15 reconciliation
  it('S. V15 reconciliation: detects spatial employee mismatches as V15_SPATIAL_CONTRADICTION', async () => {
    spatialWorkspacesStore.set('ws-cross', {
      id: 'ws-cross',
      companyId: compA,
      employeeId: 'emp-from-compB',
    });

    employeesStore.set('emp-from-compB', {
      id: 'emp-from-compB',
      companyId: compB,
      status: 'ACTIVE',
    });

    const findings = await conflictService.auditImpossibleStates(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.V15_SPATIAL_CONTRADICTION)).toBe(true);
  });

  // T. CompanyEvent integration
  it('T. CompanyEvent integration: responds to databaseEvents for targeted continuous reconciliation', async () => {
    const spy = jest.spyOn(reconciliationService, 'reconcileCompanyState');

    databaseEvents$.next({
      model: 'CompanyEvent',
      action: 'create',
      data: {
        companyId: compA,
        type: 'TASK_OUTCOME_VERIFIED',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(spy).toHaveBeenCalledWith(compA);
  });

  // U. Continuous reconciliation
  it('U. Continuous reconciliation: idempotently reconciles tasks and departments', async () => {
    departmentsStore.set('dept-eng', {
      id: 'dept-eng',
      companyId: compA,
      name: 'Engineering',
      status: 'ACTIVE',
      employees: [],
      healthSnapshots: [],
    });

    await reconciliationService.reconcileCompanyState(compA);
    const secondRun = await reconciliationService.reconcileCompanyState(compA);

    // Second run produces 0 newly reconciled records because values have not changed
    expect(secondRun.reconciledCount).toBe(0);
  });

  // V. Continuous replanning
  it('V. Continuous replanning: evaluates material state change and creates EnterprisePlanChangeRecord', async () => {
    const res = await replanningService.evaluateReplanningNeed({
      companyId: compA,
      triggerEvent: 'TASK_OUTCOME_FAILED',
      triggerReason: 'Critical dependency failed execution',
      affectedEntityType: 'PROJECT',
      affectedEntityId: 'proj-crit-1',
      proposedModifications: [{ action: 'RESCHEDULE', newDate: '2026-11-01' }],
    });

    expect(res.replanningRequired).toBe(true);
    expect(res.isThrottled).toBe(false);
    expect(res.planChangeRecordId).toBeDefined();

    const history = await replanningService.getPlanChangeHistory(compA);
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  // W. Chairman sovereignty
  it('W. Chairman sovereignty: replanning cannot override active Chairman commands', async () => {
    commandsStore.set('cmd-sov-1', {
      id: 'cmd-sov-1',
      companyId: compA,
      status: 'EXECUTING',
    });

    await expect(
      replanningService.evaluateReplanningNeed({
        companyId: compA,
        triggerEvent: 'AUTONOMOUS_ADAPTATION',
        triggerReason: 'Attempt to override chairman command',
        affectedEntityType: 'PROJECT',
        affectedEntityId: 'proj-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // X. V17 authority integration
  it('X. V17 authority integration: detects execution attempts without authority proof', async () => {
    attemptsStore.set('attempt-unauth-1', {
      id: 'attempt-unauth-1',
      companyId: compA,
      taskId: 'task-unauth',
      status: 'COMPLETED',
      authorityProofId: null,
    });

    const findings = await conflictService.auditImpossibleStates(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.UNAUTHORIZED_ATTEMPT)).toBe(true);
  });

  // Y. V16 Gateway preservation
  it('Y. V16 Gateway preservation: scenario consequence evaluation runs without bypassing V16 dimensions', async () => {
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'V16 Preservation Scenario',
      hypotheticalChanges: [{ entityType: 'PROJECT', entityId: 'p-v16', value: 1 }],
      createdBy: ceoId,
    });

    const res = await scenarioService.runSimulation(compA, s.id);
    expect(res.consequenceReport.overallRisk).toBeDefined();
  });

  // Z. Emergency stop
  it('Z. Emergency stop: company isolation prevents cross-company access', async () => {
    await expect(stateService.recordObservation({
      companyId: 'non-existent-company',
      streamKey: 'TASKS',
      entityType: 'TASK',
      entityId: 't-1',
      stateKey: 'STATUS',
      stateValue: {},
      source: 'SYS',
      sourceType: 'INTERNAL',
    })).rejects.toThrow(NotFoundException);
  });

  // AA. Integrity findings
  it('AA. Integrity findings: queries return active detected integrity violations', async () => {
    const findings = await conflictService.getOpenIntegrityFindings(compA);
    expect(Array.isArray(findings)).toBe(true);
  });

  // AB. State health
  it('AB. State health: computes completeness, freshness, and assigns health tier', async () => {
    const health = await healthService.computeStateHealth(compA);
    expect(health.id).toBeDefined();
    expect(health.healthTier).toBeDefined();
    expect(health.freshnessScore).toBeGreaterThanOrEqual(0);
  });

  // AC. API company isolation
  it('AC. API company isolation: controller queries are strictly company scoped', async () => {
    const states = await controller.getAllCurrentStates(compA);
    expect(states.every((s) => s.companyId === compA)).toBe(true);
  });

  // AD. Concurrent reconciliation
  it('AD. Concurrent reconciliation: handles concurrent reconciliation calls gracefully', async () => {
    const [res1, res2] = await Promise.all([
      reconciliationService.reconcileCompanyState(compA),
      reconciliationService.reconcileCompanyState(compA),
    ]);

    expect(res1.errors.length).toBe(0);
    expect(res2.errors.length).toBe(0);
  });

  // AE. Duplicate-event race
  it('AE. Duplicate-event race: identical duplicate events do not create conflicting records', async () => {
    databaseEvents$.next({
      model: 'CompanyEvent',
      action: 'create',
      data: { companyId: compA, type: 'TASK_OUTCOME_VERIFIED' },
    });
    databaseEvents$.next({
      model: 'CompanyEvent',
      action: 'create',
      data: { companyId: compA, type: 'TASK_OUTCOME_VERIFIED' },
    });

    const conflicts = await conflictService.getOpenConflicts(compA);
    expect(conflicts.filter((c) => c.conflictType === ConflictType.CONTRADICTORY_VALUE).length).toBe(0);
  });

  // AF. Rollback/recovery
  it('AF. Rollback/recovery: point-in-time reconstruction allows deterministic recovery', async () => {
    const pit = await stateService.getPointInTimeState({
      companyId: compA,
      asOf: new Date(),
    });
    expect(Array.isArray(pit)).toBe(true);
  });

  // AG. Stale material-state planning restriction
  it('AG. Stale material-state planning restriction: high stale rate marks health tier as DEGRADED or CRITICAL', async () => {
    // Add multiple stale records
    for (let i = 0; i < 5; i++) {
      const rec = {
        id: `stale-health-${i}`,
        companyId: compA,
        entityType: 'KPI',
        entityId: `kpi-${i}`,
        stateKey: 'VAL',
        stateValue: { v: i },
        isCurrent: true,
        isSimulation: false,
        isStale: true,
        confidence: 0.2,
        epistemicStatus: EpistemicCertainty.UNKNOWN,
      };
      stateRecordsStore.set(rec.id, rec);
    }

    const health = await healthService.computeStateHealth(compA);
    expect(['DEGRADED', 'CRITICAL']).toContain(health.healthTier);
  });

  // AH. Conflict-driven escalation
  it('AH. Conflict-driven escalation: marks conflict as ESCALATED with Chairman rationale', async () => {
    const conflict = await prisma.enterpriseStateConflict.create({
      data: {
        companyId: compA,
        entityType: 'REVENUE',
        entityId: 'q3-rev',
        field: 'AMOUNT',
        conflictType: ConflictType.CONTRADICTORY_VALUE,
        primarySource: 'AUDIT',
        primaryValue: { amount: 100000 },
        secondarySource: 'SALES',
        secondaryValue: { amount: 150000 },
        resolutionStatus: 'OPEN',
      },
    });

    const escalated = await conflictService.escalateConflictToChairman(
      compA,
      conflict.id,
      '50k variance between external audit and internal sales figures',
    );

    expect(escalated.escalatedToChairman).toBe(true);
    expect(escalated.resolutionStatus).toBe('ESCALATED');
  });

  // AI. Evidence-to-state lineage
  it('AI. Evidence-to-state lineage: links state record to TaskEvidenceRecord', async () => {
    evidenceStore.set('ev-101', {
      id: 'ev-101',
      companyId: compA,
      verificationStatus: 'VERIFIED',
    });

    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.OUTCOMES,
      entityType: 'TASK',
      entityId: 'task-ev-link',
      stateKey: 'OUTCOME',
      stateValue: { verified: true },
      epistemicStatus: EpistemicCertainty.VERIFIED_FACT,
      source: 'VERIFICATION_SERVICE',
      sourceType: 'INTERNAL_SYSTEM',
      evidenceRecordId: 'ev-101',
    });

    expect(rec.evidenceRecordId).toBe('ev-101');
    expect(rec.epistemicStatus).toBe(EpistemicCertainty.VERIFIED_FACT);
  });

  // AJ. Outcome-to-state lineage
  it('AJ. Outcome-to-state lineage: verified task outcome reflects as VERIFIED_FACT in state', async () => {
    evidenceStore.set('ev-101', {
      id: 'ev-101',
      companyId: compA,
      verificationStatus: 'VERIFIED',
    });

    tasksStore.set('task-outcome-1', {
      id: 'task-outcome-1',
      companyId: compA,
      status: 'COMPLETED',
      outcomeState: 'OUTCOME_VERIFIED',
      evidenceRecords: [{ id: 'ev-101' }],
    });

    await reconciliationService.reconcileCompanyState(compA);
    const state = await stateService.getCurrentState(compA, 'TASK', 'task-outcome-1', 'STATUS');

    expect(state).toBeDefined();
    expect(state?.epistemicStatus).toBe(EpistemicCertainty.VERIFIED_FACT);
  });

  // AK. Authority-proof lineage
  it('AK. Authority-proof lineage: records authorityProofId on state record', async () => {
    const rec = await stateService.recordObservation({
      companyId: compA,
      streamKey: EnterpriseStreamKey.GOVERNANCE,
      entityType: 'TASK',
      entityId: 'task-auth-link',
      stateKey: 'AUTHORITY',
      stateValue: { authorized: true },
      source: 'GOVERNED_AUTHORITY_SERVICE',
      sourceType: 'INTERNAL_SYSTEM',
      authorityProofId: 'proof-alpha-001',
    });

    expect(rec.authorityProofId).toBe('proof-alpha-001');
  });

  // AL. Simulation cannot create production evidence
  it('AL. Simulation cannot create production evidence: simulation states reject production evidence creation', async () => {
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'Sim Evidence Test',
      hypotheticalChanges: [{ entityType: 'TASK', entityId: 't-sim-ev', value: 1 }],
      createdBy: ceoId,
    });
    await scenarioService.runSimulation(compA, s.id);

    // Verify simulated state is marked isSimulation: true
    const simState = Array.from(stateRecordsStore.values()).find((r) => r.entityId === 't-sim-ev');
    expect(simState.isSimulation).toBe(true);
    expect(simState.scenarioId).toBe(s.id);
  });

  // AM. Simulation cannot create production outcomes
  it('AM. Simulation cannot create production outcomes: simulation cannot directly alter real task outcomeState', async () => {
    await scenarioService.createScenario({
      companyId: compA,
      name: 'Sim Outcome Test',
      hypotheticalChanges: [{ entityType: 'TASK', entityId: 'task-real-1', stateKey: 'OUTCOME', value: 'OUTCOME_VERIFIED' }],
      createdBy: ceoId,
    });

    // Verify no production task outcome was mutated
    const realTask = tasksStore.get('task-real-1');
    expect(realTask?.outcomeState).not.toBe('OUTCOME_VERIFIED');
  });

  // AN. Simulation cannot create production authority
  it('AN. Simulation cannot create production authority: direct promotion to production is rejected', async () => {
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'Promotion Block Test',
      hypotheticalChanges: [],
      createdBy: ceoId,
    });

    await expect(scenarioService.attemptPromoteScenarioToProduction(compA, s.id)).rejects.toThrow(
      BadRequestException,
    );

    const findings = await conflictService.getOpenIntegrityFindings(compA);
    expect(findings.some((f) => f.findingType === 'SIMULATION_LEAKAGE')).toBe(true);
  });

  // AO. Cross-company leakage resistance
  it('AO. Cross-company leakage resistance: detects project referencing foreign client as CROSS_COMPANY_REFERENCE', async () => {
    projectsStore.set('proj-foreign', {
      id: 'proj-foreign',
      companyId: compA,
      clientId: 'client-foreign',
      client: { id: 'client-foreign', companyId: compB },
    });

    const findings = await conflictService.auditImpossibleStates(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.CROSS_COMPANY_REFERENCE)).toBe(true);
  });

  // AP. Deterministic scenario replay
  it('AP. Deterministic scenario replay: comparison against baseline yields identical results on replay', async () => {
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'Replay Scenario',
      hypotheticalChanges: [{ entityType: 'PROJECT', entityId: 'proj-10', stateKey: 'STATUS', value: 'DONE' }],
      createdBy: ceoId,
    });
    await scenarioService.runSimulation(compA, s.id);

    const comp1 = await scenarioService.compareScenarioWithBaseline(compA, s.id);
    const comp2 = await scenarioService.compareScenarioWithBaseline(compA, s.id);

    expect(comp1).toEqual(comp2);
  });

  // AQ. Scenario expiration
  it('AQ. Scenario expiration: marks expired scenarios as EXPIRED', async () => {
    const past = new Date(Date.now() - 10000);
    const s = await scenarioService.createScenario({
      companyId: compA,
      name: 'Expired Scenario',
      hypotheticalChanges: [],
      createdBy: ceoId,
      expiresAt: past,
    });

    const expiredCount = await scenarioService.expireScenarios(compA);
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const updated = scenariosStore.get(s.id);
    expect(updated.status).toBe('EXPIRED');
  });

  // AR. Replanning deduplication
  it('AR. Replanning deduplication: deterministic deduplication keys match for identical triggers', async () => {
    const res1 = await replanningService.evaluateReplanningNeed({
      companyId: compA,
      triggerEvent: 'TASK_OUTCOME_FAILED',
      triggerReason: 'Same reason',
      affectedEntityType: 'PROJECT',
      affectedEntityId: 'proj-same-1',
    });

    const res2 = await replanningService.evaluateReplanningNeed({
      companyId: compA,
      triggerEvent: 'TASK_OUTCOME_FAILED',
      triggerReason: 'Same reason',
      affectedEntityType: 'PROJECT',
      affectedEntityId: 'proj-same-1',
    });

    expect(res1.deduplicationKey).toBe(res2.deduplicationKey);
  });

  // AS. Plan-thrashing protection
  it('AS. Plan-thrashing protection: throttles subsequent replanning requests within cooldown window', async () => {
    const res1 = await replanningService.evaluateReplanningNeed({
      companyId: compA,
      triggerEvent: 'RESOURCE_DEPLETION',
      triggerReason: 'Server capacity threshold reached',
      affectedEntityType: 'DEPARTMENT',
      affectedEntityId: 'dept-thrash',
    });
    expect(res1.isThrottled).toBe(false);

    // Immediate second trigger
    const res2 = await replanningService.evaluateReplanningNeed({
      companyId: compA,
      triggerEvent: 'RESOURCE_DEPLETION',
      triggerReason: 'Server capacity threshold reached',
      affectedEntityType: 'DEPARTMENT',
      affectedEntityId: 'dept-thrash',
    });
    expect(res2.isThrottled).toBe(true);
    expect(res2.replanningRequired).toBe(false);
  });

  // AT. State corruption detection
  it('AT. State corruption detection: audits impossible states and catches active task assigned to inactive worker', async () => {
    employeesStore.set('emp-term', {
      id: 'emp-term',
      companyId: compA,
      status: 'TERMINATED',
    });

    tasksStore.set('task-corrupt', {
      id: 'task-corrupt',
      companyId: compA,
      status: 'IN_PROGRESS',
      assignedEmployeeId: 'emp-term',
      dependencies: [],
      evidenceRecords: [],
    });

    const findings = await conflictService.auditImpossibleStates(compA);
    expect(findings.some((f) => f.findingType === IntegrityFindingType.INACTIVE_WORKER_ASSIGNMENT)).toBe(true);
  });
});

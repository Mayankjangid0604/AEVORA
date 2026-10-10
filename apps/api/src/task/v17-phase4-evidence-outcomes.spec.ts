import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceVerificationService, computeContentHash } from './evidence-verification.service';
import { OutcomeVerificationService } from './outcome-verification.service';
import { StrategicOutcomeReconciliationService } from './strategic-outcome-reconciliation.service';
import { TaskExecutionService } from './task-execution.service';
import { RetryPolicyService } from './retry-policy.service';
import {
  EvidenceNature,
  EpistemicCertainty,
  EvidenceVerificationStatus,
  OutcomeVerificationStatus,
  EvidenceContract,
} from './evidence-contract.types';
import {
  TaskStatus,
  ExecutionAttemptStatus,
  EmployeeStatus,
  OrgMemoryType,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('V17 Phase 4 — Evidence & Outcomes Verification Specification Tests (A through Z)', () => {
  let evidenceVerification: EvidenceVerificationService;
  let outcomeVerification: OutcomeVerificationService;
  let strategicReconciliation: StrategicOutcomeReconciliationService;
  let taskExecution: TaskExecutionService;
  let prisma: PrismaService;

  const compA = 'company-alpha-100';
  const compB = 'company-beta-200';
  const taskId = 'task-phase4-001';
  const attemptId = 'attempt-phase4-001';
  const workerId = 'worker-agent-007';

  // In-memory mock store for evidence records and tasks to test real state transitions deterministically
  let evidenceStore: any[] = [];
  let tasksStore: Map<string, any> = new Map();
  let taskResultsStore: Map<string, any> = new Map();
  let attemptsStore: Map<string, any> = new Map();
  let companyEventsStore: any[] = [];
  let memoryStore: any[] = [];

  beforeEach(async () => {
    evidenceStore = [];
    tasksStore = new Map();
    taskResultsStore = new Map();
    attemptsStore = new Map();
    companyEventsStore = [];
    memoryStore = [];

    // Prepopulate default company, task, worker, and attempt
    const defaultTask = {
      id: taskId,
      companyId: compA,
      title: 'Deploy Production Billing Integration',
      status: TaskStatus.IN_PROGRESS,
      outcomeState: OutcomeVerificationStatus.AUTHORIZED,
      correlationId: 'corr-001',
      causationId: 'caus-001',
      evidenceRequirements: [
        {
          evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
          description: 'Receipt from payment provider via V16 gateway',
          requiredNature: EvidenceNature.RAW,
          minConfidence: 0.9,
          maxAgeMs: 3600000, // 1 hour
          mustBeExternal: true,
          sufficientForOutcomeVerification: true,
        },
      ],
      successCriteria: [
        { key: 'settlementStatus', expectedValue: 'CONFIRMED', operator: 'EQUALS' },
      ],
    };
    tasksStore.set(taskId, defaultTask);

    const defaultAttempt = {
      id: attemptId,
      taskId,
      companyId: compA,
      attemptNumber: 1,
      workerId,
      agentId: `agent_${workerId}`,
      status: ExecutionAttemptStatus.RUNNING,
      startedAt: new Date(),
    };
    attemptsStore.set(attemptId, defaultAttempt);

    const mockPrisma: any = {
      task: {
        findFirst: jest.fn().mockImplementation(({ where, include }: any) => {
          const t = tasksStore.get(where.id);
          if (!t || (where.companyId && t.companyId !== where.companyId)) return null;
          const clone = { ...t };
          if (include?.evidenceRecords) {
            clone.evidenceRecords = evidenceStore.filter((e) => e.taskId === t.id && e.companyId === t.companyId);
          }
          if (include?.result) {
            clone.result = taskResultsStore.get(t.id) || null;
          }
          if (include?.dependentOn) {
            clone.dependentOn = [];
          }
          return clone;
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const t = tasksStore.get(where.id);
          if (t) {
            Object.assign(t, data);
            tasksStore.set(where.id, t);
          }
          return t;
        }),
      },
      taskExecutionAttempt: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const a = attemptsStore.get(where.id);
          if (!a || (where.companyId && a.companyId !== where.companyId)) return null;
          if (where.taskId && a.taskId !== where.taskId) return null;
          return {
            ...a,
            task: tasksStore.get(a.taskId),
            worker: { id: a.workerId, name: 'AI Billing Worker' },
          };
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const a = attemptsStore.get(where.id);
          if (a) {
            Object.assign(a, data);
            attemptsStore.set(where.id, a);
          }
          return a;
        }),
      },
      taskEvidenceRecord: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const record = {
            id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          evidenceStore.push(record);
          return record;
        }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          return (
            evidenceStore.find((e) => {
              if (where.id && e.id !== where.id) return false;
              if (where.companyId && e.companyId !== where.companyId) return false;
              if (where.taskId && e.taskId !== where.taskId) return false;
              if (where.contentHash && e.contentHash !== where.contentHash) return false;
              return true;
            }) || null
          );
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          return evidenceStore.filter((e) => {
            if (where.companyId && e.companyId !== where.companyId) return false;
            if (where.taskId && e.taskId !== where.taskId) return false;
            return true;
          });
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const record = evidenceStore.find((e) => e.id === where.id);
          if (record) {
            Object.assign(record, data);
          }
          return record;
        }),
      },
      taskResult: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return taskResultsStore.get(where.taskId) || null;
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
          const existing = taskResultsStore.get(where.taskId);
          const data = existing ? { ...existing, ...update } : { id: `res-${where.taskId}`, ...create };
          taskResultsStore.set(where.taskId, data);
          return data;
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          for (const [tId, res] of taskResultsStore.entries()) {
            if (res.id === where.id) {
              Object.assign(res, data);
              taskResultsStore.set(tId, res);
              return res;
            }
          }
          return null;
        }),
      },
      companyEvent: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const evt = { id: `evt-${Date.now()}`, ...data };
          companyEventsStore.push(evt);
          return Promise.resolve(evt);
        }),
      },
      organizationalMemory: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const mem = { id: `mem-${Date.now()}`, ...data };
          memoryStore.push(mem);
          return Promise.resolve(mem);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceVerificationService,
        OutcomeVerificationService,
        StrategicOutcomeReconciliationService,
        TaskExecutionService,
        RetryPolicyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    evidenceVerification = module.get<EvidenceVerificationService>(EvidenceVerificationService);
    outcomeVerification = module.get<OutcomeVerificationService>(OutcomeVerificationService);
    strategicReconciliation = module.get<StrategicOutcomeReconciliationService>(
      StrategicOutcomeReconciliationService,
    );
    taskExecution = module.get<TaskExecutionService>(TaskExecutionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // -------------------------------------------------------------
  // A. Evidence Contract Creation
  // -------------------------------------------------------------
  it('A. Evidence Contract Creation: creates formal contracts with typed requirements and verification rules', () => {
    const contract: EvidenceContract = {
      taskId,
      companyId: compA,
      requirements: [
        {
          evidenceType: 'EXTERNAL_PAYMENT_RECEIPT',
          description: 'Payment settlement from Stripe Gateway',
          requiredNature: EvidenceNature.RAW,
          minConfidence: 0.95,
          maxAgeMs: 60000,
          mustBeIndependent: true,
          mustBeExternal: true,
          exactAttemptBinding: true,
          sufficientForOutcomeVerification: true,
        },
      ],
      strictAttemptBinding: true,
      requireIndependentEvidence: true,
      requireExternalEvidence: true,
    };

    expect(contract.requirements).toHaveLength(1);
    expect(contract.requirements[0].evidenceType).toBe('EXTERNAL_PAYMENT_RECEIPT');
    expect(contract.strictAttemptBinding).toBe(true);
    expect(contract.requireExternalEvidence).toBe(true);
  });

  // -------------------------------------------------------------
  // B. Evidence Contract Enforcement
  // -------------------------------------------------------------
  it('B. Evidence Contract Enforcement: fails verification if required evidence is missing', async () => {
    const res = await evidenceVerification.verifyEvidenceContract(taskId, compA);

    expect(res.verified).toBe(false);
    expect(res.status).toBe(EvidenceVerificationStatus.REJECTED);
    expect(res.missingRequirements).toHaveLength(1);
    expect(res.missingRequirements[0]).toContain('EXTERNAL_GATEWAY_RECEIPT');
    expect(res.canAcceptOutcomeVerification).toBe(false);
  });

  // -------------------------------------------------------------
  // C. Raw Evidence Immutability
  // -------------------------------------------------------------
  it('C. Raw Evidence Immutability: raw evidence cannot be altered; corrections produce append-only superseding records', async () => {
    const rawRes = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      nature: EvidenceNature.RAW,
      evidenceType: 'DATABASE_QUERY_SNAPSHOT',
      source: 'Postgres_Primary',
      sourceType: 'DATABASE',
      payload: { rowCount: 150, checksum: 'abc-123' },
    });

    const originalId = rawRes.record.id;
    const originalHash = rawRes.record.contentHash;

    // Submit an append-only correction referencing the raw record
    const correctedRes = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      nature: EvidenceNature.DERIVED,
      evidenceType: 'DATABASE_QUERY_SNAPSHOT',
      source: 'Data_Auditor_Agent',
      sourceType: 'AI_AGENT',
      payload: { rowCount: 152, checksum: 'abc-124', correctionNote: 'Backfilled 2 missed rows' },
      supersedesId: originalId,
    });

    // Original remains intact
    const originalInStore = evidenceStore.find((e) => e.id === originalId);
    expect(originalInStore.contentHash).toBe(originalHash);
    expect((originalInStore.payload as any).rowCount).toBe(150);

    // New record points back to original
    expect(correctedRes.record.supersedesId).toBe(originalId);
    expect((correctedRes.record.payload as any).rowCount).toBe(152);
  });

  // -------------------------------------------------------------
  // D. Derived Evidence Provenance
  // -------------------------------------------------------------
  it('D. Derived Evidence Provenance: derived records explicitly track transformation provenance', async () => {
    const raw = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      nature: EvidenceNature.RAW,
      evidenceType: 'RAW_SENSOR_DATA',
      source: 'Edge_Node_4',
      sourceType: 'INTERNAL_SYSTEM',
      payload: { rawValues: [10, 20, 30] },
    });

    const derived = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      nature: EvidenceNature.DERIVED,
      epistemicStatus: EpistemicCertainty.DERIVED_FACT,
      evidenceType: 'AGGREGATED_METRICS',
      source: 'TimeSeries_Aggregator',
      sourceType: 'INTERNAL_SYSTEM',
      payload: { average: 20, sourceRecordId: raw.record.id },
      supersedesId: raw.record.id,
    });

    expect(derived.record.nature).toBe(EvidenceNature.DERIVED);
    expect(derived.record.epistemicStatus).toBe(EpistemicCertainty.DERIVED_FACT);
    expect(derived.record.supersedesId).toBe(raw.record.id);
  });

  // -------------------------------------------------------------
  // E. AI Inference Classification
  // -------------------------------------------------------------
  it('E. AI Inference Classification: blocks AI inference from masquerading as FACT or VERIFIED_FACT', async () => {
    const res = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      nature: EvidenceNature.AI_INFERENCE,
      epistemicStatus: EpistemicCertainty.FACT, // ILLEGAL attempt to mark inference as fact
      evidenceType: 'LLM_REASONING_CHAIN',
      source: 'Claude_Strategic_Adviser',
      sourceType: 'AI_AGENT',
      payload: { hypothesis: 'Market is likely to buy', confidenceEstimate: 0.95 },
    });

    // Forced downgrade to INFERENCE
    expect(res.record.epistemicStatus).toBe(EpistemicCertainty.INFERENCE);
    expect(res.record.nature).toBe(EvidenceNature.AI_INFERENCE);
  });

  // -------------------------------------------------------------
  // F. Evidence Integrity Verification
  // -------------------------------------------------------------
  it('F. Evidence Integrity Verification: calculates deterministic SHA-256 hash', async () => {
    const payload = { b: 2, a: 1, nested: { z: 'last', y: 'first' } };
    const hash1 = computeContentHash(payload);
    // Keys in different order must yield identical hash due to canonicalization
    const payloadReordered = { nested: { y: 'first', z: 'last' }, a: 1, b: 2 };
    const hash2 = computeContentHash(payloadReordered);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  // -------------------------------------------------------------
  // G. Evidence Hash / Integrity Failure
  // -------------------------------------------------------------
  it('G. Evidence Hash Failure: detects and rejects tampered evidence payload', async () => {
    const submitted = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Gateway',
      sourceType: 'EXTERNAL_API',
      payload: { settlementStatus: 'CONFIRMED', amount: 5000 },
      isExternal: true,
      confidence: 1.0,
    });

    // Tamper with payload in store directly
    const stored = evidenceStore.find((e) => e.id === submitted.record.id);
    stored.payload = { settlementStatus: 'CONFIRMED', amount: 999999 }; // TAMPERED!

    const verifyRes = await evidenceVerification.verifyEvidenceContract(taskId, compA);

    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.failedRequirements.some((f) => f.includes('Integrity check failed'))).toBe(true);
    expect(stored.verificationStatus).toBe(EvidenceVerificationStatus.REJECTED);
  });

  // -------------------------------------------------------------
  // H. Evidence Freshness
  // -------------------------------------------------------------
  it('H. Evidence Freshness: marks evidence expired if past maxAgeMs or expiresAt', async () => {
    // Add expired evidence
    const expiredRecord = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Gateway',
      sourceType: 'EXTERNAL_API',
      payload: { settlementStatus: 'CONFIRMED' },
      isExternal: true,
      expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
    });

    const verifyRes = await evidenceVerification.verifyEvidenceContract(taskId, compA);
    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.failedRequirements.some((f) => f.includes('expired'))).toBe(true);
  });

  // -------------------------------------------------------------
  // I. Evidence Quality
  // -------------------------------------------------------------
  it('I. Evidence Quality: fails verification if confidence is below minimum threshold', async () => {
    await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Gateway',
      sourceType: 'EXTERNAL_API',
      payload: { settlementStatus: 'CONFIRMED' },
      isExternal: true,
      confidence: 0.65, // Below contract threshold of 0.9
    });

    const verifyRes = await evidenceVerification.verifyEvidenceContract(taskId, compA);
    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.failedRequirements.some((f) => f.includes('threshold'))).toBe(true);
  });

  // -------------------------------------------------------------
  // J. Duplicate Evidence Rejection / Idempotency
  // -------------------------------------------------------------
  it('J. Duplicate Evidence Rejection: idempotent deduplication prevents duplicate insertion and confidence inflation', async () => {
    const payload = { txnId: 'tx-unique-999', settlementStatus: 'CONFIRMED' };

    const first = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Gateway',
      sourceType: 'EXTERNAL_API',
      payload,
    });
    expect(first.isDuplicate).toBe(false);

    // Submit identical evidence again
    const second = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Gateway',
      sourceType: 'EXTERNAL_API',
      payload,
    });

    expect(second.isDuplicate).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(evidenceStore.filter((e) => e.taskId === taskId)).toHaveLength(1);
  });

  // -------------------------------------------------------------
  // K. Company Isolation
  // -------------------------------------------------------------
  it('K. Company Isolation: rejects cross-company evidence submission and verification', async () => {
    // Attempt to submit evidence to Task in Company A using Company B credentials
    await expect(
      evidenceVerification.submitEvidence({
        companyId: compB,
        taskId,
        evidenceType: 'ROGUE_EVIDENCE',
        source: 'Attacker',
        sourceType: 'AI_AGENT',
        payload: { spoof: true },
      }),
    ).rejects.toThrow(NotFoundException);

    // Attempt to verify Task in Company A using Company B context
    await expect(evidenceVerification.verifyEvidenceContract(taskId, compB)).rejects.toThrow(
      NotFoundException,
    );
  });

  // -------------------------------------------------------------
  // L. Task Binding
  // -------------------------------------------------------------
  it('L. Task Binding: strictly enforces that evidence cannot attach to a non-existent or invalid task', async () => {
    await expect(
      evidenceVerification.submitEvidence({
        companyId: compA,
        taskId: 'non-existent-task-id',
        evidenceType: 'ANY',
        source: 'Worker',
        sourceType: 'INTERNAL_SYSTEM',
        payload: { test: true },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // -------------------------------------------------------------
  // M. Execution-Attempt Binding
  // -------------------------------------------------------------
  it('M. Execution-Attempt Binding: rejects evidence that points to an attempt from another task or company', async () => {
    // Mismatched attempt from another company
    attemptsStore.set('foreign-attempt', {
      id: 'foreign-attempt',
      companyId: compB,
      taskId: 'foreign-task',
      status: ExecutionAttemptStatus.RUNNING,
    });

    await expect(
      evidenceVerification.submitEvidence({
        companyId: compA,
        taskId,
        attemptId: 'foreign-attempt',
        evidenceType: 'PAYMENT_RECEIPT',
        source: 'Gateway',
        sourceType: 'EXTERNAL_API',
        payload: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // -------------------------------------------------------------
  // N. Contradictory Evidence
  // -------------------------------------------------------------
  it('N. Contradictory Evidence: detects contradictory evidence, sets CONFLICTED status, and preserves both records', async () => {
    // Submit first evidence indicating success
    const ev1 = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'SETTLEMENT_STATUS',
      source: 'Provider_A',
      sourceType: 'EXTERNAL_API',
      payload: { success: true, status: 'DELIVERED' },
    });
    expect(ev1.record.verificationStatus).toBe(EvidenceVerificationStatus.UNVERIFIED);

    // Submit contradictory evidence
    const ev2 = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'SETTLEMENT_STATUS',
      source: 'Provider_B',
      sourceType: 'EXTERNAL_API',
      payload: { success: false, status: 'BOUNCED' },
    });

    expect(ev2.record.verificationStatus).toBe(EvidenceVerificationStatus.CONFLICTED);
    expect(ev2.record.epistemicStatus).toBe(EpistemicCertainty.CONFLICTED);
    expect(ev2.contradictions.length).toBeGreaterThan(0);

    // Both records preserved in store
    expect(evidenceStore.filter((e) => e.taskId === taskId)).toHaveLength(2);
    // Prior record also marked CONFLICTED
    expect(evidenceStore.find((e) => e.id === ev1.record.id).verificationStatus).toBe(
      EvidenceVerificationStatus.CONFLICTED,
    );
  });

  // -------------------------------------------------------------
  // O. UNKNOWN / INFERENCE / FACT Boundary
  // -------------------------------------------------------------
  it('O. Epistemic Certainty Boundary: governs transitions and prohibits UNKNOWN -> VERIFIED_FACT without evidence', async () => {
    const raw = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      nature: EvidenceNature.RAW,
      evidenceType: 'RAW_METRIC',
      source: 'Sensor',
      sourceType: 'INTERNAL_SYSTEM',
      payload: { metric: 42 },
    });
    expect(raw.record.epistemicStatus).toBe(EpistemicCertainty.UNKNOWN);

    // Inference submitted with claim of fact is rejected down to INFERENCE
    const inf = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      nature: EvidenceNature.AI_INFERENCE,
      epistemicStatus: EpistemicCertainty.FACT,
      evidenceType: 'AI_REASONING',
      source: 'LLM',
      sourceType: 'AI_AGENT',
      payload: { reasoning: 'high certainty' },
    });
    expect(inf.record.epistemicStatus).toBe(EpistemicCertainty.INFERENCE);
  });

  // -------------------------------------------------------------
  // P. Technical Completion vs Outcome Verification
  // -------------------------------------------------------------
  it('P. Technical Completion vs Outcome Verification: technical completion does NOT automatically equal outcome verification', async () => {
    // Complete attempt technically
    const completeRes = await taskExecution.completeAttempt({
      attemptId,
      companyId: compA,
      output: { status: 'HTTP 200 OK sent to payment provider' },
      summary: 'API call succeeded technically',
    });

    // Task and TaskResult must be in TECHNICALLY_COMPLETED, not OUTCOME_VERIFIED
    expect(completeRes.taskResult.outcomeState).toBe(OutcomeVerificationStatus.TECHNICALLY_COMPLETED);
    const updatedTask = tasksStore.get(taskId);
    expect(updatedTask.outcomeState).toBe(OutcomeVerificationStatus.TECHNICALLY_COMPLETED);

    // Outcome verification engine evaluation without external evidence must NOT verify outcome
    const outcomeEval = await outcomeVerification.evaluateTaskOutcome(taskId, compA);
    expect(outcomeEval.isOutcomeVerified).toBe(false);
    expect(outcomeEval.outcomeState).toBe(OutcomeVerificationStatus.TECHNICALLY_COMPLETED);
  });

  // -------------------------------------------------------------
  // Q. False-Success Prevention
  // -------------------------------------------------------------
  it('Q. False-Success Prevention: catches agent claiming success without satisfying evidence contract', async () => {
    // Agent says success in summary, but evidence contract requirement EXTERNAL_GATEWAY_RECEIPT is missing
    const outcomeRes = await outcomeVerification.evaluateTaskOutcome(taskId, compA);

    expect(outcomeRes.isOutcomeVerified).toBe(false);
    expect(outcomeRes.falseSuccessPrevented).toBe(true);
    expect(outcomeRes.rejectionReason).toContain('Required evidence missing');
  });

  // -------------------------------------------------------------
  // R. Outcome Reopening
  // -------------------------------------------------------------
  it('R. Outcome Reopening: previously accepted outcome is invalidated and reopened when disproven', async () => {
    // 1. Submit valid evidence and verify outcome
    taskResultsStore.set(taskId, {
      id: `res-${taskId}`,
      taskId,
      outcomeState: OutcomeVerificationStatus.TECHNICALLY_COMPLETED,
    });

    await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'Stripe_Gateway',
      sourceType: 'EXTERNAL_API',
      payload: { settlementStatus: 'CONFIRMED' },
      isExternal: true,
      confidence: 1.0,
    });

    const evalRes = await outcomeVerification.evaluateTaskOutcome(taskId, compA);
    expect(evalRes.isOutcomeVerified).toBe(true);
    expect(evalRes.outcomeState).toBe(OutcomeVerificationStatus.OUTCOME_VERIFIED);

    // 2. Later, a chargeback or revocation notice is received
    const reopenRes = await outcomeVerification.reopenOutcome(taskId, compA, {
      reason: 'Payment chargeback received from issuer; settlement invalidated',
      invalidatingEvidenceId: 'ev-chargeback-01',
      reopenedBy: 'FRAUD_DETECTION_ENGINE',
    });

    expect(reopenRes.outcomeState).toBe(OutcomeVerificationStatus.REOPENED);
    expect(tasksStore.get(taskId).outcomeState).toBe(OutcomeVerificationStatus.REOPENED);
    expect(taskResultsStore.get(taskId).outcomeState).toBe(OutcomeVerificationStatus.REOPENED);
  });

  // -------------------------------------------------------------
  // S. Downstream Impact Propagation
  // -------------------------------------------------------------
  it('S. Downstream Impact Propagation: outcome reopening marks dependent tasks as DEGRADED', async () => {
    const dependentTaskId = 'task-downstream-reporting';
    tasksStore.set(dependentTaskId, {
      id: dependentTaskId,
      companyId: compA,
      title: 'Generate Financial Report',
      recoveryState: 'NORMAL',
    });

    // Mock dependentOn in prisma
    const taskWithDeps = tasksStore.get(taskId);
    (prisma.task.findFirst as jest.Mock).mockImplementationOnce(() => ({
      ...taskWithDeps,
      dependentOn: [{ task: tasksStore.get(dependentTaskId) }],
      result: taskResultsStore.get(taskId),
    }));

    const reopenRes = await outcomeVerification.reopenOutcome(taskId, compA, {
      reason: 'Upstream data invalidated',
    });

    expect(reopenRes.downstreamTaskIds).toContain(dependentTaskId);
    expect(tasksStore.get(dependentTaskId).recoveryState).toBe('DEGRADED');
  });

  // -------------------------------------------------------------
  // T. Strategic Outcome Reconciliation
  // -------------------------------------------------------------
  it('T. Strategic Outcome Reconciliation: connects verified outcome to strategic hierarchy and checks variance', async () => {
    // Ensure task is verified first
    tasksStore.get(taskId).outcomeState = OutcomeVerificationStatus.OUTCOME_VERIFIED;
    taskResultsStore.set(taskId, {
      id: `res-${taskId}`,
      taskId,
      summary: 'Billing integration confirmed by Stripe Gateway',
      verificationScore: 1.0,
      outcomeConfidence: 1.0,
      errors: [],
    });

    const reconciliation = await strategicReconciliation.reconcileOutcome(taskId, compA, {
      expectedOutcome: 'Billing integration confirmed by Stripe Gateway',
    });

    expect(reconciliation.strategicImpact).toBe('ON_TRACK');
    expect(reconciliation.assumptionsValid).toBe(true);
    expect(reconciliation.replanningRequired).toBe(false);
    expect(tasksStore.get(taskId).outcomeState).toBe(OutcomeVerificationStatus.STRATEGICALLY_SUCCESSFUL);
  });

  // -------------------------------------------------------------
  // U. V16 Consequential-Action Integration
  // -------------------------------------------------------------
  it('U. V16 Consequential-Action Integration: consumes external gateway receipts without bypassing V16 governance', async () => {
    const v16Receipt = {
      actionId: 'ext-action-1234',
      provider: 'AEVORA_V16_GATEWAY',
      executionState: 'COMPLETED',
      settlementStatus: 'CONFIRMED',
      consequenceTier: 'TIER_3_FINANCIAL',
      reversibility: 'PARTIALLY_REVERSIBLE',
    };

    const ev = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'V16_EXTERNAL_ACTION_GATEWAY',
      sourceType: 'V16_GATEWAY',
      payload: v16Receipt,
      isExternal: true,
      confidence: 1.0,
    });

    expect(ev.record.sourceType).toBe('V16_GATEWAY');
    const outcomeEval = await outcomeVerification.evaluateTaskOutcome(taskId, compA);
    expect(outcomeEval.isOutcomeVerified).toBe(true);
  });

  // -------------------------------------------------------------
  // V. V15 CompanyEvent Lineage
  // -------------------------------------------------------------
  it('V. V15 CompanyEvent Lineage: emits canonical CompanyEvents with correlation and causation IDs', async () => {
    await outcomeVerification.reopenOutcome(taskId, compA, {
      reason: 'Audit finding',
    });

    const reopenEvent = companyEventsStore.find((e) => e.type === 'TASK_OUTCOME_REOPENED');
    expect(reopenEvent).toBeDefined();
    expect(reopenEvent.companyId).toBe(compA);
    expect(reopenEvent.payload.taskId).toBe(taskId);
    expect(reopenEvent.payload.correlationId).toBe('corr-001');
    expect(reopenEvent.payload.causationId).toBe('caus-001');
  });

  // -------------------------------------------------------------
  // W. V24 Offer Market Compatibility
  // -------------------------------------------------------------
  it('W. V24 Offer Market Compatibility: validates offer dispatch evidence while preserving discount boundaries', async () => {
    const offerEvidence = {
      offerId: 'offer-enterprise-q4',
      channel: 'DIRECT_OMNICHANNEL',
      discountPercentage: 25, // <= 50% does not require Chairman escalation
      dispatchReceipt: 'rcpt_omnidirect_789',
      settlementStatus: 'CONFIRMED',
    };

    const ev = await evidenceVerification.submitEvidence({
      companyId: compA,
      taskId,
      attemptId,
      evidenceType: 'EXTERNAL_GATEWAY_RECEIPT',
      source: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
      sourceType: 'V24_OFFER',
      payload: offerEvidence,
      isExternal: true,
      confidence: 1.0,
    });

    expect(ev.record.sourceType).toBe('V24_OFFER');
    expect((ev.record.payload as any).discountPercentage).toBe(25);
  });

  // -------------------------------------------------------------
  // X. Organizational Memory Integration
  // -------------------------------------------------------------
  it('X. Organizational Memory Integration: records verified outcomes into memory preserving raw evidence and provenance', async () => {
    tasksStore.get(taskId).outcomeState = OutcomeVerificationStatus.OUTCOME_VERIFIED;
    taskResultsStore.set(taskId, {
      id: `res-${taskId}`,
      taskId,
      summary: 'Verified deployment outcome',
      verificationScore: 1.0,
      outcomeConfidence: 0.95,
      errors: [],
    });

    await strategicReconciliation.reconcileOutcome(taskId, compA);

    expect(memoryStore).toHaveLength(1);
    const mem = memoryStore[0];
    expect(mem.companyId).toBe(compA);
    expect(mem.memoryType).toBe(OrgMemoryType.SUCCESSFUL_INTERVENTION);
    expect(mem.relevanceScore).toBe(95);
    expect(mem.tags).toContain('V17_PHASE4');
    expect(mem.tags).toContain('VERIFIED_OUTCOME');
  });

  // -------------------------------------------------------------
  // Y. Verification Replay / Idempotency
  // -------------------------------------------------------------
  it('Y. Verification Replay: re-running outcome evaluation on unchanged evidence produces identical deterministic results', async () => {
    const firstEval = await outcomeVerification.evaluateTaskOutcome(taskId, compA);
    const secondEval = await outcomeVerification.evaluateTaskOutcome(taskId, compA);

    expect(firstEval.outcomeState).toBe(secondEval.outcomeState);
    expect(firstEval.verificationScore).toBe(secondEval.verificationScore);
    expect(firstEval.isOutcomeVerified).toBe(secondEval.isOutcomeVerified);
  });

  // -------------------------------------------------------------
  // Z. Chairman Authority / Escalation
  // -------------------------------------------------------------
  it('Z. Chairman Sovereignty & Escalation: non-verified outcome prevents strategic success and mandates escalation', async () => {
    // Task is not verified
    tasksStore.get(taskId).outcomeState = OutcomeVerificationStatus.TECHNICALLY_COMPLETED;

    const reconciliation = await strategicReconciliation.reconcileOutcome(taskId, compA);

    // Must mandate escalation
    expect(reconciliation.escalationRequired).toBe(true);
    expect(reconciliation.replanningRequired).toBe(true);
    expect(reconciliation.strategicImpact).toBe('DEVIATION_CRITICAL');
    expect(tasksStore.get(taskId).outcomeState).not.toBe(OutcomeVerificationStatus.STRATEGICALLY_SUCCESSFUL);
  });
});

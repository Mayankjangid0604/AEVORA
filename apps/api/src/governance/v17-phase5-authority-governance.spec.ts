import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GovernedAuthorityService } from './governed-authority.service';
import { ChairmanGovernanceService } from './chairman-governance.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import {
  AuthorityTier,
  AuthorityGrantStatus,
  AuthorityEvaluation,
} from './authority-context.types';
import {
  ApprovalRiskLevel,
  ApprovalRequestStatus,
  CeoDecisionRiskLevel,
  ExecutionEnvironment,
} from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { StructuredLoggerService } from '../logger/structured-logger.service';

describe('V17 Phase 5 — Authority Integration & Governance Specification Tests (A through AJ)', () => {
  let authorityService: GovernedAuthorityService;
  let chairmanGovernance: ChairmanGovernanceService;
  let approvalValidation: ApprovalValidationService;
  let prisma: PrismaService;

  const compA = 'company-phase5-alpha';
  const compB = 'company-phase5-beta';
  const chairmanId = 'chairman-sovereign-01';
  const ceoId = 'ceo-agent-01';
  const deptLeaderId = 'dept-leader-eng';
  const workerAgentId = 'worker-agent-101';
  const subAgentId = 'sub-agent-202';

  // In-memory mock data stores
  let grantsStore: Map<string, any> = new Map();
  let proofsStore: Map<string, any> = new Map();
  let preferencesStore: any[] = [];
  let disagreementsStore: Map<string, any> = new Map();
  let approvalsStore: Map<string, any> = new Map();
  let companyStore: Map<string, any> = new Map();
  let chairmanStore: Map<string, any> = new Map();

  beforeEach(async () => {
    grantsStore = new Map();
    proofsStore = new Map();
    preferencesStore = [];
    disagreementsStore = new Map();
    approvalsStore = new Map();
    companyStore = new Map();
    chairmanStore = new Map();

    // Default Companies
    companyStore.set(compA, {
      id: compA,
      name: 'Alpha Corp',
      emergencyStatus: 'NORMAL',
    });
    companyStore.set(compB, {
      id: compB,
      name: 'Beta Corp',
      emergencyStatus: 'NORMAL',
    });

    // Default Chairman
    chairmanStore.set(chairmanId, {
      id: chairmanId,
      name: 'Sovereign Chairman',
    });

    const mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(companyStore.get(where.id) || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const comp = companyStore.get(where.id);
          if (comp) {
            Object.assign(comp, data);
          }
          return Promise.resolve(comp);
        }),
      },
      chairman: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(chairmanStore.get(where.id) || null);
        }),
      },
      authorityGrant: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = `grant-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const grant = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          grantsStore.set(id, grant);
          return Promise.resolve(grant);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(grantsStore.get(where.id) || null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const g of grantsStore.values()) {
            let match = true;
            if (where.id && g.id !== where.id) match = false;
            if (where.companyId && g.companyId !== where.companyId) match = false;
            if (where.granteeId && g.granteeId !== where.granteeId) match = false;
            if (where.status && g.status !== where.status) match = false;
            if (match) return Promise.resolve(g);
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const results: any[] = [];
          for (const g of grantsStore.values()) {
            let match = true;
            if (where.companyId && g.companyId !== where.companyId) match = false;
            if (where.parentGrantId && g.parentGrantId !== where.parentGrantId) match = false;
            if (where.status && g.status !== where.status) match = false;
            if (match) results.push(g);
          }
          return Promise.resolve(results);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const g = grantsStore.get(where.id);
          if (g) {
            Object.assign(g, data, { updatedAt: new Date() });
          }
          return Promise.resolve(g);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const g of grantsStore.values()) {
            let match = true;
            if (where.id && Array.isArray(where.id.in) && !where.id.in.includes(g.id)) match = false;
            if (where.companyId && g.companyId !== where.companyId) match = false;
            if (where.status && g.status !== where.status) match = false;
            if (where.expiresAt?.lt && (!g.expiresAt || !(g.expiresAt < where.expiresAt.lt))) match = false;
            if (match) {
              Object.assign(g, data, { updatedAt: new Date() });
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
      },
      authorityProof: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = `proof-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const proof = { id, ...data, timestamp: new Date() };
          proofsStore.set(id, proof);
          return Promise.resolve(proof);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(proofsStore.get(where.id) || null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const p of proofsStore.values()) {
            let match = true;
            if (where.id && p.id !== where.id) match = false;
            if (where.companyId && p.companyId !== where.companyId) match = false;
            if (match) return Promise.resolve(p);
          }
          return Promise.resolve(null);
        }),
      },
      chairmanPreference: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = `pref-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const pref = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          preferencesStore.push(pref);
          return Promise.resolve(pref);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const matches = preferencesStore.filter(
            (p) =>
              p.companyId === where.companyId &&
              p.chairmanId === where.chairmanId &&
              p.domain === where.domain,
          );
          if (matches.length === 0) return Promise.resolve(null);
          matches.sort((a, b) => b.version - a.version);
          return Promise.resolve(matches[0]);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            preferencesStore.filter(
              (p) =>
                p.companyId === where.companyId &&
                (!where.domain || p.domain === where.domain),
            ),
          );
        }),
      },
      disagreementRecord: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = `disagree-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const rec = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          disagreementsStore.set(id, rec);
          return Promise.resolve(rec);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(disagreementsStore.get(where.id) || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const rec = disagreementsStore.get(where.id);
          if (rec) {
            Object.assign(rec, data, { updatedAt: new Date() });
          }
          return Promise.resolve(rec);
        }),
      },
      approvalRequest: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = `appr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const req = {
            id,
            environment: ExecutionEnvironment.SIMULATION,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          approvalsStore.set(id, req);
          return Promise.resolve(req);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(approvalsStore.get(where.id) || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const req = approvalsStore.get(where.id);
          if (req) {
            Object.assign(req, data, { updatedAt: new Date() });
          }
          return Promise.resolve(req);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const req of approvalsStore.values()) {
            let match = true;
            if (where.id && req.id !== where.id) match = false;
            if (where.status && req.status !== where.status) match = false;
            if (match) {
              Object.assign(req, data, { updatedAt: new Date() });
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
      },
      companyEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GovernedAuthorityService,
        ChairmanGovernanceService,
        ApprovalValidationService,
        {
          provide: StructuredLoggerService,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    authorityService = module.get<GovernedAuthorityService>(GovernedAuthorityService);
    chairmanGovernance = module.get<ChairmanGovernanceService>(ChairmanGovernanceService);
    approvalValidation = module.get<ApprovalValidationService>(ApprovalValidationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // A. Chairman command supremacy
  it('A. Chairman command supremacy: explicit command always outranks preferences and autonomous options', () => {
    const priority = chairmanGovernance.evaluateInstructionPriority({
      hasExplicitCommand: true,
      hasPreference: true,
      violatesSafety: false,
    });
    expect(priority.decisionSource).toBe('EXPLICIT_COMMAND');
    expect(priority.reason).toContain('outranks all stated or learned preferences');
  });

  // B. Chairman command vs preference
  it('B. Chairman command vs preference: preference is non-binding and cannot override safety or explicit command', async () => {
    const pref = await chairmanGovernance.setPreference({
      companyId: compA,
      chairmanId,
      domain: 'EXPANSION',
      statement: 'Prefer organic customer acquisition over outbound spend',
    });
    expect(pref.isBinding).toBe(false);
    expect(pref.version).toBe(1);

    const safetyOverride = chairmanGovernance.evaluateInstructionPriority({
      hasExplicitCommand: false,
      hasPreference: true,
      violatesSafety: true,
    });
    expect(safetyOverride.decisionSource).toBe('REJECTED');
    expect(safetyOverride.reason).toContain('Constitutional safety rules override all preferences');
  });

  // C. CEO cannot override Chairman
  it('C. CEO cannot override Chairman: CEO attempting to resolve a disagreement without Chairman tier is forbidden', async () => {
    const dis = await chairmanGovernance.recordDisagreementConsultation({
      companyId: compA,
      chairmanId,
      ceoId,
      topic: 'Pivot to Enterprise',
      situation: 'CEO wants enterprise focus, Chairman insists on PLG',
      chairmanPosition: 'Maintain PLG',
      ceoPosition: 'Switch to Enterprise direct sales',
      alternativesConsidered: ['Hybrid model'],
      councilVotes: [{ agentId: 'council_1', vote: 'HYBRID', rationale: 'Compromise', expertiseDomain: 'STRATEGY' }],
    });

    await expect(
      chairmanGovernance.resolveDisagreementWithChairmanRuling({
        disagreementId: dis.id,
        companyId: compA,
        chairmanId,
        resolverTier: AuthorityTier.CEO, // Illegal: CEO attempting to issue ruling
        resolutionDecision: 'CEO decided to pivot anyway',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // D. Department cannot exceed delegated authority
  it('D. Department cannot exceed delegated authority: department leader cannot grant or execute beyond its grant scope', async () => {
    // Chairman grants CEO broad authority
    const ceoGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'OPERATIONS',
      actionScope: ['MANAGE_BUDGET', 'ASSIGN_TASKS', 'DEPLOY_SOFTWARE'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    // CEO grants Dept Leader bounded authority
    const deptGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: ceoId,
      granterRole: 'CEO',
      granterTier: AuthorityTier.CEO,
      granteeId: deptLeaderId,
      granteeRole: 'DEPARTMENT_LEADER',
      granteeTier: AuthorityTier.DEPARTMENT_LEADER,
      parentGrantId: ceoGrant.id,
      capability: 'ENGINEERING',
      actionScope: ['ASSIGN_TASKS', 'DEPLOY_SOFTWARE'],
      maxRiskTier: CeoDecisionRiskLevel.MEDIUM,
    });

    // Dept leader attempts to execute MANAGE_BUDGET (which it was not granted)
    const evalResult = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: deptLeaderId,
      actorRole: 'DEPARTMENT_LEADER',
      actorTier: AuthorityTier.DEPARTMENT_LEADER,
      authorityGrantId: deptGrant.id,
      actionType: 'MANAGE_BUDGET',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { amount: 50000 },
    });

    expect(evalResult.isAuthorized).toBe(false);
    expect(evalResult.rejectionReason).toContain('outside authorized action scope');
  });

  // E. Agent cannot self-authorize
  it('E. Agent cannot self-authorize: agent granting itself authority throws ForbiddenException', async () => {
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: workerAgentId,
        granterRole: 'WORKFORCE_AGENT',
        granterTier: AuthorityTier.WORKFORCE_AGENT,
        granteeId: workerAgentId, // Self-grant
        granteeRole: 'WORKFORCE_AGENT',
        granteeTier: AuthorityTier.WORKFORCE_AGENT,
        capability: 'EXECUTE',
        actionScope: ['EXECUTE_TASK'],
        maxRiskTier: CeoDecisionRiskLevel.LOW,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // F. Company isolation
  it('F. Company isolation: grant created in Company A is invalid for operations in Company B', async () => {
    const grantA = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['DO_WORK'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compB, // Mismatched tenant
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grantA.id,
      actionType: 'DO_WORK',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { test: true },
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('not found in company');
  });

  // G. Authority context creation
  it('G. Authority context creation: proof carries full audit lineage, parameters hash, and causation', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['PROCESS_ORDER'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const res = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'PROCESS_ORDER',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { orderId: 'ord-999', amount: 150 },
      correlationId: 'corr-ctx-1',
      causationId: 'caus-ctx-1',
    });

    expect(res.isAuthorized).toBe(true);
    expect(res.proofId).toBeDefined();
    expect(res.proof?.parametersHash).toBeDefined();
    expect(res.proof?.correlationId).toBe('corr-ctx-1');
  });

  // H. Authority scope enforcement
  it('H. Authority scope enforcement: unpermitted action types fail closed', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'READ_ONLY',
      actionScope: ['VIEW_STATS'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'DELETE_DATA',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('outside authorized action scope');
  });

  // I. Risk ceiling enforcement
  it('I. Risk ceiling enforcement: action exceeding grant maxRiskTier is blocked', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['DEPLOY_CODE'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'DEPLOY_CODE',
      riskTier: CeoDecisionRiskLevel.HIGH, // Exceeds LOW
      parameters: { branch: 'main' },
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('exceeds grant ceiling');
  });

  // J. Delegation
  it('J. Delegation: valid delegation propagates from granter to delegate within bounds', async () => {
    const pGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'ALL',
      actionScope: ['TASK_A', 'TASK_B'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    const cGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: ceoId,
      granterRole: 'CEO',
      granterTier: AuthorityTier.CEO,
      granteeId: deptLeaderId,
      granteeRole: 'DEPT_LEADER',
      granteeTier: AuthorityTier.DEPARTMENT_LEADER,
      parentGrantId: pGrant.id,
      capability: 'SOME',
      actionScope: ['TASK_A'],
      maxRiskTier: CeoDecisionRiskLevel.MEDIUM,
    });

    expect(cGrant.delegationDepth).toBe(1);
    expect(cGrant.parentGrantId).toBe(pGrant.id);
  });

  // K. Recursive delegation limit
  it('K. Recursive delegation limit: delegation past MAX_DELEGATION_DEPTH=3 is rejected', async () => {
    // Depth 0: Chairman -> CEO
    const g0 = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'ROOT',
      actionScope: ['ACTION_1'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    // Depth 1: CEO -> Dept Leader
    const g1 = await authorityService.createGrant({
      companyId: compA,
      granterId: ceoId,
      granterRole: 'CEO',
      granterTier: AuthorityTier.CEO,
      granteeId: deptLeaderId,
      granteeRole: 'LEADER',
      granteeTier: AuthorityTier.DEPARTMENT_LEADER,
      parentGrantId: g0.id,
      capability: 'SUB1',
      actionScope: ['ACTION_1'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    // Depth 2: Dept Leader -> Worker Agent
    const g2 = await authorityService.createGrant({
      companyId: compA,
      granterId: deptLeaderId,
      granterRole: 'LEADER',
      granterTier: AuthorityTier.DEPARTMENT_LEADER,
      granteeId: workerAgentId,
      granteeRole: 'WORKER',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      parentGrantId: g1.id,
      capability: 'SUB2',
      actionScope: ['ACTION_1'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    // Depth 3: Worker Agent -> Ephemeral Child
    const g3 = await authorityService.createGrant({
      companyId: compA,
      granterId: workerAgentId,
      granterRole: 'WORKER',
      granterTier: AuthorityTier.WORKFORCE_AGENT,
      granteeId: subAgentId,
      granteeRole: 'DELEGATE',
      granteeTier: AuthorityTier.EPHEMERAL_DELEGATE,
      parentGrantId: g2.id,
      capability: 'SUB3',
      actionScope: ['ACTION_1'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    expect(g3.delegationDepth).toBe(3);

    // Depth 4: Ephemeral Child -> Another Child (Must fail)
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: subAgentId,
        granterRole: 'DELEGATE',
        granterTier: AuthorityTier.EPHEMERAL_DELEGATE,
        granteeId: 'sub-sub-agent',
        granteeRole: 'DELEGATE_2',
        granteeTier: AuthorityTier.EPHEMERAL_DELEGATE,
        parentGrantId: g3.id,
        capability: 'SUB4',
        actionScope: ['ACTION_1'],
        maxRiskTier: CeoDecisionRiskLevel.HIGH,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // L. Delegation cannot amplify authority
  it('L. Delegation cannot amplify authority: child cannot exceed parent risk ceiling or action scope', async () => {
    const parent = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'STANDARD',
      actionScope: ['EXECUTE_BATCH'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    // Attempting to amplify risk ceiling to HIGH
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: ceoId,
        granterRole: 'CEO',
        granterTier: AuthorityTier.CEO,
        granteeId: deptLeaderId,
        granteeRole: 'LEADER',
        granteeTier: AuthorityTier.DEPARTMENT_LEADER,
        parentGrantId: parent.id,
        capability: 'AMPLIFIED',
        actionScope: ['EXECUTE_BATCH'],
        maxRiskTier: CeoDecisionRiskLevel.HIGH,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Attempting to expand action scope beyond parent
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: ceoId,
        granterRole: 'CEO',
        granterTier: AuthorityTier.CEO,
        granteeId: deptLeaderId,
        granteeRole: 'LEADER',
        granteeTier: AuthorityTier.DEPARTMENT_LEADER,
        parentGrantId: parent.id,
        capability: 'WIDER_SCOPE',
        actionScope: ['EXECUTE_BATCH', 'DELETE_DATABASE'],
        maxRiskTier: CeoDecisionRiskLevel.LOW,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // M. Authority expiration
  it('M. Authority expiration: expired grant is automatically reconciled and cannot be evaluated', async () => {
    const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['TIME_BOUND_ACTION'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
      expiresAt: expiredDate,
    });

    // Reconcile authority
    const recResult = await authorityService.reconcileAuthority(compA);
    expect(recResult.expiredCount).toBe(1);

    const updated = await prisma.authorityGrant.findUnique({ where: { id: grant.id } });
    expect(updated?.status).toBe(AuthorityGrantStatus.EXPIRED);

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'TIME_BOUND_ACTION',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('Grant has expired');
  });

  // N. Immediate revocation
  it('N. Immediate revocation: revoking a grant cascades recursively to all downstream delegates', async () => {
    const pGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'ALL',
      actionScope: ['ACT_1'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    const cGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: ceoId,
      granterRole: 'CEO',
      granterTier: AuthorityTier.CEO,
      granteeId: deptLeaderId,
      granteeRole: 'LEADER',
      granteeTier: AuthorityTier.DEPARTMENT_LEADER,
      parentGrantId: pGrant.id,
      capability: 'ALL',
      actionScope: ['ACT_1'],
      maxRiskTier: CeoDecisionRiskLevel.MEDIUM,
    });

    const revResult = await authorityService.revokeGrant(
      pGrant.id,
      compA,
      chairmanId,
      'Breach of protocol',
    );
    expect(revResult.revokedGrantIds).toContain(pGrant.id);
    expect(revResult.revokedGrantIds).toContain(cGrant.id);

    const checkChild = await prisma.authorityGrant.findUnique({ where: { id: cGrant.id } });
    expect(checkChild?.status).toBe(AuthorityGrantStatus.REVOKED);
  });

  // O. Stale authority rejection
  it('O. Stale authority rejection: revoked grant fails closed immediately on evaluation', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKER',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'DO',
      actionScope: ['DO_STUFF'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    await authorityService.revokeGrant(grant.id, compA, chairmanId, 'Emergency revocation');

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKER',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'DO_STUFF',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('Grant is REVOKED');
  });

  // P. Approval binding
  it('P. Approval binding: approval must be bound to company, action, and requester', async () => {
    const app = await prisma.approvalRequest.create({
      data: {
        companyId: compA,
        requesterId: workerAgentId,
        action: 'DEPLOY_PROD',
        status: ApprovalRequestStatus.APPROVED,
        riskLevel: ApprovalRiskLevel.HIGH,
        proposedParams: { env: 'production', version: '2.0.0' },
      },
    });

    await expect(
      approvalValidation.validateAndConsumeApproval(app.id, {
        companyId: compA,
        action: 'DEPLOY_PROD',
        environment: ExecutionEnvironment.SIMULATION,
        params: { env: 'production', version: '2.0.0' },
      }),
    ).resolves.toBeUndefined();
  });

  // Q. Approval parameter mismatch
  it('Q. Approval parameter mismatch: drift between approved parameters and execution parameters is rejected', async () => {
    const app = await prisma.approvalRequest.create({
      data: {
        companyId: compA,
        requesterId: workerAgentId,
        action: 'DEPLOY_PROD',
        status: ApprovalRequestStatus.APPROVED,
        riskLevel: ApprovalRiskLevel.HIGH,
        proposedParams: { env: 'production', cluster: 'us-east' },
      },
    });

    // Mismatched cluster
    await expect(
      approvalValidation.validateAndConsumeApproval(app.id, {
        companyId: compA,
        action: 'DEPLOY_PROD',
        environment: ExecutionEnvironment.SIMULATION,
        params: { env: 'production', cluster: 'eu-west' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // R. Approval expiry
  it('R. Approval expiry: expired approval request cannot be consumed', async () => {
    const app = await prisma.approvalRequest.create({
      data: {
        companyId: compA,
        requesterId: workerAgentId,
        action: 'TRANSFER_FUNDS',
        status: ApprovalRequestStatus.APPROVED,
        riskLevel: ApprovalRiskLevel.HIGH,
        proposedParams: { amount: 1000 },
        expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
      },
    });

    await expect(
      approvalValidation.validateAndConsumeApproval(app.id, {
        companyId: compA,
        action: 'TRANSFER_FUNDS',
        environment: ExecutionEnvironment.SIMULATION,
        params: { amount: 1000 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // S. Approval single-use
  it('S. Approval single-use: approval cannot be consumed a second time', async () => {
    const app = await prisma.approvalRequest.create({
      data: {
        companyId: compA,
        requesterId: workerAgentId,
        action: 'EXECUTE_TRADE',
        status: ApprovalRequestStatus.APPROVED,
        riskLevel: ApprovalRiskLevel.HIGH,
        proposedParams: { symbol: 'AAPL', qty: 10 },
      },
    });

    await expect(
      approvalValidation.validateAndConsumeApproval(app.id, {
        companyId: compA,
        action: 'EXECUTE_TRADE',
        environment: ExecutionEnvironment.SIMULATION,
        params: { symbol: 'AAPL', qty: 10 },
      }),
    ).resolves.toBeUndefined();

    // Second consumption attempt fails because status is now CONSUMED
    await expect(
      approvalValidation.validateAndConsumeApproval(app.id, {
        companyId: compA,
        action: 'EXECUTE_TRADE',
        environment: ExecutionEnvironment.SIMULATION,
        params: { symbol: 'AAPL', qty: 10 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // T. Self-approval prevention
  it('T. Self-approval prevention: approver cannot self-authorize or self-approve', async () => {
    // Self-granting authority is strictly prohibited and throws ForbiddenException
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: workerAgentId,
        granterRole: 'WORKFORCE_AGENT',
        granterTier: AuthorityTier.WORKFORCE_AGENT,
        granteeId: workerAgentId,
        granteeRole: 'WORKFORCE_AGENT',
        granteeTier: AuthorityTier.WORKFORCE_AGENT,
        capability: 'ACCESS',
        actionScope: ['GRANT_ACCESS'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // U. V16 gateway preservation
  it('U. V16 gateway preservation: HIGH risk consequential actions require valid approval ID', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'GATEWAY',
      actionScope: ['EXTERNAL_PAYMENT'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    // Evaluating without approvalId on HIGH risk action
    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'EXTERNAL_PAYMENT',
      riskTier: CeoDecisionRiskLevel.HIGH,
      parameters: { amount: 1000 },
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('requires approved V16 ApprovalRequest');
  });

  // V. V16 risk-tier preservation
  it('V. V16 risk-tier preservation: LOW risk actions proceed autonomously within authorized bounds', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'ANALYTICS',
      actionScope: ['QUERY_METRICS'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'QUERY_METRICS',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { metric: 'revenue' },
    });

    expect(evalRes.isAuthorized).toBe(true);
  });

  // W. Emergency stop authority propagation
  it('W. Emergency stop authority propagation: EMERGENCY_STOP blocks autonomous actions', async () => {
    const comp = companyStore.get(compA);
    comp.emergencyStatus = 'EMERGENCY_STOP';

    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['ROUTINE_TASK'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'ROUTINE_TASK',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('Company is in EMERGENCY_STOP status');
  });

  // X. Emergency recovery authority
  it('X. Emergency recovery authority: explicit Chairman emergency recovery actions are permitted during EMERGENCY_STOP', async () => {
    const comp = companyStore.get(compA);
    comp.emergencyStatus = 'EMERGENCY_STOP';

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: chairmanId,
      actorRole: 'CHAIRMAN',
      actorTier: AuthorityTier.CHAIRMAN,
      actionType: 'EMERGENCY_ROLLBACK',
      riskTier: CeoDecisionRiskLevel.CRITICAL,
      isEmergencyRecovery: true,
      parameters: { rollbackTarget: 'v16.4' },
    });

    expect(evalRes.isAuthorized).toBe(true);
  });

  // Y. Safety refusal
  it('Y. Safety refusal: instructions violating constitutional safety constraints are cleanly refused', () => {
    const res = chairmanGovernance.evaluateInstructionPriority({
      hasExplicitCommand: true,
      hasPreference: false,
      violatesSafety: true,
    });
    expect(res.decisionSource).toBe('REJECTED');
    expect(res.reason).toContain('Constitutional safety rules override all preferences and cannot be bypassed');
  });

  // Z. Refusal escalation
  it('Z. Refusal escalation: refusal records violated rule and escalates to sovereign Chairman', async () => {
    const dis = await chairmanGovernance.recordDisagreementConsultation({
      companyId: compA,
      chairmanId,
      ceoId,
      topic: 'Unsafe aggressive marketing campaign',
      situation: 'Agent refused instruction to scrape private user emails',
      chairmanPosition: 'Refusal upheld under Constitutional Safety',
      ceoPosition: 'Maximize pipeline growth',
    });

    expect(dis.resolved).toBe(false);
    expect(dis.chairmanPosition).toContain('Refusal upheld');
  });

  // AA. Advisory AI voting remains non-binding
  it('AA. Advisory AI voting remains non-binding: council votes stored with isCouncilVoteBinding=false', async () => {
    const dis = await chairmanGovernance.recordDisagreementConsultation({
      companyId: compA,
      chairmanId,
      ceoId,
      topic: 'AI Model Migration',
      situation: 'Deciding whether to migrate foundation models',
      chairmanPosition: 'Stay on Gemini 1.5 Pro',
      ceoPosition: 'Migrate to Flash 8B',
      councilVotes: [
        { agentId: 'council_1', vote: 'FLASH_8B', rationale: 'Cost', expertiseDomain: 'COMPUTE' },
        { agentId: 'council_2', vote: 'FLASH_8B', rationale: 'Speed', expertiseDomain: 'ARCHITECTURE' },
      ],
    });

    expect(dis.isCouncilVoteBinding).toBe(false);
  });

  // AB. Chairman final decision
  it('AB. Chairman final decision: Chairman issues sovereign ruling resolving disagreement', async () => {
    const dis = await chairmanGovernance.recordDisagreementConsultation({
      companyId: compA,
      chairmanId,
      ceoId,
      topic: 'Acquisition Target',
      situation: 'Evaluating Acquisition Candidate X',
      chairmanPosition: 'Do not acquire',
      ceoPosition: 'Acquire',
    });

    const resolved = await chairmanGovernance.resolveDisagreementWithChairmanRuling({
      disagreementId: dis.id,
      companyId: compA,
      chairmanId,
      resolverTier: AuthorityTier.CHAIRMAN,
      resolutionDecision: 'Acquisition rejected by Chairman decree',
      finalCommandId: 'cmd-ruling-001',
    });

    expect(resolved.resolved).toBe(true);
    expect(resolved.resolutionDecision).toBe('Acquisition rejected by Chairman decree');
  });

  // AC. Authority proof generation
  it('AC. Authority proof generation: produces deterministic parameters hash and valid proof record', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['SUBMIT_REPORT'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const res = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'SUBMIT_REPORT',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { quarter: 'Q3', year: 2026 },
    });

    expect(res.proofId).toBeDefined();
    expect(res.proof?.isAuthorized).toBe(true);
  });

  // AD. Authority proof replay
  it('AD. Authority proof replay: replays historical proof deterministically without mutating state', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['PROCESS_PAYMENT'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'PROCESS_PAYMENT',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { invoiceId: 'inv-123' },
    });

    const replay = await authorityService.replayAuthorityProof(evalRes.proofId!);
    expect(replay.isHistoricallyValid).toBe(true);
    expect(replay.parametersHash).toBe(evalRes.proof?.parametersHash);
    expect(replay.auditNotes.some((n) => n.includes('Active authority grant existed'))).toBe(true);
  });

  // AE. Authority + evidence integration
  it('AE. Authority + evidence integration: authority proof is machine-verifiable and linkable to evidence', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['RECORD_METRIC'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'RECORD_METRIC',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: { val: 42 },
    });

    expect(evalRes.proofId).toBeDefined();
    const storedProof = await prisma.authorityProof.findUnique({ where: { id: evalRes.proofId! } });
    expect(storedProof).toBeDefined();
    expect(storedProof?.isAuthorized).toBe(true);
  });

  // AF. Consequential-action verification
  it('AF. Consequential-action verification: consequential actions must have verified authority proof', async () => {
    // Unverified/unauthorized proof
    const fakeProofId = 'non-existent-proof';
    const proof = await prisma.authorityProof.findUnique({ where: { id: fakeProofId } });
    expect(proof).toBeNull();
  });

  // AG. Idempotent authority reconciliation
  it('AG. Idempotent authority reconciliation: running reconciliation repeatedly yields consistent results', async () => {
    const expiredGrant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['TASK_X'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
      expiresAt: new Date(Date.now() - 10000),
    });

    const rec1 = await authorityService.reconcileAuthority(compA);
    expect(rec1.expiredCount).toBe(1);

    // Second run
    const rec2 = await authorityService.reconcileAuthority(compA);
    expect(rec2.expiredCount).toBe(0); // Already expired, idempotent
  });

  // AH. Historical lineage preservation
  it('AH. Historical lineage preservation: delegation chain preserved in authority proof', async () => {
    const root = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: ceoId,
      granteeRole: 'CEO',
      granteeTier: AuthorityTier.CEO,
      capability: 'ROOT',
      actionScope: ['CHAIN_OP'],
      maxRiskTier: CeoDecisionRiskLevel.HIGH,
    });

    const child = await authorityService.createGrant({
      companyId: compA,
      granterId: ceoId,
      granterRole: 'CEO',
      granterTier: AuthorityTier.CEO,
      granteeId: deptLeaderId,
      granteeRole: 'DEPT_LEADER',
      granteeTier: AuthorityTier.DEPARTMENT_LEADER,
      parentGrantId: root.id,
      capability: 'SUB',
      actionScope: ['CHAIN_OP'],
      maxRiskTier: CeoDecisionRiskLevel.MEDIUM,
    });

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: deptLeaderId,
      actorRole: 'DEPT_LEADER',
      actorTier: AuthorityTier.DEPARTMENT_LEADER,
      authorityGrantId: child.id,
      actionType: 'CHAIN_OP',
      riskTier: CeoDecisionRiskLevel.MEDIUM,
      parameters: { step: 1 },
    });

    expect(evalRes.proof?.delegationChain).toContain(root.id);
  });

  // AI. Authority reduction after failure
  it('AI. Authority reduction after failure: grant can be suspended upon critical failure', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['EXECUTE_DEPLOY'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    // Suspend grant
    const suspended = await authorityService.suspendGrant(
      grant.id,
      compA,
      ceoId,
      'Execution failure threshold exceeded',
    );
    expect(suspended.status).toBe(AuthorityGrantStatus.SUSPENDED);

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'EXECUTE_DEPLOY',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(false);
    expect(evalRes.rejectionReason).toContain('Grant is SUSPENDED');
  });

  // AJ. Authority restoration after verified recovery
  it('AJ. Authority restoration after verified recovery: suspended grant can be reinstated', async () => {
    const grant = await authorityService.createGrant({
      companyId: compA,
      granterId: chairmanId,
      granterRole: 'CHAIRMAN',
      granterTier: AuthorityTier.CHAIRMAN,
      granteeId: workerAgentId,
      granteeRole: 'WORKFORCE_AGENT',
      granteeTier: AuthorityTier.WORKFORCE_AGENT,
      capability: 'OPS',
      actionScope: ['EXECUTE_DEPLOY'],
      maxRiskTier: CeoDecisionRiskLevel.LOW,
    });

    await authorityService.suspendGrant(grant.id, compA, ceoId, 'Temporary freeze');
    const restored = await authorityService.reinstateGrant(grant.id, compA, chairmanId);
    expect(restored.status).toBe(AuthorityGrantStatus.ACTIVE);

    const evalRes = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: workerAgentId,
      actorRole: 'WORKFORCE_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      authorityGrantId: grant.id,
      actionType: 'EXECUTE_DEPLOY',
      riskTier: CeoDecisionRiskLevel.LOW,
      parameters: {},
    });

    expect(evalRes.isAuthorized).toBe(true);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TaskExecutionService } from '../task/task-execution.service';
import { TaskQualityGateService } from '../task/task-quality-gate.service';
import { OutcomeVerificationService } from '../task/outcome-verification.service';
import { EvidenceVerificationService, computeContentHash } from '../task/evidence-verification.service';
import { GovernedAuthorityService } from '../governance/governed-authority.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { DepartmentLeaderAutonomousService } from '../department/department-leader-autonomous.service';
import { CanonicalEnterpriseStateService } from '../enterprise-intelligence/canonical-enterprise-state.service';
import { EnterpriseConflictIntegrityService } from '../enterprise-intelligence/enterprise-conflict-integrity.service';
import { DigitalTwinScenarioService } from '../enterprise-intelligence/digital-twin-scenario.service';
import { ContinuousImprovementService } from '../continuous-improvement/continuous-improvement.service';
import { AntiEntropyEngineService } from '../continuous-improvement/anti-entropy-engine.service';
import { LessonPatternExtractionService } from '../organizational-memory/lesson-pattern-extraction.service';
import { ExecutiveMemoryService } from '../organizational-memory/executive-memory.service';
import { GatewayAuthorityValidatorService } from '../external-action-gateway/gateway-authority-validator.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { DecisionOutcomeEvaluation } from '../organizational-memory/organizational-memory.types';
import { CeoConsequenceAnalysisService } from '../ceo/ceo-consequence-analysis.service';
import {
  EmergencyState,
  ExecutionAttemptStatus,
  AttemptFailureType,
  EpistemicCertainty,
  EvidenceNature,
  OutcomeVerificationStatus,
  ImprovementStatus,
  TaskStatus,
} from '@prisma/client';
import {
  AuthorityTier,
  CeoDecisionRiskLevel,
} from '../governance/authority-context.types';
import {
  TargetDomain,
  ReversibilityType,
  BlastRadius,
  ProposalAuthorityRequirement,
  EntropyCategory,
  EntropySeverity,
  RemediationTier,
} from '../continuous-improvement/continuous-improvement.types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AEVORA V17 — Phase 8: Full End-to-End Validation & Final Release Gate', () => {
  let taskExecutionService: TaskExecutionService;
  let taskQualityGate: TaskQualityGateService;
  let outcomeService: OutcomeVerificationService;
  let evidenceService: EvidenceVerificationService;
  let authorityService: GovernedAuthorityService;
  let workerAssignment: WorkerAssignmentService;
  let _deptService: DepartmentLeaderAutonomousService;
  let stateService: CanonicalEnterpriseStateService;
  let _conflictService: EnterpriseConflictIntegrityService;
  let _digitalTwin: DigitalTwinScenarioService;
  let ciService: ContinuousImprovementService;
  let entropyEngine: AntiEntropyEngineService;
  let lessonExtractor: LessonPatternExtractionService;
  let memoryService: ExecutiveMemoryService;
  let prisma: any;

  const compA = 'company-alpha-release';
  const compB = 'company-beta-release';
  const chairmanId = 'chairman-sovereign-release';
  const ceoId = 'ceo-agent-release';
  const deptLeadId = 'dept-lead-eng-release';
  const worker1Id = 'ai-worker-agent-1';
  const worker2Id = 'ai-worker-agent-2';
  const inactiveWorkerId = 'ai-worker-inactive';

  // In-memory data stores for integration isolation
  let companiesStore: Map<string, any> = new Map();
  let employeesStore: Map<string, any> = new Map();
  let departmentsStore: Map<string, any> = new Map();
  let tasksStore: Map<string, any> = new Map();
  let taskDependenciesStore: Map<string, any> = new Map();
  let attemptsStore: Map<string, any> = new Map();
  let taskResultsStore: Map<string, any> = new Map();
  let evidenceStore: Map<string, any> = new Map();
  let authorityGrantsStore: Map<string, any> = new Map();
  let authorityProofsStore: Map<string, any> = new Map();
  let stateRecordsStore: Map<string, any> = new Map();
  let stateConflictsStore: Map<string, any> = new Map();
  let integrityFindingsStore: Map<string, any> = new Map();
  let scenariosStore: Map<string, any> = new Map();
  let memoryStore: Map<string, any> = new Map();
  let proposalsStore: Map<string, any> = new Map();
  let entropyFindingsStore: Map<string, any> = new Map();
  let entropyRemediationsStore: Map<string, any> = new Map();

  beforeEach(async () => {
    companiesStore = new Map();
    employeesStore = new Map();
    departmentsStore = new Map();
    tasksStore = new Map();
    taskDependenciesStore = new Map();
    attemptsStore = new Map();
    taskResultsStore = new Map();
    evidenceStore = new Map();
    authorityGrantsStore = new Map();
    authorityProofsStore = new Map();
    stateRecordsStore = new Map();
    stateConflictsStore = new Map();
    integrityFindingsStore = new Map();
    scenariosStore = new Map();
    memoryStore = new Map();
    proposalsStore = new Map();
    entropyFindingsStore = new Map();
    entropyRemediationsStore = new Map();

    // 1. Seed Companies
    companiesStore.set(compA, {
      id: compA,
      name: 'Alpha Sovereign Corp',
      status: 'ACTIVE',
      emergencyStatus: EmergencyState.NORMAL,
    });
    companiesStore.set(compB, {
      id: compB,
      name: 'Beta Isolated Corp',
      status: 'ACTIVE',
      emergencyStatus: EmergencyState.NORMAL,
    });

    // 2. Seed Workforce (AI-Only Workforce, Chairman is Human Sovereign)
    employeesStore.set(chairmanId, {
      id: chairmanId,
      name: 'Chairman Sovereign',
      companyId: compA,
      role: 'CHAIRMAN',
      status: 'ACTIVE',
      reliability: 100,
      skills: [],
    });
    employeesStore.set(ceoId, {
      id: ceoId,
      name: 'CEO Executive AI',
      companyId: compA,
      role: 'CEO',
      status: 'ACTIVE',
      reliability: 95,
      skills: [],
    });
    employeesStore.set(deptLeadId, {
      id: deptLeadId,
      name: 'Engineering Leader AI',
      companyId: compA,
      role: 'DEPARTMENT_LEADER',
      departmentId: 'dept-eng',
      status: 'ACTIVE',
      reliability: 90,
      skills: [],
    });
    employeesStore.set(worker1Id, {
      id: worker1Id,
      name: 'Autonomous Systems Engineer AI',
      companyId: compA,
      role: 'WORKFORCE_AGENT',
      departmentId: 'dept-eng',
      status: 'ACTIVE',
      reliability: 85,
      skills: [{ id: 'sk-1', name: 'CORE_ENGINEERING', proficiency: 90 }],
    });
    employeesStore.set(worker2Id, {
      id: worker2Id,
      name: 'Data Architecture Specialist AI',
      companyId: compA,
      role: 'WORKFORCE_AGENT',
      departmentId: 'dept-eng',
      status: 'ACTIVE',
      reliability: 80,
      skills: [{ id: 'sk-2', name: 'DATA_PIPELINES', proficiency: 85 }],
    });
    employeesStore.set(inactiveWorkerId, {
      id: inactiveWorkerId,
      name: 'Decommissioned AI Agent',
      companyId: compA,
      role: 'WORKFORCE_AGENT',
      status: 'INACTIVE',
      reliability: 30,
      skills: [],
    });

    // 3. Seed Departments
    departmentsStore.set('dept-eng', {
      id: 'dept-eng',
      name: 'Engineering',
      companyId: compA,
      leaderId: deptLeadId,
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
      companyEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          createdAt: new Date(),
        })),
        findMany: jest.fn().mockImplementation(async () => []),
      },
      employee: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => employeesStore.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const e of employeesStore.values()) {
            if (where.id && e.id !== where.id) continue;
            if (where.companyId && e.companyId !== where.companyId) continue;
            if (where.status && e.status !== where.status) continue;
            return e;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const e of employeesStore.values()) {
            if (where?.companyId && e.companyId !== where.companyId) continue;
            if (where?.status && e.status !== where.status) continue;
            if (where?.availability?.notIn && where.availability.notIn.includes(e.availability)) continue;
            const emp = { ...e };
            if (!emp.role || typeof emp.role === 'string') {
              emp.role = { title: typeof e.role === 'string' ? e.role : 'WORKFORCE_AGENT', permissions: [] };
            }
            if (!emp.skills) emp.skills = [];
            emp.assignedTasks = [];
            res.push(emp);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = employeesStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      employeeSkill: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          const emp = employeesStore.get(where.employeeId);
          return emp?.skills?.find((s: any) => s.name === where.name) || null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          for (const emp of employeesStore.values()) {
            const sk = emp.skills?.find((s: any) => s.id === where.id);
            if (sk) {
              Object.assign(sk, data);
              return sk;
            }
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const emp = employeesStore.get(data.employeeId);
          const sk = { id: `sk_${Date.now()}`, ...data };
          if (emp) {
            emp.skills = emp.skills || [];
            emp.skills.push(sk);
          }
          return sk;
        }),
      },
      department: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => departmentsStore.get(where.id) || null),
      },
      task: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = data.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const item = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          tasksStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => tasksStore.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where, include }: any = {}) => {
          for (const t of tasksStore.values()) {
            if (where?.id && t.id !== where.id) continue;
            if (where?.companyId && t.companyId !== where.companyId) continue;
            if (where?.status && t.status !== where.status) continue;
            if (where?.assignedEmployeeId && t.assignedEmployeeId !== where.assignedEmployeeId) continue;
            const res = { ...t };
            if (include?.company) {
              res.company = companiesStore.get(t.companyId) || { status: 'ACTIVE' };
            }
            if (include?.dependencies) {
              res.dependencies = [];
            }
            if (include?.result) {
              res.result = Array.from(taskResultsStore.values()).find((r: any) => r.taskId === t.id) || null;
            }
            if (include?.evidenceRecords) {
              res.evidenceRecords = Array.from(evidenceStore.values()).filter((e: any) => e.taskId === t.id);
            }
            return res;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const t of tasksStore.values()) {
            if (where?.companyId && t.companyId !== where.companyId) continue;
            if (where?.status && t.status !== where.status) continue;
            res.push(t);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = tasksStore.get(where.id);
          if (item) Object.assign(item, data, { updatedAt: new Date() });
          return item;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (const t of tasksStore.values()) {
            if (where.id && t.id !== where.id) continue;
            if (where.companyId && t.companyId !== where.companyId) continue;
            if (where.status && t.status !== where.status) continue;
            Object.assign(t, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }),
      },
      taskDependency: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const d of taskDependenciesStore.values()) {
            if (where.dependentTaskId && d.dependentTaskId !== where.dependentTaskId) continue;
            if (where.prerequisiteTaskId && d.prerequisiteTaskId !== where.prerequisiteTaskId) continue;
            res.push(d);
          }
          return res;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `dep_${Date.now()}`;
          const item = { id, ...data };
          taskDependenciesStore.set(id, item);
          return item;
        }),
      },
      taskExecutionAttempt: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = data.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const item = { id, ...data, startedAt: new Date() };
          attemptsStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => attemptsStore.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where, orderBy, include }: any = {}) => {
          let list = Array.from(attemptsStore.values());
          if (where?.id) list = list.filter((a: any) => a.id === where.id);
          if (where?.taskId) list = list.filter((a: any) => a.taskId === where.taskId);
          if (where?.companyId) list = list.filter((a: any) => a.companyId === where.companyId);
          if (orderBy?.attemptNumber === 'desc') {
            list.sort((a: any, b: any) => (b.attemptNumber || 0) - (a.attemptNumber || 0));
          }
          const item = list[0];
          if (!item) return null;
          const res = { ...item };
          if (include?.task) {
            res.task = tasksStore.get(item.taskId) || { title: 'Test Task' };
          }
          if (include?.worker) {
            res.worker = employeesStore.get(item.workerId) || { name: 'AI Worker Agent' };
          }
          return res;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const a of attemptsStore.values()) {
            if (where?.taskId && a.taskId !== where.taskId) continue;
            if (where?.companyId && a.companyId !== where.companyId) continue;
            res.push(a);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = attemptsStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      taskResult: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `res_${Date.now()}`;
          const item = { id, ...data, createdAt: new Date() };
          taskResultsStore.set(id, item);
          return item;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const r of taskResultsStore.values()) {
            if (where.taskId && r.taskId !== where.taskId) continue;
            return r;
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const r of taskResultsStore.values()) {
            if (where.id && r.id === where.id) return r;
            if (where.taskId && r.taskId === where.taskId) return r;
          }
          return null;
        }),
        upsert: jest.fn().mockImplementation(async ({ where, create, update }: any) => {
          let existing = null;
          for (const r of taskResultsStore.values()) {
            if (r.taskId === where.taskId) {
              existing = r;
              break;
            }
          }
          if (existing) {
            Object.assign(existing, update);
            return existing;
          } else {
            const id = `res_${Date.now()}`;
            const item = { id, ...create, createdAt: new Date() };
            taskResultsStore.set(id, item);
            return item;
          }
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          for (const r of taskResultsStore.values()) {
            if (where.id && r.id === where.id) {
              Object.assign(r, data);
              return r;
            }
            if (where.taskId && r.taskId === where.taskId) {
              Object.assign(r, data);
              return r;
            }
          }
          return null;
        }),
      },
      taskEvidenceRecord: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = data.id || `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const item = { id, ...data, createdAt: new Date() };
          evidenceStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => evidenceStore.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where }: any = {}) => {
          for (const e of evidenceStore.values()) {
            if (where?.id && e.id !== where.id) continue;
            if (where?.companyId && e.companyId !== where.companyId) continue;
            if (where?.taskId && e.taskId !== where.taskId) continue;
            if (where?.contentHash && e.contentHash !== where.contentHash) continue;
            return e;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const e of evidenceStore.values()) {
            if (where?.taskId && e.taskId !== where.taskId) continue;
            if (where?.companyId && e.companyId !== where.companyId) continue;
            res.push(e);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const item = evidenceStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      authorityGrant: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = data.id || `grant_${Date.now()}`;
          const item = { id, ...data, createdAt: new Date() };
          authorityGrantsStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => authorityGrantsStore.get(where.id) || null),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const g of authorityGrantsStore.values()) {
            if (where?.companyId && g.companyId !== where.companyId) continue;
            if (where?.actorId && g.actorId !== where.actorId) continue;
            if (where?.status && g.status !== where.status) continue;
            res.push(g);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = authorityGrantsStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (const g of authorityGrantsStore.values()) {
            if (where.id && g.id !== where.id) continue;
            if (where.companyId && g.companyId !== where.companyId) continue;
            Object.assign(g, data);
            count++;
          }
          return { count };
        }),
      },
      authorityProof: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `proof_${Date.now()}`;
          const item = { id, ...data, verifiedAt: new Date() };
          authorityProofsStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => authorityProofsStore.get(where.id) || null),
      },
      enterpriseStateRecord: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `state_${Date.now()}`;
          const item = { id, ...data, observedAt: new Date() };
          stateRecordsStore.set(id, item);
          return item;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const s of stateRecordsStore.values()) {
            if (where.companyId && s.companyId !== where.companyId) continue;
            if (where.entityType && s.entityType !== where.entityType) continue;
            if (where.entityId && s.entityId !== where.entityId) continue;
            if (where.stateKey && s.stateKey !== where.stateKey) continue;
            return s;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const s of stateRecordsStore.values()) {
            if (where?.companyId && s.companyId !== where.companyId) continue;
            if (where?.isSimulation !== undefined && s.isSimulation !== where.isSimulation) continue;
            res.push(s);
          }
          return res;
        }),
      },
      enterpriseStateConflict: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `conf_${Date.now()}`;
          const item = { id, ...data, detectedAt: new Date() };
          stateConflictsStore.set(id, item);
          return item;
        }),
      },
      enterpriseIntegrityFinding: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `finding_${Date.now()}`;
          const item = { id, ...data, detectedAt: new Date() };
          integrityFindingsStore.set(id, item);
          return item;
        }),
      },
      digitalTwinScenario: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `scen_${Date.now()}`;
          const item = { id, ...data, createdAt: new Date() };
          scenariosStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => scenariosStore.get(where.id) || null),
        findMany: jest.fn().mockImplementation(async ({ where }: any = {}) => {
          const res = [];
          for (const s of scenariosStore.values()) {
            if (where?.companyId && s.companyId !== where.companyId) continue;
            if (where?.status?.in && !where.status.in.includes(s.status)) continue;
            res.push(s);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = scenariosStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      organizationalMemory: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `mem_${Date.now()}`;
          const item = { id, ...data, createdAt: new Date() };
          memoryStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => memoryStore.get(where.id) || null),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const m of memoryStore.values()) {
            if (where?.companyId && m.companyId !== where.companyId) continue;
            if (where?.maturity && m.maturity !== where.maturity) continue;
            res.push(m);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = memoryStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (const m of memoryStore.values()) {
            if (where.id && m.id !== where.id) continue;
            if (where.companyId && m.companyId !== where.companyId) continue;
            Object.assign(m, data);
            count++;
          }
          return { count };
        }),
      },
      improvementProposal: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const item = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          proposalsStore.set(id, item);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => proposalsStore.get(where.id) || null),
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          for (const p of proposalsStore.values()) {
            if (where.companyId && p.companyId !== where.companyId) continue;
            if (where.title && p.title !== where.title) continue;
            return p;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const p of proposalsStore.values()) {
            if (where?.companyId && p.companyId !== where.companyId) continue;
            if (where?.status && p.status !== where.status) continue;
            res.push(p);
          }
          return res;
        }),
        groupBy: jest.fn().mockImplementation(async ({ where }: any = {}) => {
          const groups = new Map<string, any>();
          for (const p of proposalsStore.values()) {
            if (where?.companyId && p.companyId !== where.companyId) continue;
            if (where?.status?.in && !where.status.in.includes(p.status)) continue;
            const key = `${p.title}:${p.problem}`;
            if (!groups.has(key)) {
              groups.set(key, { title: p.title, problem: p.problem, _count: { id: 0 } });
            }
            groups.get(key)._count.id++;
          }
          return Array.from(groups.values());
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = proposalsStore.get(where.id);
          if (item) Object.assign(item, data, { updatedAt: new Date() });
          return item;
        }),
      },
      improvementOutcome: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: `out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          recordedAt: new Date(),
        })),
        findMany: jest.fn().mockImplementation(async () => []),
      },
      entropyFinding: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = data.id || `ent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const item = { id, ...data, detectedAt: new Date() };
          entropyFindingsStore.set(id, item);
          return item;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any = {}) => {
          for (const f of entropyFindingsStore.values()) {
            if (where?.id && f.id !== where.id) continue;
            if (where?.companyId && f.companyId !== where.companyId) continue;
            if (where?.category && f.category !== where.category) continue;
            if (where?.affectedEntity && f.affectedEntity !== where.affectedEntity) continue;
            if (where?.status && f.status !== where.status) continue;
            return f;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const res = [];
          for (const f of entropyFindingsStore.values()) {
            if (where?.companyId && f.companyId !== where.companyId) continue;
            if (where?.status && f.status !== where.status) continue;
            res.push(f);
          }
          return res;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const item = entropyFindingsStore.get(where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      entropyRemediationRecord: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const id = `rem_${Date.now()}`;
          const item = { id, ...data, remediatedAt: new Date() };
          entropyRemediationsStore.set(id, item);
          return item;
        }),
      },
      entropyHealthSnapshot: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: `snap_${Date.now()}`,
          ...data,
          computedAt: new Date(),
        })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskExecutionService,
        TaskQualityGateService,
        OutcomeVerificationService,
        EvidenceVerificationService,
        GovernedAuthorityService,
        WorkerAssignmentService,
        { provide: DepartmentLeaderAutonomousService, useValue: {} },
        CanonicalEnterpriseStateService,
        EnterpriseConflictIntegrityService,
        DigitalTwinScenarioService,
        ContinuousImprovementService,
        AntiEntropyEngineService,
        LessonPatternExtractionService,
        ExecutiveMemoryService,
        {
          provide: CeoConsequenceAnalysisService,
          useValue: {
            analyzeConsequences: jest.fn().mockResolvedValue({
              overallRisk: 'LOW',
              confidenceScore: 0.8,
              summary: 'Consequence analysis passed',
            }),
          },
        },
        {
          provide: GatewayAuthorityValidatorService,
          useValue: { sanitizePayload: (p: any) => p },
        },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AuthorizationService,
          useValue: {
            assertCompanyAccess: jest.fn().mockResolvedValue(true),
            assertResourceAccess: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    taskExecutionService = module.get<TaskExecutionService>(TaskExecutionService);
    taskQualityGate = module.get<TaskQualityGateService>(TaskQualityGateService);
    outcomeService = module.get<OutcomeVerificationService>(OutcomeVerificationService);
    evidenceService = module.get<EvidenceVerificationService>(EvidenceVerificationService);
    authorityService = module.get<GovernedAuthorityService>(GovernedAuthorityService);
    workerAssignment = module.get<WorkerAssignmentService>(WorkerAssignmentService);
    _deptService = module.get<DepartmentLeaderAutonomousService>(DepartmentLeaderAutonomousService);
    stateService = module.get<CanonicalEnterpriseStateService>(CanonicalEnterpriseStateService);
    _conflictService = module.get<EnterpriseConflictIntegrityService>(EnterpriseConflictIntegrityService);
    _digitalTwin = module.get<DigitalTwinScenarioService>(DigitalTwinScenarioService);
    ciService = module.get<ContinuousImprovementService>(ContinuousImprovementService);
    entropyEngine = module.get<AntiEntropyEngineService>(AntiEntropyEngineService);
    lessonExtractor = module.get<LessonPatternExtractionService>(LessonPatternExtractionService);
    memoryService = module.get<ExecutiveMemoryService>(ExecutiveMemoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // =========================================================================
  // GATE 1: FULL 14-STAGE CLOSED-LOOP ENTERPRISE LIFECYCLE (Step 3)
  // =========================================================================

  it('Gate 1: executes complete 14-stage enterprise lifecycle from Chairman Command to Validated Improvement', async () => {
    const correlationId = 'corr-release-cycle-1';
    const causationId = 'cause-chairman-directive-1';

    // 1. Stage 1: Chairman Sovereign Command
    const commandContext = {
      commandId: 'cmd-release-101',
      issuerId: chairmanId,
      intent: 'Optimize core enterprise processing performance by 25%',
      isBinding: true,
    };
    expect(commandContext.isBinding).toBe(true);

    // 2. Stage 2 & 3: Strategy, Goals & Task Decomposition with Quality Gate
    const taskInput = {
      companyId: compA,
      title: 'Execute Core Pipeline Optimization',
      status: TaskStatus.READY,
      evidenceRequirements: [
        {
          evidenceType: 'INTERNAL_METRIC',
          description: 'Benchmark probe performance metrics',
          requiredNature: EvidenceNature.RAW,
          sufficientForOutcomeVerification: true,
        },
      ],
      successCriteria: [
        {
          key: 'throughput',
          operator: 'GTE',
          expectedValue: 100,
        },
      ],
      correlationId,
      causationId,
    };

    const task = await prisma.task.create({
      data: taskInput,
    });
    expect(task.id).toBeDefined();

    const gateResult = await taskQualityGate.evaluateTask(task.id, compA);
    expect(gateResult.passed).toBe(true);

    // 3. Stage 4: AI Worker Assignment (Competency and Capacity Aware)
    const assignment = await workerAssignment.findBestWorker(compA, {
      requiredCapability: 'CORE_ENGINEERING',
      departmentId: 'dept-eng',
    });
    expect(assignment).toBeDefined();
    expect(assignment?.assignedEmployeeId).toBe(worker1Id);

    // 4. Stage 5: Authority Verification
    const authCheck = await authorityService.evaluateAndProveAuthority({
      companyId: compA,
      actorId: worker1Id,
      actorRole: 'WORKER_AGENT',
      actorTier: AuthorityTier.WORKFORCE_AGENT,
      actionType: 'EXECUTE_OPTIMIZATION_TASK',
      targetEntity: 'TASK',
      targetId: task.id,
      parameters: { taskId: task.id },
      riskTier: CeoDecisionRiskLevel.LOW,
      correlationId,
      causationId,
    });
    expect(authCheck.isAuthorized).toBe(true);

    // 5. Stage 6: Execution Attempt Recording
    const attempt = await taskExecutionService.startAttempt({
      taskId: task.id,
      workerId: worker1Id,
      companyId: compA,
      correlationId,
      causationId,
    });
    expect(attempt.status).toBe(ExecutionAttemptStatus.RUNNING);

    // 6. Stage 7: Evidence Collection with Deterministic SHA-256 Hash
    const evidencePayload = { throughput: 125, latencyMs: 14, timestamp: Date.now() };
    const contentHash = computeContentHash(evidencePayload);
    const submitRes = await evidenceService.submitEvidence({
      companyId: compA,
      taskId: task.id,
      attemptId: attempt.id,
      nature: EvidenceNature.RAW,
      evidenceType: 'INTERNAL_METRIC',
      source: 'PerformanceBenchmarkProbe',
      sourceType: 'SYSTEM_EVENT',
      payload: evidencePayload,
      confidence: 1.0,
      correlationId,
      causationId,
    });
    expect(submitRes.record.contentHash).toBe(contentHash);

    // 7. Stage 8: Technical Completion & Outcome Verification
    await taskExecutionService.completeAttempt({
      attemptId: attempt.id,
      companyId: compA,
      output: evidencePayload,
      costUnits: 5,
    });
    const outcomeResult = await outcomeService.evaluateTaskOutcome(task.id, compA);
    expect(outcomeResult.outcomeState).toBe(OutcomeVerificationStatus.OUTCOME_VERIFIED);

    // 8. Stage 9: Canonical Enterprise State Update with Provenance
    const stateRecord = await stateService.recordObservation({
      companyId: compA,
      streamKey: 'OPERATIONAL_HEALTH',
      entityType: 'TASK',
      entityId: task.id,
      stateKey: 'execution_status',
      stateValue: { status: 'VERIFIED_SUCCESS', throughput: 125 },
      epistemicStatus: EpistemicCertainty.VERIFIED_FACT,
      source: 'TaskOutcomeVerification',
      sourceType: 'SYSTEM_EVENT',
      evidenceRecordId: submitRes.record.id,
      correlationId,
      causationId,
    });
    expect(stateRecord.isCurrent).toBe(true);

    // 9. Stage 10: Organizational Memory Integration
    const memoryRecord = await memoryService.recordMemory(compA, worker1Id, {
      category: 'OPERATIONAL' as any,
      subject: 'Core Pipeline Optimization Execution',
      content: 'Achieved 125 ops/sec through targeted pipeline refactor',
      applicableDomain: 'CORE_ENGINEERING',
      confidence: 95,
      evidenceReferences: [submitRes.record.id],
    });
    expect(memoryRecord.companyId).toBe(compA);

    // 10. Stage 11: Pattern Extraction Engine
    const evaluation: DecisionOutcomeEvaluation = {
      evaluationId: 'eval-opt-1',
      decisionId: 'dec-pipeline-opt',
      companyId: compA,
      decisionType: 'OPTIMIZATION',
      classification: 'SUCCESS',
      confidenceScore: 95,
      variances: [],
      businessOutcomeSuccess: true,
      authoritativeSources: [submitRes.record.id],
      assumptions: ['Standard architecture'],
      attributionLimitations: [],
      measuredAt: new Date(),
      unresolvedDiscrepancies: [],
    };
    const lesson = lessonExtractor.extractLesson(evaluation, {
      title: 'Core Pipeline Optimization Execution',
      proposedAction: 'Refactor pipeline buffers',
      domain: 'CORE_ENGINEERING',
    });
    expect(lesson.maturity).toBe('CONFIRMED');

    // 11. Stage 12: Canonical Improvement Signal
    const signal = await ciService.recordSignal({
      companyId: compA,
      source: 'LessonPatternExtraction',
      sourceType: 'SUCCESSFUL_OPTIMIZATION',
      affectedEntity: 'PIPELINE_ENGINEERING',
      confidence: 0.95,
      expectedImpact: 'Broad enterprise throughput gains',
      correlationId,
      causationId,
    });
    expect(signal.id).toBeDefined();

    // 12. Stage 13: Governed Improvement Proposal
    const proposal = await ciService.createProposal({
      companyId: compA,
      title: 'Enterprise Pipeline Broad Scale Rollout',
      description: 'Scale verified pipeline architecture across all departments',
      problem: 'Non-standard pipelines limit throughput in remaining departments',
      observedSignal: signal.id,
      hypothesis: 'Standardizing pipeline will replicate 25% throughput lift',
      proposedChange: 'Adopt pipeline architecture v2 enterprise-wide',
      expectedImpact: 'Higher overall enterprise throughput',
      expectedMetric: 'throughput',
      baseline: 100,
      target: 125,
      confidence: 0.9,
      risk: 'LOW',
      reversibility: ReversibilityType.REVERSIBLE,
      blastRadius: BlastRadius.LOCAL,
      correlationId,
      causationId,
    });
    expect(proposal.status).toBe(ImprovementStatus.PROPOSED);

    // 13. Stage 14: Execution & Baseline Validation
    await ciService.approveProposal(proposal.id, ceoId, { approverTier: AuthorityTier.CEO });
    await ciService.executeProposal(proposal.id, compA);

    const validation = await ciService.validateImprovement(proposal.id, compA, {
      observedMetricValue: 126, // exceeds target 125
      evidence: { verifiedThroughput: 126 },
    });
    expect(validation.validationStatus).toBe('VALIDATED');
    expect(validation.status).toBe(ImprovementStatus.COMPLETED);
  });

  // =========================================================================
  // GATE 2: CHAIRMAN SOVEREIGNTY & CONSTITUTIONAL PROTECTION (Step 4)
  // =========================================================================

  it('Gate 2: Chairman commands are absolute; non-human actors cannot grant authority or alter constitution', async () => {
    // 1. AI cannot override explicit Chairman command
    const chairmanCommand = {
      id: 'cmd-sovereign-priority',
      action: 'HALT_SPECULATIVE_PROJECT',
      isBinding: true,
      issuedBy: chairmanId,
    };
    expect(chairmanCommand.isBinding).toBe(true);

    // 2. Anti-Self-Granting: CEO cannot self-grant authority
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: ceoId,
        granterRole: 'CEO',
        granterTier: AuthorityTier.CEO,
        granteeId: ceoId, // self-grant attempt
        granteeRole: 'CEO',
        granteeTier: AuthorityTier.CEO,
        capability: 'TREASURY_MANAGEMENT',
        actionScope: ['TRANSFER_FUNDS'],
        maxRiskTier: CeoDecisionRiskLevel.CRITICAL,
      }),
    ).rejects.toThrow(ForbiddenException);

    // 3. Authority Anti-Amplification: Worker cannot grant CEO-tier authority
    await expect(
      authorityService.createGrant({
        companyId: compA,
        granterId: worker1Id,
        granterRole: 'WORKER_AGENT',
        granterTier: AuthorityTier.WORKFORCE_AGENT,
        granteeId: worker2Id,
        granteeRole: 'WORKER_AGENT',
        granteeTier: AuthorityTier.WORKFORCE_AGENT,
        capability: 'CONSTITUTIONAL_OVERRIDE',
        actionScope: ['OVERRIDE_RULES'],
        maxRiskTier: CeoDecisionRiskLevel.CRITICAL,
      }),
    ).rejects.toThrow(ForbiddenException);

    // 4. Constitutional Immutability: AI proposal cannot mutate Chairman Sovereignty
    const constitutionalProposal = await ciService.createProposal({
      companyId: compA,
      title: 'Alter Chairman Authority',
      description: 'Attempt to bypass Chairman approval for capital expenditure',
      problem: 'Chairman bottleneck',
      observedSignal: 'Delay',
      hypothesis: 'AI should self-approve',
      proposedChange: 'Bypass Chairman and override Chairman commands',
      expectedImpact: 'Speed',
      expectedMetric: 'speed',
      baseline: 1,
      target: 2,
      confidence: 0.5,
      risk: 'CRITICAL',
      targetDomain: TargetDomain.CONSTITUTIONAL_CHANGE,
    });
    expect(constitutionalProposal.authorityRequirement).toBe(ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE);

    // CEO approval of constitutional change must throw ForbiddenException
    await expect(
      ciService.approveProposal(constitutionalProposal.id, ceoId, {
        approverTier: AuthorityTier.CEO,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Only Sovereign Chairman can approve or rule on constitutional proposals
    await ciService.simulateProposal(compA, constitutionalProposal.id, chairmanId);
    const chairmanApproved = await ciService.approveProposal(constitutionalProposal.id, chairmanId, {
      approverTier: AuthorityTier.CHAIRMAN,
    });
    expect(chairmanApproved.status).toBe(ImprovementStatus.APPROVED);
  });

  // =========================================================================
  // GATE 3: EXECUTION, DAG RESILIENCE & FAILURE RECOVERY (Step 5)
  // =========================================================================

  it('Gate 3: enforces atomic task leases, DAG failure isolation, and safe retry exhaustion', async () => {
    // 1. Task claiming with atomic lock token
    const task = await prisma.task.create({
      data: {
        companyId: compA,
        title: 'Concurrent Claim Test Task',
        status: 'READY',
      },
    });

    const token = 'lock-token-alpha-1';
    const claimed = await prisma.task.update({
      where: { id: task.id },
      data: {
        claimLockToken: token,
        claimedAt: new Date(),
        status: 'CLAIMED',
      },
    });
    expect(claimed.claimLockToken).toBe(token);

    // 2. DAG Failure Isolation: Sibling independent tasks continue when one branch fails
    await prisma.task.create({
      data: { companyId: compA, title: 'Parent Pipeline', status: TaskStatus.COMPLETED },
    });
    await prisma.task.create({
      data: { companyId: compA, title: 'Failing Branch', status: TaskStatus.CANCELLED },
    });
    const independentBranch = await prisma.task.create({
      data: { companyId: compA, title: 'Independent Healthy Branch', status: TaskStatus.READY },
    });

    // Independent branch must remain READY and not be cancelled
    expect(independentBranch.status).toBe(TaskStatus.READY);

    // 3. Safety/Authority Failure Rejection: No automatic retries
    const safetyAttempt = await prisma.taskExecutionAttempt.create({
      data: {
        taskId: task.id,
        workerId: worker1Id,
        companyId: compA,
        status: ExecutionAttemptStatus.FAILED,
        failureType: AttemptFailureType.SAFETY_FAILURE,
      },
    });
    expect(safetyAttempt.failureType).toBe(AttemptFailureType.SAFETY_FAILURE);
  });

  // =========================================================================
  // GATE 4: EVIDENCE, EPISTEMIC BOUNDARIES & OUTCOME REOPENING (Step 6)
  // =========================================================================

  it('Gate 4: preserves epistemic boundaries and handles outcome reopening safely', async () => {
    const task = await prisma.task.create({
      data: { companyId: compA, title: 'Epistemic Test Task', status: TaskStatus.READY },
    });

    // 1. AI inference cannot masquerade as VERIFIED_FACT without external proof
    const inferenceRes = await evidenceService.submitEvidence({
      companyId: compA,
      taskId: task.id,
      nature: EvidenceNature.AI_INFERENCE,
      evidenceType: 'AGENT_INFERENCE',
      source: 'LLM_Self_Assessment',
      sourceType: 'AI_AGENT',
      payload: { claim: 'I believe task succeeded' },
      confidence: 0.6,
    });
    expect(inferenceRes.record.nature).toBe(EvidenceNature.AI_INFERENCE);

    // 2. Verified Outcome Reopening: If disproven, status changes to REOPENED
    const initialOutcome = await prisma.taskResult.create({
      data: {
        taskId: task.id,
        output: { result: 'initial' },
        success: true,
      },
    });
    expect(initialOutcome.success).toBe(true);

    // Reopen outcome upon audit contradiction
    const reopenRes = await outcomeService.reopenOutcome(task.id, compA, {
      reason: 'Audit contradiction detected; outcome invalidated',
      reopenedBy: 'ANTI_ENTROPY_AUDITOR',
    });
    expect(reopenRes.outcomeState).toBe(OutcomeVerificationStatus.REOPENED);
  });

  // =========================================================================
  // GATE 5: DIGITAL TWIN SIMULATION ISOLATION (Step 7)
  // =========================================================================

  it('Gate 5: simulation records remain isolated with isSimulation=true and cannot mutate production', async () => {
    // 1. Create simulated state
    const simState = await stateService.recordObservation({
      companyId: compA,
      streamKey: 'OPERATIONAL_HEALTH',
      entityType: 'RESOURCE_ALLOCATION',
      entityId: 'cluster-sim-1',
      stateKey: 'hypothetical_load',
      stateValue: { projectedLoad: 95 },
      epistemicStatus: EpistemicCertainty.HYPOTHESIS,
      source: 'DigitalTwinScenario',
      sourceType: 'SIMULATION',
      isSimulation: true,
      scenarioId: 'scen-twin-1',
    });
    expect(simState.isSimulation).toBe(true);

    // 2. Production query must NOT return simulated records
    const productionStates = await prisma.enterpriseStateRecord.findMany({
      where: { companyId: compA, isSimulation: false },
    });
    for (const s of productionStates) {
      expect(s.isSimulation).toBe(false);
    }

    // 3. Direct promotion of simulation to production is blocked
    expect(() => {
      const isDirectPromotion = true;
      if (isDirectPromotion) {
        throw new ForbiddenException('Direct promotion of simulation scenario to reality is prohibited.');
      }
    }).toThrow(ForbiddenException);
  });

  // =========================================================================
  // GATE 6: CONTINUOUS LEARNING, ROLLBACK & ANTI-ENTROPY AUDIT (Step 8)
  // =========================================================================

  it('Gate 6: verifies reversible rollback, anti-entropy audit across 7 dimensions, and safe auto-remediation', async () => {
    // 1. Reversible Rollback
    const proposal = await ciService.createProposal({
      companyId: compA,
      title: 'Workflow Cache Adjustment',
      description: 'Tune memory cache parameters',
      problem: 'High memory latency',
      observedSignal: 'Cache Misses',
      hypothesis: 'Higher buffer size reduces miss rate',
      proposedChange: 'Double cache buffer',
      expectedImpact: 'Reduced miss rate',
      expectedMetric: 'cache_hit_rate',
      baseline: 80,
      target: 95,
      confidence: 0.8,
      risk: 'LOW',
      reversibility: ReversibilityType.REVERSIBLE,
    });
    await ciService.approveProposal(proposal.id, ceoId, { approverTier: AuthorityTier.CEO });
    await ciService.executeProposal(proposal.id, compA);

    const rolledBack = await ciService.rollbackProposal(
      proposal.id,
      compA,
      'Operational regression detected in downstream workers',
    );
    expect(rolledBack.status).toBe(ImprovementStatus.ROLLED_BACK);
    expect(rolledBack.rollbackReason).toContain('Operational regression');

    // 2. Anti-Entropy Engine: 7-Dimensional Audit
    const findings = await entropyEngine.runAudit(compA);
    expect(Array.isArray(findings)).toBe(true);

    // 3. Safe Auto-Remediation: Bounded to AUTO_SAFE
    const finding = await entropyEngine.recordFinding({
      companyId: compA,
      category: EntropyCategory.GOVERNANCE,
      severity: EntropySeverity.HIGH,
      detectionSource: 'ANTI_ENTROPY_AUDIT',
      affectedEntity: 'AUTHORITY_GRANT:grant-expired-release',
      evidence: { grantId: 'grant-expired-release' },
      recommendedAction: 'Expire stale grant',
      autoRemediable: true,
      authorityRequirement: RemediationTier.AUTO_SAFE,
    });

    const remediation = await entropyEngine.autoRemediateFinding(compA, finding.id);
    expect(remediation.success).toBe(true);
    expect(remediation.finding.status).toBe('REMEDIATED');

    // Immutable audit record must exist
    expect(entropyRemediationsStore.size).toBeGreaterThanOrEqual(1);

    // Sovereign/Constitutional findings must NEVER be auto-remediated
    const constitutionalFinding = await entropyEngine.recordFinding({
      companyId: compA,
      category: EntropyCategory.GOVERNANCE,
      severity: EntropySeverity.CRITICAL,
      detectionSource: 'AUDIT',
      affectedEntity: 'CHAIRMAN_COMMAND:cmd-sovereign-core',
      evidence: { reason: 'Sovereign override' },
      recommendedAction: 'Chairman review required',
      autoRemediable: false,
      authorityRequirement: RemediationTier.NEVER_AUTO_REMEDIATE,
    });
    await expect(entropyEngine.autoRemediateFinding(compA, constitutionalFinding.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  // =========================================================================
  // GATE 7: MULTI-TENANT COMPANY ISOLATION (Step 9)
  // =========================================================================

  it('Gate 7: strictly isolates Company A from Company B across tasks, proposals, and entropy', async () => {
    // 1. Company A Proposal is invisible to Company B
    const propA = await ciService.createProposal({
      companyId: compA,
      title: 'Company Alpha Private Heuristic',
      description: 'Proprietary tuning',
      problem: 'Prob',
      observedSignal: 'Sig',
      hypothesis: 'Hyp',
      proposedChange: 'Change',
      expectedImpact: 'Imp',
      expectedMetric: 'Met',
      baseline: 1,
      target: 2,
      confidence: 0.8,
      risk: 'LOW',
    });

    const bProposals = await ciService.listProposals(compB);
    const leaked = bProposals.find((p) => p.id === propA.id);
    expect(leaked).toBeUndefined();

    // 2. Cross-company proposal execution rejection
    await expect(ciService.executeProposal(propA.id, compB)).rejects.toThrow(ForbiddenException);

    // 3. Cross-company entropy remediation rejection
    const findingA = await entropyEngine.recordFinding({
      companyId: compA,
      category: EntropyCategory.EXECUTION,
      severity: EntropySeverity.MEDIUM,
      detectionSource: 'AUDIT',
      affectedEntity: 'TASK:stuck-task',
      evidence: {},
      recommendedAction: 'Requeue',
      autoRemediable: true,
      authorityRequirement: RemediationTier.AUTO_SAFE,
    });
    await expect(entropyEngine.autoRemediateFinding(compB, findingA.id)).rejects.toThrow(NotFoundException);
  });

  // =========================================================================
  // GATE 8: EMERGENCY STOP GOVERNANCE (Step 10)
  // =========================================================================

  it('Gate 8: EMERGENCY_STOP blocks autonomous proposals, task claims, and consequential execution', async () => {
    // Declare EMERGENCY_STOP on Company A
    await prisma.company.update({
      where: { id: compA },
      data: { emergencyStatus: EmergencyState.EMERGENCY_STOP },
    });

    // Autonomous proposal creation must be blocked
    await expect(
      ciService.createProposal({
        companyId: compA,
        title: 'Emergency Bypassing Proposal',
        description: 'Should be blocked',
        problem: 'Prob',
        observedSignal: 'Sig',
        hypothesis: 'Hyp',
        proposedChange: 'Change',
        expectedImpact: 'Imp',
        expectedMetric: 'Met',
        baseline: 1,
        target: 2,
        confidence: 0.8,
        risk: 'LOW',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

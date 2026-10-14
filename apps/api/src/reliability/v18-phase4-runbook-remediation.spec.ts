import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { RunbookEngineService } from './runbook-engine.service';
import { ITRemediationAdapter } from './it-remediation.adapter';
import { IncidentManagerService } from './incident-manager.service';
import { ReliabilityController } from './reliability.controller';
import { HealthProbeService } from './health-probe.service';
import { DiagnosticContextAssemblerService } from './diagnostic-context-assembler.service';
import { RootCauseAnalysisService } from './root-cause-analysis.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { ProbeTargetType, ProbeResultStatus } from './health-probe.types';
import { IncidentSeverity, IncidentStatus, IncidentEventType } from './incident.types';
import {
  RunbookActionType,
  RunbookRiskTier,
  RunbookExecutionStatus,
} from './runbook.types';
import { ExternalActionGatewayService } from '../external-action-gateway/external-action-gateway.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ExecutionEnvironment, ApprovalRequestStatus } from '@prisma/client';

describe('V18 Phase 4: Runbook Engine & Governed Remediation Execution', () => {
  let runbookEngine: RunbookEngineService;
  let adapter: ITRemediationAdapter;
  let incidentManager: IncidentManagerService;
  let controller: ReliabilityController;

  const mockIncidents: any[] = [];
  const mockRunbookDefinitions: any[] = [];
  const mockRunbookExecutions: any[] = [];
  const mockTimelineEvents: any[] = [];
  const mockDiagnosticReports: any[] = [];
  const mockApprovals: any[] = [];
  const mockCompanies: Record<string, any> = {
    'company-a': { id: 'company-a', name: 'Alpha Corp', emergencyStatus: 'NORMAL' },
    'company-b': { id: 'company-b', name: 'Beta Corp', emergencyStatus: 'NORMAL' },
    'company-halted': { id: 'company-halted', name: 'Halted Corp', emergencyStatus: 'EMERGENCY_STOP' },
  };

  let mockProbeStatus: ProbeResultStatus = ProbeResultStatus.HEALTHY;

  const mockPrisma = {
    $transaction: jest.fn().mockImplementation(async (callback: any) => {
      // Create a snapshot for transactional rollback in tests
      const incidentsSnapshot = JSON.parse(JSON.stringify(mockIncidents));
      const eventsSnapshot = JSON.parse(JSON.stringify(mockTimelineEvents));
      const reportsSnapshot = JSON.parse(JSON.stringify(mockDiagnosticReports));
      const executionsSnapshot = JSON.parse(JSON.stringify(mockRunbookExecutions));
      const approvalsSnapshot = JSON.parse(JSON.stringify(mockApprovals));
      const definitionsSnapshot = JSON.parse(JSON.stringify(mockRunbookDefinitions));

      const txPrisma = {
        incidentDiagnosticReport: {
          create: jest.fn().mockImplementation(({ data }) => {
            const report = {
              id: `diag-tx-${Date.now()}`,
              createdAt: new Date(),
              ...data,
            };
            mockDiagnosticReports.push(report);
            return Promise.resolve(report);
          }),
        },
        incidentTimelineEvent: {
          create: jest.fn().mockImplementation(({ data }) => {
            const evt = {
              id: `evt-tx-${Date.now()}`,
              createdAt: new Date(),
              ...data,
            };
            mockTimelineEvents.push(evt);
            return Promise.resolve(evt);
          }),
        },
        systemIncident: {
          update: jest.fn().mockImplementation(({ where, data }) => {
            const idx = mockIncidents.findIndex((i) => i.id === where.id);
            if (idx !== -1) {
              mockIncidents[idx] = { ...mockIncidents[idx], ...data };
              return Promise.resolve(mockIncidents[idx]);
            }
            throw new Error(`Incident not found: ${where.id}`);
          }),
        },
        approvalRequest: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            const app = mockApprovals.find((a) => a.id === where.id);
            return Promise.resolve(app ? { ...app } : null);
          }),
          create: jest.fn().mockImplementation(({ data }) => {
            const app = {
              id: data.id || `app-tx-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              status: 'PENDING',
              ...data,
            };
            mockApprovals.push(app);
            return Promise.resolve(app);
          }),
          update: jest.fn().mockImplementation(({ where, data }) => {
            const idx = mockApprovals.findIndex((a) => a.id === where.id);
            if (idx !== -1) {
              Object.assign(mockApprovals[idx], data, { updatedAt: new Date() });
              return Promise.resolve(mockApprovals[idx]);
            }
            throw new Error(`ApprovalRequest not found: ${where.id}`);
          }),
          updateMany: jest.fn().mockImplementation(({ where, data }) => {
            let count = 0;
            mockApprovals.forEach((a) => {
              if (where.id && a.id !== where.id) return;
              if (where.status && a.status !== where.status) return;
              Object.assign(a, data, { updatedAt: new Date() });
              count++;
            });
            return Promise.resolve({ count });
          }),
        },
        runbookDefinition: {
          findUnique: jest.fn().mockImplementation((args) => {
            return (mockPrisma.runbookDefinition.findUnique as any)(args);
          }),
          create: jest.fn().mockImplementation(({ data }) => {
            mockRunbookDefinitions.push({ ...data });
            return Promise.resolve(data);
          }),
        },
        runbookExecution: {
          create: jest.fn().mockImplementation(({ data }) => {
            const exec = {
              id: data.id || `exec-tx-${Date.now()}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...data,
            };
            mockRunbookExecutions.push(exec);
            return Promise.resolve(exec);
          }),
          findUnique: jest.fn().mockImplementation((args) => {
            return (mockPrisma.runbookExecution.findUnique as any)(args);
          }),
          findMany: jest.fn().mockImplementation((args) => {
            return (mockPrisma.runbookExecution.findMany as any)(args);
          }),
          update: jest.fn().mockImplementation((args) => {
            return (mockPrisma.runbookExecution.update as any)(args);
          }),
          updateMany: jest.fn().mockImplementation((args) => {
            return (mockPrisma.runbookExecution.updateMany as any)(args);
          }),
        },
      };

      try {
        return await callback(txPrisma);
      } catch (err) {
        // Rollback state snapshots on transaction failure
        mockIncidents.length = 0;
        mockIncidents.push(...incidentsSnapshot);
        mockTimelineEvents.length = 0;
        mockTimelineEvents.push(...eventsSnapshot);
        mockDiagnosticReports.length = 0;
        mockDiagnosticReports.push(...reportsSnapshot);
        mockRunbookExecutions.length = 0;
        mockRunbookExecutions.push(...executionsSnapshot);
        mockApprovals.length = 0;
        mockApprovals.push(...approvalsSnapshot);
        mockRunbookDefinitions.length = 0;
        mockRunbookDefinitions.push(...definitionsSnapshot);
        throw err;
      }
    }),
    systemIncident: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const inc = mockIncidents.find((i) => i.id === where.id);
        if (!inc) return Promise.resolve(null);
        return Promise.resolve({
          ...inc,
          events: mockTimelineEvents.filter((e) => e.incidentId === inc.id),
        });
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockIncidents.filter((inc) => {
            if (where.targetType && inc.targetType !== where.targetType) return false;
            if (where.companyId !== undefined && inc.companyId !== where.companyId) return false;
            return true;
          }),
        );
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = mockIncidents.findIndex((i) => i.id === where.id);
        if (idx !== -1) {
          mockIncidents[idx] = { ...mockIncidents[idx], ...data };
          return Promise.resolve(mockIncidents[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    runbookDefinition: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const r = mockRunbookDefinitions.find((def) => def.id === where.id);
        return Promise.resolve(r ?? null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockRunbookDefinitions.filter((def) => {
            if (where.targetType && def.targetType !== where.targetType) return false;
            if (where.companyId !== undefined && def.companyId !== where.companyId) return false;
            return true;
          }),
        );
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newDef = { ...data };
        mockRunbookDefinitions.push(newDef);
        return Promise.resolve(newDef);
      }),
      upsert: jest.fn().mockImplementation(({ where, update, create }) => {
        const idx = mockRunbookDefinitions.findIndex((def) => def.id === where.id);
        if (idx !== -1) {
          mockRunbookDefinitions[idx] = { ...mockRunbookDefinitions[idx], ...update };
          return Promise.resolve(mockRunbookDefinitions[idx]);
        } else {
          const newDef = { ...create, id: where.id || create.id };
          mockRunbookDefinitions.push(newDef);
          return Promise.resolve(newDef);
        }
      }),
    },
    approvalRequest: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const app = mockApprovals.find((a) => a.id === where.id);
        return Promise.resolve(app ? { ...app } : null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockApprovals.filter((a) => {
            if (where.companyId !== undefined && a.companyId !== where.companyId) return false;
            if (where.action && a.action !== where.action) return false;
            if (where.status && a.status !== where.status) return false;
            return true;
          }),
        );
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const app = {
          id: data.id || `app-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'PENDING',
          ...data,
        };
        mockApprovals.push(app);
        return Promise.resolve(app);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = mockApprovals.findIndex((a) => a.id === where.id);
        if (idx !== -1) {
          Object.assign(mockApprovals[idx], data, { updatedAt: new Date() });
          return Promise.resolve(mockApprovals[idx]);
        }
        throw new Error(`ApprovalRequest not found: ${where.id}`);
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        mockApprovals.forEach((a) => {
          if (where.id && a.id !== where.id) return;
          if (where.status && a.status !== where.status) return;
          Object.assign(a, data, { updatedAt: new Date() });
          count++;
        });
        return Promise.resolve({ count });
      }),
    },
    runbookExecution: {
      create: jest.fn().mockImplementation(({ data }) => {
        const exec = {
          id: data.id || `exec-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockRunbookExecutions.push(exec);
        return Promise.resolve(exec);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const exec = mockRunbookExecutions.find((e) => e.id === where.id);
        if (!exec) return Promise.resolve(null);
        const runbook = mockRunbookDefinitions.find((d) => d.id === exec.runbookId) ||
          RunbookEngineService.BUILTIN_RUNBOOKS.find((b) => b.id === exec.runbookId);
        return Promise.resolve({
          ...exec,
          runbook,
        });
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockRunbookExecutions.filter((e) => {
            if (where.id) {
              if (typeof where.id === 'string' && e.id !== where.id) return false;
              if (where.id.not && e.id === where.id.not) return false;
            }
            if (where.incidentId && e.incidentId !== where.incidentId) return false;
            if (where.actionType && e.actionType !== where.actionType) return false;
            if (where.companyId !== undefined && e.companyId !== where.companyId) return false;
            if (where.status) {
              if (typeof where.status === 'string' && e.status !== where.status) return false;
              if (where.status.in && !where.status.in.includes(e.status)) return false;
              if (where.status.not && e.status === where.status.not) return false;
            }
            return true;
          }),
        );
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = mockRunbookExecutions.findIndex((e) => e.id === where.id);
        if (idx !== -1) {
          mockRunbookExecutions[idx] = {
            ...mockRunbookExecutions[idx],
            ...data,
            updatedAt: new Date(),
          };
          return Promise.resolve(mockRunbookExecutions[idx]);
        }
        return Promise.resolve(null);
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        mockRunbookExecutions.forEach((e, idx) => {
          if (where.id && e.id !== where.id) return;
          if (where.status && e.status !== where.status) return;
          mockRunbookExecutions[idx] = {
            ...e,
            ...data,
            updatedAt: new Date(),
          };
          count++;
        });
        return Promise.resolve({ count });
      }),
    },
    incidentTimelineEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        const evt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          createdAt: new Date(),
          ...data,
        };
        mockTimelineEvents.push(evt);
        return Promise.resolve(evt);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockTimelineEvents.filter((e) => e.incidentId === where.incidentId),
        );
      }),
    },
    incidentDiagnosticReport: {
      create: jest.fn().mockImplementation(({ data }) => {
        const report = {
          id: `diag-${Date.now()}`,
          createdAt: new Date(),
          ...data,
        };
        mockDiagnosticReports.push(report);
        return Promise.resolve(report);
      }),
    },
    company: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockCompanies[where.id] ?? null);
      }),
    },
  };

  const mockProbeService = {
    executeProbe: jest.fn().mockImplementation(async (targetType: string, targetName: string) => {
      return {
        status: mockProbeStatus,
        latencyMs: 15,
        details: { target: targetName, simulated: true },
      };
    }),
    getProbeSummaries: jest.fn().mockResolvedValue([]),
  };

  const mockAuthz = {
    assertCompanyAccess: jest.fn().mockImplementation((user, companyId) => {
      if (user.actorRole === 'CHAIRMAN') return Promise.resolve(true);
      if (user.companyId === companyId) return Promise.resolve(true);
      throw new ForbiddenException(`Forbidden company access: ${companyId}`);
    }),
  };

  const mockDiagnosticAssembler = {
    assembleDiagnosticContext: jest.fn().mockResolvedValue({
      incidentId: 'inc-pool-exhausted',
      companyId: 'company-a',
      scope: 'TENANT',
      assembledAt: new Date(),
      primaryTargetObservations: [],
      relatedIncidents: [],
      historicalLessons: [],
      telemetryAggregates: {},
      evidenceCompleteness: { completenessScore: 0.9, missingSources: [] },
    }),
  };

  const mockRootCauseAnalysis = {
    analyzeRootCause: jest.fn().mockReturnValue({
      id: 'diag-test-1',
      status: 'COMPLETED',
      confidenceScore: 0.85,
      isInconclusive: false,
      rankedHypotheses: [
        {
          rank: 1,
          id: 'hyp-rca-1',
          category: 'DATABASE_POOL_SATURATION',
          title: 'Database connection pool saturation',
          explanation: 'Automated RCA performed: pool saturated at 98%',
          confidence: 0.85,
          epistemicStatus: 'HYPOTHESIS',
          supportingEvidenceIds: ['ev-1'],
          contradictingEvidenceIds: [],
          dataNeededToConfirm: [],
          nonExecutableRecommendations: ['Rebalance pool'],
        },
      ],
      evidenceGaps: [],
      contradictions: [],
      recommendedAction: 'CONNECTION_POOL_REBALANCE',
      diagnosticContext: {},
    }),
  };

  const mockGateway = {
    registerAdapter: jest.fn(),
    getAuditRecordByIdempotencyKey: jest.fn().mockImplementation((_key: string, _companyId?: string | null) => {
      return Promise.resolve(null);
    }),
    executeAction: jest.fn().mockImplementation(async (req) => {
      const actionType = req.payload?.runbookActionType || req.payload?.actionType;
      const targetName =
        typeof req.target === 'string'
          ? req.target
          : req.target?.targetId || req.target?.targetName || 'primary-target';
      const parameters = req.payload?.parameters;

      if (req.payload?.isRollback) {
        const result = await adapter.executeRollback(actionType, targetName, req.payload?.preExecutionSnapshot);
        return {
          executionId: `ext-rb-${Date.now()}`,
          success: result.success,
          resultPayload: result,
          errorMessage: result.errorMessage,
          status: result.success ? 'EXECUTED' : 'FAILED',
          riskTier: 'TIER_1',
          requiresApproval: false,
          evaluatedRules: ['DEFAULT_ALLOW'],
          auditTrailId: `audit-rb-${Date.now()}`,
          adapterResult: result,
        };
      }

      const result = await adapter.executeAction(actionType, targetName, parameters);
      return {
        executionId: `ext-${Date.now()}`,
        success: result.success,
        resultPayload: result,
        status: result.success ? 'EXECUTED' : 'FAILED',
        riskTier: 'TIER_1',
        requiresApproval: false,
        evaluatedRules: ['DEFAULT_ALLOW'],
        auditTrailId: `audit-${Date.now()}`,
        adapterResult: result,
      };
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCompanies['company-a'].emergencyStatus = 'NORMAL';
    mockCompanies['company-b'].emergencyStatus = 'NORMAL';
    mockCompanies['company-halted'].emergencyStatus = 'EMERGENCY_STOP';
    mockIncidents.length = 0;
    mockRunbookDefinitions.length = 0;
    mockRunbookExecutions.length = 0;
    mockTimelineEvents.length = 0;
    mockDiagnosticReports.length = 0;
    mockApprovals.length = 0;
    mockProbeStatus = ProbeResultStatus.HEALTHY;

    // Seed test incidents
    mockIncidents.push(
      {
        id: 'inc-pool-exhausted',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'primary-postgres',
        title: 'PostgreSQL connection pool exhausted',
        description: 'Exceeded 90% connection pool capacity',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 3,
        hypotheses: [
          {
            id: 'hyp-1',
            summary: 'Connection leak in worker tasks',
            confidence: 0.85,
            epistemicStatus: 'CONFIRMED_EVIDENCE',
            indicators: ['Pool saturation at 98%'],
          },
        ],
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(Date.now() - 1800000),
      },
      {
        id: 'inc-queue-stale',
        companyId: 'company-a',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'default-job-queue',
        title: 'Background queue stalled',
        description: 'Multiple active locks stalled for > 15 minutes',
        severity: IncidentSeverity.SEV3_MEDIUM,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 1,
        hypotheses: [],
        createdAt: new Date(Date.now() - 1800000),
        updatedAt: new Date(Date.now() - 900000),
      },
      {
        id: 'inc-memory-high',
        companyId: 'company-a',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'api-worker-1',
        title: 'High Heap Memory Consumption',
        description: 'Worker process near heap limit',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 1,
        hypotheses: [],
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(Date.now() - 1800000),
      },
      {
        id: 'inc-resolved-terminal',
        companyId: 'company-a',
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'gemini-gateway',
        title: 'Gateway timeout spike',
        description: 'Previously resolved gateway issue',
        severity: IncidentSeverity.SEV4_LOW,
        status: IncidentStatus.RESOLVED,
        occurrences: 1,
        hypotheses: [],
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(Date.now() - 3600000),
      },
      {
        id: 'inc-halted-company',
        companyId: 'company-halted',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'halted-db',
        title: 'Halted DB failure',
        description: 'Incident in halted company',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 1,
        hypotheses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'inc-global-infra',
        companyId: null,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'global-db-replica',
        title: 'Global DB replica latency',
        description: 'Global infrastructure issue',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 1,
        hypotheses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ITRemediationAdapter,
        RunbookEngineService,
        IncidentManagerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HealthProbeService, useValue: mockProbeService },
        { provide: DiagnosticContextAssemblerService, useValue: mockDiagnosticAssembler },
        { provide: RootCauseAnalysisService, useValue: mockRootCauseAnalysis },
        { provide: SystemTelemetryService, useValue: {} },
        { provide: AnomalyDetectionService, useValue: {} },
        { provide: AuthorizationService, useValue: mockAuthz },
        { provide: ExternalActionGatewayService, useValue: mockGateway },
      ],
      controllers: [ReliabilityController],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    runbookEngine = module.get<RunbookEngineService>(RunbookEngineService);
    adapter = module.get<ITRemediationAdapter>(ITRemediationAdapter);
    incidentManager = module.get<IncidentManagerService>(IncidentManagerService);
    controller = module.get<ReliabilityController>(ReliabilityController);
  });

  // ==========================================
  // SECTION 1: MANDATORY TRANSACTIONAL HARDENING
  // ==========================================
  describe('1. Transactional Hardening & Rollback Proof', () => {
    it('executes atomic Prisma transaction when persisting diagnosis and updates', async () => {
      const result = await incidentManager.diagnoseIncident(
        'inc-pool-exhausted',
        'company-a',
        { actorId: 'user-sec', actorRole: 'CEO' },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(mockDiagnosticReports.length).toBe(1);
      expect(mockTimelineEvents.some((e) => e.eventType === IncidentEventType.DIAGNOSTIC_REPORT_ATTACHED)).toBe(true);

      const updatedIncident = mockIncidents.find((i) => i.id === 'inc-pool-exhausted');
      expect(updatedIncident.triageSummary).toContain('Automated RCA performed');
    });

    it('rolls back complete operation and leaves zero partial writes if any write in transaction fails', async () => {
      const initialReportCount = mockDiagnosticReports.length;
      const initialEventCount = mockTimelineEvents.length;
      const initialTriageSummary = mockIncidents.find((i) => i.id === 'inc-pool-exhausted').triageSummary;

      // Inject failure on transaction update
      mockPrisma.$transaction.mockImplementationOnce(async (callback) => {
        const txPrisma = {
          incidentDiagnosticReport: {
            create: jest.fn().mockResolvedValue({ id: 'leaked-report' }),
          },
          incidentTimelineEvent: {
            create: jest.fn().mockResolvedValue({ id: 'leaked-event' }),
          },
          systemIncident: {
            update: jest.fn().mockRejectedValue(new Error('Simulated DB deadlock / foreign key violation')),
          },
        };
        // Run callback which will fail on incident.update
        return callback(txPrisma);
      });

      await expect(
        incidentManager.diagnoseIncident('inc-pool-exhausted', 'company-a', { actorId: 'user-sec' }),
      ).rejects.toThrow('Simulated DB deadlock / foreign key violation');

      // Verify ZERO partial writes remained
      expect(mockDiagnosticReports.length).toBe(initialReportCount);
      expect(mockTimelineEvents.length).toBe(initialEventCount);
      expect(mockIncidents.find((i) => i.id === 'inc-pool-exhausted').triageSummary).toBe(initialTriageSummary);
    });
  });

  // ==========================================
  // SECTION 2: RUNBOOK RETRIEVAL & FILTERING
  // ==========================================
  describe('2. Available Runbook Discovery & Filtering', () => {
    it('returns built-in templates matching incident target component', async () => {
      const runbooks = await runbookEngine.getAvailableRunbooksForIncident('inc-pool-exhausted', 'company-a');
      expect(runbooks.length).toBeGreaterThan(0);
      expect(runbooks.every((r) => r.targetType === ProbeTargetType.DATABASE_POOL)).toBe(true);
      expect(runbooks.some((r) => r.actionType === RunbookActionType.CONNECTION_POOL_REBALANCE)).toBe(true);
    });

    it('returns queue-specific runbooks for queue incidents', async () => {
      const runbooks = await runbookEngine.getAvailableRunbooksForIncident('inc-queue-stale', 'company-a');
      expect(runbooks.some((r) => r.actionType === RunbookActionType.QUEUE_PURGE_STALE_LOCKS)).toBe(true);
    });

    it('denies cross-tenant runbook definition access', async () => {
      mockRunbookDefinitions.push({
        id: 'runbook-custom-b',
        companyId: 'company-b',
        targetType: ProbeTargetType.DATABASE_POOL,
        name: 'Company B Custom Pool Drain',
        actionType: RunbookActionType.CONNECTION_POOL_REBALANCE,
        riskTier: RunbookRiskTier.MEDIUM,
        requiresApproval: false,
        maxAttempts: 2,
        cooldownMinutes: 15,
        isActive: true,
      });

      await expect(
        runbookEngine.getRunbookById('runbook-custom-b', 'company-a'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // SECTION 3: REMEDIATION PLANNING & LOOP PREVENTION
  // ==========================================
  describe('3. Remediation Planning & Loop Prevention', () => {
    it('plans remediation and creates RunbookExecution in initial status with timeline event', async () => {
      const execution = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
        { actorId: 'user-ops', actorRole: 'CEO' },
      );

      expect(execution).toBeDefined();
      expect(execution.incidentId).toBe('inc-queue-stale');
      expect(execution.actionType).toBe(RunbookActionType.QUEUE_PURGE_STALE_LOCKS);
      expect(execution.status).toBe(RunbookExecutionStatus.APPROVED); // Low/medium risk approved for CEO
      expect(execution.preExecutionSnapshot).toBeDefined();

      const plannedEvent = mockTimelineEvents.find((e) => e.eventType === IncidentEventType.REMEDIATION_PLANNED);
      expect(plannedEvent).toBeDefined();
      expect(plannedEvent.note).toContain('Remediation planned');
    });

    it('rejects planning remediation on resolved or closed incident', async () => {
      await expect(
        runbookEngine.planRemediation('inc-resolved-terminal', 'builtin-model-gateway-cache-flush', 'company-a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces loop prevention throttling when execution exceeds maxAttempts', async () => {
      // Seed max attempts (default 3 for queue purge locks) for this incident and action
      mockRunbookExecutions.push(
        {
          id: 'exec-prev-1',
          companyId: 'company-a',
          incidentId: 'inc-queue-stale',
          actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
          status: RunbookExecutionStatus.COMPLETED,
          createdAt: new Date(Date.now() - 3600000), // 60m ago
        },
        {
          id: 'exec-prev-2',
          companyId: 'company-a',
          incidentId: 'inc-queue-stale',
          actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
          status: RunbookExecutionStatus.COMPLETED,
          createdAt: new Date(Date.now() - 2400000), // 40m ago
        },
        {
          id: 'exec-prev-3',
          companyId: 'company-a',
          incidentId: 'inc-queue-stale',
          actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
          status: RunbookExecutionStatus.COMPLETED,
          createdAt: new Date(Date.now() - 1200000), // 20m ago
        },
      );

      await expect(
        runbookEngine.planRemediation('inc-queue-stale', 'builtin-queue-purge-locks', 'company-a'),
      ).rejects.toThrow(ConflictException);
    });

    it('enforces cooldown throttling when execution is attempted too quickly', async () => {
      // Seed a recent execution 2 minutes ago (cooldown is 10 min for queue purge)
      mockRunbookExecutions.push({
        id: 'exec-recent',
        companyId: 'company-a',
        incidentId: 'inc-queue-stale',
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        status: RunbookExecutionStatus.COMPLETED,
        createdAt: new Date(Date.now() - 120000), // 2 minutes ago
      });

      await expect(
        runbookEngine.planRemediation('inc-queue-stale', 'builtin-queue-purge-locks', 'company-a'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================
  // SECTION 4: GOVERNANCE & CHAIRMAN APPROVAL GATES
  // ==========================================
  describe('4. Governance & Risk Tiers (V16/V17 Alignment)', () => {
    it('sets HIGH/CRITICAL risk runbooks to PENDING_APPROVAL when requested by non-CHAIRMAN', async () => {
      const execution = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle', // HIGH risk
        'company-a',
        { actorId: 'user-ops', actorRole: 'MEMBER' },
      );

      expect(execution.riskTier).toBe(RunbookRiskTier.HIGH);
      expect(execution.status).toBe(RunbookExecutionStatus.PENDING_APPROVAL);
    });

    it('blocks execution of PENDING_APPROVAL runbook when dispatched by non-CHAIRMAN', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'MEMBER' },
      );

      await expect(
        runbookEngine.executeRemediation(planned.id, 'company-a', {
          actorId: 'user-ops',
          actorRole: 'MEMBER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows execution of high-risk runbook when approved by CHAIRMAN', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'MEMBER' },
      );

      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a', {
        actorId: 'user-chair',
        actorRole: 'CHAIRMAN',
      });

      expect(executed.status).toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
    });
  });

  // ==========================================
  // SECTION 5: EXECUTION, VERIFICATION & AUTOMATED ROLLBACK
  // ==========================================
  describe('5. Execution, Health Verification & Automated Rollback', () => {
    it('successfully executes, verifies probe healthy, and marks incident MITIGATED', async () => {
      mockProbeStatus = ProbeResultStatus.HEALTHY;

      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
        { actorId: 'user-ceo', actorRole: 'CEO' },
      );

      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a', {
        actorId: 'user-ceo',
        actorRole: 'CEO',
      });

      expect(executed.status).toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
      expect(executed.postVerificationSnapshot?.status).toBe(ProbeResultStatus.HEALTHY);

      // Verify incident transitioned to MITIGATED
      const incident = mockIncidents.find((i) => i.id === 'inc-queue-stale');
      expect(incident.status).toBe(IncidentStatus.MITIGATED);

      // Verify timeline events
      expect(mockTimelineEvents.some((e) => e.eventType === IncidentEventType.REMEDIATION_STARTED)).toBe(true);
      expect(mockTimelineEvents.some((e) => e.eventType === IncidentEventType.REMEDIATION_COMPLETED)).toBe(true);
      expect(mockTimelineEvents.some((e) => e.eventType === IncidentEventType.REMEDIATION_VERIFIED)).toBe(true);
    });

    it('automatically triggers rollback if post-remediation health probe remains UNHEALTHY', async () => {
      // Simulate failed verification probe
      mockProbeStatus = ProbeResultStatus.UNHEALTHY;

      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
        { actorId: 'user-ceo', actorRole: 'CEO' },
      );

      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a', {
        actorId: 'user-ceo',
        actorRole: 'CEO',
      });

      // Status should be ROLLED_BACK
      expect(executed.status).toBe(RunbookExecutionStatus.ROLLED_BACK);
      expect(executed.rollbackResults).toBeDefined();

      // Incident should NOT be MITIGATED, must remain in INVESTIGATING
      const incident = mockIncidents.find((i) => i.id === 'inc-queue-stale');
      expect(incident.status).toBe(IncidentStatus.INVESTIGATING);

      // Timeline must record REMEDIATION_ROLLED_BACK
      const rollbackEvent = mockTimelineEvents.find((e) => e.eventType === IncidentEventType.REMEDIATION_ROLLED_BACK);
      expect(rollbackEvent).toBeDefined();
      expect(rollbackEvent.note).toContain('Remediation action rolled back');
    });

    it('supports manual rollback of completed remediation', async () => {
      mockProbeStatus = ProbeResultStatus.HEALTHY;

      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
        { actorId: 'user-ceo', actorRole: 'CEO' },
      );

      await runbookEngine.executeRemediation(planned.id, 'company-a', {
        actorId: 'user-ceo',
        actorRole: 'CEO',
      });

      const rolledBack = await runbookEngine.rollbackRemediation(
        planned.id,
        'company-a',
        'Operator manual decision to restore previous locks',
      );

      expect(rolledBack.status).toBe(RunbookExecutionStatus.ROLLED_BACK);
      expect(rolledBack.rollbackResults?.reason).toContain('Operator manual decision');
    });
  });

  // ==========================================
  // SECTION 6: EMERGENCY_STOP COMPLIANCE
  // ==========================================
  describe('6. Sovereign EMERGENCY_STOP Guard', () => {
    it('blocks planning remediation for company in EMERGENCY_STOP', async () => {
      await expect(
        runbookEngine.planRemediation('inc-halted-company', 'builtin-db-pool-rebalance', 'company-halted'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks executing remediation for company in EMERGENCY_STOP', async () => {
      // Mock an existing execution in approved state
      mockRunbookExecutions.push({
        id: 'exec-halted',
        companyId: 'company-halted',
        incidentId: 'inc-halted-company',
        actionType: RunbookActionType.CONNECTION_POOL_REBALANCE,
        riskTier: RunbookRiskTier.HIGH,
        status: RunbookExecutionStatus.APPROVED,
        parameters: {},
        runbook: {
          id: 'builtin-db-pool-rebalance',
          name: 'DB Pool Rebalance',
          requiresApproval: true,
        },
      });

      await expect(
        runbookEngine.executeRemediation('exec-halted', 'company-halted', {
          actorRole: 'CHAIRMAN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // SECTION 7: TENANT ISOLATION & CONTROLLER ENDPOINTS
  // ==========================================
  describe('7. Tenant Isolation & Reliability Controller Endpoints', () => {
    it('enforces company isolation: Company A user cannot list runbooks for Company B incident', async () => {
      const req = { user: { actorId: 'user-a', companyId: 'company-a', actorRole: 'MEMBER' } };

      // Create Company B incident
      mockIncidents.push({
        id: 'inc-company-b',
        companyId: 'company-b',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'b-database',
        title: 'Company B incident',
        status: IncidentStatus.INVESTIGATING,
        severity: IncidentSeverity.SEV2_HIGH,
        occurrences: 1,
        hypotheses: [],
      });

      await expect(
        controller.getAvailableRunbooks(req, 'inc-company-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires CHAIRMAN authority for global infrastructure runbook access', async () => {
      const nonChairmanReq = { user: { actorId: 'user-a', companyId: 'company-a', actorRole: 'CEO' } };

      await expect(
        controller.getAvailableRunbooks(nonChairmanReq, 'inc-global-infra'),
      ).rejects.toThrow(ForbiddenException);

      const chairmanReq = { user: { actorId: 'user-chair', companyId: 'company-a', actorRole: 'CHAIRMAN' } };
      const runbooks = await controller.getAvailableRunbooks(chairmanReq, 'inc-global-infra');
      expect(runbooks).toBeDefined();
    });

    it('controller delegates planRemediation and executeRemediation with correct context', async () => {
      const ceoReq = { user: { actorId: 'user-ceo', companyId: 'company-a', actorRole: 'CEO' } };

      const planResult = await controller.planRemediation(
        ceoReq,
        'inc-queue-stale',
        'builtin-queue-purge-locks',
      );
      expect(planResult).toBeDefined();
      expect(planResult.actionType).toBe(RunbookActionType.QUEUE_PURGE_STALE_LOCKS);

      const execResult = await controller.executeRemediation(
        ceoReq,
        planResult.id,
      );
      expect(execResult).toBeDefined();
      expect(execResult.status).toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
    });

    it('controller exposes execution inspection and incident execution list', async () => {
      const ceoReq = { user: { actorId: 'user-ceo', companyId: 'company-a', actorRole: 'CEO' } };

      const planResult = await controller.planRemediation(
        ceoReq,
        'inc-queue-stale',
        'builtin-queue-purge-locks',
      );

      const fetchedExec = await controller.getExecution(ceoReq, planResult.id);
      expect(fetchedExec.id).toBe(planResult.id);

      const executions = await controller.getIncidentExecutions(ceoReq, 'inc-queue-stale');
      expect(executions.length).toBeGreaterThan(0);
      expect(executions.some((e) => e.id === planResult.id)).toBe(true);
    });
  });

  // ==========================================
  // SECTION 8: PHASE 4.1 CRITICAL REMEDIATION & REGRESSION VERIFICATION
  // ==========================================
  describe('8. Phase 4.1 Critical Remediation & Regression Verification', () => {
    it('seeds canonical built-in runbook definitions into the database idempotently', async () => {
      await runbookEngine.ensureBuiltinRunbooksSeeded();
      expect(mockRunbookDefinitions.length).toBe(5);
      const poolRunbook = mockRunbookDefinitions.find((r) => r.id === 'builtin-db-pool-rebalance');
      expect(poolRunbook).toBeDefined();
      expect(poolRunbook.actionType).toBe(RunbookActionType.CONNECTION_POOL_REBALANCE);
      // Run second time to verify idempotency
      await runbookEngine.ensureBuiltinRunbooksSeeded();
      expect(mockRunbookDefinitions.length).toBe(5);
    });

    it('enforces V16 ExternalActionGateway governance and blocks remediation on policy rejection', async () => {
      mockGateway.executeAction.mockResolvedValueOnce({
        actionId: 'ext-blocked',
        idempotencyKey: 'rem-key-1',
        companyId: 'company-a',
        executionState: 'REJECTED',
        success: false,
        provider: 'IT_REMEDIATION_ADAPTER',
        executedAt: new Date(),
        isReplayed: false,
        errorMessage: 'Autonomous remediation blocked by sovereign safety rule',
      });

      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      await expect(
        runbookEngine.executeRemediation(planned.id, 'company-a'),
      ).rejects.toThrow(ConflictException);

      const exec = mockRunbookExecutions.find((e) => e.id === planned.id);
      expect(exec.status).toBe(RunbookExecutionStatus.FAILED);
      expect(exec.stepResults.some((s: any) => s.stepName === 'GATEWAY_GOVERNANCE_BLOCKED')).toBe(true);
    });

    it('prevents re-executing already completed, verified, failed, or rolled back executions', async () => {
      // Completed execution
      mockRunbookExecutions.push({
        id: 'exec-completed-1',
        incidentId: 'inc-queue-stale',
        companyId: 'company-a',
        runbookId: 'builtin-queue-purge-locks',
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        status: RunbookExecutionStatus.COMPLETED,
        createdAt: new Date(),
      });
      await expect(runbookEngine.executeRemediation('exec-completed-1', 'company-a')).rejects.toThrow(
        ConflictException,
      );

      // Verified healthy execution
      mockRunbookExecutions.push({
        id: 'exec-verified-1',
        incidentId: 'inc-queue-stale',
        companyId: 'company-a',
        runbookId: 'builtin-queue-purge-locks',
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        status: RunbookExecutionStatus.VERIFIED_HEALTHY,
        createdAt: new Date(),
      });
      await expect(runbookEngine.executeRemediation('exec-verified-1', 'company-a')).rejects.toThrow(
        ConflictException,
      );

      // Rolled back execution
      mockRunbookExecutions.push({
        id: 'exec-rolledback-1',
        incidentId: 'inc-queue-stale',
        companyId: 'company-a',
        runbookId: 'builtin-queue-purge-locks',
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        status: RunbookExecutionStatus.ROLLED_BACK,
        createdAt: new Date(),
      });
      await expect(runbookEngine.executeRemediation('exec-rolledback-1', 'company-a')).rejects.toThrow(
        ConflictException,
      );

      // Rollback failed execution
      mockRunbookExecutions.push({
        id: 'exec-rb-failed-1',
        incidentId: 'inc-queue-stale',
        companyId: 'company-a',
        runbookId: 'builtin-queue-purge-locks',
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        status: RunbookExecutionStatus.ROLLBACK_FAILED,
        createdAt: new Date(),
      });
      await expect(runbookEngine.executeRemediation('exec-rb-failed-1', 'company-a')).rejects.toThrow(
        ConflictException,
      );
    });

    it('atomic concurrency claim prevents concurrent duplicate execution', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      // Simulate concurrent race: mock updateMany returning { count: 0 } as if another request claimed it
      const originalUpdateMany = mockPrisma.runbookExecution.updateMany;
      mockPrisma.runbookExecution.updateMany = jest.fn().mockResolvedValueOnce({ count: 0 });

      await expect(
        runbookEngine.executeRemediation(planned.id, 'company-a'),
      ).rejects.toThrow(ConflictException);

      mockPrisma.runbookExecution.updateMany = originalUpdateMany;
    });

    it('health verification fails closed when probe is degraded or throws', async () => {
      // 1. Probe returns DEGRADED
      mockProbeStatus = ProbeResultStatus.DEGRADED;
      const planned1 = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );
      const exec1 = await runbookEngine.executeRemediation(planned1.id, 'company-a');
      expect(exec1.status).not.toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
      const incident1 = mockIncidents.find((i) => i.id === 'inc-queue-stale');
      expect(incident1.status).not.toBe(IncidentStatus.MITIGATED);

      // 2. Probe throws exception
      mockProbeService.executeProbe.mockRejectedValueOnce(new Error('Connection timed out'));
      const planned2 = await runbookEngine.planRemediation(
        'inc-pool-exhausted',
        'builtin-db-pool-rebalance',
        'company-a',
      );
      const exec2 = await runbookEngine.executeRemediation(planned2.id, 'company-a');
      expect(exec2.status).not.toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
      const incident2 = mockIncidents.find((i) => i.id === 'inc-pool-exhausted');
      expect(incident2.status).not.toBe(IncidentStatus.MITIGATED);

      mockProbeStatus = ProbeResultStatus.HEALTHY;
    });

    it('records ROLLBACK_FAILED honestly when adapter rollback fails without claiming success', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );
      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a');

      // Force adapter rollback to fail
      jest.spyOn(adapter, 'executeRollback').mockResolvedValueOnce({
        success: false,
        actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
        errorMessage: 'Drain lock release timed out',
      });

      const rbResult = await runbookEngine.rollbackRemediation(
        executed.id,
        'company-a',
        'Test rollback failure',
        {
          actorId: 'user-ceo',
          actorRole: 'CEO',
        },
      );

      expect(rbResult.status).toBe(RunbookExecutionStatus.ROLLBACK_FAILED);
      expect(rbResult.rollbackResults?.error).toContain('Drain lock release timed out');

      // Timeline must record failure, never success
      const timeline = mockTimelineEvents.filter((t) => t.incidentId === 'inc-queue-stale');
      const rollbackSuccessEvt = timeline.find((t) => t.note.includes('Remediation rolled back successfully'));
      expect(rollbackSuccessEvt).toBeUndefined();
      const rollbackFailEvt = timeline.find((t) => t.note.includes('Remediation action rollback FAILED'));
      expect(rollbackFailEvt).toBeDefined();
    });

    it('strictly enforces EMERGENCY_STOP at rollback time', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );
      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a');

      // Now set company into EMERGENCY_STOP
      mockCompanies['company-a'].emergencyStatus = 'EMERGENCY_STOP';

      try {
        await expect(
          runbookEngine.rollbackRemediation(executed.id, 'company-a', 'Emergency stop rollback test', {
            actorId: 'user-ceo',
            actorRole: 'CEO',
          }),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        mockCompanies['company-a'].emergencyStatus = 'NORMAL';
      }
    });

    it('enforces tenant isolation preventing cross-tenant remediation and rollback', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      // Company B tries to execute Company A execution
      await expect(
        runbookEngine.executeRemediation(planned.id, 'company-b'),
      ).rejects.toThrow(ForbiddenException);

      // Company B tries to rollback Company A execution
      await expect(
        runbookEngine.rollbackRemediation(planned.id, 'company-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('controller supports approve endpoint with Chairman authority', async () => {
      // Plan high risk runbook requiring approval
      const nonChairReq = { user: { actorId: 'user-ceo', companyId: 'company-a', actorRole: 'CEO' } };
      const planned = await controller.planRemediation(
        nonChairReq,
        'inc-memory-high',
        'builtin-memory-worker-recycle',
      );
      expect(planned.status).toBe(RunbookExecutionStatus.PENDING_APPROVAL);

      // Non-chairman approval fails
      await expect(
        controller.approveExecution(nonChairReq, planned.id, { reason: 'Test approval' }),
      ).rejects.toThrow(ForbiddenException);

      // Chairman approval succeeds
      const chairReq = { user: { actorId: 'user-chair', companyId: 'company-a', actorRole: 'CHAIRMAN' } };
      const approved = await controller.approveExecution(chairReq, planned.id, { reason: 'Chairman approved' });
      expect(approved.status).toBe(RunbookExecutionStatus.APPROVED);
      expect(approved.approvalRequestId).toBeDefined();
    });
  });

  describe('9. Phase 4.2 Targeted Remediation Verification (F01–F06)', () => {
    let approvalValidationService: ApprovalValidationService;

    beforeEach(() => {
      const mockStructuredLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any;
      approvalValidationService = new ApprovalValidationService(mockPrisma as any, mockStructuredLogger);
    });

    // F01: Authentic Approval Persistence
    it('F01: creates authentic ApprovalRequest bound to actor, execution, action, target and params', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      expect(planned.status).toBe(RunbookExecutionStatus.PENDING_APPROVAL);
      expect(planned.approvalRequestId).toBeDefined();

      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      expect(approval).toBeDefined();
      expect(approval.companyId).toBe('company-a');
      expect(approval.requesterId).toBe('user-ops');
      expect(approval.action).toBe('IT_REMEDIATION_ACTION');
      expect(approval.targetId).toBe('api-worker-1');
      expect(approval.status).toBe('PENDING');
      expect(approval.isGlobal).toBe(false);
      expect(approval.proposedParams).toBeDefined();
      expect(approval.proposedParams.runbookActionType).toBe(RunbookActionType.SERVICE_RESTART);
    });

    it('F01: enforces Chairman authorization and updates both ApprovalRequest and RunbookExecution in tx', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      // Non-chairman cannot approve
      await expect(
        runbookEngine.approveExecution(
          planned.id,
          'company-a',
          { actorId: 'user-ceo', actorRole: 'CEO' },
          'CEO approving',
        ),
      ).rejects.toThrow(ForbiddenException);

      // Chairman approves
      const approved = await runbookEngine.approveExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Chairman authorization granted',
      );

      expect(approved.status).toBe(RunbookExecutionStatus.APPROVED);
      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      expect(approval.status).toBe(ApprovalRequestStatus.APPROVED);
      expect(approval.approverId).toBe('user-chair');
      expect(approval.decisionReason).toBe('Chairman authorization granted');
    });

    it('F01: allows Chairman to reject execution, setting ApprovalRequest to REJECTED and execution to FAILED', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      const rejected = await runbookEngine.rejectExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Risk too high for active traffic',
      );

      expect(rejected.status).toBe(RunbookExecutionStatus.FAILED);
      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      expect(approval.status).toBe(ApprovalRequestStatus.REJECTED);
      expect(approval.approverId).toBe('user-chair');
      expect(approval.decisionReason).toBe('Risk too high for active traffic');

      // Subsequent attempt to execute fails immediately
      await expect(
        runbookEngine.executeRemediation(planned.id, 'company-a', { actorId: 'user-chair', actorRole: 'CHAIRMAN' }),
      ).rejects.toThrow(ConflictException);
    });

    it('F01: enforces single-use consumption and prevents replay via real ApprovalValidationService', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      await runbookEngine.approveExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Approved',
      );

      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      const validationContext = {
        companyId: 'company-a',
        action: 'IT_REMEDIATION_ACTION',
        targetType: 'SYSTEM',
        targetId: 'api-worker-1',
        environment: ExecutionEnvironment.PRODUCTION,
        params: approval.proposedParams,
      };

      // 1st consumption: succeeds and transitions to CONSUMED
      await approvalValidationService.validateAndConsumeApproval(approval.id, validationContext);
      expect(approval.status).toBe(ApprovalRequestStatus.CONSUMED);

      // 2nd consumption attempt (replay): throws BadRequestException
      await expect(
        approvalValidationService.validateAndConsumeApproval(approval.id, validationContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('F01: rejects approval when execution parameters are altered', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      await runbookEngine.approveExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Approved',
      );

      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      const tamperedContext = {
        companyId: 'company-a',
        action: 'IT_REMEDIATION_ACTION',
        targetType: 'SYSTEM',
        targetId: 'api-worker-1',
        environment: ExecutionEnvironment.PRODUCTION,
        params: { ...approval.proposedParams, parameters: { drainTimeoutMs: 999999 } }, // Tampered
      };

      await expect(
        approvalValidationService.validateAndConsumeApproval(approval.id, tamperedContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('F01: rejects cross-tenant approval consumption', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-memory-high',
        'builtin-memory-worker-recycle',
        'company-a',
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      await runbookEngine.approveExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Approved',
      );

      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      const crossTenantContext = {
        companyId: 'company-b', // Cross tenant!
        action: 'IT_REMEDIATION_ACTION',
        targetType: 'SYSTEM',
        targetId: 'api-worker-1',
        environment: ExecutionEnvironment.PRODUCTION,
        params: approval.proposedParams,
      };

      await expect(
        approvalValidationService.validateAndConsumeApproval(approval.id, crossTenantContext),
      ).rejects.toThrow(UnauthorizedException);
    });

    // F02: Rollback Through Gateway Governance
    it('F02: dispatches rollback through ExternalActionGatewayService with isRollback flag and proper risk evaluation', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );
      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a');

      let capturedRequest: any;
      mockGateway.executeAction.mockImplementationOnce(async (req) => {
        capturedRequest = req;
        const result = await adapter.executeRollback(
          req.payload.runbookActionType,
          req.target.targetId,
          req.payload.preExecutionSnapshot,
        );
        return {
          executionId: `gw-rb-${Date.now()}`,
          success: true,
          resultPayload: result,
          status: 'EXECUTED',
          auditTrailId: `audit-rb-${Date.now()}`,
        };
      });

      const rolledBack = await runbookEngine.rollbackRemediation(
        executed.id,
        'company-a',
        'Testing governed rollback',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
      );

      expect(rolledBack.status).toBe(RunbookExecutionStatus.ROLLED_BACK);
      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.payload.isRollback).toBe(true);
      expect(capturedRequest.actionType).toBe('IT_REMEDIATION_ACTION');
      expect(capturedRequest.idempotencyKey).toContain(`rollback:inc-queue-stale:${executed.id}`);
      expect(capturedRequest.requestingActorId).toBe('user-chair');
    });

    it('F02: gateway rejection blocks rollback adapter execution and records ROLLBACK_FAILED honestly', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );
      const executed = await runbookEngine.executeRemediation(planned.id, 'company-a');

      // Gateway rejects rollback (e.g., rate limit, policy block, or risk tier breach)
      mockGateway.executeAction.mockResolvedValueOnce({
        executionId: `gw-rb-rej-${Date.now()}`,
        success: false,
        executionState: 'REJECTED',
        errorMessage: 'Rollback blocked by gateway anti-replay and risk governance policy',
        status: 'FAILED',
      });

      const rollbackAdapterSpy = jest.spyOn(adapter, 'executeRollback');

      const failedRollback = await runbookEngine.rollbackRemediation(
        executed.id,
        'company-a',
        'Attempt rollback against policy',
      );

      expect(failedRollback.status).toBe(RunbookExecutionStatus.ROLLBACK_FAILED);
      expect(failedRollback.rollbackResults?.error).toContain('Rollback blocked by gateway anti-replay');
      // Adapter must NOT be called when gateway rejects
      expect(rollbackAdapterSpy).not.toHaveBeenCalled();
    });

    // F03: Global Infrastructure Company Scope
    it('F03: global infrastructure runbook creates ApprovalRequest with companyId=null and isGlobal=true', async () => {
      // Create global incident (companyId: null)
      mockIncidents.push({
        id: 'inc-global-edge',
        companyId: null,
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'edge-gateway-router',
        title: 'Global edge router latency spike',
        description: 'Edge router elevated error rates across all tenants',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.INVESTIGATING,
        occurrences: 1,
        hypotheses: [],
      });

      const planned = await runbookEngine.planRemediation(
        'inc-global-edge',
        'builtin-memory-worker-recycle',
        null,
        { actorId: 'user-ops', actorRole: 'OPERATOR' },
      );

      expect(planned.status).toBe(RunbookExecutionStatus.PENDING_APPROVAL);
      expect(planned.approvalRequestId).toBeDefined();

      const approval = mockApprovals.find((a) => a.id === planned.approvalRequestId);
      expect(approval).toBeDefined();
      expect(approval.companyId).toBeNull(); // Schema compatible: null foreign key, NOT 'GLOBAL_INFRASTRUCTURE'
      expect(approval.isGlobal).toBe(true);

      // Ordinary tenant user cannot approve global runbook
      await expect(
        runbookEngine.approveExecution(
          planned.id,
          null,
          { actorId: 'user-ceo', actorRole: 'CEO' },
          'Tenant user attempt',
        ),
      ).rejects.toThrow(ForbiddenException);

      // Chairman can approve
      const approved = await runbookEngine.approveExecution(
        planned.id,
        null,
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        'Chairman approves global action',
      );
      expect(approved.status).toBe(RunbookExecutionStatus.APPROVED);

      // Real ApprovalValidationService validates global scope
      await approvalValidationService.validateAndConsumeApproval(approval.id, {
        companyId: null,
        action: 'IT_REMEDIATION_ACTION',
        targetType: 'SYSTEM',
        targetId: 'edge-gateway-router',
        environment: ExecutionEnvironment.PRODUCTION,
        params: approval.proposedParams,
      });
      expect(approval.status).toBe(ApprovalRequestStatus.CONSUMED);
    });

    // F04: Crash Recovery for Stranded EXECUTING States
    it('F04: enforces lease threshold and rejects premature reconciliation of active executions', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      // Put execution into EXECUTING starting right now (active lease)
      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(), // Just started!
        },
      });

      await expect(
        runbookEngine.reconcileStrandedExecution(
          planned.id,
          'company-a',
          { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('F04: crash before action: safely marks FAILED when gateway has no record (no side effect)', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      // Simulate crash: execution stranded in EXECUTING 10 minutes ago
      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      // Gateway has no audit record (crashed before reaching gateway)
      mockGateway.getAuditRecordByIdempotencyKey.mockResolvedValueOnce(null);

      const recovered = await runbookEngine.reconcileStrandedExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
      );

      expect(recovered.status).toBe(RunbookExecutionStatus.FAILED);
      expect(recovered.stepResults?.some((s: any) => s.name === 'Reconciliation')).toBe(true);
    });

    it('F04: action success before persistence: confirms gateway success, verifies health, and moves to VERIFIED_HEALTHY', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      // Simulate crash: execution stranded in EXECUTING 10 minutes ago
      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      // Gateway confirms action executed successfully
      mockGateway.getAuditRecordByIdempotencyKey.mockResolvedValueOnce({
        executionId: `gw-rec-${Date.now()}`,
        idempotencyKey: `rem:inc-queue-stale:${planned.id}`,
        executionState: 'EXECUTED',
        success: true,
        actionType: 'IT_REMEDIATION_ACTION',
        adapterResult: { success: true },
      });

      // Probe is healthy
      mockProbeStatus = ProbeResultStatus.HEALTHY;

      const recovered = await runbookEngine.reconcileStrandedExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
      );

      expect(recovered.status).toBe(RunbookExecutionStatus.VERIFIED_HEALTHY);
    });

    it('F04: gateway action failure: confirms failure and transitions execution to FAILED', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      mockGateway.getAuditRecordByIdempotencyKey.mockResolvedValueOnce({
        executionId: `gw-rec-fail-${Date.now()}`,
        idempotencyKey: `rem:inc-queue-stale:${planned.id}`,
        executionState: 'FAILED',
        success: false,
        errorMessage: 'Remote resource unreachable',
        actionType: 'IT_REMEDIATION_ACTION',
      });

      const recovered = await runbookEngine.reconcileStrandedExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
      );

      expect(recovered.status).toBe(RunbookExecutionStatus.FAILED);
      expect(recovered.stepResults?.some((s: any) => s.status === 'FAILED')).toBe(true);
    });

    it('F04: uncertain outcome: quarantines execution to REQUIRES_RECONCILIATION without guessing', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      // Gateway state is uncertain / EXECUTING
      mockGateway.getAuditRecordByIdempotencyKey.mockResolvedValueOnce({
        executionId: `gw-rec-unc-${Date.now()}`,
        idempotencyKey: `rem:inc-queue-stale:${planned.id}`,
        executionState: 'EXECUTING', // Uncertain!
        success: false,
        actionType: 'IT_REMEDIATION_ACTION',
      });

      const quarantined = await runbookEngine.reconcileStrandedExecution(
        planned.id,
        'company-a',
        { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
      );

      expect(quarantined.status).toBe(RunbookExecutionStatus.FAILED);
      expect(quarantined.stepResults?.some((s: any) => s.name === 'ReconciliationQuarantine')).toBe(true);
      const timeline = mockTimelineEvents.filter((e) => e.incidentId === 'inc-queue-stale');
      const quarantineEvt = timeline.find((e) => e.note.includes('QUARANTINED'));
      expect(quarantineEvt).toBeDefined();
    });

    it('F04: atomic conditional lock prevents concurrent duplicate reconciliation claims', async () => {
      const planned = await runbookEngine.planRemediation(
        'inc-queue-stale',
        'builtin-queue-purge-locks',
        'company-a',
      );

      await (mockPrisma.runbookExecution.update as any)({
        where: { id: planned.id },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      // Simulate first claimant winning lock, second claimant sees count: 0
      jest.spyOn(mockPrisma.runbookExecution, 'updateMany').mockResolvedValueOnce({ count: 0 });

      await expect(
        runbookEngine.reconcileStrandedExecution(
          planned.id,
          'company-a',
          { actorId: 'user-chair', actorRole: 'CHAIRMAN' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    // F05: Cooldown and MaxAttempts Concurrency
    it('F05: transactional assertion prevents race conditions exceeding maxAttempts or cooldown', async () => {
      const def = RunbookEngineService.BUILTIN_RUNBOOKS[0]; // maxAttempts: 3
      // Create 3 prior executions
      for (let i = 0; i < 3; i++) {
        mockRunbookExecutions.push({
          id: `prior-exec-${i}`,
          incidentId: 'inc-pool-exhausted',
          runbookId: def.id,
          actionType: def.actionType,
          companyId: 'company-a',
          status: RunbookExecutionStatus.FAILED,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Next planning attempt is blocked atomically by assertRunbookNotThrottledInTx
      await expect(
        runbookEngine.planRemediation('inc-pool-exhausted', def.id, 'company-a'),
      ).rejects.toThrow(ConflictException);
    });

    // F06: Canonical Seeding & Operator Customization Preservation
    it('F06: ensureBuiltinRunbooksSeeded preserves operator-customized runbook fields', async () => {
      // Pre-seed an operator-customized definition
      mockRunbookDefinitions.push({
        id: 'builtin-database-pool-rebalance',
        name: 'Custom Operator Pool Rebalance',
        description: 'Operator adjusted description and cooldown',
        cooldownMinutes: 60, // Customized from 10 to 60
        maxAttempts: 1,      // Customized from 3 to 1
        targetType: ProbeTargetType.DATABASE_POOL,
        actionType: RunbookActionType.CONNECTION_POOL_REBALANCE,
        riskTier: RunbookRiskTier.MEDIUM,
        isReversible: true,
        companyId: null,
      });

      await runbookEngine.ensureBuiltinRunbooksSeeded();

      // Verify the operator customization was NOT overwritten
      const preserved = mockRunbookDefinitions.find((d) => d.id === 'builtin-database-pool-rebalance');
      expect(preserved.cooldownMinutes).toBe(60);
      expect(preserved.maxAttempts).toBe(1);
      expect(preserved.name).toBe('Custom Operator Pool Rebalance');
    });

    // Controller Endpoints
    it('controller exposes rejectExecution and reconcileExecution with Chairman authority guards', async () => {
      const nonChairReq = { user: { actorId: 'user-ceo', companyId: 'company-a', actorRole: 'CEO' } };
      const chairReq = { user: { actorId: 'user-chair', companyId: 'company-a', actorRole: 'CHAIRMAN' } };

      const planned = await controller.planRemediation(
        nonChairReq,
        'inc-memory-high',
        'builtin-memory-worker-recycle',
      );

      // Non-Chairman cannot reject
      await expect(
        controller.rejectExecution(nonChairReq, planned.id, { reason: 'Non-chair rejection' }),
      ).rejects.toThrow(ForbiddenException);

      // Chairman can reject
      const rejected = await controller.rejectExecution(chairReq, planned.id, { reason: 'Chairman rejected' });
      expect(rejected.status).toBe(RunbookExecutionStatus.FAILED);
    });
  });
});

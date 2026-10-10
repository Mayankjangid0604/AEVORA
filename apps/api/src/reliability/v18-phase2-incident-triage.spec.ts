import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { IncidentManagerService } from './incident-manager.service';
import { ReliabilityController } from './reliability.controller';
import { HealthProbeService } from './health-probe.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentEventType,
} from './incident.types';
import { ProbeTargetType, ProbeResultStatus } from './health-probe.types';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

describe('V18 Phase 2: Incident Management, Anomaly Detection & Triage', () => {
  let anomalyService: AnomalyDetectionService;
  let incidentManager: IncidentManagerService;
  let reliabilityController: ReliabilityController;

  const mockIncidents: any[] = [];
  const mockTimelineEvents: any[] = [];
  const mockTasks: any[] = [];
  const mockCompanies: Record<string, any> = {
    'company-normal': { id: 'company-normal', name: 'Normal Co', emergencyStatus: 'NORMAL' },
    'company-halted': { id: 'company-halted', name: 'Halted Co', emergencyStatus: 'EMERGENCY_STOP' },
  };

  const mockPrisma = {
    systemIncident: {
      create: jest.fn().mockImplementation(({ data }) => {
        // Enforce active-incident partial uniqueness constraint (simulating PostgreSQL partial unique index)
        const hasActiveDuplicate = mockIncidents.some(
          (inc) =>
            inc.deduplicationKey === data.deduplicationKey &&
            inc.status !== IncidentStatus.RESOLVED &&
            inc.status !== IncidentStatus.CLOSED,
        );
        if (hasActiveDuplicate) {
          const err: any = new Error(
            'Unique constraint failed on the constraint: SystemIncident_dedup_active_unique_idx',
          );
          err.code = 'P2002';
          return Promise.reject(err);
        }

        const row = {
          id: `inc-${Date.now()}-${Math.random()}`,
          occurrenceCount: 1,
          taskId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockIncidents.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const found = mockIncidents.find((inc) => {
          if (where.deduplicationKey && inc.deduplicationKey !== where.deduplicationKey) return false;
          if (where.status?.notIn && where.status.notIn.includes(inc.status)) return false;
          return true;
        });
        return Promise.resolve(found || null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = mockIncidents.find((inc) => inc.id === where.id);
        if (!found) return Promise.resolve(null);
        const events = mockTimelineEvents.filter((e) => e.incidentId === where.id);
        return Promise.resolve({ ...found, events });
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        let results = mockIncidents.filter((inc) => {
          if (where?.companyId && inc.companyId !== where.companyId) return false;
          if (where?.status && inc.status !== where.status) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = mockIncidents.findIndex((inc) => inc.id === where.id);
        if (idx >= 0) {
          const updated = { ...mockIncidents[idx], ...data };
          if (data.occurrenceCount?.increment) {
            updated.occurrenceCount = (mockIncidents[idx].occurrenceCount || 1) + data.occurrenceCount.increment;
          }
          mockIncidents[idx] = updated;
          return Promise.resolve(updated);
        }
        return Promise.resolve(null);
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        for (let i = 0; i < mockIncidents.length; i++) {
          const inc = mockIncidents[i];
          if (where.id && inc.id !== where.id) continue;
          if (where.taskId === null && inc.taskId !== null && inc.taskId !== undefined) continue;
          mockIncidents[i] = { ...inc, ...data };
          count++;
        }
        return Promise.resolve({ count });
      }),
    },
    incidentTimelineEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = {
          id: `evt-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          ...data,
        };
        mockTimelineEvents.push(row);
        return Promise.resolve(row);
      }),
    },
    task: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { id: `task-${Date.now()}-${Math.random()}`, ...data };
        mockTasks.push(row);
        return Promise.resolve(row);
      }),
    },
    company: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockCompanies[where.id] || null);
      }),
    },
  };

  const mockAuthz = {
    assertCompanyAccess: jest.fn().mockImplementation(async (user: any, companyId: string) => {
      if (user?.actorRole === 'CHAIRMAN') return;
      if (user?.companyId === companyId) return;
      throw new ForbiddenException(`Access denied to company ${companyId}`);
    }),
  };

  beforeEach(async () => {
    mockIncidents.length = 0;
    mockTimelineEvents.length = 0;
    mockTasks.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReliabilityController],
      providers: [
        AnomalyDetectionService,
        IncidentManagerService,
        { provide: HealthProbeService, useValue: { getProbeSummaries: jest.fn().mockResolvedValue([]) } },
        { provide: SystemTelemetryService, useValue: { getAggregatedMetrics: jest.fn().mockResolvedValue({}) } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthorizationService, useValue: mockAuthz },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    anomalyService = module.get<AnomalyDetectionService>(AnomalyDetectionService);
    incidentManager = module.get<IncidentManagerService>(IncidentManagerService);
    reliabilityController = module.get<ReliabilityController>(ReliabilityController);
  });

  // S1: Incident Lifecycle State Machine
  describe('S1: Incident Lifecycle State Machine', () => {
    it('executes valid transitions: DETECTED -> TRIAGED -> INVESTIGATING -> MITIGATED -> RESOLVED -> CLOSED', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'High latency detected',
        description: 'PostgreSQL ping query latency is elevated',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV3_MEDIUM,
      });

      expect(incident.status).toBe(IncidentStatus.DETECTED);

      // DETECTED -> TRIAGED
      const triaged = await incidentManager.transitionStatus(
        incident.id,
        { toStatus: IncidentStatus.TRIAGED, note: 'Triage complete; investigating worker contention.' },
        'company-normal',
      );
      expect(triaged.status).toBe(IncidentStatus.TRIAGED);

      // TRIAGED -> INVESTIGATING
      const investigating = await incidentManager.transitionStatus(
        incident.id,
        { toStatus: IncidentStatus.INVESTIGATING, note: 'Engineer assigned to inspect locks.' },
        'company-normal',
      );
      expect(investigating.status).toBe(IncidentStatus.INVESTIGATING);

      // INVESTIGATING -> MITIGATED
      const mitigated = await incidentManager.transitionStatus(
        incident.id,
        { toStatus: IncidentStatus.MITIGATED, note: 'Connection pool recycled.' },
        'company-normal',
      );
      expect(mitigated.status).toBe(IncidentStatus.MITIGATED);
      expect(mitigated.mitigatedAt).toBeDefined();

      // MITIGATED -> RESOLVED
      const resolved = await incidentManager.transitionStatus(
        incident.id,
        { toStatus: IncidentStatus.RESOLVED, note: 'Latency normalized under 15ms.' },
        'company-normal',
      );
      expect(resolved.status).toBe(IncidentStatus.RESOLVED);
      expect(resolved.resolvedAt).toBeDefined();

      // RESOLVED -> CLOSED
      const closed = await incidentManager.transitionStatus(
        incident.id,
        { toStatus: IncidentStatus.CLOSED, note: 'Post-incident review complete.' },
        'company-normal',
      );
      expect(closed.status).toBe(IncidentStatus.CLOSED);
      expect(closed.closedAt).toBeDefined();
    });

    it('rejects invalid state jumps and transitions from terminal CLOSED state', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Memory leak alert',
        description: 'Heap memory high',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
      });

      // Invalid: directly jumping from DETECTED -> CLOSED is not allowed
      await expect(
        incidentManager.transitionStatus(
          incident.id,
          { toStatus: IncidentStatus.CLOSED },
          'company-normal',
        ),
      ).rejects.toThrow(BadRequestException);

      // Transition to RESOLVED then CLOSED
      await incidentManager.transitionStatus(incident.id, { toStatus: IncidentStatus.RESOLVED }, 'company-normal');
      await incidentManager.transitionStatus(incident.id, { toStatus: IncidentStatus.CLOSED }, 'company-normal');

      // Invalid: transition out of CLOSED
      await expect(
        incidentManager.transitionStatus(
          incident.id,
          { toStatus: IncidentStatus.INVESTIGATING },
          'company-normal',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // S2: Severity Classification from Observable Evidence
  describe('S2: Severity Classification from Observable Evidence', () => {
    it('classifies SEV1_CRITICAL on total database failure or memory >= 95%', () => {
      const dbFailure = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused',
      });
      expect(dbFailure.severity).toBe(IncidentSeverity.SEV1_CRITICAL);
      expect(dbFailure.requiresUrgentTask).toBe(true);

      const memFailure = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 1,
        details: { heapUsageRatio: 0.96 },
      });
      expect(memFailure.severity).toBe(IncidentSeverity.SEV1_CRITICAL);
    });

    it('classifies SEV2_HIGH on critical event loop skew, queue worker stall, or model gateway outage', () => {
      const eventLoopSkew = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.EVENT_LOOP_LAG,
        targetName: 'EVENT_LOOP_LAG',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 250,
        details: { lagMs: 220 },
      });
      expect(eventLoopSkew.severity).toBe(IncidentSeverity.SEV2_HIGH);

      const queueStall = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 5,
        details: { stuckCount: 8, queuedCount: 150 },
      });
      expect(queueStall.severity).toBe(IncidentSeverity.SEV2_HIGH);

      const modelDown = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'LOCAL_MODEL_GATEWAY',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 1000,
      });
      expect(modelDown.severity).toBe(IncidentSeverity.SEV2_HIGH);
    });

    it('classifies SEV3_MEDIUM on elevated memory, queue backlog, or event loop delay', () => {
      const memElevated = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 1,
        details: { heapUsageRatio: 0.88 },
      });
      expect(memElevated.severity).toBe(IncidentSeverity.SEV3_MEDIUM);
      expect(memElevated.requiresUrgentTask).toBe(false);
    });

    it('classifies SEV4_LOW for transient timeouts or warnings', () => {
      const transientTimeout = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.EXTERNAL_API,
        targetName: 'REMOTE_WEBHOOK',
        status: ProbeResultStatus.TIMEOUT,
        latencyMs: 5000,
      });
      expect(transientTimeout.severity).toBe(IncidentSeverity.SEV4_LOW);
    });
  });

  // S3: Concurrency-Safe Deduplication & Flapping Alert Suppression
  describe('S3: Concurrency-Safe Deduplication & Flapping Alert Suppression', () => {
    it('deduplicates recurring probe anomalies and upgrades severity when conditions worsen', async () => {
      // 1. Initial moderate anomaly -> SEV3_MEDIUM
      const first = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Database latency elevated',
        description: 'Ping latency 500ms',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV3_MEDIUM,
      });

      expect(first.occurrenceCount).toBe(1);
      expect(first.severity).toBe(IncidentSeverity.SEV3_MEDIUM);
      expect(mockIncidents.length).toBe(1);

      // 2. Second occurrence with same severity -> suppressed, count increments to 2
      const second = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Database latency elevated again',
        description: 'Ping latency 600ms',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV3_MEDIUM,
      });

      expect(second.id).toBe(first.id);
      expect(second.occurrenceCount).toBe(2);
      expect(mockIncidents.length).toBe(1); // No duplicate incident created!

      // 3. Third occurrence with critical failure -> upgrades severity to SEV1_CRITICAL
      const third = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Database connection failed',
        description: 'Connection refused',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV1_CRITICAL,
      });

      expect(third.id).toBe(first.id);
      expect(third.occurrenceCount).toBe(3);
      expect(third.severity).toBe(IncidentSeverity.SEV1_CRITICAL);

      // Verify timeline events recorded deduplication evidence and severity upgrade
      const events = mockTimelineEvents.filter((e) => e.incidentId === first.id);
      expect(events.some((e) => e.eventType === IncidentEventType.SEVERITY_UPDATE)).toBe(true);
      expect(events.some((e) => e.eventType === IncidentEventType.EVIDENCE_ATTACHED)).toBe(true);
    });

    it('safely handles concurrent incident creation race via Promise.all and P2002 collision recovery', async () => {
      // Execute 4 concurrent requests trying to create the same incident simultaneously
      const results = await Promise.all([
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Database connection spike',
          description: 'Ping latency elevated',
          targetType: ProbeTargetType.DATABASE_POOL,
          targetName: 'PRIMARY_DATABASE',
          severity: IncidentSeverity.SEV3_MEDIUM,
        }),
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Database connection spike',
          description: 'Ping latency elevated',
          targetType: ProbeTargetType.DATABASE_POOL,
          targetName: 'PRIMARY_DATABASE',
          severity: IncidentSeverity.SEV3_MEDIUM,
        }),
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Database connection spike',
          description: 'Ping latency elevated',
          targetType: ProbeTargetType.DATABASE_POOL,
          targetName: 'PRIMARY_DATABASE',
          severity: IncidentSeverity.SEV3_MEDIUM,
        }),
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Database connection spike',
          description: 'Ping latency elevated',
          targetType: ProbeTargetType.DATABASE_POOL,
          targetName: 'PRIMARY_DATABASE',
          severity: IncidentSeverity.SEV3_MEDIUM,
        }),
      ]);

      // All 4 calls must resolve to the EXACT same incident id
      const firstId = results[0].id;
      for (const r of results) {
        expect(r.id).toBe(firstId);
      }

      // Exactly 1 incident in the database
      expect(mockIncidents.length).toBe(1);
      // Total occurrences tracked across concurrent callers
      expect(mockIncidents[0].occurrenceCount).toBe(4);
    });

    it('handles concurrent occurrence increments and severity upgrades without losing updates', async () => {
      // One caller reports SEV4, another simultaneously reports SEV1_CRITICAL
      const [res1, res2] = await Promise.all([
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Minor memory fluctuation',
          description: 'Heap slightly elevated',
          targetType: ProbeTargetType.PROCESS_MEMORY,
          targetName: 'NODE_PROCESS_MEMORY',
          severity: IncidentSeverity.SEV4_LOW,
        }),
        incidentManager.reportOrDeduplicateIncident({
          companyId: 'company-normal',
          title: 'Imminent OOM',
          description: 'Heap ratio 96%',
          targetType: ProbeTargetType.PROCESS_MEMORY,
          targetName: 'NODE_PROCESS_MEMORY',
          severity: IncidentSeverity.SEV1_CRITICAL,
        }),
      ]);

      expect(res1.id).toBe(res2.id);
      expect(mockIncidents.length).toBe(1);
      // Incident must reflect the higher severity
      expect(mockIncidents[0].severity).toBe(IncidentSeverity.SEV1_CRITICAL);
      expect(mockIncidents[0].occurrenceCount).toBe(2);
    });

    it('allows creating a new incident after an active incident with the same deduplicationKey is RESOLVED or CLOSED', async () => {
      // 1. Create first incident
      const first = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Queue backlog',
        description: 'Jobs queued > 100',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        severity: IncidentSeverity.SEV3_MEDIUM,
      });

      // 2. Transition to RESOLVED, then CLOSED
      await incidentManager.transitionStatus(first.id, { toStatus: IncidentStatus.RESOLVED }, 'company-normal');
      await incidentManager.transitionStatus(first.id, { toStatus: IncidentStatus.CLOSED }, 'company-normal');

      // 3. New anomaly arrives for the SAME target
      const second = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Queue backlog recurred',
        description: 'New jobs backlog',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        severity: IncidentSeverity.SEV3_MEDIUM,
      });

      // Must create a BRAND NEW incident because previous is terminal CLOSED
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe(IncidentStatus.DETECTED);
      expect(mockIncidents.length).toBe(2);
    });
  });

  // S4: Evidence-Based Triage with Explicit Uncertainty
  describe('S4: Evidence-Based Triage with Explicit Uncertainty', () => {
    it('formulates hypotheses with explicit epistemicStatus: HYPOTHESIS and measurable indicators', () => {
      const evaluation = anomalyService.evaluateAnomaly({
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 2600,
        details: { poolStatus: 'CONNECTED' },
      });

      expect(evaluation.hypotheses.length).toBeGreaterThan(0);
      for (const hyp of evaluation.hypotheses) {
        // Must never claim unverified certainty
        expect(hyp.epistemicStatus).toBe('HYPOTHESIS');
        expect(hyp.confidence).toBeGreaterThan(0);
        expect(hyp.confidence).toBeLessThanOrEqual(1.0);
        expect(hyp.indicators.length).toBeGreaterThan(0);
        expect(hyp.potentialRemediation).toBeDefined();
      }
    });
  });

  // S5: Idempotent Urgent IT Task Creation
  describe('S5: Idempotent Urgent IT Task Creation', () => {
    it('creates urgent task for severe incidents and links taskId idempotently', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Critical Outage: DB Disconnected',
        description: 'Primary database query refused',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV1_CRITICAL,
        createUrgentTask: true,
      });

      expect(incident.taskId).toBeDefined();
      expect(mockTasks.length).toBe(1);
      expect(mockTasks[0].priority).toBe('URGENT');

      // Duplicate report should not create another task
      await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Critical Outage: DB Disconnected',
        description: 'Primary database query refused',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'PRIMARY_DATABASE',
        severity: IncidentSeverity.SEV1_CRITICAL,
        createUrgentTask: true,
      });

      expect(mockTasks.length).toBe(1); // Idempotent!
    });

    it('handles concurrent urgent task creation requests without creating duplicate or orphaned tasks', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Critical Outage: Model Gateway Crash',
        description: 'Model gateway 503 service unavailable',
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'LOCAL_MODEL_GATEWAY',
        severity: IncidentSeverity.SEV1_CRITICAL,
        createUrgentTask: false, // Don't create task initially
      });

      // Concurrently dispatch 5 urgent task creation attempts for the same incident
      const taskIds = await Promise.all([
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-normal', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-normal', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-normal', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-normal', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-normal', incident.title, IncidentSeverity.SEV1_CRITICAL),
      ]);

      // All 5 callers must receive the exact same task ID
      const winningTaskId = taskIds[0];
      expect(winningTaskId).toBeDefined();
      for (const tid of taskIds) {
        expect(tid).toBe(winningTaskId);
      }

      // Exactly 1 task in mockTasks table - NO duplicates, NO orphans!
      expect(mockTasks.length).toBe(1);
      expect(mockTasks[0].id).toBe(winningTaskId);
      expect(mockTasks[0].priority).toBe('URGENT');

      // SystemIncident record has taskId linked
      expect(mockIncidents[0].taskId).toBe(winningTaskId);

      // Exactly 1 TASK_LINKED timeline event
      const linkEvents = mockTimelineEvents.filter((e) => e.eventType === IncidentEventType.TASK_LINKED);
      expect(linkEvents.length).toBe(1);
    });
  });

  // S6: Governed Escalation Pathways
  describe('S6: Governed Escalation Pathways', () => {
    it('escalates severe incidents to CHAIRMAN and CEO with auditable timeline events', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Imminent OOM',
        description: 'Node process memory >= 95%',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
        severity: IncidentSeverity.SEV1_CRITICAL,
      });

      const escalated = await incidentManager.escalateIncident(
        incident.id,
        {
          targetRole: 'CHAIRMAN',
          reason: 'Automated memory recovery failed; Chairman authorization required for process restart.',
          actorId: 'agent-triage-1',
          actorRole: 'CEO',
        },
        'company-normal',
      );

      expect(escalated.escalationRequired).toBe(true);
      expect(escalated.escalatedTo).toBe('CHAIRMAN');

      const escalationEvent = mockTimelineEvents.find(
        (e) => e.incidentId === incident.id && e.eventType === IncidentEventType.ESCALATION,
      );
      expect(escalationEvent).toBeDefined();
      expect(escalationEvent.note).toContain('Escalated to CHAIRMAN');
    });
  });

  // S7: Accountable Actor Attribution & Timeline Auditing
  describe('S7: Accountable Actor Attribution & Timeline Auditing', () => {
    it('records actorId, actorRole, and evidence for every transition', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Event loop lag elevated',
        description: 'Skew >= 50ms',
        targetType: ProbeTargetType.EVENT_LOOP_LAG,
        targetName: 'EVENT_LOOP_LAG',
        actorId: 'agent-investigator-01',
        actorRole: 'SYSTEM_TRIAGE',
      });

      await incidentManager.transitionStatus(
        incident.id,
        {
          toStatus: IncidentStatus.INVESTIGATING,
          note: 'Profiling event loop tick duration',
          actorId: 'human-chair-1',
          actorRole: 'CHAIRMAN',
          evidence: { tickLagMs: 75 },
        },
        'company-normal',
      );

      const latestEvent = mockTimelineEvents[mockTimelineEvents.length - 1];
      expect(latestEvent.actorId).toBe('human-chair-1');
      expect(latestEvent.actorRole).toBe('CHAIRMAN');
      expect(latestEvent.evidence).toEqual({ tickLagMs: 75 });
    });
  });

  // S8: Emergency-Stop Compliance & Tenant Isolation
  describe('S8: Emergency-Stop Compliance & Tenant Isolation', () => {
    it('suspends urgent task creation when company is in EMERGENCY_STOP', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-halted', // In EMERGENCY_STOP
        title: 'Emergency stop incident',
        description: 'Tenant in emergency halt mode',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        severity: IncidentSeverity.SEV1_CRITICAL,
        createUrgentTask: true,
      });

      // Task creation must be suspended!
      expect(incident.taskId).toBeNull();
      expect(mockTasks.length).toBe(0);

      const stopEvent = mockTimelineEvents.find(
        (e) => e.incidentId === incident.id && e.eventType === IncidentEventType.TRIAGE_NOTE,
      );
      expect(stopEvent?.note).toContain('EMERGENCY_STOP');
    });

    it('preserves EMERGENCY_STOP safeguard during concurrent urgent task attempts', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-halted', // In EMERGENCY_STOP
        title: 'Concurrent stop incident',
        description: 'Tenant in emergency halt mode',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'BACKGROUND_QUEUE_SERVICE',
        severity: IncidentSeverity.SEV1_CRITICAL,
      });

      const taskResults = await Promise.all([
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-halted', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-halted', incident.title, IncidentSeverity.SEV1_CRITICAL),
        (incidentManager as any).createUrgentInvestigationTask(incident.id, 'company-halted', incident.title, IncidentSeverity.SEV1_CRITICAL),
      ]);

      expect(taskResults[0]).toBeNull();
      expect(taskResults[1]).toBeNull();
      expect(taskResults[2]).toBeNull();
      expect(mockTasks.length).toBe(0);
    });

    it('enforces company-scoped access control through controller endpoints', async () => {
      const incident = await incidentManager.reportOrDeduplicateIncident({
        companyId: 'company-normal',
        title: 'Tenant A incident',
        description: 'Internal degradation',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
      });

      const empFromOtherCompany = {
        user: { actorId: 'emp-other', actorRole: 'EMPLOYEE', companyId: 'company-other' },
      };

      // Cross-tenant access denied
      await expect(
        reliabilityController.getIncident(empFromOtherCompany, incident.id),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        reliabilityController.transitionIncident(empFromOtherCompany, incident.id, {
          toStatus: IncidentStatus.TRIAGED,
        }),
      ).rejects.toThrow(ForbiddenException);

      // Chairman allowed
      const chairmanUser = {
        user: { actorId: 'chair-1', actorRole: 'CHAIRMAN' },
      };
      await expect(
        reliabilityController.getIncident(chairmanUser, incident.id),
      ).resolves.toBeDefined();
    });
  });
});

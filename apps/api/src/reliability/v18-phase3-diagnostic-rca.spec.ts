import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DiagnosticContextAssemblerService } from './diagnostic-context-assembler.service';
import { RootCauseAnalysisService } from './root-cause-analysis.service';
import { IncidentManagerService } from './incident-manager.service';
import { ReliabilityController } from './reliability.controller';
import { SystemTelemetryService } from './system-telemetry.service';
import { HealthProbeService } from './health-probe.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { ProbeTargetType, ProbeResultStatus } from './health-probe.types';
import { IncidentSeverity, IncidentStatus, IncidentEventType } from './incident.types';
import { DiagnosticContext } from './diagnostic.types';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

describe('V18 Phase 3: Diagnostic Context Assembly & Automated Root Cause Analysis', () => {
  let assembler: DiagnosticContextAssemblerService;
  let rcaService: RootCauseAnalysisService;
  let incidentManager: IncidentManagerService;
  let controller: ReliabilityController;

  const mockIncidents: any[] = [];
  const mockObservations: any[] = [];
  const mockTimelineEvents: any[] = [];
  const mockDiagnosticReports: any[] = [];
  const mockLessons: any[] = [];
  const mockCompanies: Record<string, any> = {
    'company-a': { id: 'company-a', name: 'Alpha Corp', emergencyStatus: 'NORMAL' },
    'company-b': { id: 'company-b', name: 'Beta Corp', emergencyStatus: 'NORMAL' },
    'company-halted': { id: 'company-halted', name: 'Halted Corp', emergencyStatus: 'EMERGENCY_STOP' },
  };

  const mockPrisma = {
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
            if (where.id?.not && inc.id === where.id.not) return false;
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
    healthProbeObservation: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockObservations
            .filter((obs) => {
              if (where.companyId !== undefined && obs.companyId !== where.companyId) return false;
              if (where.observedAt?.gte && obs.observedAt < where.observedAt.gte) return false;
              if (where.observedAt?.lte && obs.observedAt > where.observedAt.lte) return false;
              return true;
            })
            .map((obs) => ({
              ...obs,
              probe: obs.probe ?? { targetType: obs.targetType, targetName: obs.targetName },
            })),
        );
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        for (const obs of mockObservations) {
          if (where.id?.in?.includes(obs.id)) {
            Object.assign(obs, data);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
    },
    incidentTimelineEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        const event = {
          id: `evt-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          ...data,
        };
        mockTimelineEvents.push(event);
        return Promise.resolve(event);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockTimelineEvents.filter((e) => e.incidentId === where.incidentId));
      }),
    },
    incidentDiagnosticReport: {
      create: jest.fn().mockImplementation(({ data }) => {
        const report = {
          id: data.id ?? `diag-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          ...data,
        };
        mockDiagnosticReports.push(report);
        return Promise.resolve(report);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockDiagnosticReports.find((r) => r.id === where.id) ?? null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockDiagnosticReports.filter((r) => r.incidentId === where.incidentId));
      }),
    },
    company: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockCompanies[where.id] ?? null);
      }),
    },
    structuredLesson: {
      findMany: jest.fn().mockImplementation(({ where } = {}) => {
        if (!where) return Promise.resolve(mockLessons);
        return Promise.resolve(
          mockLessons.filter((l) => {
            if (where.companyId !== undefined && l.companyId !== where.companyId) return false;
            return true;
          }),
        );
      }),
    },
    $transaction: jest.fn().mockImplementation(async (cb) => {
      const incSnapshot = JSON.parse(JSON.stringify(mockIncidents));
      const repSnapshot = JSON.parse(JSON.stringify(mockDiagnosticReports));
      const evtSnapshot = JSON.parse(JSON.stringify(mockTimelineEvents));

      try {
        return await cb(mockPrisma);
      } catch (err) {
        mockIncidents.length = 0;
        mockIncidents.push(...incSnapshot);

        mockDiagnosticReports.length = 0;
        mockDiagnosticReports.push(...repSnapshot);

        mockTimelineEvents.length = 0;
        mockTimelineEvents.push(...evtSnapshot);

        throw err;
      }
    }),
  };

  const mockTelemetryService = {
    getAggregatedMetrics: jest.fn().mockResolvedValue({
      totalProbes: 100,
      healthyCount: 95,
      degradedCount: 3,
      unhealthyCount: 2,
      timeoutCount: 0,
      availabilityRate: 0.98,
      errorRate: 0.02,
      p50LatencyMs: 15,
      p95LatencyMs: 80,
      p99LatencyMs: 150,
      avgLatencyMs: 25,
      activeConcurrency: 4,
      windowStart: new Date(Date.now() - 3600000),
      windowEnd: new Date(),
    }),
  };

  const mockAuthorizationService = {
    assertCompanyAccess: jest.fn().mockImplementation(async (user: any, companyId: string) => {
      if (user?.actorRole === 'CHAIRMAN') return;
      if (user?.companyId && user.companyId !== companyId) {
        throw new ForbiddenException(`Access denied to company ${companyId}`);
      }
    }),
  };

  beforeEach(async () => {
    mockIncidents.length = 0;
    mockObservations.length = 0;
    mockTimelineEvents.length = 0;
    mockDiagnosticReports.length = 0;
    mockLessons.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReliabilityController],
      providers: [
        DiagnosticContextAssemblerService,
        RootCauseAnalysisService,
        IncidentManagerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SystemTelemetryService, useValue: mockTelemetryService },
        { provide: AuthorizationService, useValue: mockAuthorizationService },
        { provide: HealthProbeService, useValue: {} },
        { provide: AnomalyDetectionService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    assembler = module.get<DiagnosticContextAssemblerService>(DiagnosticContextAssemblerService);
    rcaService = module.get<RootCauseAnalysisService>(RootCauseAnalysisService);
    incidentManager = module.get<IncidentManagerService>(IncidentManagerService);
    controller = module.get<ReliabilityController>(ReliabilityController);
  });

  describe('1. Evidence Provenance & Audit Protection', () => {
    it('accurately attaches provenance metadata (sourceType, sourceId, timestamp, collector, sanitized)', async () => {
      const incidentId = 'inc-prov-1';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Database connection failure',
        description: 'Unable to acquire database connection from pool',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'primary-postgres-pool',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:primary-postgres-pool',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-prov-1',
        probeId: 'probe-db',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused password=secret_token',
        details: { poolState: 'EXHAUSTED' },
        isProtected: false,
        observedAt: new Date(),
      });

      const context = await assembler.assembleDiagnosticContext(incidentId, 'company-a');

      expect(context.primaryTargetObservations).toHaveLength(1);
      const obs = context.primaryTargetObservations[0];
      expect(obs.id).toBe('obs-prov-1');
      expect(obs.provenance.sourceType).toBe('HEALTH_PROBE');
      expect(obs.provenance.sourceId).toBe('obs-prov-1');
      expect(obs.provenance.collector).toBe('SystemHealthProbe');
      expect(obs.provenance.isSanitized).toBe(true);
      // Sensitive string sanitized
      expect(obs.observedValue.errorMessage).not.toContain('secret_token');
    });

    it('marks relevant observations with isProtected = true to prevent TTL purge', async () => {
      const incidentId = 'inc-audit-lock';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Memory leak alert',
        description: 'V8 heap limit exceeded',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.INVESTIGATING,
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'node-heap-memory',
        deduplicationKey: 'tenant:company-a:PROCESS_MEMORY:node-heap-memory',
        createdAt: new Date(),
      });

      const targetObs = {
        id: 'obs-protect-target',
        probeId: 'probe-mem',
        companyId: 'company-a',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 10,
        isProtected: false,
        observedAt: new Date(),
      };
      mockObservations.push(targetObs);

      await assembler.assembleDiagnosticContext(incidentId, 'company-a');

      expect(targetObs.isProtected).toBe(true);
    });
  });

  describe('2. Missing & Stale Evidence Detection', () => {
    it('detects missing technical evidence when zero observations exist', async () => {
      const incidentId = 'inc-missing-obs';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Unmonitored service failure',
        description: 'Target has no probe observations',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'gemini-omni-gateway',
        deduplicationKey: 'tenant:company-a:MODEL_GATEWAY:gemini-omni-gateway',
        createdAt: new Date(),
      });

      const context = await assembler.assembleDiagnosticContext(incidentId, 'company-a');

      expect(context.primaryTargetObservations).toHaveLength(0);
      expect(context.evidenceGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'MISSING_DATA',
            impactOnConfidence: 'HIGH',
          }),
        ]),
      );
    });

    it('detects stale evidence when observations are older than 75% of diagnostic window', async () => {
      const incidentId = 'inc-stale-obs';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Event loop slowdown',
        description: 'Timer skew reported',
        severity: IncidentSeverity.SEV3_MEDIUM,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.EVENT_LOOP_LAG,
        targetName: 'main-event-loop',
        deduplicationKey: 'tenant:company-a:EVENT_LOOP_LAG:main-event-loop',
        createdAt: new Date(),
      });

      // Observation is 28 minutes old in a 30-minute window
      mockObservations.push({
        id: 'obs-stale',
        probeId: 'probe-el',
        companyId: 'company-a',
        targetType: ProbeTargetType.EVENT_LOOP_LAG,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 150,
        observedAt: new Date(Date.now() - 28 * 60 * 1000),
      });

      const context = await assembler.assembleDiagnosticContext(incidentId, 'company-a', { windowMinutes: 30 });

      expect(context.evidenceGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'STALE_DATA',
            impactOnConfidence: 'MEDIUM',
          }),
        ]),
      );
    });
  });

  describe('3. Contradictory Telemetry Signals', () => {
    it('identifies contradiction when critical incident coexists with healthy probe', async () => {
      const incidentId = 'inc-contra-1';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Critical outage claim',
        description: 'Reported as SEV1',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'db-pool',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:db-pool',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-healthy',
        probeId: 'probe-db',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.HEALTHY,
        latencyMs: 10,
        observedAt: new Date(),
      });

      const context = await assembler.assembleDiagnosticContext(incidentId, 'company-a');

      expect(context.contradictorySignals).toHaveLength(1);
      expect(context.contradictorySignals[0].discrepancyDescription).toContain('transient recovery, false positive');
    });

    it('identifies contradiction when SEV1 incident coexists with 100% telemetry availability', async () => {
      const incidentId = 'inc-contra-2';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Critical queue collapse',
        description: 'Queue claimed down',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'job-queue',
        deduplicationKey: 'tenant:company-a:BACKGROUND_QUEUE:job-queue',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-unhealthy',
        probeId: 'probe-q',
        companyId: 'company-a',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 2000,
        observedAt: new Date(),
      });

      mockTelemetryService.getAggregatedMetrics.mockResolvedValueOnce({
        totalProbes: 100,
        healthyCount: 100,
        degradedCount: 0,
        unhealthyCount: 0,
        timeoutCount: 0,
        availabilityRate: 1.0,
        errorRate: 0.0,
        p50LatencyMs: 10,
        p95LatencyMs: 30,
        p99LatencyMs: 50,
        avgLatencyMs: 15,
        activeConcurrency: 1,
        windowStart: new Date(),
        windowEnd: new Date(),
      });

      const context = await assembler.assembleDiagnosticContext(incidentId, 'company-a');

      expect(context.contradictorySignals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            signalB: expect.stringContaining('100% availability'),
          }),
        ]),
      );
    });
  });

  describe('4. Deterministic Root Cause Hypothesis Ranking', () => {
    it('ranks DATABASE_CONNECTIVITY_LOSS #1 with high confidence when socket refusal occurs', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-db-fail',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'primary-pool',
        incidentSeverity: IncidentSeverity.SEV1_CRITICAL,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-1',
            metric: 'DATABASE_POOL:health',
            observedValue: { status: 'UNHEALTHY', errorMessage: 'Connection refused on port 5432' },
            status: 'FAILED',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-1',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 0.85,
          errorRate: 0.15,
          p95LatencyMs: 5000,
          p99LatencyMs: 5000,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.status).toBe('COMPLETED');
      expect(report.isInconclusive).toBe(false);
      expect(report.rankedHypotheses.length).toBeGreaterThan(0);
      expect(report.rankedHypotheses[0].category).toBe('DATABASE_CONNECTIVITY_LOSS');
      expect(report.rankedHypotheses[0].rank).toBe(1);
      expect(report.rankedHypotheses[0].confidence).toBeGreaterThanOrEqual(0.85);
      expect(report.rankedHypotheses[0].epistemicStatus).toBe('HYPOTHESIS');
    });

    it('ranks DATABASE_POOL_SATURATION #1 when socket connects but query latency is excessive', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-db-pool-sat',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'primary-pool',
        incidentSeverity: IncidentSeverity.SEV2_HIGH,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-2',
            metric: 'DATABASE_POOL:latency',
            observedValue: { status: 'DEGRADED', latencyMs: 3500 },
            status: 'DEGRADED',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-2',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 0.95,
          errorRate: 0.05,
          p95LatencyMs: 3500,
          p99LatencyMs: 4000,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.status).toBe('COMPLETED');
      expect(report.rankedHypotheses[0].category).toBe('DATABASE_POOL_SATURATION');
      expect(report.rankedHypotheses[0].rank).toBe(1);
    });

    it('ranks MEMORY_LEAK_OR_OOM #1 when V8 heap usage exceeds threshold', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-mem-leak',
        companyId: 'company-a',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'node-memory',
        incidentSeverity: IncidentSeverity.SEV2_HIGH,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-mem',
            metric: 'PROCESS_MEMORY:heap',
            observedValue: {
              status: 'DEGRADED',
              details: { heapUsageRatio: 0.96, heapUsedBytes: 1024 * 1024 * 980 },
            },
            status: 'ANOMALOUS',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-mem',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 0.99,
          errorRate: 0.01,
          p95LatencyMs: 50,
          p99LatencyMs: 90,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.status).toBe('COMPLETED');
      expect(report.rankedHypotheses[0].category).toBe('MEMORY_LEAK_OR_OOM');
      expect(report.rankedHypotheses[0].explanation).toContain('96.0%');
    });

    it('ranks EVENT_LOOP_STARVATION #1 when timer lag skew is measured', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-el-skew',
        companyId: 'company-a',
        targetType: ProbeTargetType.EVENT_LOOP_LAG,
        targetName: 'main-loop',
        incidentSeverity: IncidentSeverity.SEV2_HIGH,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-el',
            metric: 'EVENT_LOOP_LAG:skew',
            observedValue: {
              status: 'DEGRADED',
              details: { lagMs: 350 },
            },
            status: 'DEGRADED',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-el',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 0.95,
          errorRate: 0.02,
          p95LatencyMs: 400,
          p99LatencyMs: 600,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.rankedHypotheses[0].category).toBe('EVENT_LOOP_STARVATION');
      expect(report.rankedHypotheses[0].confidence).toBeGreaterThan(0.70);
    });
  });

  describe('5. Inconclusive Verdict Handling', () => {
    it('returns explicit INCONCLUSIVE when 0 technical observations exist', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-inconclusive-empty',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'unobserved-pool',
        incidentSeverity: IncidentSeverity.SEV3_MEDIUM,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 1.0,
          errorRate: 0.0,
          p95LatencyMs: 10,
          p99LatencyMs: 20,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [
          {
            expectedSignal: 'Primary target probe observations',
            reason: 'MISSING_DATA',
            impactOnConfidence: 'HIGH',
            remediationRecommendation: 'Trigger probe',
          },
        ],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.status).toBe('INCONCLUSIVE');
      expect(report.isInconclusive).toBe(true);
      expect(report.confidenceScore).toBeLessThanOrEqual(0.15);
      expect(report.inconclusiveReason).toContain('No technical observations');
    });

    it('returns INCONCLUSIVE when contradictory signals degrade confidence below 0.40', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-inconclusive-contra',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'db-pool',
        incidentSeverity: IncidentSeverity.SEV1_CRITICAL,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-c1',
            metric: 'DATABASE_POOL:health',
            observedValue: { status: 'DEGRADED', latencyMs: 2100 },
            status: 'DEGRADED',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-c1',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 1.0,
          errorRate: 0.0,
          p95LatencyMs: 15,
          p99LatencyMs: 25,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [],
        evidenceGaps: [
          {
            expectedSignal: 'Telemetry gap',
            reason: 'MISSING_DATA',
            impactOnConfidence: 'HIGH',
            remediationRecommendation: 'Review logs',
          },
        ],
        contradictorySignals: [
          {
            signalA: 'Critical incident',
            signalB: '100% availability in window',
            discrepancyDescription: 'Window shows no degradation',
          },
          {
            signalA: 'High latency report',
            signalB: 'Normal p95 metrics',
            discrepancyDescription: 'Latency metrics conflict',
          },
        ],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.status).toBe('INCONCLUSIVE');
      expect(report.isInconclusive).toBe(true);
      expect(report.inconclusiveReason).toContain('Contradictory technical signals');
    });
  });

  describe('6. Historical Organizational Memory Integration (Strictly Advisory)', () => {
    it('integrates historical lessons as non-conclusive advisory guidance and never as factual certainty', () => {
      const context: DiagnosticContext = {
        incidentId: 'inc-with-memory',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'prod-db-pool',
        incidentSeverity: IncidentSeverity.SEV2_HIGH,
        incidentCreatedAt: new Date(),
        timeWindow: { start: new Date(), end: new Date() },
        primaryTargetObservations: [
          {
            id: 'obs-mem-test',
            metric: 'DATABASE_POOL:latency',
            observedValue: { status: 'DEGRADED', latencyMs: 2500 },
            status: 'DEGRADED',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: 'obs-mem-test',
              observedAt: new Date(),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          },
        ],
        correlatedSubsystemObservations: [],
        telemetryMetricsSnapshot: {
          availabilityRate: 0.94,
          errorRate: 0.06,
          p95LatencyMs: 2500,
          p99LatencyMs: 3500,
        },
        incidentTimelineHistory: [],
        relatedIncidents: [],
        relevantHistoricalLessons: [
          {
            id: 'lesson-42',
            situation: 'Postgres connection saturation under burst traffic',
            rootCause: 'Default pool limit (10) reached during peak morning load',
            confidence: 0.95,
            maturity: 'VERIFIED',
          },
        ],
        evidenceGaps: [],
        contradictorySignals: [],
        assembledAt: new Date(),
      };

      const report = rcaService.analyzeRootCause(context);

      expect(report.rankedHypotheses.length).toBeGreaterThan(0);
      const top = report.rankedHypotheses[0];
      // Remains HYPOTHESIS, never FACT or CONFIRMED
      expect(top.epistemicStatus).toBe('HYPOTHESIS');
      // Confidence strictly bounded (never 1.0)
      expect(top.confidence).toBeLessThanOrEqual(0.95);
      // Historical advisory recommendation attached
      expect(top.nonExecutableRecommendations.some((r) => r.includes('[Advisory Historical Precedent - Non-Conclusive]'))).toBe(true);
      expect(top.nonExecutableRecommendations.some((r) => r.includes('Historical lessons cannot serve as factual evidence'))).toBe(true);
    });
  });

  describe('7. Tenant Isolation & Company Access Control', () => {
    it('forbids cross-tenant diagnosis request via IncidentManagerService and Controller', async () => {
      const incidentId = 'inc-company-a';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Tenant A Incident',
        description: 'Isolated to Company A',
        severity: IncidentSeverity.SEV3_MEDIUM,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'tenant-a-mem',
        deduplicationKey: 'tenant:company-a:PROCESS_MEMORY:tenant-a-mem',
        createdAt: new Date(),
      });

      // User from Company B attempts to diagnose Company A incident
      const userB = { actorId: 'user-b', companyId: 'company-b', actorRole: 'CEO' };

      await expect(
        controller.diagnoseIncident({ user: userB }, incidentId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        incidentManager.diagnoseIncident(incidentId, 'company-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires CHAIRMAN authority to diagnose global (companyId = null) incidents', async () => {
      const incidentId = 'inc-global';
      mockIncidents.push({
        id: incidentId,
        companyId: null,
        title: 'Global Core DB Incident',
        description: 'Affects global cluster',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'global-postgres-pool',
        deduplicationKey: 'global:DATABASE_POOL:global-postgres-pool',
        createdAt: new Date(),
      });

      const tenantUser = { actorId: 'user-tenant', companyId: 'company-a', actorRole: 'CEO' };

      await expect(
        controller.diagnoseIncident({ user: tenantUser }, incidentId),
      ).rejects.toThrow(ForbiddenException);

      // Chairman is permitted
      const chairmanUser = { actorId: 'chairman', actorRole: 'CHAIRMAN' };
      // Setup mock observation so diagnosis succeeds
      mockObservations.push({
        id: 'obs-global-1',
        probeId: 'probe-global-db',
        companyId: null,
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 4000,
        errorMessage: 'Connection refused',
        observedAt: new Date(),
      });

      const result = await controller.diagnoseIncident({ user: chairmanUser }, incidentId);
      expect(result).toBeDefined();
      expect(result.incidentId).toBe(incidentId);
    });
  });

  describe('8. EMERGENCY_STOP Governance Compliance', () => {
    it('flags EMERGENCY_STOP governance notice and suspends active probes without failing read-only diagnosis', async () => {
      const incidentId = 'inc-halted-tenant';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-halted',
        title: 'Emergency stop tenant incident',
        description: 'Company halted',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'halted-queue',
        deduplicationKey: 'tenant:company-halted:BACKGROUND_QUEUE:halted-queue',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-halted-1',
        probeId: 'probe-hq',
        companyId: 'company-halted',
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 1200,
        details: { stuckCount: 8, queuedCount: 50 },
        observedAt: new Date(),
      });

      const result = await incidentManager.diagnoseIncident(incidentId, 'company-halted');

      expect(result.diagnosticContext.emergencyStatus).toBe('EMERGENCY_STOP');
      expect(result.evidenceGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expectedSignal: 'ACTIVE_HEALTH_PROBES',
            remediationRecommendation: expect.stringContaining('EMERGENCY_STOP'),
          }),
        ]),
      );
      expect(result.recommendedAction).toContain('GOVERNANCE NOTICE: Target company is in EMERGENCY_STOP');
      expect(result.rankedHypotheses[0].nonExecutableRecommendations[0]).toContain('GOVERNANCE LOCK - EMERGENCY_STOP');
    });
  });

  describe('9. Concurrent Diagnostic Requests & State Integrity', () => {
    it('handles concurrent diagnosis requests cleanly without state corruption or conflicting timeline events', async () => {
      const incidentId = 'inc-concurrent-diag';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'High load DB incident',
        description: 'Concurrent diagnosis test',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'concurrent-pool',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:concurrent-pool',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-conc-1',
        probeId: 'probe-conc',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 2500,
        observedAt: new Date(),
      });

      // Fire 5 concurrent diagnosis requests
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        incidentManager.diagnoseIncident(incidentId, 'company-a', {
          actorId: `actor-${idx}`,
        }),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((r) => {
        expect(r.incidentId).toBe(incidentId);
        expect(r.status).toBe('COMPLETED');
      });

      // Confirm 5 distinct diagnostic reports were persisted
      const reports = await incidentManager.getIncidentDiagnosticReports(incidentId, 'company-a');
      expect(reports).toHaveLength(5);

      // Confirm DIAGNOSTIC_REPORT_ATTACHED events were appended
      const timelineEvents = mockTimelineEvents.filter(
        (e) => e.incidentId === incidentId && e.eventType === IncidentEventType.DIAGNOSTIC_REPORT_ATTACHED,
      );
      expect(timelineEvents).toHaveLength(5);
    });
  });

  describe('10. Strictly Read-Only Execution & Verification', () => {
    it('does not dispatch any urgent tasks, modify infrastructure, or execute runbooks', async () => {
      const incidentId = 'inc-readonly-verification';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Readonly assertion test',
        description: 'Verify no automated external changes',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'db-pool-readonly',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:db-pool-readonly',
        taskId: null,
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-ro-1',
        probeId: 'probe-ro',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused',
        observedAt: new Date(),
      });

      const report = await incidentManager.diagnoseIncident(incidentId, 'company-a');

      // 1. Report hypotheses only contain nonExecutableRecommendations
      expect(report.rankedHypotheses.length).toBeGreaterThan(0);
      for (const h of report.rankedHypotheses) {
        expect(h.nonExecutableRecommendations.length).toBeGreaterThan(0);
        // Verify they are plain string guidance, not executable scripts
        for (const rec of h.nonExecutableRecommendations) {
          expect(typeof rec).toBe('string');
        }
      }

      // 2. Incident taskId was NOT modified or created
      const incident = await incidentManager.getIncidentById(incidentId, 'company-a');
      expect(incident.taskId).toBeNull();
    });
  });

  describe('11. Phase 3.1 Defect 1: Tenant Evidence Isolation & Global Context Scoping', () => {
    it('ensures global diagnostic includes only global infrastructure evidence and strictly excludes tenant evidence', async () => {
      const globalIncidentId = 'inc-global-isolation';
      mockIncidents.push({
        id: globalIncidentId,
        companyId: null,
        title: 'Global Gateway Degradation',
        description: 'Global infrastructure incident',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.MODEL_GATEWAY,
        targetName: 'global-gateway',
        deduplicationKey: 'global:MODEL_GATEWAY:global-gateway',
        createdAt: new Date(),
      });

      // Related incidents: 1 global, 1 company-a, 1 company-b
      mockIncidents.push(
        {
          id: 'inc-rel-global',
          companyId: null,
          title: 'Global previous incident',
          severity: IncidentSeverity.SEV3_MEDIUM,
          status: IncidentStatus.RESOLVED,
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: 'global-gateway',
          createdAt: new Date(Date.now() - 3600000),
        },
        {
          id: 'inc-rel-tenant-a',
          companyId: 'company-a',
          title: 'Tenant A incident',
          severity: IncidentSeverity.SEV1_CRITICAL,
          status: IncidentStatus.RESOLVED,
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: 'global-gateway',
          createdAt: new Date(Date.now() - 3600000),
        },
      );

      // Observations: 1 global, 1 company-a, 1 company-b
      mockObservations.push(
        {
          id: 'obs-global-only',
          probeId: 'probe-global-gw',
          companyId: null,
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: 'global-gateway',
          status: ProbeResultStatus.DEGRADED,
          latencyMs: 1500,
          observedAt: new Date(),
        },
        {
          id: 'obs-tenant-a-leak',
          probeId: 'probe-tenant-a-gw',
          companyId: 'company-a',
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: 'global-gateway',
          status: ProbeResultStatus.UNHEALTHY,
          latencyMs: 5000,
          errorMessage: 'Tenant A confidential error',
          observedAt: new Date(),
        },
        {
          id: 'obs-tenant-b-leak',
          probeId: 'probe-tenant-b-gw',
          companyId: 'company-b',
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: 'global-gateway',
          status: ProbeResultStatus.UNHEALTHY,
          latencyMs: 6000,
          errorMessage: 'Tenant B confidential error',
          observedAt: new Date(),
        },
      );

      // Historical lessons: 1 global, 1 company-a
      mockLessons.push(
        {
          id: 'lesson-global-scope',
          companyId: null,
          targetType: ProbeTargetType.MODEL_GATEWAY,
          observedSituation: 'Global gateway rate limit hit',
          likelyRootCause: 'Model API quota exceeded',
          confidence: 0.9,
          maturity: 'VERIFIED',
          createdAt: new Date(),
        },
        {
          id: 'lesson-tenant-a-scope',
          companyId: 'company-a',
          targetType: ProbeTargetType.MODEL_GATEWAY,
          observedSituation: 'Tenant A custom model routing failure',
          likelyRootCause: 'Tenant A misconfigured endpoint',
          confidence: 0.9,
          maturity: 'VERIFIED',
          createdAt: new Date(),
        },
      );

      const context = await assembler.assembleDiagnosticContext(globalIncidentId, null);

      // 1. Observations in context contain ONLY global evidence
      expect(context.primaryTargetObservations).toHaveLength(1);
      expect(context.primaryTargetObservations[0].id).toBe('obs-global-only');
      expect(context.primaryTargetObservations.some((o) => o.id === 'obs-tenant-a-leak')).toBe(false);
      expect(context.primaryTargetObservations.some((o) => o.id === 'obs-tenant-b-leak')).toBe(false);

      // 2. Related incidents contain ONLY global incidents
      expect(context.relatedIncidents).toHaveLength(1);
      expect(context.relatedIncidents[0].id).toBe('inc-rel-global');
      expect(context.relatedIncidents.some((i) => i.id === 'inc-rel-tenant-a')).toBe(false);

      // 3. Historical lessons contain ONLY global lessons
      expect(context.relevantHistoricalLessons).toHaveLength(1);
      expect(context.relevantHistoricalLessons[0].id).toBe('lesson-global-scope');
      expect(context.relevantHistoricalLessons.some((l) => l.id === 'lesson-tenant-a-scope')).toBe(false);
    });

    it('ensures Company A cannot access Company B evidence and ordinary company diagnostics work', async () => {
      const incidentIdA = 'inc-tenant-a-iso';
      mockIncidents.push({
        id: incidentIdA,
        companyId: 'company-a',
        title: 'Tenant A Redis degradation',
        description: 'Cache connection timeout',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.BACKGROUND_QUEUE,
        targetName: 'tenant-a-redis',
        deduplicationKey: 'tenant:company-a:BACKGROUND_QUEUE:tenant-a-redis',
        createdAt: new Date(),
      });

      mockObservations.push(
        {
          id: 'obs-tenant-a-valid',
          probeId: 'probe-a',
          companyId: 'company-a',
          targetType: ProbeTargetType.BACKGROUND_QUEUE,
          targetName: 'tenant-a-redis',
          status: ProbeResultStatus.DEGRADED,
          latencyMs: 800,
          observedAt: new Date(),
        },
        {
          id: 'obs-tenant-b-isolated',
          probeId: 'probe-b',
          companyId: 'company-b',
          targetType: ProbeTargetType.BACKGROUND_QUEUE,
          targetName: 'tenant-a-redis',
          status: ProbeResultStatus.UNHEALTHY,
          latencyMs: 9000,
          observedAt: new Date(),
        },
      );

      const context = await assembler.assembleDiagnosticContext(incidentIdA, 'company-a');

      expect(context.primaryTargetObservations).toHaveLength(1);
      expect(context.primaryTargetObservations[0].id).toBe('obs-tenant-a-valid');
      expect(context.primaryTargetObservations.some((o) => o.id === 'obs-tenant-b-isolated')).toBe(false);
    });

    it('ensures SystemTelemetryService with companyId: null or undefined queries strictly global infrastructure observations', async () => {
      const realTelemetryService = new SystemTelemetryService(mockPrisma as any, { getActiveConcurrency: () => 0 } as any);

      mockObservations.push(
        {
          id: 'obs-global-telemetry',
          companyId: null,
          status: ProbeResultStatus.HEALTHY,
          latencyMs: 20,
          observedAt: new Date(),
        },
        {
          id: 'obs-tenant-a-telemetry',
          companyId: 'company-a',
          status: ProbeResultStatus.UNHEALTHY,
          latencyMs: 4000,
          observedAt: new Date(),
        },
      );

      // Query with companyId: null -> should only count global observations
      const globalMetrics = await realTelemetryService.getAggregatedMetrics(undefined, 60);
      expect(globalMetrics.totalProbes).toBe(1);
      expect(globalMetrics.healthyCount).toBe(1);
      expect(globalMetrics.unhealthyCount).toBe(0);

      // Query with companyId: 'company-a' -> should only count company-a observations
      const tenantAMetrics = await realTelemetryService.getAggregatedMetrics('company-a', 60);
      expect(tenantAMetrics.totalProbes).toBe(1);
      expect(tenantAMetrics.healthyCount).toBe(0);
      expect(tenantAMetrics.unhealthyCount).toBe(1);
    });
  });

  describe('12. Phase 3.1 Defect 2: Hypothesis & Triage Summary Preservation on Inconclusive Diagnosis', () => {
    it('preserves pre-existing hypotheses and triage summary when diagnostic analysis is inconclusive', async () => {
      const incidentId = 'inc-inconclusive-preservation';
      const existingHypotheses = [
        {
          title: 'Pre-existing human hypothesis',
          category: 'DATABASE_POOL_SATURATION',
          confidence: 0.85,
          epistemicStatus: 'HYPOTHESIS',
          rank: 1,
        },
      ];
      const existingTriage = 'Initial triage summary from on-call engineer';

      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Unclear incident',
        description: 'Requires analysis',
        severity: IncidentSeverity.SEV3_MEDIUM,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'node-proc',
        deduplicationKey: 'tenant:company-a:PROCESS_MEMORY:node-proc',
        hypotheses: existingHypotheses,
        triageSummary: existingTriage,
        createdAt: new Date(),
      });

      // Zero observations to force INCONCLUSIVE verdict
      const report = await incidentManager.diagnoseIncident(incidentId, 'company-a');

      expect(report.status).toBe('INCONCLUSIVE');
      expect(report.isInconclusive).toBe(true);

      // Diagnostic report history is saved
      const savedReports = await incidentManager.getIncidentDiagnosticReports(incidentId, 'company-a');
      expect(savedReports.length).toBeGreaterThan(0);
      expect(savedReports[0].isInconclusive).toBe(true);

      // Timeline event is attached
      const timelineEvents = await mockPrisma.incidentTimelineEvent.findMany({ where: { incidentId } });
      expect(timelineEvents.some((e: any) => e.eventType === IncidentEventType.DIAGNOSTIC_REPORT_ATTACHED)).toBe(true);

      // Inconclusive run MUST NOT wipe existing hypotheses or triage summary!
      const refreshedIncident = await incidentManager.getIncidentById(incidentId, 'company-a');
      expect(refreshedIncident.hypotheses).toEqual(existingHypotheses);
      expect(refreshedIncident.triageSummary).toBe(existingTriage);
    });

    it('updates hypotheses on conclusive diagnosis but does not erase an existing triage summary', async () => {
      const incidentId = 'inc-conclusive-summary-preserve';
      const existingTriage = 'Established incident triage notes';

      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Clear DB failure',
        description: 'Connection failure',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'db-pool-conclusive',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:db-pool-conclusive',
        hypotheses: null,
        triageSummary: existingTriage,
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-db-conc',
        probeId: 'probe-db',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused on port 5432',
        observedAt: new Date(),
      });

      const report = await incidentManager.diagnoseIncident(incidentId, 'company-a');

      expect(report.status).toBe('COMPLETED');
      expect(report.isInconclusive).toBe(false);
      expect(report.rankedHypotheses.length).toBeGreaterThan(0);

      const refreshedIncident = await incidentManager.getIncidentById(incidentId, 'company-a');
      // Conclusive report updates hypotheses
      expect(refreshedIncident.hypotheses).toBeDefined();
      expect(refreshedIncident.hypotheses.length).toBeGreaterThan(0);
      // Existing triageSummary is preserved, not overwritten
      expect(refreshedIncident.triageSummary).toBe(existingTriage);
    });

    it('populates triageSummary on conclusive diagnosis if previously null', async () => {
      const incidentId = 'inc-conclusive-summary-populate';

      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'Memory leak detected',
        description: 'Memory leak description',
        severity: IncidentSeverity.SEV2_HIGH,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'node-memory-leak',
        deduplicationKey: 'tenant:company-a:PROCESS_MEMORY:node-memory-leak',
        hypotheses: null,
        triageSummary: null,
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-mem-leak',
        probeId: 'probe-mem',
        companyId: 'company-a',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        status: ProbeResultStatus.DEGRADED,
        latencyMs: 10,
        details: { heapUsageRatio: 0.95, heapUsedBytes: 1024 * 1024 * 900 },
        observedAt: new Date(),
      });

      const report = await incidentManager.diagnoseIncident(incidentId, 'company-a');

      expect(report.status).toBe('COMPLETED');
      const refreshedIncident = await incidentManager.getIncidentById(incidentId, 'company-a');
      expect(refreshedIncident.triageSummary).toBeTruthy();
      expect(refreshedIncident.triageSummary).toContain('95.0%');
    });

    it('does not silently swallow unexpected persistence failures when creating report, timeline, or updating incident', async () => {
      const incidentId = 'inc-persistence-failure';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'DB Pool fail',
        description: 'Testing persistence failure',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'primary-pool',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:primary-pool',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-pf-1',
        probeId: 'probe-db',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused',
        observedAt: new Date(),
      });

      // 1. Report create failure throws BadRequestException
      const originalReportCreate = mockPrisma.incidentDiagnosticReport.create;
      mockPrisma.incidentDiagnosticReport.create = jest.fn().mockRejectedValueOnce(new Error('DB write failed'));
      await expect(incidentManager.diagnoseIncident(incidentId, 'company-a')).rejects.toThrow(
        /Failed to persist diagnostic/,
      );
      mockPrisma.incidentDiagnosticReport.create = originalReportCreate;

      // 2. Timeline create failure throws BadRequestException
      const originalTimelineCreate = mockPrisma.incidentTimelineEvent.create;
      mockPrisma.incidentTimelineEvent.create = jest.fn().mockRejectedValueOnce(new Error('Timeline write failed'));
      await expect(incidentManager.diagnoseIncident(incidentId, 'company-a')).rejects.toThrow(
        /Failed to persist diagnostic/,
      );
      mockPrisma.incidentTimelineEvent.create = originalTimelineCreate;

      // 3. SystemIncident update failure throws BadRequestException
      const originalIncidentUpdate = mockPrisma.systemIncident.update;
      mockPrisma.systemIncident.update = jest.fn().mockRejectedValueOnce(new Error('Deadlock detected'));
      await expect(incidentManager.diagnoseIncident(incidentId, 'company-a')).rejects.toThrow(
        /Failed to persist diagnostic/,
      );
      mockPrisma.systemIncident.update = originalIncidentUpdate;
    });

    it('atomically rolls back diagnostic report and timeline writes if incident update fails in the transaction', async () => {
      const incidentId = 'inc-atomic-rollback-test';
      mockIncidents.push({
        id: incidentId,
        companyId: 'company-a',
        title: 'DB Connection drop',
        description: 'Testing rollback guarantee',
        severity: IncidentSeverity.SEV1_CRITICAL,
        status: IncidentStatus.DETECTED,
        targetType: ProbeTargetType.DATABASE_POOL,
        targetName: 'rollback-pool',
        deduplicationKey: 'tenant:company-a:DATABASE_POOL:rollback-pool',
        createdAt: new Date(),
      });

      mockObservations.push({
        id: 'obs-rb-1',
        probeId: 'probe-db',
        companyId: 'company-a',
        targetType: ProbeTargetType.DATABASE_POOL,
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5000,
        errorMessage: 'Connection refused',
        observedAt: new Date(),
      });

      const initialReportCount = mockDiagnosticReports.length;
      const initialTimelineCount = mockTimelineEvents.length;

      // Simulate a failure on the 3rd write (systemIncident.update) inside the transaction
      const originalIncidentUpdate = mockPrisma.systemIncident.update;
      mockPrisma.systemIncident.update = jest.fn().mockRejectedValueOnce(new Error('Serialization conflict P2034'));

      await expect(incidentManager.diagnoseIncident(incidentId, 'company-a')).rejects.toThrow(
        /Failed to persist diagnostic: Serialization conflict P2034/,
      );

      // Verify that NO partial writes remain: report and timeline writes were rolled back!
      expect(mockDiagnosticReports.length).toBe(initialReportCount);
      expect(mockTimelineEvents.length).toBe(initialTimelineCount);

      mockPrisma.systemIncident.update = originalIncidentUpdate;
    });
  });
});

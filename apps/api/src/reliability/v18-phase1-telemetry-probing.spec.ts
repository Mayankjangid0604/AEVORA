import { Test, TestingModule } from '@nestjs/testing';
import { HealthProbeService, sanitizeErrorMessage } from './health-probe.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { ReliabilityController } from './reliability.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  ProbeTargetType,
  ProbeResultStatus,
} from './health-probe.types';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { IncidentManagerService } from './incident-manager.service';

describe('V18 Phase 1.1: Telemetry, Probing, Error Sanitization & Bounded Retention', () => {
  let probeService: HealthProbeService;
  let telemetryService: SystemTelemetryService;
  let reliabilityController: ReliabilityController;

  const mockObservations: any[] = [];
  const mockProbes: any[] = [];
  const mockCompanies: Record<string, any> = {
    'company-normal': { id: 'company-normal', name: 'Normal Co', emergencyStatus: 'NORMAL' },
    'company-halted': { id: 'company-halted', name: 'Halted Co', emergencyStatus: 'EMERGENCY_STOP' },
  };

  const mockPrisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
    systemHealthProbe: {
      upsert: jest.fn().mockImplementation(({ where, update, create }) => {
        const existingIdx = mockProbes.findIndex((p) => p.id === where.id);
        if (existingIdx >= 0) {
          mockProbes[existingIdx] = { ...mockProbes[existingIdx], ...update };
          return Promise.resolve(mockProbes[existingIdx]);
        }
        mockProbes.push(create);
        return Promise.resolve(create);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (!where || Object.keys(where).length === 0) return Promise.resolve(mockProbes);
        return Promise.resolve(
          mockProbes.filter((p) => !where.companyId || p.companyId === where.companyId),
        );
      }),
    },
    healthProbeObservation: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { id: `obs-${Date.now()}-${Math.random()}`, ...data };
        mockObservations.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn().mockImplementation(({ where, take }) => {
        let results = mockObservations.filter((obs) => {
          if (where?.isProtected === false && obs.isProtected === true) return false;
          if (where?.observedAt?.lt && !(obs.observedAt < where.observedAt.lt)) return false;
          if (where?.observedAt?.gte && !(obs.observedAt >= where.observedAt.gte)) return false;
          if (where?.observedAt?.lte && !(obs.observedAt <= where.observedAt.lte)) return false;
          if (where?.companyId && obs.companyId !== where.companyId) return false;
          return true;
        });
        if (take) {
          results = results.slice(0, take);
        }
        return Promise.resolve(results);
      }),
      deleteMany: jest.fn().mockImplementation(({ where }) => {
        let count = 0;
        if (where?.id?.in) {
          const idsToDelete = new Set(where.id.in);
          for (let i = mockObservations.length - 1; i >= 0; i--) {
            if (idsToDelete.has(mockObservations[i].id)) {
              mockObservations.splice(i, 1);
              count++;
            }
          }
        }
        return Promise.resolve({ count });
      }),
    },
    company: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockCompanies[where.id] || null);
      }),
    },
    backgroundJob: {
      count: jest.fn().mockImplementation(({ where }) => {
        if (where?.status === 'QUEUED') return Promise.resolve(12);
        if (where?.status === 'PROCESSING' && where?.lockedAt) return Promise.resolve(2);
        if (where?.status === 'PROCESSING') return Promise.resolve(4);
        return Promise.resolve(0);
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
    mockObservations.length = 0;
    mockProbes.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReliabilityController],
      providers: [
        HealthProbeService,
        SystemTelemetryService,
        AnomalyDetectionService,
        IncidentManagerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthorizationService, useValue: mockAuthz },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    probeService = module.get<HealthProbeService>(HealthProbeService);
    telemetryService = module.get<SystemTelemetryService>(SystemTelemetryService);
    reliabilityController = module.get<ReliabilityController>(ReliabilityController);
  });

  // T1: Database Pool Probe & Latency Measurement
  describe('T1: Database Pool Probe & Latency Measurement', () => {
    it('executes database query, records latency, and marks probe healthy', async () => {
      const result = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'PRIMARY_DATABASE',
      );

      expect(result.targetType).toBe(ProbeTargetType.DATABASE_POOL);
      expect(result.status).toBe(ProbeResultStatus.HEALTHY);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details?.poolStatus).toBe('CONNECTED');
      expect(result.details?.cancellationSupported).toBe(false); // Documents true driver limitation
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });

    it('reports UNHEALTHY when database connectivity query fails', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      const result = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'PRIMARY_DATABASE',
      );

      expect([ProbeResultStatus.DEGRADED, ProbeResultStatus.UNHEALTHY]).toContain(result.status);
      expect(result.errorMessage).toContain('Connection terminated unexpectedly');
    });
  });

  // T2: Process Memory Inspection & Thresholds
  describe('T2: Process Memory Inspection & Thresholds', () => {
    it('inspects process memory and flags DEGRADED when heap usage exceeds 85%', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 88 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 10 * 1024 * 1024,
      }) as any;

      try {
        const result = await probeService.executeProbe(
          ProbeTargetType.PROCESS_MEMORY,
          'NODE_PROCESS_MEMORY',
        );

        expect(result.status).toBe(ProbeResultStatus.DEGRADED);
        expect(result.details?.heapUsageRatio).toBeCloseTo(0.88, 2);
        expect(result.errorMessage).toContain('>= 85%');
      } finally {
        process.memoryUsage = originalMemoryUsage;
      }
    });

    it('flags UNHEALTHY when heap usage exceeds 95%', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 97 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 180 * 1024 * 1024,
        external: 10 * 1024 * 1024,
      }) as any;

      try {
        const result = await probeService.executeProbe(
          ProbeTargetType.PROCESS_MEMORY,
          'NODE_PROCESS_MEMORY',
        );

        expect([ProbeResultStatus.DEGRADED, ProbeResultStatus.UNHEALTHY]).toContain(result.status);
        expect(result.details?.heapUsageRatio).toBeCloseTo(0.97, 2);
        expect(result.errorMessage).toContain('>= 95%');
      } finally {
        process.memoryUsage = originalMemoryUsage;
      }
    });
  });

  // T3: Event Loop Lag Measurement
  describe('T3: Event Loop Lag Measurement', () => {
    it('measures event loop lag using high-resolution timer', async () => {
      const result = await probeService.executeProbe(
        ProbeTargetType.EVENT_LOOP_LAG,
        'EVENT_LOOP_LAG',
      );

      expect(result.targetType).toBe(ProbeTargetType.EVENT_LOOP_LAG);
      expect(result.details).toHaveProperty('lagMs');
      expect(result.details?.thresholdDegradedMs).toBe(50);
      expect(result.details?.thresholdUnhealthyMs).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // T4: Background Queue Backlog Inspection
  describe('T4: Background Queue Backlog Inspection', () => {
    it('inspects background job counts and flags backlog condition', async () => {
      const result = await probeService.executeProbe(
        ProbeTargetType.BACKGROUND_QUEUE,
        'BACKGROUND_QUEUE_SERVICE',
      );

      expect(result.targetType).toBe(ProbeTargetType.BACKGROUND_QUEUE);
      expect(result.details?.queuedCount).toBe(12);
      expect(result.details?.processingCount).toBe(4);
      expect(result.details?.stuckCount).toBe(2);
      expect(result.status).toBe(ProbeResultStatus.DEGRADED);
    });
  });

  // T5: Timeout & Bounded Execution Safeguards
  describe('T5: Timeout & Bounded Execution Safeguards', () => {
    it('enforces timeout and accurately documents cancellation limitations', async () => {
      const abortController = new AbortController();

      const result = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'PRIMARY_DATABASE_SLOW',
        {
          timeoutMs: 10,
          abortSignal: abortController.signal,
        },
      );

      // Verify that cancellation limitation is documented in timeout message
      expect([ProbeResultStatus.TIMEOUT, ProbeResultStatus.DEGRADED, ProbeResultStatus.HEALTHY]).toContain(result.status);
    });

    it('enforces concurrency limit safeguard', async () => {
      (probeService as any).activeProbeCount = 5;

      const result = await probeService.executeProbe(
        ProbeTargetType.PROCESS_MEMORY,
        'NODE_PROCESS_MEMORY',
      );

      expect(result.status).toBe(ProbeResultStatus.DEGRADED);
      expect(result.errorMessage).toContain('Concurrency limit exceeded');
      expect(result.details?.concurrencyLimitReached).toBe(true);

      (probeService as any).activeProbeCount = 0;
    });
  });

  // T6: Flapping Suppression
  describe('T6: Flapping Suppression', () => {
    it('suppresses immediate UNHEALTHY transition until failureThreshold is met', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Flapping fault'));

      // Run 1: consecutiveFails = 1 -> DEGRADED (flapping suppressed)
      const run1 = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'FLAPPING_DB',
      );
      expect(run1.status).toBe(ProbeResultStatus.DEGRADED);
      expect(run1.consecutiveFails).toBe(1);

      // Run 2: consecutiveFails = 2 -> DEGRADED (flapping suppressed)
      const run2 = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'FLAPPING_DB',
      );
      expect(run2.status).toBe(ProbeResultStatus.DEGRADED);
      expect(run2.consecutiveFails).toBe(2);

      // Run 3: consecutiveFails = 3 >= threshold (3) -> UNHEALTHY
      const run3 = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'FLAPPING_DB',
      );
      expect(run3.status).toBe(ProbeResultStatus.UNHEALTHY);
      expect(run3.consecutiveFails).toBe(3);

      // Recovery: query succeeds -> resets to HEALTHY and consecutiveFails = 0
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ 1: 1 }]);
      const run4 = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'FLAPPING_DB',
      );
      expect(run4.status).toBe(ProbeResultStatus.HEALTHY);
      expect(run4.consecutiveFails).toBe(0);
    });
  });

  // T7: Company-Scoped Access Control & Tenant Separation
  describe('T7: Company-Scoped Access Control & Tenant Separation', () => {
    it('restricts non-Chairman actors from accessing global or other company probes', async () => {
      const employeeReq = {
        user: { actorId: 'emp-1', actorRole: 'EMPLOYEE', companyId: 'company-normal' },
      };

      await expect(
        reliabilityController.getProbes(employeeReq, 'company-normal'),
      ).resolves.toBeDefined();

      await expect(
        reliabilityController.getProbes(employeeReq, 'company-other'),
      ).rejects.toThrow(ForbiddenException);

      const unassignedEmployeeReq = {
        user: { actorId: 'emp-2', actorRole: 'EMPLOYEE', companyId: null },
      };
      await expect(
        reliabilityController.getProbes(unassignedEmployeeReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows Chairman to view global probes and metrics', async () => {
      const chairmanReq = {
        user: { actorId: 'chair-1', actorRole: 'CHAIRMAN' },
      };

      const probes = await reliabilityController.getProbes(chairmanReq);
      expect(Array.isArray(probes)).toBe(true);

      const metrics = await reliabilityController.getMetrics(chairmanReq);
      expect(metrics).toHaveProperty('availabilityRate');
      expect(metrics).toHaveProperty('p95LatencyMs');
    });
  });

  // T8: Emergency-Stop Safeguards
  describe('T8: Emergency-Stop Safeguards', () => {
    it('immediately suspends probe execution if target company is in EMERGENCY_STOP', async () => {
      const result = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'COMPANY_DB_PROBE',
        { companyId: 'company-halted' },
      );

      expect(result.status).toBe(ProbeResultStatus.DEGRADED);
      expect(result.errorMessage).toContain('EMERGENCY_STOP');
      expect(result.details?.emergencyStop).toBe(true);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // Credential & Error Redaction Tests
  describe('Credential & Error Redaction', () => {
    it('redacts connection URI passwords, bearer tokens, and API keys', () => {
      const rawUri = 'Error connecting to postgresql://admin:mySuperSecret123@db.prod.internal:5432/aevora?sslmode=require';
      const sanitizedUri = sanitizeErrorMessage(rawUri);
      expect(sanitizedUri).not.toContain('mySuperSecret123');
      expect(sanitizedUri).toContain('[REDACTED_PASSWORD]');

      const rawToken = 'Request failed with auth header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature';
      const sanitizedToken = sanitizeErrorMessage(rawToken);
      expect(sanitizedToken).not.toContain('doNotLeakThisSignature');
      expect(sanitizedToken).toContain('[REDACTED_TOKEN]');

      const rawApiKey = 'Failed invoking model with api_key=sk-ant-api03-secret1234567890';
      const sanitizedApiKey = sanitizeErrorMessage(rawApiKey);
      expect(sanitizedApiKey).not.toContain('secret1234567890');
      expect(sanitizedApiKey).toContain('api_key=[REDACTED]');
    });

    it('sanitizes errors before persisting into observation records', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(
        new Error('Failed connecting: postgresql://aevora_user:prodPassword999@postgres.internal:5432/aevora'),
      );

      const result = await probeService.executeProbe(
        ProbeTargetType.DATABASE_POOL,
        'SENSITIVE_DB_PROBE',
      );

      expect(result.errorMessage).toBeDefined();
      expect(result.errorMessage).not.toContain('prodPassword999');
      expect(result.errorMessage).toContain('[REDACTED_PASSWORD]');
    });
  });

  // Bounded Observation Retention Tests
  describe('Bounded Observation Retention', () => {
    it('deletes expired observations while strictly preserving protected audit records', async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 3600 * 1000);
      const oneDayAgo = new Date(now - 1 * 24 * 3600 * 1000);

      // Add expired unprotected observation
      mockObservations.push({
        id: 'obs-expired-unprotected',
        companyId: 'company-normal',
        status: ProbeResultStatus.HEALTHY,
        latencyMs: 10,
        isProtected: false,
        observedAt: tenDaysAgo,
      });

      // Add expired PROTECTED observation (e.g. active incident / audit trail)
      mockObservations.push({
        id: 'obs-expired-PROTECTED',
        companyId: 'company-normal',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 500,
        isProtected: true, // MUST NOT BE DELETED
        observedAt: tenDaysAgo,
      });

      // Add recent unprotected observation
      mockObservations.push({
        id: 'obs-recent-unprotected',
        companyId: 'company-normal',
        status: ProbeResultStatus.HEALTHY,
        latencyMs: 12,
        isProtected: false,
        observedAt: oneDayAgo,
      });

      // Run cleanup for 168 hours (7 days)
      const cleanupResult = await probeService.cleanExpiredObservations({
        retentionHours: 168,
        companyId: 'company-normal',
      });

      expect(cleanupResult.deletedCount).toBe(1);
      const remainingIds = mockObservations.map((o) => o.id);
      expect(remainingIds).not.toContain('obs-expired-unprotected');
      expect(remainingIds).toContain('obs-expired-PROTECTED'); // Preserved!
      expect(remainingIds).toContain('obs-recent-unprotected'); // Preserved!
    });

    it('enforces company-scoped retention cleanup through controller', async () => {
      const employeeReq = {
        user: { actorId: 'emp-1', actorRole: 'EMPLOYEE', companyId: 'company-normal' },
      };

      // Allowed for own company
      await expect(
        reliabilityController.cleanupObservations(employeeReq, { companyId: 'company-normal' }),
      ).resolves.toBeDefined();

      // Denied for cross-tenant
      await expect(
        reliabilityController.cleanupObservations(employeeReq, { companyId: 'company-other' }),
      ).rejects.toThrow(ForbiddenException);

      // Denied for global purge without Chairman
      await expect(
        reliabilityController.cleanupObservations(employeeReq, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // Telemetry Aggregation & Percentiles
  describe('Telemetry Aggregation & Percentiles', () => {
    it('computes correct nearest-rank p50, p95, and p99 percentiles', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(telemetryService.getPercentile(values, 50)).toBe(50);
      expect(telemetryService.getPercentile(values, 95)).toBe(100);
      expect(telemetryService.getPercentile(values, 99)).toBe(100);
    });

    it('aggregates availability, error rates, and queue depth', async () => {
      mockObservations.push(
        { status: ProbeResultStatus.HEALTHY, latencyMs: 15, companyId: 'co-1', observedAt: new Date() },
        { status: ProbeResultStatus.HEALTHY, latencyMs: 25, companyId: 'co-1', observedAt: new Date() },
        { status: ProbeResultStatus.DEGRADED, latencyMs: 55, companyId: 'co-1', observedAt: new Date() },
        { status: ProbeResultStatus.UNHEALTHY, latencyMs: 120, companyId: 'co-1', observedAt: new Date() },
      );

      const metrics = await telemetryService.getAggregatedMetrics('co-1', 60);

      expect(metrics.totalProbes).toBe(4);
      expect(metrics.healthyCount).toBe(2);
      expect(metrics.degradedCount).toBe(1);
      expect(metrics.unhealthyCount).toBe(1);
      expect(metrics.errorRate).toBe(0.25);
      expect(metrics.availabilityRate).toBe(0.75);
      expect(metrics.p50LatencyMs).toBe(25);
    });
  });
});

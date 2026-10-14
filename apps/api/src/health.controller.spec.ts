import { HealthController } from './health.controller';
import { HealthProbeService } from './reliability/health-probe.service';
import { ProbeTargetType, ProbeResultStatus } from './reliability/health-probe.types';

describe('HealthController', () => {
  let controller: HealthController;
  let mockProbeService: Partial<HealthProbeService>;

  beforeEach(() => {
    mockProbeService = {
      executeProbe: jest.fn().mockImplementation((targetType: ProbeTargetType, targetName: string) => {
        return Promise.resolve({
          id: 'probe-1',
          targetType,
          targetName,
          status: ProbeResultStatus.HEALTHY,
          latencyMs: 1.5,
          details: { usagePercent: 42 },
          timestamp: new Date(),
        });
      }),
    };
    controller = new HealthController(mockProbeService as HealthProbeService);
  });

  describe('GET /health (basic liveness probe)', () => {
    it('returns ok status and iso timestamp without leaking environment or secrets', () => {
      const res = controller.check();
      expect(res.status).toBe('ok');
      expect(typeof res.timestamp).toBe('string');
      expect(res).not.toHaveProperty('database');
      expect(res).not.toHaveProperty('password');
      expect(res).not.toHaveProperty('secret');
      expect(res).not.toHaveProperty('DATABASE_URL');
    });
  });

  describe('GET /health/probes (deep reliability probes)', () => {
    it('returns aggregated probe status and sanitised metrics without secrets', async () => {
      const res = await controller.probes();
      expect(res.status).toBe('ok');
      expect(res.probes).toHaveLength(2);
      expect(res.probes[0].status).toBe(ProbeResultStatus.HEALTHY);
      expect(res.probes[1].status).toBe(ProbeResultStatus.HEALTHY);

      // Verify zero sensitive data is exposed
      const jsonString = JSON.stringify(res);
      expect(jsonString).not.toContain('password');
      expect(jsonString).not.toContain('secret');
      expect(jsonString).not.toContain('DATABASE_URL');
      expect(jsonString).not.toContain('REDIS_URL');
    });

    it('gracefully handles missing probeService without throwing', async () => {
      const bareController = new HealthController(undefined);
      const res = await bareController.probes();
      expect(res.status).toBe('ok');
      expect(res.probes).toEqual([]);
    });

    it('reports degraded when any probe fails', async () => {
      (mockProbeService.executeProbe as jest.Mock).mockResolvedValueOnce({
        id: 'probe-fail',
        targetType: ProbeTargetType.PROCESS_MEMORY,
        targetName: 'NODE_PROCESS_MEMORY',
        status: ProbeResultStatus.UNHEALTHY,
        latencyMs: 5.0,
        details: { error: 'Memory threshold exceeded' },
        timestamp: new Date(),
      });

      const res = await controller.probes();
      expect(res.status).toBe('degraded');
      expect(res.probes[0].status).toBe(ProbeResultStatus.UNHEALTHY);
    });
  });
});

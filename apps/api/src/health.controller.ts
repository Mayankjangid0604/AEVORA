import { Controller, Get, Optional } from '@nestjs/common';
import { LocalProvider } from '@aevora/model-gateway';
import { Public } from './authorization/jwt-auth.guard';
import { HealthProbeService } from './reliability/health-probe.service';
import { ProbeTargetType, ProbeResultStatus } from './reliability/health-probe.types';

@Public()
@Controller('health')
export class HealthController {
  private readonly local = new LocalProvider();
  private cached: { at: number; result: { status: 'ok' | 'error'; message: string } } | null = null;

  constructor(@Optional() private readonly probeService?: HealthProbeService) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Read-only lightweight platform probes (memory & event-loop) with strict secret/stack-trace exclusion. */
  @Get('probes')
  async probes() {
    if (!this.probeService) {
      return { status: 'ok', probes: [], timestamp: new Date().toISOString() };
    }
    const memProbe = await this.probeService.executeProbe(ProbeTargetType.PROCESS_MEMORY, 'NODE_PROCESS_MEMORY');
    const lagProbe = await this.probeService.executeProbe(ProbeTargetType.EVENT_LOOP_LAG, 'EVENT_LOOP_LAG');
    const isHealthy = memProbe.status === ProbeResultStatus.HEALTHY && lagProbe.status === ProbeResultStatus.HEALTHY;
    return {
      status: isHealthy ? 'ok' : 'degraded',
      probes: [
        {
          targetType: memProbe.targetType,
          targetName: memProbe.targetName,
          status: memProbe.status,
          latencyMs: memProbe.latencyMs,
          details: memProbe.details,
        },
        {
          targetType: lagProbe.targetType,
          targetName: lagProbe.targetName,
          status: lagProbe.status,
          latencyMs: lagProbe.latencyMs,
          details: lagProbe.details,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  /** Read-only: is the local model gateway (Ollama + required models) up? Cached 15 s. Used by the office for "absent" desks. */
  @Get('models')
  async models() {
    if (!this.cached || Date.now() - this.cached.at > 15_000) this.cached = { at: Date.now(), result: await this.local.checkHealth() };
    return { ...this.cached.result, checkedAt: new Date(this.cached.at).toISOString() };
  }
}

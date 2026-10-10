import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthProbeService } from './health-probe.service';
import { AggregatedMetrics, ProbeResultStatus } from './health-probe.types';

@Injectable()
export class SystemTelemetryService {
  private readonly logger = new Logger(SystemTelemetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly probeService: HealthProbeService,
  ) {}

  /**
   * Computes aggregated infrastructure metrics over a lookback window (default 1 hour).
   * Enforces tenant/company isolation when companyId is provided.
   */
  async getAggregatedMetrics(
    companyId?: string,
    windowMinutes = 60,
  ): Promise<AggregatedMetrics> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);

    let observations: Array<{ status: ProbeResultStatus; latencyMs: number }> = [];

    try {
      if (this.prisma && (this.prisma as any).healthProbeObservation) {
        const whereClause: any = {
          observedAt: {
            gte: windowStart,
            lte: windowEnd,
          },
          companyId: companyId ?? null,
        };

        observations = await (this.prisma as any).healthProbeObservation.findMany({
          where: whereClause,
          select: {
            status: true,
            latencyMs: true,
          },
          orderBy: { observedAt: 'desc' },
          take: 1000,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not query healthProbeObservation: ${err?.message || err}`);
    }

    const totalProbes = observations.length;
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    let timeoutCount = 0;

    const latencies: number[] = [];

    for (const obs of observations) {
      latencies.push(obs.latencyMs);
      switch (obs.status) {
        case ProbeResultStatus.HEALTHY:
          healthyCount++;
          break;
        case ProbeResultStatus.DEGRADED:
          degradedCount++;
          break;
        case ProbeResultStatus.UNHEALTHY:
          unhealthyCount++;
          break;
        case ProbeResultStatus.TIMEOUT:
          timeoutCount++;
          break;
      }
    }

    latencies.sort((a, b) => a - b);

    const p50 = this.getPercentile(latencies, 50);
    const p95 = this.getPercentile(latencies, 95);
    const p99 = this.getPercentile(latencies, 99);
    const avgLatency = latencies.length > 0
      ? Math.round((latencies.reduce((sum, val) => sum + val, 0) / latencies.length) * 100) / 100
      : 0;

    const errorCount = unhealthyCount + timeoutCount;
    const errorRate = totalProbes > 0 ? Math.round((errorCount / totalProbes) * 10000) / 10000 : 0;
    const availabilityRate = totalProbes > 0 ? Math.round(((totalProbes - errorCount) / totalProbes) * 10000) / 10000 : 1;

    let queueDepth: number | undefined;
    try {
      if (this.prisma && (this.prisma as any).backgroundJob) {
        const queueWhere: any = { status: 'QUEUED' };
        if (companyId) queueWhere.companyId = companyId;
        queueDepth = await (this.prisma as any).backgroundJob.count({ where: queueWhere });
      }
    } catch {
      queueDepth = 0;
    }

    return {
      totalProbes,
      healthyCount,
      degradedCount,
      unhealthyCount,
      timeoutCount,
      availabilityRate,
      errorRate,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      avgLatencyMs: avgLatency,
      queueDepth,
      activeConcurrency: this.probeService?.getActiveConcurrency ? this.probeService.getActiveConcurrency() : 0,
      windowStart,
      windowEnd,
    };
  }

  /**
   * Helper to compute exact nearest-rank percentile from a sorted array.
   */
  getPercentile(sortedValues: number[], percentile: number): number {
    if (!sortedValues || sortedValues.length === 0) return 0;
    if (percentile <= 0) return sortedValues[0];
    if (percentile >= 100) return sortedValues[sortedValues.length - 1];

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
    return Math.round(sortedValues[clampedIndex] * 100) / 100;
  }
}

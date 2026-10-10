import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemTelemetryService } from './system-telemetry.service';
import { sanitizeErrorMessage } from './health-probe.service';
import { ProbeTargetType } from './health-probe.types';
import {
  DiagnosticContext,
  ObservableEvidenceItem,
  EvidenceGap,
  ContradictorySignal,
} from './diagnostic.types';
import { IncidentSeverity, IncidentStatus } from './incident.types';

@Injectable()
export class DiagnosticContextAssemblerService {
  private readonly logger = new Logger(DiagnosticContextAssemblerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetryService: SystemTelemetryService,
  ) {}

  /**
   * Assembles a structured, company-scoped diagnostic context for a given incident.
   * Collects telemetry observations, correlates subsystem signals, checks historical lessons,
   * explicitly registers evidence gaps, and records contradictory signals.
   */
  async assembleDiagnosticContext(
    incidentId: string,
    companyId?: string,
    options?: { windowMinutes?: number },
  ): Promise<DiagnosticContext> {
    const windowMinutes = Math.max(5, Math.min(180, options?.windowMinutes ?? 30));

    // 1. Retrieve incident and enforce tenant boundary
    const incident = await this.getIncidentOrThrow(incidentId, companyId);
    const targetCompanyId: string | null = incident.companyId ?? null;

    const incidentTime = new Date(incident.createdAt);
    const windowStart = new Date(incidentTime.getTime() - windowMinutes * 60 * 1000);
    const windowEnd = new Date(Math.min(Date.now(), incidentTime.getTime() + 10 * 60 * 1000));

    // 2. Fetch technical probe observations in window
    const { primaryObservations, correlatedObservations } = await this.fetchObservations(
      incident.targetType,
      incident.targetName,
      targetCompanyId,
      windowStart,
      windowEnd,
    );

    // 3. Fetch aggregated telemetry metrics snapshot
    const metricsSnapshot = await this.telemetryService.getAggregatedMetrics(
      targetCompanyId,
      windowMinutes,
    );

    // 4. Retrieve incident timeline events
    const timelineHistory = (incident.events || []).map((e: any) => ({
      eventType: e.eventType,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      note: sanitizeErrorMessage(e.note) ?? null,
      createdAt: new Date(e.createdAt),
    }));

    // 5. Query related incidents in the preceding 24 hours
    const relatedIncidents = await this.fetchRelatedIncidents(
      incident.id,
      incident.targetType,
      targetCompanyId,
      incidentTime,
    );

    // 6. Query relevant historical organizational lessons (Advisory only)
    const historicalLessons = await this.fetchHistoricalLessons(
      incident.targetType,
      targetCompanyId,
    );

    // 7. Check company emergency status
    let emergencyStatus: string | null = null;
    if (targetCompanyId && this.prisma && (this.prisma as any).company) {
      try {
        const comp = await (this.prisma as any).company.findUnique({
          where: { id: targetCompanyId },
          select: { emergencyStatus: true },
        });
        emergencyStatus = comp?.emergencyStatus ?? null;
      } catch (err: any) {
        this.logger.debug(`Could not check company emergencyStatus: ${sanitizeErrorMessage(err?.message)}`);
      }
    }

    // 8. Detect evidence gaps and stale signals
    const evidenceGaps = this.detectEvidenceGaps(
      incident.targetType,
      primaryObservations,
      windowMinutes,
    );

    if (emergencyStatus === 'EMERGENCY_STOP') {
      evidenceGaps.push({
        expectedSignal: 'ACTIVE_HEALTH_PROBES',
        reason: 'COLLECTION_TIMEOUT',
        impactOnConfidence: 'MEDIUM',
        remediationRecommendation: 'Target company is under EMERGENCY_STOP. Active probes and autonomous execution are suspended by governance policy. Review read-only telemetry only.',
      });
    }

    // 9. Detect contradictory telemetry signals
    const contradictorySignals = this.detectContradictions(
      incident.severity,
      primaryObservations,
      metricsSnapshot,
    );

    // 10. Protect relevant observations from retention deletion (audit lock)
    await this.protectRelevantObservations(primaryObservations);

    return {
      incidentId: incident.id,
      companyId: incident.companyId ?? null,
      targetType: incident.targetType,
      targetName: incident.targetName,
      incidentSeverity: incident.severity as IncidentSeverity,
      incidentCreatedAt: incidentTime,
      timeWindow: {
        start: windowStart,
        end: windowEnd,
      },
      primaryTargetObservations: primaryObservations,
      correlatedSubsystemObservations: correlatedObservations,
      telemetryMetricsSnapshot: {
        availabilityRate: metricsSnapshot.availabilityRate ?? 1.0,
        errorRate: metricsSnapshot.errorRate ?? 0.0,
        p95LatencyMs: metricsSnapshot.p95LatencyMs ?? 0,
        p99LatencyMs: metricsSnapshot.p99LatencyMs ?? 0,
        avgLatencyMs: metricsSnapshot.avgLatencyMs,
        queueDepth: metricsSnapshot.queueDepth,
      },
      incidentTimelineHistory: timelineHistory,
      relatedIncidents,
      relevantHistoricalLessons: historicalLessons,
      evidenceGaps,
      contradictorySignals,
      emergencyStatus,
      assembledAt: new Date(),
    };
  }

  private async fetchObservations(
    targetType: ProbeTargetType,
    targetName: string,
    companyId?: string | null,
    start?: Date,
    end?: Date,
  ): Promise<{
    primaryObservations: ObservableEvidenceItem[];
    correlatedObservations: ObservableEvidenceItem[];
  }> {
    const primaryObservations: ObservableEvidenceItem[] = [];
    const correlatedObservations: ObservableEvidenceItem[] = [];

    try {
      if (this.prisma && (this.prisma as any).healthProbeObservation) {
        const whereClause: any = {
          observedAt: {
            gte: start,
            lte: end,
          },
          companyId: companyId ?? null,
        };

        const rawRows = await (this.prisma as any).healthProbeObservation.findMany({
          where: whereClause,
          orderBy: { observedAt: 'desc' },
          take: 50,
          include: { probe: true },
        });

        for (const row of rawRows) {
          const item: ObservableEvidenceItem = {
            id: row.id,
            metric: `${row.probe?.targetType ?? 'PROBE'}:${row.probe?.targetName ?? 'UNKNOWN'}`,
            observedValue: {
              latencyMs: row.latencyMs,
              status: row.status,
              errorMessage: sanitizeErrorMessage(row.errorMessage),
              details: row.details,
            },
            status: row.status === 'HEALTHY' ? 'NORMAL' : 'ANOMALOUS',
            provenance: {
              sourceType: 'HEALTH_PROBE',
              sourceId: row.id,
              observedAt: new Date(row.observedAt),
              collector: 'SystemHealthProbe',
              isSanitized: true,
            },
          };

          const obsTargetType = row.probe?.targetType ?? row.targetType;
          const obsTargetName = row.probe?.targetName ?? row.targetName;
          if (obsTargetType === targetType || obsTargetName === targetName) {
            primaryObservations.push(item);
          } else {
            correlatedObservations.push(item);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch observations for diagnostic assembly: ${sanitizeErrorMessage(err?.message)}`);
    }

    return { primaryObservations, correlatedObservations };
  }

  private async fetchRelatedIncidents(
    currentIncidentId: string,
    targetType: ProbeTargetType,
    companyId?: string | null,
    before?: Date,
  ): Promise<Array<{ id: string; title: string; severity: IncidentSeverity; status: IncidentStatus; createdAt: Date }>> {
    try {
      if (!this.prisma || !(this.prisma as any).systemIncident) return [];

      const past24h = new Date((before ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
      const whereClause: any = {
        id: { not: currentIncidentId },
        targetType,
        createdAt: { gte: past24h, lte: before },
        companyId: companyId ?? null,
      };

      const rows = await (this.prisma as any).systemIncident.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          createdAt: true,
        },
      });

      return rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        severity: r.severity as IncidentSeverity,
        status: r.status as IncidentStatus,
        createdAt: new Date(r.createdAt),
      }));
    } catch (err: any) {
      this.logger.warn(`Could not fetch related incidents: ${sanitizeErrorMessage(err?.message)}`);
      return [];
    }
  }

  private async fetchHistoricalLessons(
    targetType: ProbeTargetType,
    companyId?: string | null,
  ): Promise<Array<{ id: string; situation: string; rootCause: string; confidence: number; maturity: string }>> {
    try {
      if (!this.prisma || !(this.prisma as any).structuredLesson) return [];

      const whereClause: any = {
        maturity: { not: 'DEPRECATED' },
        companyId: companyId ?? null,
      };

      const lessons = await (this.prisma as any).structuredLesson.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          observedSituation: true,
          likelyRootCause: true,
          confidence: true,
          maturity: true,
        },
      });

      return lessons.map((l: any) => ({
        id: l.id,
        situation: l.observedSituation,
        rootCause: l.likelyRootCause,
        confidence: l.confidence,
        maturity: l.maturity,
      }));
    } catch {
      // Graceful fallback if StructuredLesson table is not queried
      return [];
    }
  }

  private detectEvidenceGaps(
    targetType: ProbeTargetType,
    observations: ObservableEvidenceItem[],
    windowMinutes: number,
  ): EvidenceGap[] {
    const gaps: EvidenceGap[] = [];

    if (observations.length === 0) {
      gaps.push({
        expectedSignal: `Probe observations for ${targetType}`,
        reason: 'MISSING_DATA',
        impactOnConfidence: 'HIGH',
        remediationRecommendation: `Trigger an immediate on-demand probe for ${targetType} to establish technical baseline.`,
      });
    } else {
      const mostRecent = observations[0].provenance.observedAt;
      const ageMinutes = (Date.now() - mostRecent.getTime()) / (60 * 1000);
      if (ageMinutes > windowMinutes * 0.75) {
        gaps.push({
          expectedSignal: `Recent telemetry observations for ${targetType}`,
          reason: 'STALE_DATA',
          impactOnConfidence: 'MEDIUM',
          remediationRecommendation: 'Telemetry observations are older than 75% of diagnostic window; refresh probe.',
        });
      }
    }

    return gaps;
  }

  private detectContradictions(
    incidentSeverity: IncidentSeverity,
    observations: ObservableEvidenceItem[],
    metrics: any,
  ): ContradictorySignal[] {
    const contradictions: ContradictorySignal[] = [];

    // Contradiction 1: Incident is SEV1 or SEV2 but latest probe reports NORMAL/HEALTHY
    if (
      (incidentSeverity === IncidentSeverity.SEV1_CRITICAL || incidentSeverity === IncidentSeverity.SEV2_HIGH) &&
      observations.length > 0 &&
      observations[0].status === 'NORMAL'
    ) {
      contradictions.push({
        signalA: `Incident marked as ${incidentSeverity}`,
        signalB: `Latest probe observation status is NORMAL`,
        discrepancyDescription: 'Observed telemetry indicates healthy target while incident severity remains critical/high; indicates transient recovery, false positive, or upstream network skew.',
      });
    }

    // Contradiction 2: Metrics availability is 100% with zero errors while incident reports active failure
    if (
      incidentSeverity === IncidentSeverity.SEV1_CRITICAL &&
      (metrics?.availabilityRate === 1.0 || metrics?.availabilityRate === 1) &&
      metrics?.errorRate === 0
    ) {
      contradictions.push({
        signalA: `Incident reported critical failure`,
        signalB: `Telemetry window indicates 100% availability and 0% error rate`,
        discrepancyDescription: 'Aggregate metrics window does not reflect failure; suggests error was isolated, bursty, or localized to a specific endpoint.',
      });
    }

    return contradictions;
  }

  private async protectRelevantObservations(observations: ObservableEvidenceItem[]): Promise<void> {
    try {
      if (!this.prisma || !(this.prisma as any).healthProbeObservation || observations.length === 0) return;
      const ids = observations.map((o) => o.id);
      await (this.prisma as any).healthProbeObservation.updateMany({
        where: { id: { in: ids }, isProtected: false },
        data: { isProtected: true },
      });
    } catch (err: any) {
      this.logger.debug(`Could not mark observations protected: ${sanitizeErrorMessage(err?.message)}`);
    }
  }

  private async getIncidentOrThrow(id: string, companyId?: string): Promise<any> {
    if (!this.prisma || !(this.prisma as any).systemIncident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const incident = await (this.prisma as any).systemIncident.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    if (companyId && incident.companyId && incident.companyId !== companyId) {
      throw new ForbiddenException(`Access denied to incident belonging to company ${incident.companyId}`);
    }

    return incident;
  }
}

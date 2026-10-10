import { randomUUID } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeErrorMessage } from './health-probe.service';
import { DiagnosticContextAssemblerService } from './diagnostic-context-assembler.service';
import { RootCauseAnalysisService } from './root-cause-analysis.service';
import { IncidentDiagnosticReportSummary } from './diagnostic.types';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentEventType,
  CreateIncidentDto,
  TransitionIncidentDto,
  EscalateIncidentDto,
  IncidentSummary,
} from './incident.types';

@Injectable()
export class IncidentManagerService {
  private readonly logger = new Logger(IncidentManagerService.name);

  // Valid state transition map
  private static readonly VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
    [IncidentStatus.DETECTED]: [IncidentStatus.TRIAGED, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATED, IncidentStatus.RESOLVED],
    [IncidentStatus.TRIAGED]: [IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATED, IncidentStatus.RESOLVED],
    [IncidentStatus.INVESTIGATING]: [IncidentStatus.MITIGATED, IncidentStatus.RESOLVED],
    [IncidentStatus.MITIGATED]: [IncidentStatus.RESOLVED, IncidentStatus.INVESTIGATING],
    [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED, IncidentStatus.INVESTIGATING],
    [IncidentStatus.CLOSED]: [], // Terminal state
  };

  private static readonly SEVERITY_RANK: Record<IncidentSeverity, number> = {
    [IncidentSeverity.SEV4_LOW]: 1,
    [IncidentSeverity.SEV3_MEDIUM]: 2,
    [IncidentSeverity.SEV2_HIGH]: 3,
    [IncidentSeverity.SEV1_CRITICAL]: 4,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly diagnosticAssembler?: DiagnosticContextAssemblerService,
    @Optional() private readonly rootCauseAnalysis?: RootCauseAnalysisService,
  ) {}

  /**
   * Reports an incident or deduplicates against an existing active incident.
   * Concurrency-safe, idempotent, and suppresses alert flapping.
   * Intercepts database unique constraint collisions (P2002) and falls back
   * to updating the winning active incident.
   */
  async reportOrDeduplicateIncident(dto: CreateIncidentDto): Promise<IncidentSummary> {
    const deduplicationKey = `${dto.companyId ? `tenant:${dto.companyId}` : 'global'}:${dto.targetType}:${dto.targetName}`;
    const severity = dto.severity ?? IncidentSeverity.SEV3_MEDIUM;

    // Check for existing active incident with same deduplicationKey
    let existingIncident: any = null;
    try {
      if (this.prisma && (this.prisma as any).systemIncident) {
        existingIncident = await (this.prisma as any).systemIncident.findFirst({
          where: {
            deduplicationKey,
            status: { notIn: [IncidentStatus.RESOLVED, IncidentStatus.CLOSED] },
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not query existing incidents: ${sanitizeErrorMessage(err?.message)}`);
    }

    if (existingIncident) {
      return this.applyDeduplicationUpdate(existingIncident, dto, severity);
    }

    // Create new incident with concurrency collision handling
    const sanitizedDesc = sanitizeErrorMessage(dto.description) ?? dto.description;
    let newIncident: any;
    try {
      newIncident = await (this.prisma as any).systemIncident.create({
        data: {
          companyId: dto.companyId ?? null,
          title: dto.title,
          description: sanitizedDesc,
          severity,
          status: IncidentStatus.DETECTED,
          targetType: dto.targetType,
          targetName: dto.targetName,
          detectionSource: dto.detectionSource ?? 'HEALTH_PROBE_ANOMALY_DETECTOR',
          deduplicationKey,
          correlationId: dto.correlationId ?? null,
          causationId: dto.causationId ?? null,
          hypotheses: dto.hypotheses ?? [],
          affectedServices: dto.affectedServices ?? [],
        },
      });
    } catch (createErr: any) {
      // Concurrency collision recovery: If another thread inserted an active incident with the same deduplicationKey
      const isUniqueConflict =
        createErr?.code === 'P2002' ||
        createErr?.message?.includes('Unique constraint') ||
        createErr?.message?.includes('deduplicationKey') ||
        createErr?.message?.includes('SystemIncident_dedup_active_unique_idx');

      if (isUniqueConflict) {
        this.logger.log(
          `Concurrency collision on deduplicationKey ${deduplicationKey}; recovering against winning active incident.`,
        );
        const winningIncident = await (this.prisma as any).systemIncident.findFirst({
          where: {
            deduplicationKey,
            status: { notIn: [IncidentStatus.RESOLVED, IncidentStatus.CLOSED] },
          },
        });

        if (winningIncident) {
          return this.applyDeduplicationUpdate(winningIncident, dto, severity);
        }
      }
      throw createErr;
    }

    // Record initial timeline event
    await (this.prisma as any).incidentTimelineEvent.create({
      data: {
        incidentId: newIncident.id,
        companyId: dto.companyId ?? null,
        eventType: IncidentEventType.STATUS_CHANGE,
        fromStatus: null,
        toStatus: IncidentStatus.DETECTED,
        note: `Incident detected and registered with severity ${severity}.`,
        evidence: {
          correlationId: dto.correlationId,
          hypotheses: dto.hypotheses ?? [],
        },
        actorId: dto.actorId ?? 'SYSTEM_DETECTOR',
        actorRole: dto.actorRole ?? 'SYSTEM_TRIAGE',
      },
    });

    // Create urgent task in existing task engine if requested and companyId is available
    if (dto.createUrgentTask && dto.companyId) {
      const createdTaskId = await this.createUrgentInvestigationTask(
        newIncident.id,
        dto.companyId,
        newIncident.title,
        severity,
      );
      newIncident.taskId = createdTaskId ?? null;
    }

    return this.mapToSummary(newIncident);
  }

  /**
   * Applies deduplication update to an active incident: increments occurrence count,
   * upgrades severity if conditions worsen, logs timeline audit, and handles urgent task.
   */
  private async applyDeduplicationUpdate(
    existingIncident: any,
    dto: CreateIncidentDto,
    severity: IncidentSeverity,
  ): Promise<IncidentSummary> {
    const existingRank = IncidentManagerService.SEVERITY_RANK[existingIncident.severity as IncidentSeverity] ?? 0;
    const incomingRank = IncidentManagerService.SEVERITY_RANK[severity] ?? 0;
    const shouldUpgradeSeverity = incomingRank > existingRank;
    const targetSeverity = shouldUpgradeSeverity ? severity : existingIncident.severity;

    const updated = await (this.prisma as any).systemIncident.update({
      where: { id: existingIncident.id },
      data: {
        occurrenceCount: { increment: 1 },
        severity: targetSeverity,
        updatedAt: new Date(),
      },
    });

    // Record timeline event for deduplication evidence attachment
    await (this.prisma as any).incidentTimelineEvent.create({
      data: {
        incidentId: existingIncident.id,
        companyId: dto.companyId ?? null,
        eventType: shouldUpgradeSeverity ? IncidentEventType.SEVERITY_UPDATE : IncidentEventType.EVIDENCE_ATTACHED,
        note: shouldUpgradeSeverity
          ? `Severity escalated from ${existingIncident.severity} to ${severity} due to recurring observable degradation.`
          : `Recurrent anomaly observed (${(existingIncident.occurrenceCount || 1) + 1} occurrences); alert suppressed.`,
        evidence: {
          incomingSeverity: severity,
          correlationId: dto.correlationId,
          hypotheses: dto.hypotheses ?? [],
        },
        actorId: dto.actorId ?? 'SYSTEM_DEDUPLICATOR',
        actorRole: dto.actorRole ?? 'SYSTEM_TRIAGE',
      },
    });

    if (dto.createUrgentTask && dto.companyId && !existingIncident.taskId) {
      const createdTaskId = await this.createUrgentInvestigationTask(
        existingIncident.id,
        dto.companyId,
        existingIncident.title,
        targetSeverity,
      );
      updated.taskId = createdTaskId ?? null;
    }

    return this.mapToSummary(updated);
  }

  /**
   * Governed lifecycle transition state machine.
   * Enforces valid state transitions and records immutable timeline audits.
   */
  async transitionStatus(
    incidentId: string,
    dto: TransitionIncidentDto,
    companyId?: string,
  ): Promise<IncidentSummary> {
    const incident = await this.getIncidentOrThrow(incidentId, companyId);
    const currentStatus = incident.status as IncidentStatus;
    const targetStatus = dto.toStatus;

    if (currentStatus === targetStatus) {
      return this.mapToSummary(incident);
    }

    const allowedTransitions = IncidentManagerService.VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid incident lifecycle transition: Cannot transition from ${currentStatus} to ${targetStatus}.`,
      );
    }

    const updateData: any = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    if (targetStatus === IncidentStatus.MITIGATED) updateData.mitigatedAt = new Date();
    if (targetStatus === IncidentStatus.RESOLVED) updateData.resolvedAt = new Date();
    if (targetStatus === IncidentStatus.CLOSED) updateData.closedAt = new Date();

    const updated = await (this.prisma as any).systemIncident.update({
      where: { id: incidentId },
      data: updateData,
    });

    // Record auditable timeline event
    await (this.prisma as any).incidentTimelineEvent.create({
      data: {
        incidentId,
        companyId: incident.companyId,
        eventType: IncidentEventType.STATUS_CHANGE,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        note: dto.note ?? `Status transitioned from ${currentStatus} to ${targetStatus}.`,
        evidence: dto.evidence ?? {},
        actorId: dto.actorId ?? 'SYSTEM_TRIAGE',
        actorRole: dto.actorRole ?? 'SYSTEM_TRIAGE',
      },
    });

    return this.mapToSummary(updated);
  }

  /**
   * Governed escalation for severe or unresolved incidents.
   */
  async escalateIncident(
    incidentId: string,
    dto: EscalateIncidentDto,
    companyId?: string,
  ): Promise<IncidentSummary> {
    const incident = await this.getIncidentOrThrow(incidentId, companyId);

    const updated = await (this.prisma as any).systemIncident.update({
      where: { id: incidentId },
      data: {
        escalationRequired: true,
        escalatedTo: dto.targetRole,
        updatedAt: new Date(),
      },
    });

    await (this.prisma as any).incidentTimelineEvent.create({
      data: {
        incidentId,
        companyId: incident.companyId,
        eventType: IncidentEventType.ESCALATION,
        note: `Escalated to ${dto.targetRole}: ${dto.reason}`,
        evidence: { reason: dto.reason, note: dto.note },
        actorId: dto.actorId ?? 'SYSTEM_ESCALATION',
        actorRole: dto.actorRole ?? 'SYSTEM_TRIAGE',
      },
    });

    return this.mapToSummary(updated);
  }

  /**
   * Idempotently creates an urgent IT investigation task in the existing task engine.
   * Concurrency-safe: uses atomic conditional reservation on SystemIncident.taskId
   * so that concurrent callers for the same incident never create duplicate or orphaned tasks.
   * Respects company EMERGENCY_STOP status.
   */
  private async createUrgentInvestigationTask(
    incidentId: string,
    companyId: string,
    incidentTitle: string,
    severity: IncidentSeverity,
  ): Promise<string | null> {
    try {
      // 1. Check emergency stop safeguard
      if ((this.prisma as any).company) {
        const company = await (this.prisma as any).company.findUnique({
          where: { id: companyId },
          select: { emergencyStatus: true },
        });
        if (company?.emergencyStatus === 'EMERGENCY_STOP') {
          this.logger.warn(`Skipping urgent task creation for incident ${incidentId}: Company is in EMERGENCY_STOP`);
          await (this.prisma as any).incidentTimelineEvent.create({
            data: {
              incidentId,
              companyId,
              eventType: IncidentEventType.TRIAGE_NOTE,
              note: 'Urgent task creation suspended: Company is currently in EMERGENCY_STOP.',
              evidence: { emergencyStop: true },
              actorId: 'SYSTEM_EMERGENCY_GUARD',
              actorRole: 'SYSTEM_TRIAGE',
            },
          });
          return null;
        }
      }

      // 2. Pre-check if task already linked on incident
      const incident = await (this.prisma as any).systemIncident.findUnique({
        where: { id: incidentId },
        select: { taskId: true },
      });
      if (incident?.taskId) {
        return incident.taskId; // Already created idempotently
      }

      // 3. Concurrency-safe slot reservation via atomic conditional update
      const candidateTaskId = randomUUID();

      const reservation = await (this.prisma as any).systemIncident.updateMany({
        where: {
          id: incidentId,
          taskId: null,
        },
        data: {
          taskId: candidateTaskId,
        },
      });

      if (reservation.count === 0) {
        // Another concurrent request already reserved or linked the task; return winning taskId
        const winning = await (this.prisma as any).systemIncident.findUnique({
          where: { id: incidentId },
          select: { taskId: true },
        });
        return winning?.taskId ?? null;
      }

      // 4. This thread won the reservation slot. Create the task in the existing task engine.
      if ((this.prisma as any).task) {
        try {
          const task = await (this.prisma as any).task.create({
            data: {
              id: candidateTaskId,
              companyId,
              title: `[IT URGENT] Triage & Resolve: ${incidentTitle}`,
              description: `Automated investigation task for ${severity} incident ${incidentId}.`,
              priority: 'URGENT',
              status: 'PENDING',
              createdBy: 'SYSTEM_RELIABILITY_ENGINE',
              causationId: incidentId,
            },
          });

          await (this.prisma as any).incidentTimelineEvent.create({
            data: {
              incidentId,
              companyId,
              eventType: IncidentEventType.TASK_LINKED,
              note: `Urgent investigation task ${task.id} created and linked.`,
              evidence: { taskId: task.id, priority: 'URGENT' },
              actorId: 'SYSTEM_TASK_BRIDGE',
              actorRole: 'SYSTEM_TRIAGE',
            },
          });

          return task.id;
        } catch (taskCreateErr: any) {
          // Rollback reservation on failure so subsequent attempts are not permanently blocked
          this.logger.error(
            `Failed to create task ${candidateTaskId} for incident ${incidentId}: ${sanitizeErrorMessage(taskCreateErr?.message)}`,
          );
          await (this.prisma as any).systemIncident.updateMany({
            where: { id: incidentId, taskId: candidateTaskId },
            data: { taskId: null },
          });
          throw taskCreateErr;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not create urgent task for incident ${incidentId}: ${sanitizeErrorMessage(err?.message)}`);
    }
    return null;
  }

  /**
   * Retrieves an incident by ID with tenant verification.
   */
  async getIncidentById(id: string, companyId?: string): Promise<IncidentSummary> {
    const incident = await this.getIncidentOrThrow(id, companyId);
    return this.mapToSummary(incident);
  }

  /**
   * Lists incidents scoped to company (or global if Chairman).
   */
  async getIncidents(companyId?: string, status?: IncidentStatus): Promise<IncidentSummary[]> {
    try {
      if (!this.prisma || !(this.prisma as any).systemIncident) return [];

      const whereClause: any = {};
      if (companyId) whereClause.companyId = companyId;
      if (status) whereClause.status = status;

      const incidents = await (this.prisma as any).systemIncident.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          events: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      return incidents.map((inc: any) => this.mapToSummary(inc));
    } catch (err: any) {
      this.logger.warn(`Could not fetch incidents: ${sanitizeErrorMessage(err?.message)}`);
      return [];
    }
  }

  private async getIncidentOrThrow(id: string, companyId?: string): Promise<any> {
    if (!this.prisma || !(this.prisma as any).systemIncident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const incident = await (this.prisma as any).systemIncident.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    // Enforce tenant boundary
    if (companyId && incident.companyId && incident.companyId !== companyId) {
      throw new ForbiddenException(`Access denied to incident belonging to company ${incident.companyId}`);
    }

    return incident;
  }

  private mapToSummary(inc: any): IncidentSummary {
    return {
      id: inc.id,
      companyId: inc.companyId ?? null,
      title: inc.title,
      description: inc.description,
      severity: inc.severity,
      status: inc.status,
      targetType: inc.targetType,
      targetName: inc.targetName,
      detectionSource: inc.detectionSource,
      deduplicationKey: inc.deduplicationKey,
      occurrenceCount: inc.occurrenceCount,
      correlationId: inc.correlationId ?? null,
      causationId: inc.causationId ?? null,
      triageSummary: inc.triageSummary ?? null,
      hypotheses: inc.hypotheses ?? [],
      affectedServices: inc.affectedServices ?? [],
      taskId: inc.taskId ?? null,
      escalationRequired: inc.escalationRequired ?? false,
      escalatedTo: inc.escalatedTo ?? null,
      mitigatedAt: inc.mitigatedAt ?? null,
      resolvedAt: inc.resolvedAt ?? null,
      closedAt: inc.closedAt ?? null,
      createdAt: inc.createdAt,
      updatedAt: inc.updatedAt,
      events: inc.events
        ? inc.events.map((e: any) => ({
            id: e.id,
            eventType: e.eventType,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            note: e.note,
            evidence: e.evidence ?? {},
            actorId: e.actorId,
            actorRole: e.actorRole,
            createdAt: e.createdAt,
          }))
        : undefined,
    };
  }

  /**
   * Triggers automated, deterministic root-cause analysis for an incident.
   * Strictly read-only: does not execute remediation, modify infrastructure,
   * or trigger external action runbooks.
   */
  async diagnoseIncident(
    incidentId: string,
    companyId?: string,
    options?: { windowMinutes?: number; actorId?: string; actorRole?: string },
  ): Promise<IncidentDiagnosticReportSummary> {
    const incident = await this.getIncidentById(incidentId, companyId);

    if (!this.diagnosticAssembler || !this.rootCauseAnalysis) {
      throw new BadRequestException('Diagnostic analysis services are not configured');
    }

    // 1. Assemble diagnostic context with provenance and gap detection
    const context = await this.diagnosticAssembler.assembleDiagnosticContext(
      incidentId,
      incident.companyId ?? undefined,
      { windowMinutes: options?.windowMinutes },
    );

    // 2. Perform deterministic root-cause analysis
    const reportSummary = this.rootCauseAnalysis.analyzeRootCause(context);

    // 3. Atomically persist diagnostic report, timeline event, and incident updates
    let savedReport = reportSummary;
    if (this.prisma) {
      try {
        const persistAction = async (tx: any) => {
          // 3a. Persist diagnostic report
          if (tx.incidentDiagnosticReport) {
            const persisted = await tx.incidentDiagnosticReport.create({
              data: {
                id: reportSummary.id,
                incidentId,
                companyId: incident.companyId ?? null,
                status: reportSummary.status as any,
                diagnosticContext: reportSummary.diagnosticContext as any,
                rankedHypotheses: reportSummary.rankedHypotheses as any,
                evidenceGaps: reportSummary.evidenceGaps as any,
                contradictions: reportSummary.contradictions as any,
                recommendedAction: reportSummary.recommendedAction,
                confidenceScore: reportSummary.confidenceScore,
                isInconclusive: reportSummary.isInconclusive,
                inconclusiveReason: reportSummary.inconclusiveReason ?? null,
                analyzedBy: options?.actorId ?? 'SYSTEM_DIAGNOSTIC_ENGINE',
              },
            });
            savedReport = {
              ...reportSummary,
              id: persisted.id,
              createdAt: persisted.createdAt,
            };
          }

          // 3b. Attach DIAGNOSTIC_REPORT_ATTACHED event to incident timeline
          if (tx.incidentTimelineEvent) {
            const topHypo = reportSummary.rankedHypotheses[0]?.title ?? 'None';
            const note = `Automated diagnostic completed (${reportSummary.status}) with confidence ${(reportSummary.confidenceScore * 100).toFixed(0)}%. ${reportSummary.isInconclusive ? `Reason: ${reportSummary.inconclusiveReason}` : `Top hypothesis: ${topHypo}`}`;

            await tx.incidentTimelineEvent.create({
              data: {
                incidentId,
                companyId: incident.companyId ?? null,
                eventType: IncidentEventType.DIAGNOSTIC_REPORT_ATTACHED,
                note,
                evidence: {
                  reportId: savedReport.id,
                  status: reportSummary.status,
                  confidenceScore: reportSummary.confidenceScore,
                  isInconclusive: reportSummary.isInconclusive,
                  topHypothesis: reportSummary.rankedHypotheses[0] ?? null,
                },
                actorId: options?.actorId ?? null,
                actorRole: options?.actorRole ?? 'SYSTEM_DIAGNOSTIC',
              },
            });
          }

          // 3c. Update incident hypotheses and triage summary if conclusive
          if (tx.systemIncident) {
            const updateData: any = {};

            // Only update hypotheses if the diagnostic report is conclusive and produced ranked hypotheses.
            // Inconclusive reports with empty or low-confidence hypotheses MUST NOT erase existing incident hypotheses.
            if (!reportSummary.isInconclusive && reportSummary.rankedHypotheses.length > 0) {
              updateData.hypotheses = reportSummary.rankedHypotheses as any;
            }

            // Only populate triageSummary if not already set, and top hypothesis explanation is available.
            // Inconclusive reports MUST NOT erase an existing triageSummary.
            if (!incident.triageSummary && reportSummary.rankedHypotheses[0]?.explanation) {
              updateData.triageSummary = reportSummary.rankedHypotheses[0].explanation;
            }

            if (Object.keys(updateData).length > 0) {
              await tx.systemIncident.update({
                where: { id: incidentId },
                data: updateData,
              });
            }
          }
        };

        if (typeof (this.prisma as any).$transaction === 'function') {
          await (this.prisma as any).$transaction(persistAction);
        } else {
          await persistAction(this.prisma);
        }
      } catch (err: any) {
        this.logger.error(`Failed to atomically persist diagnostic for incident ${incidentId}: ${sanitizeErrorMessage(err?.message)}`);
        throw new BadRequestException(`Failed to persist diagnostic: ${sanitizeErrorMessage(err?.message)}`);
      }
    }

    return savedReport;
  }

  /**
   * Retrieves all diagnostic reports attached to an incident.
   */
  async getIncidentDiagnosticReports(
    incidentId: string,
    companyId?: string,
  ): Promise<any[]> {
    await this.getIncidentById(incidentId, companyId);

    if (!this.prisma || !(this.prisma as any).incidentDiagnosticReport) {
      return [];
    }

    return (this.prisma as any).incidentDiagnosticReport.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a single diagnostic report by ID with tenant isolation check.
   */
  async getDiagnosticReportById(
    reportId: string,
    companyId?: string,
  ): Promise<any> {
    if (!this.prisma || !(this.prisma as any).incidentDiagnosticReport) {
      throw new NotFoundException(`Diagnostic report ${reportId} not found`);
    }

    const report = await (this.prisma as any).incidentDiagnosticReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(`Diagnostic report ${reportId} not found`);
    }

    if (companyId && report.companyId && report.companyId !== companyId) {
      throw new ForbiddenException(`Access denied to diagnostic report belonging to company ${report.companyId}`);
    }

    return report;
  }
}

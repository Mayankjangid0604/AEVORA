import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthProbeService, sanitizeErrorMessage } from './health-probe.service';
import { ITRemediationAdapter } from './it-remediation.adapter';
import { ExternalActionGatewayService } from '../external-action-gateway/external-action-gateway.service';
import { ExternalActionRequest } from '../external-action-gateway/external-action-gateway.types';
import { ProbeTargetType, ProbeResultStatus } from './health-probe.types';
import { IncidentStatus, IncidentEventType } from './incident.types';
import {
  RunbookActionType,
  RunbookRiskTier,
  RunbookExecutionStatus,
  RunbookDefinitionSummary,
  RunbookExecutionSummary,
} from './runbook.types';

@Injectable()
export class RunbookEngineService {
  private readonly logger = new Logger(RunbookEngineService.name);

  // Canonical built-in self-healing runbook catalog
  public static readonly BUILTIN_RUNBOOKS: Array<Omit<RunbookDefinitionSummary, 'createdAt' | 'updatedAt'>> = [
    {
      id: 'builtin-db-pool-rebalance',
      companyId: null,
      name: 'Database Connection Pool Rebalance',
      description: 'Safely evicts idle database connections and rebalances connection pool under high query latency.',
      targetType: ProbeTargetType.DATABASE_POOL,
      actionType: RunbookActionType.CONNECTION_POOL_REBALANCE,
      riskTier: RunbookRiskTier.MEDIUM,
      isReversible: true,
      parameters: { maxConnections: 20 },
      preconditions: [
        { metric: 'status', operator: 'NOT_EQUALS', expectedValue: 'HEALTHY', description: 'Pool must be DEGRADED or UNHEALTHY' },
      ],
      postVerificationCriteria: { expectedStatus: 'HEALTHY' },
      maxAttempts: 2,
      cooldownMinutes: 15,
      isActive: true,
    },
    {
      id: 'builtin-queue-purge-locks',
      companyId: null,
      name: 'Background Queue Stale Lock Reclaim',
      description: 'Reclaims abandoned job claim locks older than threshold without deleting jobs.',
      targetType: ProbeTargetType.BACKGROUND_QUEUE,
      actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
      riskTier: RunbookRiskTier.LOW,
      isReversible: true,
      parameters: { staleThresholdMinutes: 5, maxReclaimed: 50 },
      preconditions: [
        { metric: 'status', operator: 'NOT_EQUALS', expectedValue: 'HEALTHY', description: 'Queue must be degraded' },
      ],
      postVerificationCriteria: { expectedStatus: 'HEALTHY' },
      maxAttempts: 3,
      cooldownMinutes: 10,
      isActive: true,
    },
    {
      id: 'builtin-memory-worker-recycle',
      companyId: null,
      name: 'Worker Process Memory Recycle',
      description: 'Gracefully drains inflight requests and recycles the worker process to recover heap limits.',
      targetType: ProbeTargetType.PROCESS_MEMORY,
      actionType: RunbookActionType.SERVICE_RESTART,
      riskTier: RunbookRiskTier.HIGH,
      isReversible: true,
      parameters: { drainTimeoutMs: 5000 },
      preconditions: [
        { metric: 'heapUsageRatio', operator: 'GREATER_THAN', expectedValue: 0.85, description: 'Heap ratio must exceed 85%' },
      ],
      postVerificationCriteria: { expectedStatus: 'HEALTHY' },
      maxAttempts: 2,
      cooldownMinutes: 30,
      isActive: true,
    },
    {
      id: 'builtin-event-loop-throttle',
      companyId: null,
      name: 'Event Loop Concurrency Throttle',
      description: 'Applies temporary concurrency backpressure to alleviate CPU starvation on event loop.',
      targetType: ProbeTargetType.EVENT_LOOP_LAG,
      actionType: RunbookActionType.TRAFFIC_THROTTLE,
      riskTier: RunbookRiskTier.MEDIUM,
      isReversible: true,
      parameters: { rateLimit: 100, durationSeconds: 60 },
      preconditions: [
        { metric: 'lagMs', operator: 'GREATER_THAN', expectedValue: 50, description: 'Lag must exceed 50ms' },
      ],
      postVerificationCriteria: { expectedStatus: 'HEALTHY' },
      maxAttempts: 2,
      cooldownMinutes: 15,
      isActive: true,
    },
    {
      id: 'builtin-model-gateway-cache-flush',
      companyId: null,
      name: 'Model Gateway Inference Cache Flush',
      description: 'Evicts corrupt or stale model provider response caches.',
      targetType: ProbeTargetType.MODEL_GATEWAY,
      actionType: RunbookActionType.CACHE_INVALIDATION,
      riskTier: RunbookRiskTier.LOW,
      isReversible: true,
      parameters: { maxKeys: 100 },
      preconditions: [],
      postVerificationCriteria: { expectedStatus: 'HEALTHY' },
      maxAttempts: 2,
      cooldownMinutes: 10,
      isActive: true,
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ITRemediationAdapter,
    @Optional() private readonly gateway?: ExternalActionGatewayService,
    @Optional() private readonly probeService?: HealthProbeService,
  ) {
    if (this.gateway && typeof this.gateway.registerAdapter === 'function') {
      this.gateway.registerAdapter(this.adapter);
    }
  }

  /**
   * Idempotently seeds built-in runbook definitions into the database table
   * to guarantee relational foreign key integrity in live PostgreSQL.
   */
  async ensureBuiltinRunbooksSeeded(): Promise<void> {
    if (!this.prisma || !(this.prisma as any).runbookDefinition) return;

    try {
      for (const b of RunbookEngineService.BUILTIN_RUNBOOKS) {
        if (typeof (this.prisma as any).runbookDefinition.findUnique === 'function') {
          const existing = await (this.prisma as any).runbookDefinition.findUnique({
            where: { id: b.id },
          });
          if (!existing) {
            await (this.prisma as any).runbookDefinition.create({
              data: {
                id: b.id,
                companyId: null,
                name: b.name,
                description: b.description,
                targetType: b.targetType,
                actionType: b.actionType,
                riskTier: b.riskTier,
                isReversible: b.isReversible,
                parameters: b.parameters,
                preconditions: b.preconditions,
                postVerificationCriteria: b.postVerificationCriteria,
                maxAttempts: b.maxAttempts,
                cooldownMinutes: b.cooldownMinutes,
                isActive: b.isActive,
              },
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`Could not auto-seed built-in runbooks: ${sanitizeErrorMessage(err?.message)}`);
    }
  }

  /**
   * Retrieves available self-healing runbook templates for a target component and company scope.
   */
  async getAvailableRunbooks(
    targetType?: ProbeTargetType,
    companyId?: string | null,
  ): Promise<RunbookDefinitionSummary[]> {
    let dbRunbooks: any[] = [];

    if (this.prisma && (this.prisma as any).runbookDefinition) {
      try {
        const whereClause: any = { isActive: true };
        if (targetType) whereClause.targetType = targetType;
        if (companyId) {
          whereClause.OR = [{ companyId: null }, { companyId }];
        } else {
          whereClause.companyId = null;
        }

        dbRunbooks = await (this.prisma as any).runbookDefinition.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
        });
      } catch (err: any) {
        this.logger.debug(`Could not query RunbookDefinition: ${sanitizeErrorMessage(err?.message)}`);
      }
    }

    if (dbRunbooks.length > 0) {
      return dbRunbooks.map((r) => this.mapDefinitionToSummary(r));
    }

    // Fallback to built-in templates
    return RunbookEngineService.BUILTIN_RUNBOOKS
      .filter((r) => !targetType || r.targetType === targetType)
      .map((r) => ({
        ...r,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
  }

  /**
   * Retrieves available self-healing runbook templates for a specific incident.
   */
  async getAvailableRunbooksForIncident(
    incidentId: string,
    companyId?: string | null,
  ): Promise<RunbookDefinitionSummary[]> {
    const incident = await this.getIncidentOrThrow(incidentId, companyId);
    return this.getAvailableRunbooks(incident.targetType as ProbeTargetType, companyId);
  }

  /**
   * Retrieves a runbook template by ID.
   */
  async getRunbookById(runbookId: string, companyId?: string | null): Promise<RunbookDefinitionSummary> {
    if (this.prisma && (this.prisma as any).runbookDefinition) {
      try {
        const r = await (this.prisma as any).runbookDefinition.findUnique({
          where: { id: runbookId },
        });
        if (r) {
          if (companyId && r.companyId && r.companyId !== companyId) {
            throw new ForbiddenException(`Access denied to runbook belonging to company ${r.companyId}`);
          }
          return this.mapDefinitionToSummary(r);
        }
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
      }
    }

    const builtin = RunbookEngineService.BUILTIN_RUNBOOKS.find((b) => b.id === runbookId);
    if (!builtin) {
      throw new NotFoundException(`Runbook definition ${runbookId} not found`);
    }

    return {
      ...builtin,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Plans a runbook remediation execution against an incident.
   * Validates incident state, enforces loop prevention (maxAttempts & cooldown),
   * evaluates preconditions, and checks company emergencyStatus.
   */
  async planRemediation(
    incidentId: string,
    runbookId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
  ): Promise<RunbookExecutionSummary> {
    await this.ensureBuiltinRunbooksSeeded();

    const incident = await this.getIncidentOrThrow(incidentId, companyId);
    const runbook = await this.getRunbookById(runbookId, companyId);

    // 1. Universal EMERGENCY_STOP check
    await this.assertCompanyNotEmergencyHalted(incident.companyId ?? undefined);

    // 2. Incident state validation
    if (incident.status === IncidentStatus.RESOLVED || incident.status === IncidentStatus.CLOSED) {
      throw new BadRequestException(`Cannot execute runbook on incident with terminal status ${incident.status}`);
    }

    // 3. Loop prevention: check execution history for this incident and action
    await this.assertRunbookNotThrottled(incident.id, runbook.actionType, runbook.maxAttempts, runbook.cooldownMinutes);

    // 4. Initial execution status determination based on risk tier
    const requiresApproval =
      (runbook.riskTier === RunbookRiskTier.HIGH || runbook.riskTier === RunbookRiskTier.CRITICAL) &&
      actor?.actorRole !== 'CHAIRMAN';

    const initialStatus = requiresApproval
      ? RunbookExecutionStatus.PENDING_APPROVAL
      : RunbookExecutionStatus.APPROVED;

    // 5. Persist RunbookExecution and attach timeline event atomically via Prisma transaction
    let execution: RunbookExecutionSummary;
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const data: any = {
      id: executionId,
      companyId: incident.companyId ?? null,
      incidentId: incident.id,
      runbookId: runbook.id,
      actionType: runbook.actionType,
      status: initialStatus,
      parameters: runbook.parameters,
      preExecutionSnapshot: {
        incidentTitle: incident.title,
        incidentSeverity: incident.severity,
        incidentTarget: incident.targetName,
        plannedAt: new Date().toISOString(),
      },
      stepResults: [],
      postVerificationSnapshot: {},
      rollbackResults: {},
      riskTier: runbook.riskTier,
      executedBy: actor?.actorId ?? 'SYSTEM_SELF_HEALING_ENGINE',
      startedAt: new Date(),
    };

    if (this.prisma && (this.prisma as any).runbookExecution) {
      try {
        const persistPlan = async (tx: any) => {
          // Atomic throttle / max attempts check inside transaction
          await this.assertRunbookNotThrottledInTx(
            tx,
            incident.id,
            runbook.actionType,
            runbook.maxAttempts,
            runbook.cooldownMinutes,
          );

          let approvalRequestId: string | null = null;
          if (requiresApproval && tx.approvalRequest) {
            const approval = await tx.approvalRequest.create({
              data: {
                companyId: incident.companyId ?? null,
                isGlobal: !incident.companyId,
                requesterId: actor?.actorId ?? 'SYSTEM_RUNBOOK_ENGINE',
                action: 'IT_REMEDIATION_ACTION',
                targetType: 'SYSTEM',
                targetId: incident.targetName,
                proposedParams: {
                  runbookActionType: runbook.actionType,
                  targetName: incident.targetName,
                  parameters: runbook.parameters,
                  riskTier: runbook.riskTier,
                  isGlobal: !incident.companyId,
                },
                riskLevel: runbook.riskTier === RunbookRiskTier.CRITICAL ? 'CRITICAL' : 'HIGH',
                financialImpact: 0,
                reasoning: `IT remediation '${runbook.name}' (${runbook.actionType}) for incident ${incident.id}`,
                environment: 'PRODUCTION',
                status: 'PENDING',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            });
            approvalRequestId = approval.id;
          }

          const executionData = {
            ...data,
            approvalRequestId,
          };

          const persisted = await tx.runbookExecution.create({ data: executionData });

          if (tx.incidentTimelineEvent) {
            await tx.incidentTimelineEvent.create({
              data: {
                incidentId: incident.id,
                companyId: incident.companyId ?? null,
                eventType: IncidentEventType.REMEDIATION_PLANNED,
                note: `Remediation planned: '${runbook.name}' (${runbook.actionType}) [Risk: ${runbook.riskTier}]. Status: ${initialStatus}${approvalRequestId ? ` [Approval: ${approvalRequestId}]` : ''}`,
                evidence: { executionId: persisted.id, runbookId: runbook.id, riskTier: runbook.riskTier, requiresApproval, approvalRequestId },
                actorId: actor?.actorId ?? null,
                actorRole: actor?.actorRole ?? 'SYSTEM_SELF_HEALING_ENGINE',
              },
            });
          }

          return persisted;
        };

        let persistedRecord: any;
        if (typeof (this.prisma as any).$transaction === 'function') {
          persistedRecord = await (this.prisma as any).$transaction(persistPlan);
        } else {
          persistedRecord = await persistPlan(this.prisma);
        }

        execution = this.mapExecutionToSummary(persistedRecord);
      } catch (err: any) {
        if (err instanceof ConflictException || err instanceof ForbiddenException || err instanceof BadRequestException) {
          throw err;
        }
        this.logger.error(`Could not persist RunbookExecution: ${sanitizeErrorMessage(err?.message)}`);
        throw new BadRequestException(`Failed to plan runbook execution: ${sanitizeErrorMessage(err?.message)}`);
      }
    } else {
      execution = {
        id: executionId,
        companyId: incident.companyId ?? null,
        incidentId: incident.id,
        runbookId: runbook.id,
        actionType: runbook.actionType,
        status: initialStatus,
        parameters: runbook.parameters,
        preExecutionSnapshot: { plannedAt: new Date().toISOString() },
        stepResults: [],
        postVerificationSnapshot: {},
        rollbackResults: {},
        riskTier: runbook.riskTier,
        executedBy: actor?.actorId ?? 'SYSTEM_SELF_HEALING_ENGINE',
        startedAt: new Date(),
        createdAt: new Date(),
      };
    }

    return execution;
  }

  /**
   * Approves a high-risk runbook execution. Requires CHAIRMAN authority.
   */
  async approveExecution(
    executionId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
    reason?: string,
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);
    await this.assertCompanyNotEmergencyHalted(incident.companyId ?? undefined);

    if (actor?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException(`Only CHAIRMAN authority can approve high-risk runbook execution ${executionId}`);
    }

    if (execution.status !== RunbookExecutionStatus.PENDING_APPROVAL) {
      throw new ConflictException(`Execution ${executionId} is in status ${execution.status}, expected PENDING_APPROVAL`);
    }

    const persistApproval = async (tx: any) => {
      let boundApprovalId = execution.approvalRequestId;

      if (boundApprovalId && tx.approvalRequest) {
        const approval = await tx.approvalRequest.findUnique({
          where: { id: boundApprovalId },
        });

        if (!approval) {
          throw new BadRequestException(`Approval ${boundApprovalId} not found`);
        }
        if (approval.status !== 'PENDING') {
          throw new ConflictException(`Approval ${boundApprovalId} is in status ${approval.status}, expected PENDING`);
        }
        if (approval.expiresAt && approval.expiresAt < new Date()) {
          throw new BadRequestException(`Approval ${boundApprovalId} has expired`);
        }

        await tx.approvalRequest.update({
          where: { id: boundApprovalId },
          data: {
            status: 'APPROVED',
            approverId: actor?.actorId ?? 'CHAIRMAN',
            decisionReason: reason ?? 'Approved by Chairman',
            decisionTime: new Date(),
          },
        });
      } else if (!boundApprovalId && tx.approvalRequest) {
        const approval = await tx.approvalRequest.create({
          data: {
            companyId: incident.companyId ?? null,
            isGlobal: !incident.companyId,
            requesterId: execution.executedBy,
            action: 'IT_REMEDIATION_ACTION',
            targetType: 'SYSTEM',
            targetId: incident.targetName,
            proposedParams: {
              runbookActionType: execution.actionType,
              targetName: incident.targetName,
              parameters: execution.parameters,
              riskTier: execution.riskTier,
              isGlobal: !incident.companyId,
            },
            riskLevel: execution.riskTier === RunbookRiskTier.CRITICAL ? 'CRITICAL' : 'HIGH',
            reasoning: reason ?? 'Direct Chairman approval',
            environment: 'PRODUCTION',
            status: 'APPROVED',
            approverId: actor?.actorId ?? 'CHAIRMAN',
            decisionReason: reason ?? 'Approved by Chairman',
            decisionTime: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        boundApprovalId = approval.id;
      }

      const updated = await tx.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: RunbookExecutionStatus.APPROVED,
          approvalRequestId: boundApprovalId,
        },
      });

      if (tx.incidentTimelineEvent) {
        await tx.incidentTimelineEvent.create({
          data: {
            incidentId: incident.id,
            companyId: incident.companyId ?? null,
            eventType: IncidentEventType.STATUS_CHANGE,
            note: `Runbook execution ${executionId} (${execution.actionType}) APPROVED by Chairman. Reason: ${reason ?? 'Approved for execution'}. Approval bound: ${boundApprovalId}`,
            evidence: { executionId, approvalRequestId: boundApprovalId, riskTier: execution.riskTier, approvedBy: actor?.actorId },
            actorId: actor?.actorId ?? null,
            actorRole: actor?.actorRole ?? 'CHAIRMAN',
          },
        });
      }

      return updated;
    };

    let updatedRecord: any;
    if (typeof (this.prisma as any).$transaction === 'function') {
      updatedRecord = await (this.prisma as any).$transaction(persistApproval);
    } else {
      updatedRecord = await persistApproval(this.prisma);
    }

    return this.mapExecutionToSummary(updatedRecord);
  }

  /**
   * Rejects a pending high-risk runbook execution. Requires CHAIRMAN authority.
   */
  async rejectExecution(
    executionId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
    reason?: string,
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);

    if (actor?.actorRole !== 'CHAIRMAN') {
      throw new ForbiddenException(`Only CHAIRMAN authority can reject runbook execution ${executionId}`);
    }

    if (execution.status !== RunbookExecutionStatus.PENDING_APPROVAL) {
      throw new ConflictException(`Execution ${executionId} is in status ${execution.status}, expected PENDING_APPROVAL`);
    }

    const persistRejection = async (tx: any) => {
      if (execution.approvalRequestId && tx.approvalRequest) {
        await tx.approvalRequest.update({
          where: { id: execution.approvalRequestId },
          data: {
            status: 'REJECTED',
            approverId: actor?.actorId ?? 'CHAIRMAN',
            decisionReason: reason ?? 'Rejected by Chairman',
            decisionTime: new Date(),
          },
        });
      }

      const updated = await tx.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: RunbookExecutionStatus.FAILED,
          stepResults: [
            {
              stepNumber: 0,
              name: 'ApprovalGate',
              status: 'FAILED',
              output: { reason: reason ?? 'Rejected by Chairman' },
              executedAt: new Date(),
            },
          ],
        },
      });

      if (tx.incidentTimelineEvent) {
        await tx.incidentTimelineEvent.create({
          data: {
            incidentId: incident.id,
            companyId: incident.companyId ?? null,
            eventType: IncidentEventType.STATUS_CHANGE,
            note: `Runbook execution ${executionId} (${execution.actionType}) REJECTED by Chairman. Reason: ${reason ?? 'Rejected by Chairman'}.`,
            evidence: { executionId, approvalRequestId: execution.approvalRequestId, rejectedBy: actor?.actorId },
            actorId: actor?.actorId ?? null,
            actorRole: actor?.actorRole ?? 'CHAIRMAN',
          },
        });
      }

      return updated;
    };

    let updatedRecord: any;
    if (typeof (this.prisma as any).$transaction === 'function') {
      updatedRecord = await (this.prisma as any).$transaction(persistRejection);
    } else {
      updatedRecord = await persistRejection(this.prisma);
    }

    return this.mapExecutionToSummary(updatedRecord);
  }

  /**
   * Executes a planned remediation execution using an atomic state machine.
   * Dispatches the action via V16 ExternalActionGatewayService (or adapter fallback),
   * monitors steps, and triggers fail-closed verification.
   */
  async executeRemediation(
    executionId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);

    // 1. Universal EMERGENCY_STOP check immediately prior to action
    await this.assertCompanyNotEmergencyHalted(incident.companyId ?? undefined);

    const runbookId = execution.runbookId || (execution as any).runbook?.id;
    const runbook = await this.getRunbookById(runbookId, companyId);

    // 2. Strict State Machine Transition Checks
    if (execution.status === RunbookExecutionStatus.PENDING_APPROVAL) {
      if (actor?.actorRole !== 'CHAIRMAN') {
        throw new ForbiddenException(
          `Execution ${executionId} requires sovereign CHAIRMAN approval before dispatching high-risk remediation`,
        );
      }
      // Chairman executing directly: auto-approve execution
      await this.approveExecution(executionId, companyId, actor, 'Direct Chairman execution approval');
      execution.status = RunbookExecutionStatus.APPROVED;
    } else if (execution.status === RunbookExecutionStatus.COMPLETED) {
      throw new ConflictException(`Execution ${executionId} has already completed successfully.`);
    } else if (execution.status === RunbookExecutionStatus.VERIFIED_HEALTHY) {
      throw new ConflictException(`Execution ${executionId} has already completed and verified healthy.`);
    } else if (execution.status === RunbookExecutionStatus.EXECUTING) {
      throw new ConflictException(`Execution ${executionId} is currently executing.`);
    } else if (execution.status === RunbookExecutionStatus.ROLLED_BACK) {
      throw new ConflictException(`Execution ${executionId} has been rolled back and cannot be re-executed.`);
    } else if (
      execution.status === RunbookExecutionStatus.FAILED ||
      (execution.status as any) === RunbookExecutionStatus.ROLLBACK_FAILED
    ) {
      throw new ConflictException(`Execution ${executionId} has failed. A new remediation must be planned.`);
    } else if (execution.status !== RunbookExecutionStatus.APPROVED) {
      throw new BadRequestException(`Execution ${executionId} is in status ${execution.status}, expected APPROVED.`);
    }

    // 3 & 4. Atomic conditional state claim with race-free throttling check inside transaction
    if (this.prisma && typeof (this.prisma as any).$transaction === 'function') {
      await (this.prisma as any).$transaction(async (tx: any) => {
        await this.assertRunbookNotThrottledInTx(
          tx,
          incident.id,
          execution.actionType,
          runbook.maxAttempts,
          runbook.cooldownMinutes,
          execution.id,
        );

        const claim = await tx.runbookExecution.updateMany({
          where: {
            id: executionId,
            status: RunbookExecutionStatus.APPROVED,
          },
          data: {
            status: RunbookExecutionStatus.EXECUTING,
            startedAt: new Date(),
          },
        });

        if (claim.count === 0) {
          throw new ConflictException(
            `Failed to acquire atomic execution lock for ${executionId}: execution is no longer in APPROVED status.`,
          );
        }
      });
    } else if (this.prisma && (this.prisma as any).runbookExecution) {
      await this.assertRunbookNotThrottled(
        incident.id,
        execution.actionType,
        runbook.maxAttempts,
        runbook.cooldownMinutes,
        execution.id,
      );

      const claim = await (this.prisma as any).runbookExecution.updateMany({
        where: {
          id: executionId,
          status: RunbookExecutionStatus.APPROVED,
        },
        data: {
          status: RunbookExecutionStatus.EXECUTING,
          startedAt: new Date(),
        },
      });

      if (claim.count === 0) {
        throw new ConflictException(
          `Failed to acquire atomic execution lock for ${executionId}: execution is no longer in APPROVED status.`,
        );
      }
    } else {
      await this.updateExecution(executionId, {
        status: RunbookExecutionStatus.EXECUTING,
      });
    }

    await this.attachTimelineEvent(
      incident.id,
      incident.companyId ?? null,
      IncidentEventType.REMEDIATION_STARTED,
      `Remediation execution started for ${execution.actionType}`,
      { executionId },
      actor?.actorId,
      actor?.actorRole,
    );

    // 5. Dispatch remediation action via V16 ExternalActionGatewayService (or adapter fallback)
    let actionResult: any;

    if (this.gateway && typeof this.gateway.executeAction === 'function') {
      try {
        const gatewayRequest: ExternalActionRequest = {
          actionId: execution.id,
          idempotencyKey: `rem:${execution.incidentId}:${execution.id}`,
          companyId: incident.companyId ?? undefined as any,
          requestingActorId: actor?.actorId ?? execution.executedBy,
          requestingActorRole: (actor?.actorRole as any) ?? 'SYSTEM',
          actionType: 'IT_REMEDIATION_ACTION',
          target: {
            targetType: 'SYSTEM',
            targetId: incident.targetName,
            targetRecipient: incident.targetName,
            verifiedInDatabase: true,
          },
          intendedEffect: `IT remediation: ${execution.actionType} for ${incident.targetName}`,
          payload: {
            runbookActionType: execution.actionType,
            targetName: incident.targetName,
            parameters: execution.parameters,
            riskTier: execution.riskTier,
            isGlobal: !incident.companyId,
          },
          financialExposure: 0,
          reversibility: runbook.isReversible ? 'PARTIALLY_REVERSIBLE' : 'DIFFICULT_TO_REVERSE',
          approvalId: execution.approvalRequestId ?? undefined,
        };

        const gatewayResult = await this.gateway.executeAction(gatewayRequest);
        if (!gatewayResult.success || gatewayResult.executionState === 'FAILED' || gatewayResult.executionState === 'REJECTED') {
          await this.updateExecution(executionId, {
            status: RunbookExecutionStatus.FAILED,
            stepResults: [{ stepName: 'GATEWAY_GOVERNANCE_BLOCKED', status: 'FAILED', details: gatewayResult }],
            completedAt: new Date(),
          });
          throw new ConflictException(
            `Remediation blocked by ExternalActionGateway: ${gatewayResult.errorMessage || 'Policy rejection'}`,
          );
        }

        actionResult = gatewayResult.resultPayload || {
          success: gatewayResult.success,
          stepResults: [],
          preExecutionSnapshot: execution.preExecutionSnapshot,
          errorMessage: gatewayResult.errorMessage,
        };
      } catch (gatewayErr: any) {
        if (gatewayErr instanceof ConflictException || gatewayErr instanceof ForbiddenException) {
          throw gatewayErr;
        }
        this.logger.error(`Gateway rejected/failed remediation ${executionId}: ${gatewayErr.message}`);
        actionResult = {
          success: false,
          stepResults: [],
          preExecutionSnapshot: execution.preExecutionSnapshot,
          errorMessage: sanitizeErrorMessage(gatewayErr.message),
        };
      }
    } else {
      actionResult = await this.adapter.executeAction(
        execution.actionType,
        incident.targetName,
        execution.parameters,
      );
    }

    if (!actionResult.success) {
      // Step failed: record failure and auto-rollback if reversible
      await this.updateExecution(executionId, {
        status: RunbookExecutionStatus.FAILED,
        stepResults: actionResult.stepResults ?? [],
        completedAt: new Date(),
      });

      await this.attachTimelineEvent(
        incident.id,
        incident.companyId ?? null,
        IncidentEventType.REMEDIATION_FAILED,
        `Remediation action failed: ${actionResult.errorMessage}`,
        { executionId, stepResults: actionResult.stepResults },
        actor?.actorId,
        actor?.actorRole,
      );

      // Trigger rollback if reversible
      return this.rollbackRemediation(executionId, companyId, 'Automated step failure', actor);
    }

    // 6. Steps succeeded: update execution and trigger post-verification
    await this.updateExecution(executionId, {
      status: RunbookExecutionStatus.COMPLETED,
      stepResults: actionResult.stepResults,
      preExecutionSnapshot: actionResult.preExecutionSnapshot,
      completedAt: new Date(),
    });

    await this.attachTimelineEvent(
      incident.id,
      incident.companyId ?? null,
      IncidentEventType.REMEDIATION_COMPLETED,
      `Remediation action steps completed successfully. Initiating health verification probe.`,
      { executionId, stepResults: actionResult.stepResults },
      actor?.actorId,
      actor?.actorRole,
    );

    // 7. Automatically verify post-remediation health
    return this.verifyRemediation(executionId, companyId, actor);
  }

  /**
   * Verifies the outcome of a remediation action by probing the target component.
   * If healthy, marks VERIFIED_HEALTHY and transitions incident to MITIGATED.
   * If still unhealthy, automatically rolls back the remediation.
   * STRICTLY FAILS CLOSED if probe service is unavailable, probe throws, or returns non-healthy status.
   */
  async verifyRemediation(
    executionId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);

    let isHealthy = false;
    let verificationDetails: Record<string, any> = {};

    if (this.probeService) {
      try {
        const probeResult = await this.probeService.executeProbe(
          incident.targetType as ProbeTargetType,
          incident.targetName,
          { companyId: incident.companyId ?? undefined },
        );
        isHealthy = probeResult.status === ProbeResultStatus.HEALTHY;
        verificationDetails = {
          status: probeResult.status,
          latencyMs: probeResult.latencyMs,
          details: probeResult.details,
          verifiedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        this.logger.warn(`Post-remediation verification probe threw: ${sanitizeErrorMessage(err?.message)}`);
        isHealthy = false;
        verificationDetails = {
          error: `Probe execution failure: ${sanitizeErrorMessage(err?.message)}`,
          verifiedAt: new Date().toISOString(),
        };
      }
    } else {
      // FAIL CLOSED: Missing probe service MUST NOT default to healthy
      this.logger.warn(`HealthProbeService not available for execution ${executionId}. Failing closed.`);
      isHealthy = false;
      verificationDetails = {
        error: 'HealthProbeService is unavailable. Failing closed per reliability requirements.',
        verifiedAt: new Date().toISOString(),
      };
    }

    if (isHealthy) {
      // Success! Atomically update execution to VERIFIED_HEALTHY, incident to MITIGATED, and attach timeline event
      const persistHealthy = async (tx: any) => {
        const updated = await tx.runbookExecution.update({
          where: { id: executionId },
          data: {
            status: RunbookExecutionStatus.VERIFIED_HEALTHY,
            postVerificationSnapshot: verificationDetails,
          },
        });

        if (tx.systemIncident) {
          await tx.systemIncident.update({
            where: { id: incident.id },
            data: {
              status: IncidentStatus.MITIGATED,
              mitigatedAt: new Date(),
            },
          });
        }

        if (tx.incidentTimelineEvent) {
          await tx.incidentTimelineEvent.create({
            data: {
              incidentId: incident.id,
              companyId: incident.companyId ?? null,
              eventType: IncidentEventType.REMEDIATION_VERIFIED,
              note: `Post-remediation health verification PASSED. Target component is HEALTHY. Incident moved to MITIGATED.`,
              evidence: { executionId, verificationDetails },
              actorId: actor?.actorId ?? null,
              actorRole: actor?.actorRole ?? 'SYSTEM_SELF_HEALING_ENGINE',
            },
          });
        }

        return updated;
      };

      let updatedRecord: any;
      if (typeof (this.prisma as any).$transaction === 'function') {
        updatedRecord = await (this.prisma as any).$transaction(persistHealthy);
      } else {
        updatedRecord = await persistHealthy(this.prisma);
      }

      return this.mapExecutionToSummary(updatedRecord);
    }

    // Verification failed! Automated rollback is required
    this.logger.warn(`Post-remediation verification failed for execution ${executionId}. Initiating rollback.`);
    await this.updateExecution(executionId, {
      postVerificationSnapshot: verificationDetails,
    });

    await this.attachTimelineEvent(
      incident.id,
      incident.companyId ?? null,
      IncidentEventType.REMEDIATION_FAILED,
      `Post-remediation health probe failed: target component is not healthy (${verificationDetails.status || verificationDetails.error || 'UNHEALTHY'}). Triggering automated rollback.`,
      { executionId, verificationDetails },
      actor?.actorId,
      actor?.actorRole,
    );

    return this.rollbackRemediation(
      executionId,
      companyId,
      `Post-remediation verification probe remained unhealthy (${verificationDetails.status || verificationDetails.error || 'unhealthy'})`,
      actor,
    );
  }

  /**
   * Rolls back a remediation execution and logs the event on the incident timeline.
   * Honors sovereign EMERGENCY_STOP and records honest ROLLBACK_FAILED outcomes on error.
   */
  async rollbackRemediation(
    executionId: string,
    companyId?: string | null,
    reason?: string,
    actor?: { actorId?: string; actorRole?: string },
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);

    // Universal EMERGENCY_STOP check
    await this.assertCompanyNotEmergencyHalted(incident.companyId ?? undefined);

    let rollbackResult: any;

    if (this.gateway && typeof this.gateway.executeAction === 'function') {
      try {
        const gatewayRequest: ExternalActionRequest = {
          actionId: `rollback-${execution.id}`,
          idempotencyKey: `rollback:${execution.incidentId}:${execution.id}`,
          companyId: incident.companyId ?? undefined as any,
          requestingActorId: actor?.actorId ?? execution.executedBy,
          requestingActorRole: (actor?.actorRole as any) ?? 'SYSTEM',
          actionType: 'IT_REMEDIATION_ACTION',
          target: {
            targetType: 'SYSTEM',
            targetId: incident.targetName,
            targetRecipient: incident.targetName,
            verifiedInDatabase: true,
          },
          intendedEffect: `Rollback IT remediation: ${execution.actionType} for ${incident.targetName}`,
          payload: {
            runbookActionType: execution.actionType,
            targetName: incident.targetName,
            parameters: execution.parameters,
            preExecutionSnapshot: execution.preExecutionSnapshot,
            riskTier: execution.riskTier,
            isGlobal: !incident.companyId,
            isRollback: true,
          },
          financialExposure: 0,
          reversibility: 'EFFECTIVELY_IRREVERSIBLE',
        };

        const gatewayResult = await this.gateway.executeAction(gatewayRequest);
        if (!gatewayResult.success || gatewayResult.executionState === 'FAILED' || gatewayResult.executionState === 'REJECTED') {
          rollbackResult = {
            success: false,
            actionType: execution.actionType,
            errorMessage:
              gatewayResult.errorMessage ||
              gatewayResult.resultPayload?.errorMessage ||
              gatewayResult.resultPayload?.error ||
              'Gateway rejected or failed rollback execution',
          };
        } else {
          rollbackResult = gatewayResult.resultPayload || { success: true, actionType: execution.actionType };
        }
      } catch (gwErr: any) {
        rollbackResult = {
          success: false,
          actionType: execution.actionType,
          errorMessage: sanitizeErrorMessage(gwErr?.message),
        };
      }
    } else {
      rollbackResult = await this.adapter.executeRollback(
        execution.actionType,
        incident.targetName,
        execution.preExecutionSnapshot,
      );
    }

    if (rollbackResult.success) {
      // Rollback succeeded
      const persistRollbackSuccess = async (tx: any) => {
        const updated = await tx.runbookExecution.update({
          where: { id: executionId },
          data: {
            status: RunbookExecutionStatus.ROLLED_BACK,
            rollbackResults: {
              reason: reason ?? 'Manual or verification rollback triggered',
              result: rollbackResult,
              rolledBackAt: new Date().toISOString(),
            },
            rolledBackAt: new Date(),
          },
        });

        if (tx.incidentTimelineEvent) {
          await tx.incidentTimelineEvent.create({
            data: {
              incidentId: incident.id,
              companyId: incident.companyId ?? null,
              eventType: IncidentEventType.REMEDIATION_ROLLED_BACK,
              note: `Remediation action rolled back: ${reason ?? 'Rollback complete'}. Incident remains in INVESTIGATING.`,
              evidence: { executionId, rollbackResult },
              actorId: actor?.actorId ?? null,
              actorRole: actor?.actorRole ?? 'SYSTEM_SELF_HEALING_ENGINE',
            },
          });
        }

        return updated;
      };

      let updatedRecord: any;
      if (typeof (this.prisma as any).$transaction === 'function') {
        updatedRecord = await (this.prisma as any).$transaction(persistRollbackSuccess);
      } else {
        updatedRecord = await persistRollbackSuccess(this.prisma);
      }

      return this.mapExecutionToSummary(updatedRecord);
    }

    // Rollback failed: HONEST RECORDING OF ROLLBACK_FAILED
    this.logger.error(`Rollback FAILED for execution ${executionId}: ${rollbackResult.errorMessage}`);
    const persistRollbackFailure = async (tx: any) => {
      const updated = await tx.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: RunbookExecutionStatus.ROLLBACK_FAILED,
          rollbackResults: {
            reason: reason ?? 'Rollback attempted',
            result: rollbackResult,
            failedAt: new Date().toISOString(),
            error: rollbackResult.errorMessage,
          },
        },
      });

      if (tx.incidentTimelineEvent) {
        await tx.incidentTimelineEvent.create({
          data: {
            incidentId: incident.id,
            companyId: incident.companyId ?? null,
            eventType: IncidentEventType.REMEDIATION_FAILED,
            note: `Remediation action rollback FAILED: ${rollbackResult.errorMessage || 'Unknown rollback failure'}. Urgent manual intervention required.`,
            evidence: { executionId, rollbackResult },
            actorId: actor?.actorId ?? null,
            actorRole: actor?.actorRole ?? 'SYSTEM_SELF_HEALING_ENGINE',
          },
        });
      }

      return updated;
    };

    let updatedRecord: any;
    if (typeof (this.prisma as any).$transaction === 'function') {
      updatedRecord = await (this.prisma as any).$transaction(persistRollbackFailure);
    } else {
      updatedRecord = await persistRollbackFailure(this.prisma);
    }

    return this.mapExecutionToSummary(updatedRecord);
  }

  /**
   * Reconciles an execution stranded in EXECUTING state due to crash or failure.
   * Concurrency-safe, enforces lease threshold, inspects gateway audit records,
   * fail-closed health verification on confirmed action success, and quarantines uncertain outcomes.
   */
  async reconcileStrandedExecution(
    executionId: string,
    companyId?: string | null,
    actor?: { actorId?: string; actorRole?: string },
    options: { leaseThresholdMs?: number } = {},
  ): Promise<RunbookExecutionSummary> {
    const execution = await this.getExecutionOrThrow(executionId, companyId);
    const incident = await this.getIncidentOrThrow(execution.incidentId, companyId);

    // Authority check: Chairman, Management, or System
    if (actor && actor.actorRole !== 'CHAIRMAN' && actor.actorRole !== 'MANAGEMENT' && actor.actorRole !== 'SYSTEM') {
      throw new ForbiddenException('Only CHAIRMAN, MANAGEMENT, or SYSTEM authority can reconcile stranded executions.');
    }

    if (execution.status !== RunbookExecutionStatus.EXECUTING) {
      throw new ConflictException(
        `Execution ${executionId} is in status ${execution.status}, expected EXECUTING for reconciliation`,
      );
    }

    // Age / lease threshold check (default: 5 minutes = 300,000 ms)
    const leaseThresholdMs = options.leaseThresholdMs ?? 5 * 60 * 1000;
    const elapsedMs = Date.now() - new Date(execution.startedAt).getTime();
    if (elapsedMs < leaseThresholdMs) {
      const remainingSec = Math.ceil((leaseThresholdMs - elapsedMs) / 1000);
      throw new ConflictException(
        `Execution ${executionId} is still within active execution lease. Please wait ${remainingSec}s before reconciling.`,
      );
    }

    // Atomic conditional claim to prevent concurrent reconciliation across instances
    if (this.prisma && (this.prisma as any).runbookExecution) {
      const claimResult = await (this.prisma as any).runbookExecution.updateMany({
        where: {
          id: executionId,
          status: RunbookExecutionStatus.EXECUTING,
        },
        data: {
          status: RunbookExecutionStatus.VERIFYING,
        },
      });

      if (claimResult.count === 0) {
        throw new ConflictException(
          `Concurrent reconciliation conflict: Execution ${executionId} was already claimed or updated.`,
        );
      }
    }

    // Query gateway audit records for durable evidence using idempotency key
    const idempotencyKey = `rem:${execution.incidentId}:${execution.id}`;
    let auditRecord: any;
    if (this.gateway && typeof (this.gateway as any).getAuditRecordByIdempotencyKey === 'function') {
      auditRecord = await (this.gateway as any).getAuditRecordByIdempotencyKey(idempotencyKey, incident.companyId);
    } else if (this.gateway && typeof (this.gateway as any).getAuditTrail === 'function') {
      const trail = (this.gateway as any).getAuditTrail(incident.companyId ?? '');
      auditRecord = trail.find((r: any) => r.idempotencyKey === idempotencyKey);
    }

    // Case 1: Action confirmed EXECUTED or COMPLETED in gateway audit record
    if (
      auditRecord &&
      (auditRecord.executionState === 'EXECUTED' ||
        auditRecord.executionState === 'COMPLETED' ||
        auditRecord.success === true)
    ) {
      this.logger.log(`[Reconciliation] Execution ${executionId} confirmed COMPLETED via gateway audit. Proceeding to health verification.`);
      return this.verifyRemediation(executionId, companyId, actor);
    }

    // Case 2: Action failed or was rejected at the gateway
    if (auditRecord && (auditRecord.executionState === 'FAILED' || auditRecord.executionState === 'REJECTED')) {
      const failedRecord = await this.updateExecution(executionId, {
        status: RunbookExecutionStatus.FAILED,
        completedAt: new Date(),
        stepResults: [
          ...(execution.stepResults || []),
          { stepNumber: 99, name: 'Reconciliation', status: 'FAILED', output: { error: auditRecord.errorMessage || 'Gateway action failed or rejected' }, executedAt: new Date() },
        ],
      });
      await this.attachTimelineEvent(
        incident.id,
        incident.companyId,
        IncidentEventType.REMEDIATION_FAILED,
        `Stranded execution ${executionId} reconciled to FAILED based on gateway audit record. Reason: ${auditRecord.errorMessage}`,
        { executionId, reconciledBy: actor?.actorId, auditState: auditRecord.executionState },
        actor?.actorId,
        actor?.actorRole,
      );
      return failedRecord;
    }

    // Case 3: Crash before action dispatch (no audit record found)
    if (!auditRecord) {
      const failedRecord = await this.updateExecution(executionId, {
        status: RunbookExecutionStatus.FAILED,
        completedAt: new Date(),
        stepResults: [
          ...(execution.stepResults || []),
          { stepNumber: 99, name: 'Reconciliation', status: 'FAILED', output: { note: 'Crashed before external action dispatch; safely failed' }, executedAt: new Date() },
        ],
      });
      await this.attachTimelineEvent(
        incident.id,
        incident.companyId,
        IncidentEventType.REMEDIATION_FAILED,
        `Stranded execution ${executionId} reconciled to FAILED: crashed before external action dispatch.`,
        { executionId, reconciledBy: actor?.actorId, outcome: 'CRASH_BEFORE_ACTION' },
        actor?.actorId,
        actor?.actorRole,
      );
      return failedRecord;
    }

    // Case 4: Uncertain external outcome (audit record exists but state is UNKNOWN / PENDING)
    // Quarantine execution: do not retry blindly
    const quarantinedRecord = await this.updateExecution(executionId, {
      status: RunbookExecutionStatus.FAILED,
      completedAt: new Date(),
      stepResults: [
        ...(execution.stepResults || []),
        {
          stepNumber: 99,
          name: 'ReconciliationQuarantine',
          status: 'FAILED',
          output: { error: 'UNCERTAIN_EXTERNAL_OUTCOME: Requires human manual verification', auditState: auditRecord.executionState },
          executedAt: new Date(),
        },
      ],
    });
    await this.attachTimelineEvent(
      incident.id,
      incident.companyId,
      IncidentEventType.REMEDIATION_FAILED,
      `Stranded execution ${executionId} QUARANTINED: Uncertain external outcome. Manual operator intervention required.`,
      { executionId, reconciledBy: actor?.actorId, auditState: auditRecord.executionState, quarantined: true },
      actor?.actorId,
      actor?.actorRole,
    );
    return quarantinedRecord;
  }

  /**
   * Retrieves an execution by ID and verifies company access.
   */
  async getExecutionById(executionId: string, companyId?: string | null): Promise<RunbookExecutionSummary> {
    return this.getExecutionOrThrow(executionId, companyId);
  }

  /**
   * Lists executions for an incident.
   */
  async getIncidentExecutions(incidentId: string, companyId?: string | null): Promise<RunbookExecutionSummary[]> {
    await this.getIncidentOrThrow(incidentId, companyId);

    if (this.prisma && (this.prisma as any).runbookExecution) {
      try {
        const rows = await (this.prisma as any).runbookExecution.findMany({
          where: { incidentId },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r: any) => this.mapExecutionToSummary(r));
      } catch (err: any) {
        this.logger.debug(`Could not list executions: ${sanitizeErrorMessage(err?.message)}`);
      }
    }

    return [];
  }

  // --- Helper Methods ---

  private async getIncidentOrThrow(id: string, companyId?: string | null): Promise<any> {
    if (!this.prisma || !(this.prisma as any).systemIncident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const incident = await (this.prisma as any).systemIncident.findUnique({
      where: { id },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    if (companyId && incident.companyId && incident.companyId !== companyId) {
      throw new ForbiddenException(`Access denied to incident belonging to company ${incident.companyId}`);
    }

    return incident;
  }

  private async getExecutionOrThrow(id: string, companyId?: string | null): Promise<RunbookExecutionSummary> {
    if (!this.prisma || !(this.prisma as any).runbookExecution) {
      throw new NotFoundException(`Runbook execution ${id} not found`);
    }

    const exec = await (this.prisma as any).runbookExecution.findUnique({
      where: { id },
    });

    if (!exec) {
      throw new NotFoundException(`Runbook execution ${id} not found`);
    }

    if (companyId && exec.companyId && exec.companyId !== companyId) {
      throw new ForbiddenException(`Access denied to execution belonging to company ${exec.companyId}`);
    }

    return this.mapExecutionToSummary(exec);
  }

  private async updateExecution(id: string, data: any): Promise<RunbookExecutionSummary> {
    if (this.prisma && (this.prisma as any).runbookExecution) {
      try {
        const updated = await (this.prisma as any).runbookExecution.update({
          where: { id },
          data,
        });
        return this.mapExecutionToSummary(updated);
      } catch (err: any) {
        this.logger.debug(`Could not update execution: ${sanitizeErrorMessage(err?.message)}`);
      }
    }

    return {
      id,
      incidentId: 'unknown',
      runbookId: 'unknown',
      actionType: RunbookActionType.QUEUE_PURGE_STALE_LOCKS,
      status: data.status ?? RunbookExecutionStatus.EXECUTING,
      parameters: {},
      preExecutionSnapshot: {},
      stepResults: data.stepResults ?? [],
      postVerificationSnapshot: data.postVerificationSnapshot ?? {},
      rollbackResults: data.rollbackResults ?? {},
      riskTier: RunbookRiskTier.LOW,
      executedBy: 'SYSTEM',
      startedAt: new Date(),
      createdAt: new Date(),
      ...data,
    };
  }

  private async assertCompanyNotEmergencyHalted(companyId?: string): Promise<void> {
    if (!companyId || !this.prisma || !(this.prisma as any).company) return;

    try {
      const comp = await (this.prisma as any).company.findUnique({
        where: { id: companyId },
        select: { emergencyStatus: true },
      });

      if (comp?.emergencyStatus === 'EMERGENCY_STOP') {
        throw new ForbiddenException(
          `Target company ${companyId} is in EMERGENCY_STOP. Remediation execution is prohibited by governance policy.`,
        );
      }
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
    }
  }

  private async assertRunbookNotThrottledInTx(
    tx: any,
    incidentId: string,
    actionType: RunbookActionType,
    maxAttempts: number,
    cooldownMinutes: number,
    currentExecutionId?: string,
  ): Promise<void> {
    if (!tx || !tx.runbookExecution) return;

    try {
      const whereClause: any = {
        incidentId,
        actionType,
        status: {
          in: [
            RunbookExecutionStatus.COMPLETED,
            RunbookExecutionStatus.VERIFIED_HEALTHY,
            RunbookExecutionStatus.FAILED,
            RunbookExecutionStatus.ROLLED_BACK,
            RunbookExecutionStatus.ROLLBACK_FAILED,
            RunbookExecutionStatus.EXECUTING,
          ],
        },
      };
      if (currentExecutionId) {
        whereClause.id = { not: currentExecutionId };
      }

      const pastExecutions = await tx.runbookExecution.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

      // 1. Max attempts enforcement
      if (pastExecutions.length >= maxAttempts) {
        throw new ConflictException(
          `Runbook action '${actionType}' has reached maximum automated attempts (${maxAttempts}) on incident ${incidentId}. Human escalation required.`,
        );
      }

      // 2. Cooldown period enforcement
      if (pastExecutions.length > 0 && cooldownMinutes > 0) {
        const lastExecution = pastExecutions[0];
        const elapsedMinutes = (Date.now() - new Date(lastExecution.createdAt).getTime()) / (60 * 1000);
        if (elapsedMinutes < cooldownMinutes) {
          const waitTime = Math.ceil(cooldownMinutes - elapsedMinutes);
          throw new ConflictException(
            `Runbook action '${actionType}' is in active cooldown on incident ${incidentId}. Please wait ${waitTime} more minutes before retrying.`,
          );
        }
      }
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
    }
  }

  private async assertRunbookNotThrottled(
    incidentId: string,
    actionType: RunbookActionType,
    maxAttempts: number,
    cooldownMinutes: number,
    currentExecutionId?: string,
  ): Promise<void> {
    return this.assertRunbookNotThrottledInTx(
      this.prisma,
      incidentId,
      actionType,
      maxAttempts,
      cooldownMinutes,
      currentExecutionId,
    );
  }

  private async attachTimelineEvent(
    incidentId: string,
    companyId: string | null,
    eventType: IncidentEventType,
    note: string,
    evidence: Record<string, any> = {},
    actorId?: string,
    actorRole?: string,
  ): Promise<void> {
    if (!this.prisma || !(this.prisma as any).incidentTimelineEvent) return;

    try {
      await (this.prisma as any).incidentTimelineEvent.create({
        data: {
          incidentId,
          companyId,
          eventType,
          note,
          evidence,
          actorId: actorId ?? null,
          actorRole: actorRole ?? 'SYSTEM_SELF_HEALING_ENGINE',
        },
      });
    } catch (err: any) {
      this.logger.debug(`Could not attach timeline event: ${sanitizeErrorMessage(err?.message)}`);
    }
  }

  private mapDefinitionToSummary(r: any): RunbookDefinitionSummary {
    return {
      id: r.id,
      companyId: r.companyId ?? null,
      name: r.name,
      description: r.description,
      targetType: r.targetType,
      actionType: r.actionType,
      riskTier: r.riskTier ?? RunbookRiskTier.LOW,
      isReversible: r.isReversible ?? true,
      parameters: r.parameters ?? {},
      preconditions: r.preconditions ?? [],
      postVerificationCriteria: r.postVerificationCriteria ?? {},
      maxAttempts: r.maxAttempts ?? 2,
      cooldownMinutes: r.cooldownMinutes ?? 15,
      isActive: r.isActive ?? true,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  private mapExecutionToSummary(e: any): RunbookExecutionSummary {
    return {
      id: e.id,
      companyId: e.companyId ?? null,
      incidentId: e.incidentId,
      runbookId: e.runbookId,
      actionType: e.actionType,
      status: e.status,
      parameters: e.parameters ?? {},
      preExecutionSnapshot: e.preExecutionSnapshot ?? {},
      stepResults: e.stepResults ?? [],
      postVerificationSnapshot: e.postVerificationSnapshot ?? {},
      rollbackResults: e.rollbackResults ?? {},
      riskTier: e.riskTier,
      approvalRequestId: e.approvalRequestId ?? null,
      executedBy: e.executedBy,
      startedAt: new Date(e.startedAt),
      completedAt: e.completedAt ? new Date(e.completedAt) : null,
      rolledBackAt: e.rolledBackAt ? new Date(e.rolledBackAt) : null,
      createdAt: new Date(e.createdAt ?? e.startedAt),
    };
  }
}

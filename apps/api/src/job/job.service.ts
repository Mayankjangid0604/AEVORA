import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, JobStatus, Prisma } from '@prisma/client';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface EnqueueJobOptions {
  type: string;
  payload: any;
  companyId?: string;
  environment?: ExecutionEnvironment;
  priority?: number;
  idempotencyKey?: string;
  correlationId?: string;
  approvalId?: string;
}

/** Tenant-scoped storage key for BackgroundJob.idempotencyKey (system jobs without a company use `system:`). */
export function scopedJobKey(companyId: string | undefined, key: string): string {
  return `${companyId ?? 'system'}:${key}`;
}

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalValidation: ApprovalValidationService,
    private readonly logger: StructuredLoggerService
  ) {}

  async enqueue(options: EnqueueJobOptions) {
    const environment = options.environment || ExecutionEnvironment.SIMULATION;
    
    // M2: Production jobs require company attribution
    if (environment === ExecutionEnvironment.PRODUCTION && !options.companyId) {
      throw new Error('Production jobs require a valid companyId attribution');
    }

    // Require approval for production operations
    // Note: If some automated jobs don't need approvals, that would be checked against a policy here.
    if (environment === ExecutionEnvironment.PRODUCTION && !options.approvalId) {
      throw new Error('UNAUTHORIZED: Production jobs require an approvalId');
    }

    if (options.approvalId && options.companyId) {
      // Validate and consume the approval
      await this.approvalValidation.validateAndConsumeApproval(options.approvalId, {
        companyId: options.companyId,
        action: options.type,
        environment,
        params: options.payload,
      });
    }
    
    // Idempotency keys are namespaced by tenant: the column is globally unique, so a raw key would let one tenant
    // read (or squat) another tenant's job. The tenant prefix is server-derived, never caller-supplied.
    const idempotencyKey = options.idempotencyKey ? scopedJobKey(options.companyId, options.idempotencyKey) : undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.backgroundJob.findUnique({
        where: { idempotencyKey }
      });
      if (existing) {
        this.logger.log(
          `Job already exists for idempotencyKey: ${options.idempotencyKey}`,
          JobService.name,
          { idempotencyKey: options.idempotencyKey, jobId: existing.id }
        );
        return existing;
      }
    }

    const job = await this.prisma.backgroundJob.create({
      data: {
        type: options.type,
        payload: options.payload,
        companyId: options.companyId,
        environment,
        priority: options.priority || 0,
        idempotencyKey,
        correlationId: options.correlationId,
        approvalId: options.approvalId,
      },
    });

    this.logger.log(
      `Enqueued job ${job.id} [${job.type}] in ${environment}`,
      JobService.name,
      { jobId: job.id, type: job.type, environment, companyId: options.companyId, approvalId: options.approvalId }
    );
    return job;
  }

  // ---- Operator job controls (Gate 4A). Tenant is always the caller's company; every change is compare-and-set. ----

  listJobs(companyId: string, status?: JobStatus) {
    return this.prisma.backgroundJob.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: JOB_OPERATOR_SELECT,
    });
  }

  async getJob(companyId: string, id: string) {
    const job = await this.prisma.backgroundJob.findFirst({ where: { id, companyId }, select: JOB_OPERATOR_SELECT });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async controlJob(companyId: string, actorId: string, id: string, action: unknown) {
    const rule = JOB_ACTIONS[action as JobAction];
    if (!rule) throw new BadRequestException(`Unknown job action ${String(action)}`);
    const job = await this.getJob(companyId, id);
    if (!rule.from.includes(job.status)) throw new ConflictException(`Cannot ${action} a ${job.status} job`);

    let data: Prisma.BackgroundJobUpdateManyMutationInput = { status: rule.to };
    if (action === 'replay') {
      if (!REPLAYABLE_TYPES.has(job.type)) throw new ForbiddenException(`Job type ${job.type} cannot be replayed (external side effects or no handler)`);
      const replays = await this.prisma.managementAuditEvent.count({ where: { companyId, objectType: 'BackgroundJob', objectId: id, action: 'JOB_REPLAY' } });
      if (replays >= MAX_REPLAYS) throw new ConflictException(`Job already replayed ${replays} times (limit ${MAX_REPLAYS})`);
      data = { status: rule.to, attempts: 0, nextAttemptAt: null, lockedAt: null, workerId: null, lastError: `Replayed by operator after: ${job.lastError ?? 'no error recorded'}`.slice(0, 2000) };
    }
    // Compare-and-set: a worker claim or another operator in between makes this a no-op → 409.
    const r = await this.prisma.backgroundJob.updateMany({ where: { id, companyId, status: job.status }, data });
    if (!r.count) throw new ConflictException('The job changed since it was loaded. Reload and try again.');
    await this.prisma.managementAuditEvent.create({
      data: { companyId, actorId, action: `JOB_${String(action).toUpperCase()}`, objectType: 'BackgroundJob', objectId: id, oldValue: { status: job.status, attempts: job.attempts }, newValue: { status: rule.to } },
    });
    return this.getJob(companyId, id);
  }
}

type JobAction = 'pause' | 'resume' | 'replay';
const JOB_ACTIONS: Record<JobAction, { from: JobStatus[]; to: JobStatus }> = {
  pause: { from: [JobStatus.QUEUED], to: JobStatus.PAUSED },
  resume: { from: [JobStatus.PAUSED], to: JobStatus.QUEUED },
  replay: { from: [JobStatus.FAILED, JobStatus.CANCELLED], to: JobStatus.QUEUED },
};
/** Types whose handler only has internal effects (any outbound it triggers still goes through the approval gate). */
/** INQUIRY_TRIAGE only touches internal inquiry rows through compare-and-set, so a replay can never duplicate or send anything. */
export const REPLAYABLE_TYPES = new Set(['TASK_EXECUTION', 'INQUIRY_TRIAGE']);
export const MAX_REPLAYS = 3;
/** No payload: it can carry task data the queue view does not need. */
const JOB_OPERATOR_SELECT = {
  id: true, type: true, status: true, attempts: true, maxAttempts: true, lastError: true, nextAttemptAt: true,
  startedAt: true, completedAt: true, createdAt: true, updatedAt: true, environment: true,
} satisfies Prisma.BackgroundJobSelect;


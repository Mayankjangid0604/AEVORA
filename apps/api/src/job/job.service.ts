import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';
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
    
    // Check for idempotency
    if (options.idempotencyKey) {
      const existing = await this.prisma.backgroundJob.findUnique({
        where: { idempotencyKey: options.idempotencyKey }
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
        idempotencyKey: options.idempotencyKey,
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
}

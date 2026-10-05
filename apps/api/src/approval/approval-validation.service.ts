import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment, ApprovalRequestStatus } from '@prisma/client';
import { normalizeParams, isDeepEqualStrict } from './parameter-binding.util';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface ExecutionValidationContext {
  companyId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  environment: ExecutionEnvironment;
  params: any;
}

@Injectable()
export class ApprovalValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService
  ) {}

  /**
   * Validates an approval against execution context and consumes it atomically.
   * Provides TOCTOU protection.
   */
  async validateAndConsumeApproval(
    approvalId: string,
    context: ExecutionValidationContext
  ): Promise<void> {
    // We use a transaction to lock the approval row, check conditions, and consume it.
    await this.prisma.$transaction(async (tx) => {
      const approval = await tx.approvalRequest.findUnique({
        where: { id: approvalId },
      });

      if (!approval) {
        throw new BadRequestException(`Approval ${approvalId} not found`);
      }

      if (approval.companyId !== context.companyId) {
        throw new UnauthorizedException('Approval does not belong to the execution company');
      }

      if (approval.status !== ApprovalRequestStatus.APPROVED) {
        throw new BadRequestException(`Approval status is ${approval.status}, expected APPROVED`);
      }

      if (approval.expiresAt && approval.expiresAt < new Date()) {
        throw new BadRequestException('Approval has expired');
      }

      if (approval.action !== context.action) {
        throw new BadRequestException(`Approval action mismatch: expected ${context.action}, got ${approval.action}`);
      }

      if (approval.environment !== context.environment) {
        throw new BadRequestException(`Approval environment mismatch`);
      }

      if (approval.targetType && approval.targetType !== context.targetType) {
        throw new BadRequestException(`Approval targetType mismatch`);
      }

      if (approval.targetId && approval.targetId !== context.targetId) {
        throw new BadRequestException(`Approval targetId mismatch`);
      }

      // Parameter binding validation
      const approvedParams = normalizeParams(approval.proposedParams);
      const executionParams = normalizeParams(context.params);

      if (!isDeepEqualStrict(approvedParams, executionParams)) {
        this.logger.error(
          `Parameter mismatch for approval ${approvalId}. Approved: ${JSON.stringify(approvedParams)}, Execution: ${JSON.stringify(executionParams)}`,
          undefined,
          ApprovalValidationService.name,
          { companyId: context.companyId, environment: context.environment, action: context.action, approvalId }
        );
        throw new BadRequestException('Execution parameters do not match approved parameters');
      }

      // Consume the approval to prevent replay/TOCTOU concurrently
      const consumed = await tx.approvalRequest.updateMany({
        where: {
          id: approvalId,
          status: ApprovalRequestStatus.APPROVED,
        },
        data: {
          status: ApprovalRequestStatus.CONSUMED,
        },
      });

      if (consumed.count === 0) {
        throw new BadRequestException('Conflict: Approval was already consumed, modified, or is not in APPROVED state');
      }

      this.logger.log(
        `Approval ${approvalId} validated and consumed for company ${context.companyId}`,
        ApprovalValidationService.name,
        { companyId: context.companyId, environment: context.environment, action: context.action, approvalId }
      );
    });
  }
}

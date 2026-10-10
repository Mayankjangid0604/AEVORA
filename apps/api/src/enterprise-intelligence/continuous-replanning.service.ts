import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReplanningEvaluationResult } from './enterprise-intelligence.types';
import * as crypto from 'crypto';

@Injectable()
export class ContinuousReplanningService {
  private readonly logger = new Logger(ContinuousReplanningService.name);

  // Plan-thrashing cooldown threshold: 3 minutes per deduplication key
  private readonly THROTTLE_WINDOW_MS = 180_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates whether a material enterprise state change requires continuous replanning,
   * enforcing Chairman sovereignty, plan-thrashing protection, and complete causation audit.
   */
  async evaluateReplanningNeed(input: {
    companyId: string;
    triggerEvent: string;
    triggerReason: string;
    affectedEntityType: string;
    affectedEntityId: string;
    proposedModifications?: any[];
    authorityProofId?: string;
    correlationId?: string;
    causationId?: string;
  }): Promise<ReplanningEvaluationResult> {
    const { companyId, triggerEvent, triggerReason, affectedEntityType, affectedEntityId, proposedModifications = [] } = input;

    // 1. Verify Company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // 2. Chairman Sovereignty Enforcement: Check if affected entity is tied to an active Chairman Command
    if (affectedEntityType === 'TASK' || affectedEntityType === 'PROJECT') {
      const activeCommand = await this.prisma.chairmanCommand.findFirst({
        where: {
          companyId,
          status: { in: ['PENDING', 'ROUTED', 'AWAITING_APPROVAL', 'EXECUTING'] },
        },
      });

      // If an autonomous replanning tries to cancel or override a Chairman command, it is strictly forbidden
      if (activeCommand && triggerReason.toLowerCase().includes('override chairman')) {
        this.logger.warn(`[${companyId}] Autonomous replanning attempted to override Chairman command ${activeCommand.id}. Blocked.`);
        throw new BadRequestException('CONSTITUTIONAL PROHIBITION: Autonomous replanning cannot override Chairman commands');
      }
    }

    // 3. Plan-Thrashing Protection via Deterministic Deduplication
    const deduplicationKey = crypto
      .createHash('sha256')
      .update(`${companyId}:${triggerEvent}:${triggerReason}:${affectedEntityType}:${affectedEntityId}`)
      .digest('hex');

    const recentChange = await this.prisma.enterprisePlanChangeRecord.findFirst({
      where: {
        companyId,
        deduplicationKey,
        createdAt: { gte: new Date(Date.now() - this.THROTTLE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChange) {
      this.logger.warn(
        `[${companyId}] Replanning throttled for key ${deduplicationKey.slice(0, 8)} to prevent plan thrashing`,
      );

      const throttledRecord = await this.prisma.enterprisePlanChangeRecord.create({
        data: {
          companyId,
          triggerEvent,
          triggerReason,
          affectedEntityTypes: [affectedEntityType],
          affectedEntityIds: [affectedEntityId],
          planModifications: [],
          explanation: `Throttled: replanning triggered within ${this.THROTTLE_WINDOW_MS / 1000}s cooldown window`,
          deduplicationKey,
          authorityProofId: input.authorityProofId,
          isThrottled: true,
          correlationId: input.correlationId,
          causationId: input.causationId,
        },
      });

      return {
        replanningRequired: false,
        isThrottled: true,
        deduplicationKey,
        reason: 'Plan change throttled by anti-thrashing policy',
        planChangeRecordId: throttledRecord.id,
      };
    }

    // 4. Generate structured plan change explanation
    const explanation = `Replanning triggered by ${triggerEvent} on ${affectedEntityType}:${affectedEntityId} (${triggerReason}). Applied ${proposedModifications.length} modifications.`;

    // 5. Record Plan Change in persistent ledger
    const planChange = await this.prisma.enterprisePlanChangeRecord.create({
      data: {
        companyId,
        triggerEvent,
        triggerReason,
        affectedEntityTypes: [affectedEntityType],
        affectedEntityIds: [affectedEntityId],
        planModifications: proposedModifications,
        explanation,
        deduplicationKey,
        authorityProofId: input.authorityProofId,
        isThrottled: false,
        correlationId: input.correlationId,
        causationId: input.causationId,
      },
    });

    this.logger.log(`[${companyId}] Recorded plan change ${planChange.id}: ${explanation}`);

    return {
      replanningRequired: true,
      isThrottled: false,
      deduplicationKey,
      reason: explanation,
      planChangeRecordId: planChange.id,
      modifications: proposedModifications,
    };
  }

  /**
   * Retrieves plan change history for a company.
   */
  async getPlanChangeHistory(companyId: string, limit = 50) {
    return this.prisma.enterprisePlanChangeRecord.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { authorityProof: true },
    });
  }
}

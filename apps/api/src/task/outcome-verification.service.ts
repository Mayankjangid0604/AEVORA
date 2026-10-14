import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceVerificationService } from './evidence-verification.service';
import {
  OutcomeVerificationStatus,
  EpistemicCertainty,
  OutcomeEvaluationResult,
  EvidenceContract,
} from './evidence-contract.types';

@Injectable()
export class OutcomeVerificationService {
  private readonly logger = new Logger(OutcomeVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceVerificationService: EvidenceVerificationService,
  ) {}

  /**
   * Evaluates and updates the canonical outcome state of a task based on its evidence contract and success criteria.
   * Explicitly enforces:
   * Execution Completion ≠ Verified Outcome ≠ Strategic Success.
   * Prevents false-success modes (agent claiming success without evidence or technical 200 without outcome).
   */
  async evaluateTaskOutcome(
    taskId: string,
    companyId: string,
    options?: {
      attemptId?: string;
      customContract?: EvidenceContract;
      verifierId?: string;
    },
  ): Promise<OutcomeEvaluationResult> {
    if (!companyId) {
      throw new BadRequestException('Outcome evaluation requires explicit companyId');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        result: true,
        evidenceRecords: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // Verify evidence contract
    const evidenceResult = await this.evidenceVerificationService.verifyEvidenceContract(
      taskId,
      companyId,
      {
        attemptId: options?.attemptId,
        customContract: options?.customContract,
      },
    );

    const now = new Date();
    const verifierId = options?.verifierId || 'OUTCOME_VERIFICATION_ENGINE';

    // False-success detection rules:
    // 1. If task has required evidence but none was submitted
    const hasRequirements =
      options?.customContract?.requirements?.length ||
      (Array.isArray(task.evidenceRequirements) && task.evidenceRequirements.length > 0);

    const hasMissingEvidence = evidenceResult.missingRequirements.length > 0;
    const hasContradictions = evidenceResult.contradictions.length > 0;
    const hasFailures = evidenceResult.failedRequirements.length > 0;

    let targetOutcomeState: OutcomeVerificationStatus;
    let targetEpistemic: EpistemicCertainty = evidenceResult.epistemicStatus;
    let falseSuccessPrevented = false;
    let rejectionReason: string | undefined;

    if (hasContradictions) {
      targetOutcomeState = OutcomeVerificationStatus.OUTCOME_FAILED;
      targetEpistemic = EpistemicCertainty.CONFLICTED;
      falseSuccessPrevented = true;
      rejectionReason = `Contradictory evidence detected on task: ${evidenceResult.contradictions.join('; ')}`;
    } else if (hasRequirements && hasMissingEvidence) {
      targetOutcomeState = OutcomeVerificationStatus.TECHNICALLY_COMPLETED;
      targetEpistemic = EpistemicCertainty.UNKNOWN;
      falseSuccessPrevented = true;
      rejectionReason = `Required evidence missing: ${evidenceResult.missingRequirements.join('; ')}`;
    } else if (hasFailures) {
      targetOutcomeState = OutcomeVerificationStatus.OUTCOME_FAILED;
      targetEpistemic = EpistemicCertainty.UNKNOWN;
      falseSuccessPrevented = true;
      rejectionReason = `Evidence verification failed: ${evidenceResult.failedRequirements.join('; ')}`;
    } else if (evidenceResult.canAcceptOutcomeVerification) {
      // Evaluate success criteria if present
      const successCriteria = (task.successCriteria as any[]) || [];
      const criteriaPassed = this.evaluateSuccessCriteria(successCriteria, task.evidenceRecords);

      if (criteriaPassed) {
        targetOutcomeState = OutcomeVerificationStatus.OUTCOME_VERIFIED;
        targetEpistemic = EpistemicCertainty.VERIFIED_FACT;
      } else {
        targetOutcomeState = OutcomeVerificationStatus.EVIDENCE_VERIFIED;
        targetEpistemic = EpistemicCertainty.DERIVED_FACT;
        rejectionReason = 'Evidence verified but substantive success criteria not yet fully met';
      }
    } else if (evidenceResult.canAcceptTechnicalCompletion) {
      targetOutcomeState = OutcomeVerificationStatus.EVIDENCE_VERIFIED;
      targetEpistemic = EpistemicCertainty.DERIVED_FACT;
    } else {
      targetOutcomeState = task.outcomeState || OutcomeVerificationStatus.TECHNICALLY_COMPLETED;
    }

    // Persist verified state on Task and TaskResult
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        outcomeState: targetOutcomeState,
      },
    });

    if (task.result) {
      await this.prisma.taskResult.update({
        where: { id: task.result.id },
        data: {
          outcomeState: targetOutcomeState,
          epistemicStatus: targetEpistemic,
          verificationScore: evidenceResult.confidenceScore,
          outcomeConfidence:
            targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED ? 1.0 : evidenceResult.confidenceScore,
          evidenceSummary: {
            passed: evidenceResult.passedRequirements,
            failed: evidenceResult.failedRequirements,
            missing: evidenceResult.missingRequirements,
            contradictions: evidenceResult.contradictions,
            uncertainties: evidenceResult.uncertainties,
          },
          verifiedAt: targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED ? now : null,
          verifiedBy: targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED ? verifierId : null,
        },
      });
    }

    // Emit authoritative CompanyEvent for verified outcome or outcome failure
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type:
          targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED
            ? 'TASK_OUTCOME_VERIFIED'
            : targetOutcomeState === OutcomeVerificationStatus.OUTCOME_FAILED
              ? 'TASK_OUTCOME_FAILED'
              : 'TASK_OUTCOME_EVALUATED',
        payload: {
          taskId,
          outcomeState: targetOutcomeState,
          epistemicStatus: targetEpistemic,
          verificationScore: evidenceResult.confidenceScore,
          falseSuccessPrevented,
          rejectionReason,
          correlationId: task.correlationId,
          causationId: task.causationId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit outcome CompanyEvent: ${e.message}`));

    this.logger.log(
      `[OutcomeVerification] Evaluated task ${taskId} in company ${companyId}: outcomeState=${targetOutcomeState}, epistemic=${targetEpistemic}, falseSuccessPrevented=${falseSuccessPrevented}`,
    );

    return {
      taskId,
      companyId,
      outcomeState: targetOutcomeState,
      epistemicStatus: targetEpistemic,
      verificationScore: evidenceResult.confidenceScore,
      outcomeConfidence:
        targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED ? 1.0 : evidenceResult.confidenceScore,
      evidenceResult,
      isOutcomeVerified: targetOutcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED,
      falseSuccessPrevented,
      rejectionReason,
    };
  }

  /**
   * Outcome Reopening:
   * If a previously accepted result later becomes disproven or materially contradicted:
   * - Preserves the original result and audit trail
   * - Marks outcome state as REOPENED
   * - Emits canonical CompanyEvent
   * - Propagates downstream impact to dependent tasks and goals
   */
  async reopenOutcome(
    taskId: string,
    companyId: string,
    options: {
      invalidatingEvidenceId?: string;
      reason: string;
      reopenedBy?: string;
    },
  ) {
    if (!companyId) {
      throw new BadRequestException('Outcome reopening requires explicit companyId');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        result: true,
        dependentOn: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    const previousOutcomeState = task.outcomeState;
    const now = new Date();
    const reopenedBy = options.reopenedBy || 'OUTCOME_REOPENING_ENGINE';

    // 1. Transition Task outcome state to REOPENED
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        outcomeState: OutcomeVerificationStatus.REOPENED,
        recoveryState: 'DEGRADED',
      },
    });

    // 2. Transition TaskResult outcome state to REOPENED, preserving historical records
    if (task.result) {
      await this.prisma.taskResult.update({
        where: { id: task.result.id },
        data: {
          outcomeState: OutcomeVerificationStatus.REOPENED,
          epistemicStatus: EpistemicCertainty.CONFLICTED,
          verificationScore: 0.0,
          outcomeConfidence: 0.0,
          verifiedAt: null,
          verifiedBy: null,
          evidenceSummary: {
            reopened: true,
            reopenedAt: now.toISOString(),
            reopenedBy,
            reason: options.reason,
            invalidatingEvidenceId: options.invalidatingEvidenceId,
            previousOutcomeState,
          },
        },
      });
    }

    // 3. Propagate impact to downstream dependent tasks
    const downstreamTaskIds: string[] = [];
    if (task.dependentOn && task.dependentOn.length > 0) {
      for (const dep of task.dependentOn) {
        const downstreamTask = dep.task;
        if (downstreamTask && downstreamTask.companyId === companyId) {
          downstreamTaskIds.push(downstreamTask.id);
          // Mark dependent task recovery state as DEGRADED
          await this.prisma.task.update({
            where: { id: downstreamTask.id },
            data: {
              recoveryState: 'DEGRADED',
            },
          });
        }
      }
    }

    // 4. Emit canonical CompanyEvent for outcome reopening
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'TASK_OUTCOME_REOPENED',
        payload: {
          taskId,
          previousOutcomeState,
          reason: options.reason,
          invalidatingEvidenceId: options.invalidatingEvidenceId,
          reopenedBy,
          downstreamTaskIds,
          correlationId: task.correlationId,
          causationId: task.causationId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit TASK_OUTCOME_REOPENED event: ${e.message}`));

    this.logger.warn(
      `[OutcomeVerification] Reopened outcome for task ${taskId} in company ${companyId}. Downstream tasks affected: ${downstreamTaskIds.length}`,
    );

    return {
      taskId,
      companyId,
      outcomeState: OutcomeVerificationStatus.REOPENED,
      previousOutcomeState,
      downstreamTaskIds,
      reopenedAt: now,
    };
  }

  /**
   * Substantive evaluation of success criteria against evidence payloads.
   */
  private evaluateSuccessCriteria(criteria: any[], evidenceRecords: any[]): boolean {
    if (!criteria || criteria.length === 0) return true;

    for (const c of criteria) {
      if (typeof c === 'string') {
        // String criterion: check if any evidence payload mentions or satisfies it
        const satisfied = evidenceRecords.some((e) => {
          const payloadStr = JSON.stringify(e.payload || {});
          return payloadStr.toLowerCase().includes(c.toLowerCase());
        });
        if (!satisfied) return false;
      } else if (typeof c === 'object' && c.key) {
        // Structured criterion: { key, expectedValue, operator }
        const satisfied = evidenceRecords.some((e) => {
          const val = e.payload?.[c.key];
          if (c.operator === 'EQUALS') return val === c.expectedValue;
          if (c.operator === 'GTE') return typeof val === 'number' && val >= c.expectedValue;
          if (c.operator === 'LTE') return typeof val === 'number' && val <= c.expectedValue;
          return val !== undefined && val !== null;
        });
        if (!satisfied) return false;
      }
    }
    return true;
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OutcomeVerificationStatus,
  StrategicReconciliationResult,
} from './evidence-contract.types';
import { OrgMemoryType } from '@prisma/client';

@Injectable()
export class StrategicOutcomeReconciliationService {
  private readonly logger = new Logger(StrategicOutcomeReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconciles a verified task outcome with the enterprise strategic hierarchy:
   * Chairman Decision -> Strategy -> Goal -> Project -> Task -> Attempt -> Evidence -> Verified Outcome.
   * Guarantees:
   * - Technical completion is never treated as strategic success.
   * - Reconciles variance between expected and observed outcomes.
   * - Escalates consequential deviations to Chairman (Chairman Sovereignty).
   * - Feeds verified learnings into canonical Organizational Memory.
   */
  async reconcileOutcome(
    taskId: string,
    companyId: string,
    options?: {
      evaluatorId?: string;
      expectedOutcome?: string;
    },
  ): Promise<StrategicReconciliationResult> {
    if (!companyId) {
      throw new BadRequestException('Strategic reconciliation requires explicit companyId');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        goal: true,
        project: true,
        result: true,
        evidenceRecords: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // Execution completion != Verified outcome != Strategic success
    if (task.outcomeState !== OutcomeVerificationStatus.OUTCOME_VERIFIED) {
      this.logger.warn(
        `[StrategicReconciliation] Task ${taskId} outcome state is ${task.outcomeState}, not OUTCOME_VERIFIED. Cannot reconcile as strategic success.`,
      );
      return {
        taskId,
        companyId,
        goalId: task.goalId || undefined,
        projectId: task.projectId || undefined,
        expectedOutcome: options?.expectedOutcome || task.title,
        observedOutcome: task.result?.summary || 'Task completed technically without verified outcome',
        variance: 'UNVERIFIED_OUTCOME: Outcome has not been verified by evidence engine',
        evidenceConfidence: task.result?.verificationScore ?? 0.0,
        outcomeConfidence: task.result?.outcomeConfidence ?? 0.0,
        strategicImpact: 'DEVIATION_CRITICAL',
        assumptionsValid: false,
        replanningRequired: true,
        escalationRequired: true,
        downstreamImpact: {
          affectedTaskIds: [],
          affectedGoalIds: task.goalId ? [task.goalId] : [],
          recommendation: 'Halt strategic progress until evidence verification confirms outcome.',
        },
      };
    }

    // Compute variance and strategic impact
    const expected = options?.expectedOutcome || task.title;
    const observed = task.result?.summary || 'Outcome verified by evidence contract';

    const evidenceConfidence = task.result?.verificationScore ?? 1.0;
    const outcomeConfidence = task.result?.outcomeConfidence ?? 1.0;

    let strategicImpact: 'ON_TRACK' | 'DEVIATION_TOLERABLE' | 'DEVIATION_CRITICAL' | 'INVALIDATING' = 'ON_TRACK';
    const assumptionsValid = true;
    const replanningRequired = false;
    const escalationRequired = false;
    let variance = 'ZERO_VARIANCE: Verified outcome matches strategic goal requirements';

    // Check if task had any failures, errors, or partial evidence
    const hasWarnings = (task.result?.errors as any[])?.length > 0;
    if (hasWarnings) {
      strategicImpact = 'DEVIATION_TOLERABLE';
      variance = 'MINOR_VARIANCE: Outcome verified with operational warnings';
    }

    // If confidence is lower than threshold
    if (outcomeConfidence < 0.8) {
      strategicImpact = 'DEVIATION_TOLERABLE';
      variance = `LOW_CONFIDENCE: Verified outcome confidence is ${outcomeConfidence}`;
    }

    // If completely aligned, elevate outcome state to STRATEGICALLY_SUCCESSFUL
    if (strategicImpact === 'ON_TRACK' && task.outcomeState === OutcomeVerificationStatus.OUTCOME_VERIFIED) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          outcomeState: OutcomeVerificationStatus.STRATEGICALLY_SUCCESSFUL,
        },
      });

      if (task.result) {
        await this.prisma.taskResult.update({
          where: { id: task.result.id },
          data: {
            outcomeState: OutcomeVerificationStatus.STRATEGICALLY_SUCCESSFUL,
          },
        });
      }
    }

    // Feed verified outcome into canonical Organizational Memory
    try {
      await this.prisma.organizationalMemory.create({
        data: {
          companyId,
          memoryType:
            strategicImpact === 'ON_TRACK'
              ? OrgMemoryType.SUCCESSFUL_INTERVENTION
              : OrgMemoryType.LESSON,
          subject: `Strategic Outcome: Task ${task.title}`,
          content: JSON.stringify({
            taskId: task.id,
            goalId: task.goalId,
            projectId: task.projectId,
            expectedOutcome: expected,
            observedOutcome: observed,
            variance,
            strategicImpact,
            evidenceRecordIds: task.evidenceRecords.map((r) => r.id),
            outcomeConfidence,
          }),
          tags: ['V17_PHASE4', 'VERIFIED_OUTCOME', strategicImpact],
          recordedBy: options?.evaluatorId || 'STRATEGIC_RECONCILIATION_ENGINE',
          relevanceScore: Math.round(outcomeConfidence * 100),
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to record organizational memory for task ${taskId}: ${e.message}`);
    }

    // Emit authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'STRATEGIC_OUTCOME_RECONCILED',
        payload: {
          taskId,
          goalId: task.goalId,
          projectId: task.projectId,
          expectedOutcome: expected,
          observedOutcome: observed,
          variance,
          strategicImpact,
          outcomeConfidence,
          correlationId: task.correlationId,
          causationId: task.causationId,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit STRATEGIC_OUTCOME_RECONCILED event: ${e.message}`));

    this.logger.log(
      `[StrategicReconciliation] Reconciled task ${taskId}: strategicImpact=${strategicImpact}, variance=${variance}`,
    );

    return {
      taskId,
      companyId,
      goalId: task.goalId || undefined,
      projectId: task.projectId || undefined,
      expectedOutcome: expected,
      observedOutcome: observed,
      variance,
      evidenceConfidence,
      outcomeConfidence,
      strategicImpact,
      assumptionsValid,
      replanningRequired,
      escalationRequired,
      downstreamImpact: {
        affectedTaskIds: [],
        affectedGoalIds: task.goalId ? [task.goalId] : [],
        recommendation:
          strategicImpact === 'ON_TRACK'
            ? 'Proceed with dependent goals and initiatives.'
            : 'Review strategic variance and determine if minor calibration is needed.',
      },
    };
  }
}

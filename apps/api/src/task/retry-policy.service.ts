import { Injectable, Logger } from '@nestjs/common';
import { AttemptFailureType, TaskPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RetryDecision {
  isRetryable: boolean;
  delayMs: number;
  nextRetryAt: Date | null;
  requiresReassignment: boolean;
  requiresEscalation: boolean;
  escalationTarget?: 'DEPARTMENT_LEADER' | 'CEO' | 'CHAIRMAN' | 'GOVERNANCE';
  reason: string;
}

export interface RetryEvaluationContext {
  taskId: string;
  companyId: string;
  failureType: AttemptFailureType;
  currentRetryCount: number;
  maxRetries: number;
  riskTier?: string;
  priority?: TaskPriority | string;
  errorMessage?: string;
  workerId?: string;
  isConsequential?: boolean;
}

export interface FailureImpactAnalysis {
  taskId: string;
  companyId: string;
  failureType: AttemptFailureType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  downstreamBlockedTasksCount: number;
  workstreamId?: string | null;
  departmentId?: string | null;
  immediateImpact: string;
  downstreamImpact: string;
  requiresEscalation: boolean;
  escalationTarget?: 'DEPARTMENT_LEADER' | 'CEO' | 'CHAIRMAN' | 'GOVERNANCE';
  reassignmentRecommended: boolean;
}

@Injectable()
export class RetryPolicyService {
  private readonly logger = new Logger(RetryPolicyService.name);

  // Default retry configurations
  private readonly defaultBaseDelayMs = 1000;
  private readonly defaultMaxDelayMs = 60000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministically evaluates whether a failed execution attempt can be retried,
   * calculates bounded exponential backoff delay, and determines if worker reassignment
   * or governance escalation is required.
   */
  evaluateRetry(context: RetryEvaluationContext): RetryDecision {
    const {
      taskId,
      failureType,
      currentRetryCount,
      maxRetries,
      riskTier = 'LOW',
      isConsequential = false,
    } = context;

    // Constitutional safety & authority rules: Never automatically retry safety or authority failures.
    if (failureType === AttemptFailureType.SAFETY_FAILURE) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget: 'CHAIRMAN',
        reason: 'Constitutional safety policy violation. Automatic retries prohibited. Escalate to Chairman/Governance.',
      };
    }

    if (failureType === AttemptFailureType.AUTHORITY_FAILURE) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget: 'CEO',
        reason: 'Execution authority exceeded or missing required permissions. Escalate to CEO.',
      };
    }

    // Validation failures indicate malformed work or specification bugs - repair/replan needed
    if (failureType === AttemptFailureType.VALIDATION_FAILURE) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget: 'DEPARTMENT_LEADER',
        reason: 'Validation failure: Work product or inputs malformed. Requires repair or replanning.',
      };
    }

    // Dependency failures cannot be retried until upstream dependency DAG completes
    if (failureType === AttemptFailureType.DEPENDENCY_FAILURE) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: false,
        reason: 'Blocked by prerequisite task dependency. Waits for DAG dependency recovery.',
      };
    }

    // External action failures must respect External Action Gateway recovery semantics
    if (failureType === AttemptFailureType.EXTERNAL_ACTION_FAILURE) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget: 'CEO',
        reason: 'External action failed. Route through External Action Gateway safeguards. Blind replay prohibited.',
      };
    }

    // Consequential tasks in HIGH / CRITICAL risk tiers require CEO approval rather than blind retry
    if (isConsequential && (riskTier === 'HIGH' || riskTier === 'CRITICAL')) {
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget: 'CEO',
        reason: 'Consequential high-risk task failure. Blind retry prohibited by Consequence Policy.',
      };
    }

    // Capability mismatch: Retryable ONLY with worker reassignment to another qualified AI agent
    if (failureType === AttemptFailureType.CAPABILITY_FAILURE) {
      if (currentRetryCount >= maxRetries) {
        return {
          isRetryable: false,
          delayMs: 0,
          nextRetryAt: null,
          requiresReassignment: true,
          requiresEscalation: true,
          escalationTarget: 'DEPARTMENT_LEADER',
          reason: `Capability mismatch retry budget exhausted (${currentRetryCount}/${maxRetries}). Escalate to Department Leader.`,
        };
      }

      const delayMs = this.calculateBackoff(currentRetryCount, taskId, 2000);
      return {
        isRetryable: true,
        delayMs,
        nextRetryAt: new Date(Date.now() + delayMs),
        requiresReassignment: true,
        requiresEscalation: false,
        reason: 'Capability mismatch: Reassigning task to a different qualified AI agent.',
      };
    }

    // Check retry budget for TRANSIENT, TIMEOUT, RESOURCE_EXHAUSTION, CONFLICT, UNEXPECTED
    if (currentRetryCount >= maxRetries) {
      const escalationTarget = currentRetryCount >= 3 ? 'CEO' : 'DEPARTMENT_LEADER';
      return {
        isRetryable: false,
        delayMs: 0,
        nextRetryAt: null,
        requiresReassignment: false,
        requiresEscalation: true,
        escalationTarget,
        reason: `Retry budget exhausted (${currentRetryCount}/${maxRetries}). Escalate to ${escalationTarget}.`,
      };
    }

    // Resource exhaustion uses a slightly longer backoff to allow resource recovery
    const baseDelay = failureType === AttemptFailureType.RESOURCE_EXHAUSTION ? 5000 : this.defaultBaseDelayMs;
    const delayMs = this.calculateBackoff(currentRetryCount, taskId, baseDelay);
    const nextRetryAt = new Date(Date.now() + delayMs);

    // If worker repeatedly fails (> 1 time) even on transient/timeout, recommend reassignment
    const requiresReassignment = currentRetryCount >= 2;

    return {
      isRetryable: true,
      delayMs,
      nextRetryAt,
      requiresReassignment,
      requiresEscalation: false,
      reason: `Eligible for retry (${currentRetryCount + 1}/${maxRetries}) after ${Math.round(delayMs)}ms backoff.`,
    };
  }

  /**
   * Calculates bounded exponential backoff with deterministic jitter.
   * attempt 0: baseDelay * 1
   * attempt 1: baseDelay * 2
   * attempt 2: baseDelay * 4
   * attempt 3: baseDelay * 8
   */
  calculateBackoff(attemptIndex: number, seedString: string, baseDelayMs: number = this.defaultBaseDelayMs): number {
    const rawMultiplier = Math.pow(2, Math.max(0, attemptIndex));
    const rawDelay = baseDelayMs * rawMultiplier;
    const boundedDelay = Math.min(this.defaultMaxDelayMs, rawDelay);

    // Deterministic jitter between 0 and 500ms based on string hash to prevent retry storms
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      hash = (hash << 5) - hash + seedString.charCodeAt(i);
      hash |= 0;
    }
    const jitter = Math.abs(hash) % 500;

    return boundedDelay + jitter;
  }

  /**
   * Analyzes the downstream, workstream, and department impact of a task failure.
   */
  async analyzeFailureImpact(taskId: string, companyId: string, failureType: AttemptFailureType): Promise<FailureImpactAnalysis> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        department: true,
        workstream: true,
      },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found in company ${companyId}`);
    }

    // Trace downstream blocked tasks via TaskDependency
    const downstreamDeps = await this.prisma.taskDependency.findMany({
      where: { dependsOnId: taskId },
    });
    const downstreamCount = downstreamDeps.length;

    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let requiresEscalation = false;
    let escalationTarget: 'DEPARTMENT_LEADER' | 'CEO' | 'CHAIRMAN' | 'GOVERNANCE' | undefined;

    if (failureType === AttemptFailureType.SAFETY_FAILURE) {
      severity = 'CRITICAL';
      requiresEscalation = true;
      escalationTarget = 'CHAIRMAN';
    } else if (failureType === AttemptFailureType.AUTHORITY_FAILURE) {
      severity = 'HIGH';
      requiresEscalation = true;
      escalationTarget = 'CEO';
    } else if (downstreamCount >= 5 || task.priority === TaskPriority.URGENT) {
      severity = 'HIGH';
      requiresEscalation = true;
      escalationTarget = 'DEPARTMENT_LEADER';
    } else if (downstreamCount > 0 || task.priority === TaskPriority.HIGH) {
      severity = 'MEDIUM';
    }

    const immediateImpact = `Task "${task.title}" failed with ${failureType}`;
    const downstreamImpact = downstreamCount > 0
      ? `${downstreamCount} downstream tasks directly blocked`
      : 'No downstream dependent tasks impacted';

    return {
      taskId,
      companyId,
      failureType,
      severity,
      downstreamBlockedTasksCount: downstreamCount,
      workstreamId: task.workstreamId,
      departmentId: task.departmentId,
      immediateImpact,
      downstreamImpact,
      requiresEscalation,
      escalationTarget,
      reassignmentRecommended: failureType === AttemptFailureType.CAPABILITY_FAILURE,
    };
  }
}

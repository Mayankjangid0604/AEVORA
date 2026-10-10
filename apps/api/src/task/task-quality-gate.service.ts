import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Task, CompanyStatus, EmployeeStatus } from '@prisma/client';

export interface QualityGateEvaluationResult {
  passed: boolean;
  reasons: string[];
  blockers: string[];
  sanitizedTask?: Partial<Task>;
}

@Injectable()
export class TaskQualityGateService {
  private readonly logger = new Logger(TaskQualityGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates whether a task satisfies the canonical V17 quality gate to enter READY state.
   * Incomplete or unsafe high-risk tasks are prevented from entering autonomous execution.
   */
  async evaluateTask(taskId: string, companyId: string): Promise<QualityGateEvaluationResult> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        company: true,
        dependencies: {
          include: { dependsOn: true },
        },
      },
    });

    if (!task) {
      return {
        passed: false,
        reasons: ['Task not found in company'],
        blockers: [`Task ${taskId} not found for company ${companyId}`],
      };
    }

    const reasons: string[] = [];
    const blockers: string[] = [];

    // 1. Company Status Check
    if (task.company.status !== CompanyStatus.ACTIVE) {
      blockers.push(`Company is in status ${task.company.status}; autonomous execution is disabled`);
    } else {
      reasons.push('Company is ACTIVE');
    }

    // 2. Title & Objective Check
    if (!task.title || task.title.trim().length < 3) {
      blockers.push('Task title is too short or missing (< 3 chars)');
    } else {
      reasons.push('Valid task title and objective');
    }

    // 3. Assigned Worker Validity Check (if pre-assigned)
    if (task.assignedEmployeeId) {
      const assignedWorker = await this.prisma.employee.findFirst({
        where: { id: task.assignedEmployeeId, companyId },
      });
      if (!assignedWorker || assignedWorker.status !== EmployeeStatus.ACTIVE) {
        blockers.push(`Assigned worker ${task.assignedEmployeeId} is invalid or not ACTIVE in company`);
      } else {
        reasons.push(`Assigned worker ${assignedWorker.name} verified in company`);
      }
    }

    // 4. Dependencies Verification
    const unfinishedDeps = task.dependencies.filter(
      (dep) => dep.dependsOn.status !== 'COMPLETED',
    );
    if (unfinishedDeps.length > 0) {
      blockers.push(
        `Task has ${unfinishedDeps.length} incomplete prerequisite dependencies (${unfinishedDeps.map((d) => d.dependsOn.title).join(', ')})`,
      );
    } else {
      reasons.push('All prerequisite dependencies completed');
    }

    // 5. Success & Evidence Criteria (Backward compatible defaults for legacy tasks)
    const successCriteria = Array.isArray(task.successCriteria) && (task.successCriteria as any[]).length > 0
      ? (task.successCriteria as any[])
      : ['Execution completed without error output'];

    const evidenceRequirements = Array.isArray(task.evidenceRequirements) && (task.evidenceRequirements as any[]).length > 0
      ? (task.evidenceRequirements as any[])
      : ['Execution output summary and status'];

    // 6. Risk Tier Validation
    const isHighOrCritical = task.riskTier === 'HIGH' || task.riskTier === 'CRITICAL';
    if (isHighOrCritical && (!task.description || task.description.length < 10)) {
      blockers.push('HIGH or CRITICAL risk task requires a detailed description with operational parameters');
    }

    const passed = blockers.length === 0;

    if (passed) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          qualityGatePassed: true,
          successCriteria,
          evidenceRequirements,
        },
      });
      this.logger.log(`[TaskQualityGate] Task ${taskId} PASSED quality gate.`);
    } else {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          qualityGatePassed: false,
        },
      });
      this.logger.warn(`[TaskQualityGate] Task ${taskId} FAILED quality gate: ${blockers.join('; ')}`);
    }

    return {
      passed,
      reasons,
      blockers,
    };
  }
}

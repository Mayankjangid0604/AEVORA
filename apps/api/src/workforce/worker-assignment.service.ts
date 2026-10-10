import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, EmployeeAvailability, WorkerType, TaskPriority } from '@prisma/client';

export interface WorkerAssignmentCriteria {
  requiredCapability?: string | null;
  departmentId?: string | null;
  priority?: TaskPriority | string;
  excludeEmployeeIds?: string[];
}

export interface CandidateEvaluation {
  employeeId: string;
  agentId: string;
  name: string;
  score: number;
  activeWorkload: number;
  reliability: number;
  performance: number;
  matchReasons: string[];
}

export interface WorkerAssignmentResult {
  assignedEmployeeId: string;
  agentId: string;
  workerName: string;
  departmentId?: string;
  departmentName?: string;
  score: number;
  matchReasons: string[];
}

@Injectable()
export class WorkerAssignmentService {
  private readonly logger = new Logger(WorkerAssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Selects an authoritative, company-scoped AI workforce agent to execute a task.
   * NEVER uses employee.findFirst() or arbitrary fallback workers.
   */
  async findBestWorker(
    companyId: string,
    criteria: WorkerAssignmentCriteria,
  ): Promise<WorkerAssignmentResult | null> {
    if (!companyId) {
      throw new BadRequestException('Worker assignment requires explicit companyId attribution');
    }

    // 1. Fetch all ACTIVE AI workforce candidates strictly within companyId
    const candidates = await this.prisma.employee.findMany({
      where: {
        companyId,
        status: EmployeeStatus.ACTIVE,
        availability: {
          notIn: [EmployeeAvailability.SUSPENDED, EmployeeAvailability.ON_HOLD, EmployeeAvailability.OFFLINE],
        },
        id: criteria.excludeEmployeeIds?.length ? { notIn: criteria.excludeEmployeeIds } : undefined,
      },
      include: {
        skills: true,
        role: true,
        department: true,
        agent: true,
        workerProfile: true,
        assignedTasks: {
          where: { status: 'IN_PROGRESS' },
          select: { id: true },
        },
      },
    });

    if (!candidates || candidates.length === 0) {
      this.logger.warn(`[WorkerAssignment] No active workforce candidates found for company ${companyId}`);
      return null;
    }

    const evaluations: CandidateEvaluation[] = [];

    for (const cand of candidates) {
      // Constitutional verification: Chairman is sole human, workforce is AI-only.
      // Guarantee worker profile reflects AI agent status
      if (cand.workerProfile && cand.workerProfile.workerType === WorkerType.HUMAN) {
        // Enforce AI worker profile
        await this.prisma.workerProfile.update({
          where: { id: cand.workerProfile.id },
          data: { workerType: WorkerType.AI_AGENT },
        }).catch((e) => this.logger.warn(`Failed to update workerType for ${cand.id}: ${e.message}`));
      }

      let score = 50; // Baseline candidate score
      const matchReasons: string[] = ['Active AI workforce member'];

      // 1. Department affinity (+25 if department matches task)
      if (criteria.departmentId && cand.departmentId === criteria.departmentId) {
        score += 25;
        matchReasons.push(`Department match (${cand.department?.name || cand.departmentId})`);
      }

      // 2. Capability / Skill match
      const reqCap = (criteria.requiredCapability || '').trim().toUpperCase();
      if (reqCap && reqCap !== 'GENERIC') {
        const hasSkill = cand.skills.some((s) => s.name.toUpperCase().includes(reqCap));
        const hasRoleTitle = cand.role.title.toUpperCase().includes(reqCap);
        const hasPermissions = Array.isArray(cand.role.permissions) &&
          cand.role.permissions.some((p: any) => String(p).toUpperCase().includes(reqCap));

        if (hasSkill || hasRoleTitle || hasPermissions) {
          score += 40;
          matchReasons.push(`Direct capability/role match for ${reqCap}`);
        } else {
          // If a specific capability was explicitly requested but candidate lacks it, penalize
          score -= 30;
        }
      }

      // 3. Workload capacity (-10 per currently IN_PROGRESS task)
      const activeWorkload = cand.assignedTasks.length;
      score -= activeWorkload * 10;
      if (activeWorkload === 0) {
        score += 15;
        matchReasons.push('Zero active workload');
      } else {
        matchReasons.push(`Active workload: ${activeWorkload} tasks`);
      }

      // 4. Competency metrics (Reliability and Performance: 0-100)
      const reliabilityScore = cand.reliability ?? 50;
      const performanceScore = cand.performance ?? 50;
      score += Math.round(reliabilityScore * 0.15);
      score += Math.round(performanceScore * 0.15);

      // 5. Activity status (+10 if currently IDLE)
      if (cand.activity === 'IDLE') {
        score += 10;
        matchReasons.push('Agent activity is IDLE');
      }

      const agentId = cand.agent?.id || `agent_${cand.id}`;

      evaluations.push({
        employeeId: cand.id,
        agentId,
        name: cand.name,
        score,
        activeWorkload,
        reliability: reliabilityScore,
        performance: performanceScore,
        matchReasons,
      });
    }

    // Sort candidates by total score descending
    evaluations.sort((a, b) => b.score - a.score);

    const best = evaluations[0];
    if (!best || best.score <= 0) {
      this.logger.warn(
        `[WorkerAssignment] No qualified candidate met threshold for company ${companyId}. Top score: ${best?.score}`,
      );
      return null;
    }

    const chosenCand = candidates.find((c) => c.id === best.employeeId)!;

    this.logger.log(
      `[WorkerAssignment] Selected worker ${best.name} (${best.employeeId}) for company ${companyId} with score ${best.score}`,
    );

    return {
      assignedEmployeeId: chosenCand.id,
      agentId: best.agentId,
      workerName: chosenCand.name,
      departmentId: chosenCand.departmentId,
      departmentName: chosenCand.department?.name,
      score: best.score,
      matchReasons: best.matchReasons,
    };
  }

  /**
   * Assigns an active AI worker to a task, strictly company-scoped.
   * Supports failure-aware reassignment by excluding specified employee IDs.
   */
  async assignTask(
    taskId: string,
    companyId: string,
    options?: { excludeEmployeeIds?: string[] },
  ): Promise<WorkerAssignmentResult> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // If already assigned to an ACTIVE employee in the same company, verify (unless excluded for reassignment)
    if (task.assignedEmployeeId && !options?.excludeEmployeeIds?.includes(task.assignedEmployeeId)) {
      const existing = await this.prisma.employee.findFirst({
        where: { id: task.assignedEmployeeId, companyId, status: EmployeeStatus.ACTIVE },
        include: { agent: true, department: true },
      });
      if (existing) {
        return {
          assignedEmployeeId: existing.id,
          agentId: existing.agent?.id || `agent_${existing.id}`,
          workerName: existing.name,
          departmentId: existing.departmentId,
          departmentName: existing.department?.name,
          score: 100,
          matchReasons: ['Pre-assigned existing active worker in company'],
        };
      }
    }

    // Find best candidate
    const assignment = await this.findBestWorker(companyId, {
      requiredCapability: task.requiredCapability,
      departmentId: task.departmentId,
      priority: task.priority,
      excludeEmployeeIds: options?.excludeEmployeeIds,
    });

    if (!assignment) {
      throw new NotFoundException(
        `Unable to assign worker for task ${taskId}: no qualified AI agent available in company ${companyId} for capability "${task.requiredCapability || 'ANY'}"`,
      );
    }

    // Persist assignment
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assignedEmployeeId: assignment.assignedEmployeeId,
      },
    });

    return assignment;
  }
}

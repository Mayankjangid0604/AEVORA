import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskService } from '../task/task.service';
import { TaskPriority } from '@prisma/client';

import { KnowledgeExtractionService } from '../knowledge/knowledge-extraction.service';

@Injectable()
export class ProjectExecutionService {
  private readonly logger = new Logger(ProjectExecutionService.name);
  constructor(
    private prisma: PrismaService,
    private taskService: TaskService,
    private knowledgeExtraction: KnowledgeExtractionService
  ) {}

  // ── Requirements ──────────────────────────────────────────────────────────
  async getRequirements(projectId: string) {
    return this.prisma.projectRequirement.findMany({ where: { projectId } });
  }

  async createRequirement(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const req = await this.prisma.projectRequirement.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        priority: data.priority || 'NORMAL',
        acceptanceCriteria: data.acceptanceCriteria,
        source: data.source
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_REQUIREMENT_CREATED', { requirementId: req.id, title: req.title });
    return req;
  }

  async updateRequirement(id: string, data: any) {
    return this.prisma.projectRequirement.update({ where: { id }, data });
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  async getPlans(projectId: string) {
    return this.prisma.projectPlan.findMany({ where: { projectId } });
  }

  async createPlan(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const plan = await this.prisma.projectPlan.create({
      data: {
        projectId,
        summary: data.summary,
        assumptions: data.assumptions,
        risks: data.risks,
        estimatedDuration: data.estimatedDuration,
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_PLAN_CREATED', { planId: plan.id });
    return plan;
  }

  async approvePlan(id: string) {
    // AI may NOT call this — only Chairman/ops via API
    const plan = await this.prisma.projectPlan.update({
      where: { id },
      data: { status: 'APPROVED' }
    });
    const project = await this.prisma.project.findUnique({ where: { id: plan.projectId } });
    if (project) {
      await this.emitProjectEvent(project.companyId, plan.projectId, 'PROJECT_PLAN_APPROVED', { planId: id });
    }
    return plan;
  }

  // ── Milestones ────────────────────────────────────────────────────────────
  async getMilestones(projectId: string) {
    return this.prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sequence: 'asc' } });
  }

  async createMilestone(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const milestone = await this.prisma.projectMilestone.create({
      data: {
        projectId,
        name: data.name,
        description: data.description,
        sequence: data.sequence ?? 0,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_MILESTONE_CREATED', { milestoneId: milestone.id, name: milestone.name });
    return milestone;
  }

  async updateMilestone(id: string, data: any) {
    return this.prisma.projectMilestone.update({ where: { id }, data });
  }

  // ── Risks ─────────────────────────────────────────────────────────────────
  async getRisks(projectId: string) {
    return this.prisma.projectRisk.findMany({ where: { projectId } });
  }

  async createRisk(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // severity = deterministic: floor((probability * impact) / 100)
    const probability = data.probability ?? 50;
    const impact = data.impact ?? 50;
    const severity = Math.floor((probability * impact) / 100);

    const risk = await this.prisma.projectRisk.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        probability,
        impact,
        severity,
        mitigation: data.mitigation
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_RISK_CREATED', { riskId: risk.id, title: risk.title, severity });
    return risk;
  }

  async updateRisk(id: string, data: any) {
    return this.prisma.projectRisk.update({ where: { id }, data });
  }

  // ── Staffing ──────────────────────────────────────────────────────────────
  async getTeam(projectId: string) {
    return this.prisma.projectAssignment.findMany({ where: { projectId }, include: { employee: { include: { skills: true } } } });
  }

  /**
   * Validates staffing proposal deterministically before persisting.
   * The AI may propose; this domain method decides if it is valid.
   */
  async proposeStaffing(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { skills: true }
    });

    // Guard: employee must exist and belong to the same company
    if (!employee || employee.companyId !== project.companyId) {
      throw new BadRequestException('Employee not found or belongs to a different company');
    }

    // Guard: employee must be active
    if (!['ACTIVE'].includes(employee.status)) {
      throw new BadRequestException(`Employee ${employee.name} is not active (status: ${employee.status})`);
    }

    // Guard: allocation cap enforcement (strictly deterministic)
    const requestedAllocation = data.allocation ?? 100;
    if (requestedAllocation < 1 || requestedAllocation > 100) {
      throw new BadRequestException('Allocation must be between 1 and 100');
    }
    const existing = await this.prisma.projectAssignment.findMany({
      where: { employeeId: data.employeeId, status: 'ACTIVE' }
    });
    const currentAlloc = existing.reduce((sum, a) => sum + a.allocation, 0);
    if (currentAlloc + requestedAllocation > 100) {
      throw new BadRequestException(`Employee allocation would exceed 100% (current: ${currentAlloc}%, requested: ${requestedAllocation}%)`);
    }

    const assignment = await this.prisma.projectAssignment.create({
      data: {
        projectId,
        employeeId: data.employeeId,
        role: data.role || 'Contributor',
        allocation: requestedAllocation,
        status: 'PROPOSED'
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_STAFF_PROPOSED', { employeeId: data.employeeId, role: assignment.role, allocation: requestedAllocation });
    return assignment;
  }

  async activateAssignment(id: string) {
    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { id },
      include: { project: true }
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status !== 'PROPOSED') throw new BadRequestException('Only PROPOSED assignments can be activated');

    const updated = await this.prisma.projectAssignment.update({
      where: { id },
      data: { status: 'ACTIVE' }
    });

    await this.emitProjectEvent(assignment.project.companyId, assignment.projectId, 'PROJECT_STAFF_ASSIGNED', { employeeId: assignment.employeeId });
    return updated;
  }

  async releaseAssignment(id: string) {
    const assignment = await this.prisma.projectAssignment.findUnique({ where: { id }, include: { project: true } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.prisma.projectAssignment.update({
      where: { id },
      data: { status: 'RELEASED', releasedAt: new Date() }
    });
  }

  // ── Project Tasks (routed through TaskService) ────────────────────────────
  /**
   * Create a project task through the authoritative TaskService.
   * Validates companyId/projectId boundary before delegating.
   */
  async createProjectTask(companyId: string, projectId: string, data: any, createdBy: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.companyId !== companyId) {
      throw new BadRequestException('Project does not belong to the specified company');
    }

    // Route through TaskService — never insert directly
    const task = await this.taskService.createTask({
      companyId,
      createdBy,
      title: data.title,
      description: data.description,
      assignedEmployeeId: data.assignedEmployeeId,
      priority: data.priority as TaskPriority,
      estimatedEffort: data.estimatedEffort,
      dependencies: data.dependencies || []
    });

    // Stamp projectId after creation
    const projectTask = await this.prisma.task.update({
      where: { id: task.id },
      data: { projectId }
    });

    await this.emitProjectEvent(companyId, projectId, 'PROJECT_TASK_CREATED', { taskId: projectTask.id, title: projectTask.title, assignedTo: data.assignedEmployeeId });
    return projectTask;
  }

  // ── Task Review ───────────────────────────────────────────────────────────
  async submitTaskForReview(taskId: string, companyId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.companyId !== companyId) throw new BadRequestException('Cross-company access denied');
    if (task.status !== 'IN_PROGRESS') throw new BadRequestException('Task must be IN_PROGRESS to submit for review');

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'REVIEW' }
    });
    if (task.projectId) {
      await this.emitProjectEvent(companyId, task.projectId, 'PROJECT_TASK_SUBMITTED_FOR_REVIEW', { taskId });
    }
    return updated;
  }

  async reviewTask(taskId: string, reviewerId: string, decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED', feedback: string | undefined, companyId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.companyId !== companyId) throw new BadRequestException('Cross-company access denied');
    if (task.status !== 'REVIEW') throw new BadRequestException('Task is not in REVIEW status');

    const reviewer = await this.prisma.employee.findUnique({ where: { id: reviewerId } });
    if (!reviewer || reviewer.companyId !== companyId) throw new BadRequestException('Reviewer not found or cross-company');

    const review = await this.prisma.taskReview.create({
      data: { taskId, reviewerId, decision, feedback }
    });

    let newStatus: string;
    if (decision === 'APPROVED') {
      newStatus = 'COMPLETED';
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() }
      });
      // Unlock dependencies
      await this.taskService.completeTask(taskId);
    } else {
      // CHANGES_REQUESTED or REJECTED → back to IN_PROGRESS
      newStatus = 'IN_PROGRESS';
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS' }
      });
    }

    if (task.projectId) {
      await this.emitProjectEvent(companyId, task.projectId, 'PROJECT_TASK_REVIEWED', { taskId, decision, reviewerId });
    }
    return { review, newStatus };
  }

  // ── Project Progress (deterministic) ─────────────────────────────────────
  async getProjectProgress(projectId: string) {
    const tasks = await this.prisma.task.findMany({ where: { projectId } });
    const requirements = await this.prisma.projectRequirement.findMany({ where: { projectId } });
    const milestones = await this.prisma.projectMilestone.findMany({ where: { projectId } });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const taskProgress = totalTasks > 0 ? Math.floor((completedTasks / totalTasks) * 100) : 0;

    const totalReqs = requirements.length;
    const satisfiedReqs = requirements.filter(r => r.status === 'SATISFIED').length;
    const reqProgress = totalReqs > 0 ? Math.floor((satisfiedReqs / totalReqs) * 100) : 0;

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.status === 'COMPLETED').length;
    const milestoneProgress = totalMilestones > 0 ? Math.floor((completedMilestones / totalMilestones) * 100) : 0;

    // Weighted overall: tasks=60%, requirements=30%, milestones=10%
    const overall = Math.floor((taskProgress * 0.6) + (reqProgress * 0.3) + (milestoneProgress * 0.1));

    return { taskProgress, reqProgress, milestoneProgress, overall, completedTasks, totalTasks };
  }

  // ── Project Delivery ──────────────────────────────────────────────────────
  async getDeliveries(projectId: string) {
    return this.prisma.projectDelivery.findMany({ where: { projectId } });
  }

  async createDelivery(projectId: string, data: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // Delivery requires actual build to have passed testing
    if (!data.buildId) {
      throw new BadRequestException('A build artifact is required to create a delivery');
    }

    const testExecution = await this.prisma.projectTestExecution.findFirst({
      where: { buildId: data.buildId, status: 'PASSED' }
    });

    if (!testExecution) {
      throw new BadRequestException('The build artifact must have passed automated testing before delivery');
    }

    const delivery = await this.prisma.projectDelivery.create({
      data: {
        projectId,
        buildId: data.buildId,
        summary: data.summary,
        deliverables: data.deliverables,
        version: data.version ?? 1
      }
    });

    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_DELIVERY_CREATED', { deliveryId: delivery.id, buildId: data.buildId });
    return delivery;
  }

  async clientAcceptDelivery(deliveryId: string, clientId: string, scope: string = 'Full Project') {
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      include: { project: true }
    });
    
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'READY_FOR_ACCEPTANCE') {
      throw new BadRequestException('Delivery must be READY_FOR_ACCEPTANCE before client can accept');
    }
    
    // Ensure the client actually owns this project
    if (delivery.project.clientId !== clientId) {
      throw new BadRequestException('Unauthorized: Client does not own this project');
    }

    // 1. Record CustomerAcceptance
    const acceptance = await this.prisma.customerAcceptance.create({
      data: {
        companyId: delivery.project.companyId,
        projectId: delivery.projectId,
        clientId,
        deliveryId,
        requestedById: (await this.prisma.employee.findFirst({ where: { companyId: delivery.project.companyId } })).id,
        customerActorId: clientId,
        scope,
        status: 'ACCEPTED',
        acceptedAt: new Date()
      }
    });

    // 2. Mark delivery accepted
    await this.prisma.projectDelivery.update({
      where: { id: deliveryId },
      data: { status: 'ACCEPTED', approvedAt: new Date() }
    });

    // 3. Mark project COMPLETED
    await this.prisma.project.update({
      where: { id: delivery.projectId },
      data: { status: 'COMPLETED' }
    });

    await this.emitProjectEvent(delivery.project.companyId, delivery.projectId, 'PROJECT_CLIENT_ACCEPTED', { deliveryId, acceptanceId: acceptance.id });
    
    // Hook into Knowledge Extraction
    try {
      await this.knowledgeExtraction.proposeKnowledgeFromSource(
        delivery.project.companyId,
        `Project ${delivery.project.name} accepted by client. Deliverables: ${delivery.deliverables}.`,
        {
          sourceType: 'PROJECT_DELIVERY',
          sourceId: delivery.id,
          projectId: delivery.project.id,
        }
      );
    } catch (err) {
      this.logger.error(`Failed to extract knowledge: ${err?.message ?? err}`);
    }

    return acceptance;
  }

  // Deprecated: Internal approval shouldn't mean client acceptance
  async approveDelivery(id: string) {
    throw new BadRequestException('approveDelivery is deprecated. Clients must accept deliveries via clientAcceptDelivery');
  }

  async markDelivered(id: string) {
    return this.prisma.projectDelivery.update({
      where: { id },
      data: { status: 'READY_FOR_ACCEPTANCE', deliveredAt: new Date() }
    });
  }

  // ── Project Lifecycle ─────────────────────────────────────────────────────
  async activateProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true, plans: true }
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== 'PLANNED') throw new BadRequestException('Project must be PLANNED to activate');
    if (project.plans.length === 0) throw new BadRequestException('Project requires at least one plan before activation');

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE', startDate: new Date() }
    });
    await this.emitProjectEvent(project.companyId, projectId, 'PROJECT_ACTIVATED', { projectId });
    return updated;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  private async emitProjectEvent(companyId: string, projectId: string, type: string, payload: object) {
    return this.prisma.companyEvent.create({
      data: { companyId, type, payload: { projectId, ...payload } }
    });
  }
}

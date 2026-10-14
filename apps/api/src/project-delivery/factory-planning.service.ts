import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskService } from '../task/task.service';
import { TaskPriority } from '@prisma/client';

@Injectable()
export class FactoryPlanningService {
  private readonly logger = new Logger(FactoryPlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
  ) {}

  /**
   * Generates a fully decomposed project plan with structured milestones,
   * prerequisite dependencies, and acceptance criteria.
   */
  async createDecomposedPlan(projectId: string, actorId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { requirements: true, company: true },
    });

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    // 1. Create or Find ProjectPlan
    let plan = await this.prisma.projectPlan.findFirst({
      where: { projectId },
    });

    if (!plan) {
      plan = await this.prisma.projectPlan.create({
        data: {
          projectId,
          summary: `Automated Delivery Factory Plan for ${project.name}`,
          assumptions: 'Local-only execution, verified tooling, quality gate compliance before delivery.',
          risks: 'Tool routing timeouts, build/test regressions, dependency conflicts.',
          estimatedDuration: 14, // 14 days
          status: 'APPROVED',
        },
      });
    }

    // 2. Define 4 Standard Factory Milestones
    const milestoneTemplates = [
      {
        sequence: 1,
        name: 'M1: Architecture & Foundation Scaffolding',
        description: 'Initialize workspace, configure dependencies, set up local structure and baseline configuration.',
        dueDays: 2,
        taskTitle: 'Foundation Scaffolding & Setup',
        taskDesc: 'Set up isolated workspace directory, dependency package structure, and verify local build configuration.',
      },
      {
        sequence: 2,
        name: 'M2: Feature Implementation & Logic Assembly',
        description: 'Implement core application features based on approved functional requirements.',
        dueDays: 7,
        taskTitle: 'Core Logic Implementation',
        taskDesc: 'Generate and implement verified source files satisfying project functional requirements.',
      },
      {
        sequence: 3,
        name: 'M3: Quality Verification & Security Hardening',
        description: 'Execute build, unit tests, static linting, type-checking, and credential leak security scan.',
        dueDays: 10,
        taskTitle: 'Quality & Security Verification',
        taskDesc: 'Run automated build and test orchestration, verify zero test failures, zero credential leaks, and 100% criteria coverage.',
      },
      {
        sequence: 4,
        name: 'M4: Deployment Readiness & Client Handover',
        description: 'Prepare preview deployment, generate client handover package, and verify acceptance criteria.',
        dueDays: 14,
        taskTitle: 'Deployment & Handover Preparation',
        taskDesc: 'Execute verified deployment adapter, assemble immutable delivery package, and prepare client acceptance review.',
      },
    ];

    const milestones = [];
    const tasks = [];
    let previousTaskId: string | null = null;

    const baseDate = new Date();

    for (const tpl of milestoneTemplates) {
      // Create or update milestone
      let milestone = await this.prisma.projectMilestone.findFirst({
        where: { projectId, sequence: tpl.sequence },
      });

      const dueAt = new Date(baseDate.getTime() + tpl.dueDays * 86400000);

      if (!milestone) {
        milestone = await this.prisma.projectMilestone.create({
          data: {
            projectId,
            name: tpl.name,
            description: tpl.description,
            sequence: tpl.sequence,
            dueAt,
            status: 'PLANNED',
          },
        });
      }
      milestones.push(milestone);

      // Create linked Task through TaskService
      const task = await this.taskService.createTask({
        companyId: project.companyId,
        createdBy: actorId,
        title: `[${project.name}] ${tpl.taskTitle}`,
        description: tpl.taskDesc,
        priority: TaskPriority.HIGH,
        estimatedEffort: 10,
        dependencies: previousTaskId ? [previousTaskId] : [],
      });

      // Stamp projectId onto task
      await this.prisma.task.update({
        where: { id: task.id },
        data: { projectId },
      });

      tasks.push(task);
      previousTaskId = task.id;
    }

    // 3. Mark project ACTIVE
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE', startDate: new Date() },
    });

    this.logger.log(`Generated decomposed plan for project ${projectId} with ${milestones.length} milestones and ${tasks.length} tasks`);

    return {
      plan,
      milestones,
      tasks,
    };
  }
}

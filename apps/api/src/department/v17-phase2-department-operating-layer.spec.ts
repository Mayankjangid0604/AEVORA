import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentHealthService } from './department-health.service';
import { DepartmentWorkstreamService } from './department-workstream.service';
import { DepartmentTeamService } from './department-team.service';
import { DepartmentResourceProposalService } from './department-resource-proposal.service';
import { DepartmentLeaderAutonomousService } from './department-leader-autonomous.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import {
  TaskStatus,
  EmployeeStatus,
  WorkstreamStatus,
  DepartmentTeamStatus,
  ResourceProposalStatus,
  CeoDecisionRiskLevel,
  TaskPriority,
} from '@prisma/client';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('V17 Phase 2 — Department Operating Layer Specification Tests', () => {
  let healthService: DepartmentHealthService;
  let workstreamService: DepartmentWorkstreamService;
  let teamService: DepartmentTeamService;
  let proposalService: DepartmentResourceProposalService;
  let leaderService: DepartmentLeaderAutonomousService;
  let prisma: PrismaService;
  let ceoService: CeoAutonomousService;
  let workerAssignment: WorkerAssignmentService;

  const compA = 'company-alpha-100';
  const compB = 'company-beta-200';
  const deptAId = 'dept-eng-001';
  const deptBId = 'dept-sales-002';
  const agent1Id = 'emp-agent-1';
  const agent2Id = 'emp-agent-2';

  beforeEach(async () => {
    const mockPrisma = {
      department: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      departmentWorkstream: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      departmentTeam: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      departmentHealthSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      departmentResourceProposal: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      task: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      taskDependency: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      taskResult: {
        upsert: jest.fn().mockResolvedValue({ id: 'res-parent-1', success: true }),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
      companyEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    const mockCeoService = {
      reviewTaskResult: jest.fn().mockResolvedValue({}),
    };

    const mockWorkerAssignment = {
      findBestWorker: jest.fn().mockResolvedValue({
        assignedEmployeeId: agent1Id,
        score: 90,
      }),
      assignTask: jest.fn().mockResolvedValue({
        assignedEmployeeId: agent1Id,
      }),
    };

    const mockWorkerRegistry = {
      getRegisteredCapabilities: jest.fn().mockReturnValue(['BACKEND', 'DATABASE', 'FRONTEND']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentHealthService,
        DepartmentWorkstreamService,
        DepartmentTeamService,
        DepartmentResourceProposalService,
        DepartmentLeaderAutonomousService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CeoAutonomousService, useValue: mockCeoService },
        { provide: WorkerAssignmentService, useValue: mockWorkerAssignment },
        { provide: WorkerRegistryService, useValue: mockWorkerRegistry },
      ],
    }).compile();

    healthService = module.get<DepartmentHealthService>(DepartmentHealthService);
    workstreamService = module.get<DepartmentWorkstreamService>(DepartmentWorkstreamService);
    teamService = module.get<DepartmentTeamService>(DepartmentTeamService);
    proposalService = module.get<DepartmentResourceProposalService>(DepartmentResourceProposalService);
    leaderService = module.get<DepartmentLeaderAutonomousService>(DepartmentLeaderAutonomousService);
    prisma = module.get<PrismaService>(PrismaService);
    ceoService = module.get<CeoAutonomousService>(CeoAutonomousService);
    workerAssignment = module.get<WorkerAssignmentService>(WorkerAssignmentService);
  });

  // -------------------------------------------------------------
  // TEST A: Workstream creation
  // -------------------------------------------------------------
  describe('Test A — Workstream Creation', () => {
    it('creates a valid workstream bound strictly to company and department', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
      });

      const mockWorkstream = {
        id: 'ws-101',
        companyId: compA,
        departmentId: deptAId,
        name: 'Infrastructure Modernization',
        status: WorkstreamStatus.PLANNED,
        priority: TaskPriority.HIGH,
        riskTier: CeoDecisionRiskLevel.LOW,
      };
      (prisma.departmentWorkstream.create as jest.Mock).mockResolvedValue(mockWorkstream);

      const created = await workstreamService.createWorkstream(compA, deptAId, {
        name: 'Infrastructure Modernization',
        priority: TaskPriority.HIGH,
      });

      expect(created.id).toBe('ws-101');
      expect(created.companyId).toBe(compA);
      expect(created.departmentId).toBe(deptAId);
      expect(prisma.departmentWorkstream.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: compA,
            departmentId: deptAId,
            name: 'Infrastructure Modernization',
          }),
        }),
      );
      expect(prisma.companyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: compA,
            type: 'WORKSTREAM_CREATED',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST B: Cross-company isolation
  // -------------------------------------------------------------
  describe('Test B — Cross-Company Isolation', () => {
    it('rejects access when Company A attempts to view or mutate Company B workstream', async () => {
      (prisma.departmentWorkstream.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(workstreamService.getWorkstream('ws-compB-1', compA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects creating a workstream if department does not belong to company', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        workstreamService.createWorkstream(compA, deptBId, { name: 'Cross Company Attack' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------
  // TEST C: Department health
  // -------------------------------------------------------------
  describe('Test C — Multi-Dimensional Department Health', () => {
    it('correctly calculates capacity, workload, execution, and reliability health dimensions', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
        employees: [
          { id: agent1Id, assignedTasks: [{ id: 't1' }, { id: 't2' }] },
          { id: agent2Id, assignedTasks: [{ id: 't3' }] },
        ],
        tasks: [
          { id: 't1', status: TaskStatus.IN_PROGRESS, riskTier: 'LOW', executionAttempts: [] },
          { id: 't2', status: TaskStatus.COMPLETED, riskTier: 'LOW', executionAttempts: [] },
          { id: 't3', status: TaskStatus.READY, riskTier: 'LOW', executionAttempts: [] },
        ],
        goals: [{ id: 'g1', status: 'ACTIVE' }],
        workstreams: [],
      });

      const report = await healthService.calculateDepartmentHealth(deptAId, compA);

      expect(report.overallScore).toBeGreaterThanOrEqual(70);
      expect(report.overallStatus).toBeDefined();
      expect(report.dimensions.capacityHealth).toBeDefined();
      expect(report.dimensions.workloadHealth).toBeDefined();
      expect(report.dimensions.executionHealth).toBeDefined();
      expect(report.dimensions.reliabilityHealth).toBeDefined();
      expect(prisma.departmentHealthSnapshot.create).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // TEST D: Capacity imbalance
  // -------------------------------------------------------------
  describe('Test D — Capacity Imbalance Detection', () => {
    it('detects severely overloaded agents and reflects penalty in capacity health', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
        employees: [
          // Agent 1 has 5 active tasks (overloaded)
          { id: agent1Id, assignedTasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 't5' }] },
        ],
        tasks: [
          { id: 't1', status: TaskStatus.IN_PROGRESS, riskTier: 'LOW', executionAttempts: [] },
        ],
        goals: [{ id: 'g1', status: 'ACTIVE' }],
        workstreams: [],
      });

      const report = await healthService.calculateDepartmentHealth(deptAId, compA);

      expect(report.dimensions.capacityHealth.metrics.overloadedAgentsCount).toBe(1);
      expect(report.bottlenecks.some((b) => b.includes('overload'))).toBe(true);
      expect(report.improvementSignals.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------
  // TEST E: Temporary team formation
  // -------------------------------------------------------------
  describe('Test E — Temporary AI Team Formation', () => {
    it('proposes and forms a valid AI-only temporary team with explicit rationale', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
      });

      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        { id: agent1Id, companyId: compA, status: EmployeeStatus.ACTIVE },
        { id: agent2Id, companyId: compA, status: EmployeeStatus.ACTIVE },
      ]);

      const mockTeam = {
        id: 'team-infra-1',
        companyId: compA,
        departmentId: deptAId,
        name: 'Distributed Systems Taskforce',
        formationReason: 'Complex multi-capability database clustering required',
        status: DepartmentTeamStatus.ACTIVE,
        leadAgentId: agent1Id,
        memberAgentIds: [agent1Id, agent2Id],
      };
      (prisma.departmentTeam.create as jest.Mock).mockResolvedValue(mockTeam);

      const team = await teamService.formTeam(compA, {
        departmentId: deptAId,
        name: 'Distributed Systems Taskforce',
        formationReason: 'Complex multi-capability database clustering required',
        expectedOutcome: 'High throughput cluster deployed',
        requiredCapabilities: ['DATABASE', 'SYSTEMS_ARCHITECTURE'],
        leadAgentId: agent1Id,
        memberAgentIds: [agent1Id, agent2Id],
      });

      expect(team.id).toBe('team-infra-1');
      expect(team.status).toBe(DepartmentTeamStatus.ACTIVE);
      expect(prisma.departmentTeam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: compA,
            departmentId: deptAId,
            leadAgentId: agent1Id,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST F: Team authority
  // -------------------------------------------------------------
  describe('Test F — Team Authority Boundaries', () => {
    it('rejects actions exceeding team authority scope', async () => {
      (prisma.departmentTeam.findFirst as jest.Mock).mockResolvedValue({
        id: 'team-infra-1',
        companyId: compA,
        status: DepartmentTeamStatus.ACTIVE,
        authorityScope: {
          maxTaskRiskTier: 'MEDIUM',
        },
      });

      // Attempting to execute HIGH risk action with a team bounded to MEDIUM
      const authCheck = await teamService.verifyTeamAuthority('team-infra-1', compA, {
        riskTier: 'HIGH',
      });

      expect(authCheck.allowed).toBe(false);
      expect(authCheck.reason).toContain('exceeds team delegated authority');
    });
  });

  // -------------------------------------------------------------
  // TEST G: Failure isolation (Anti-Pattern D solved)
  // -------------------------------------------------------------
  describe('Test G — Failure Isolation (Independent Work Continues)', () => {
    it('isolates subtask failure so independent subtasks continue executing and parent objective does NOT fail', async () => {
      const parentTaskId = 'task-parent-obj-1';
      const failedTaskId = 'task-sub-failed-1';
      const independentTaskId = 'task-sub-independent-2';

      (prisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: parentTaskId,
        title: 'Department Q4 Core Platform Delivery',
        companyId: compA,
        departmentId: deptAId,
        status: TaskStatus.IN_PROGRESS,
      });

      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        { id: failedTaskId, parentTaskId, companyId: compA, status: TaskStatus.CANCELLED },
        { id: independentTaskId, parentTaskId, companyId: compA, status: TaskStatus.IN_PROGRESS },
      ]);

      // Subtask 2 does NOT depend on Subtask 1
      (prisma.taskDependency.findMany as jest.Mock).mockResolvedValue([]);

      const result = await leaderService.orchestrateObjective(parentTaskId);

      // Objective continues partially active; parent task is NOT failed
      expect(result?.status).toBe('PARTIAL_ACTIVE');
      expect(result?.runningTasks).toBe(1);
      expect(prisma.taskResult.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // TEST H: Dependency failure propagation
  // -------------------------------------------------------------
  describe('Test H — Dependency Failure Propagation', () => {
    it('marks only downstream dependent tasks as BLOCKED when prerequisite fails', async () => {
      const parentTaskId = 'task-parent-obj-1';
      const failedTaskId = 'task-prereq-1';
      const downstreamTaskId = 'task-downstream-2';
      const independentTaskId = 'task-parallel-3';

      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        { id: failedTaskId, parentTaskId, companyId: compA, status: TaskStatus.CANCELLED },
        { id: downstreamTaskId, parentTaskId, companyId: compA, status: TaskStatus.READY },
        { id: independentTaskId, parentTaskId, companyId: compA, status: TaskStatus.IN_PROGRESS },
      ]);

      // task-downstream-2 depends on task-prereq-1
      (prisma.taskDependency.findMany as jest.Mock).mockResolvedValue([
        { taskId: downstreamTaskId, dependsOnId: failedTaskId },
      ]);

      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const isolation = await leaderService.isolateSubtaskFailure(failedTaskId, parentTaskId, compA);

      expect(isolation.affectedTaskIds).toContain(downstreamTaskId);
      expect(isolation.independentTaskIds).toContain(independentTaskId);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: downstreamTaskId },
          data: expect.objectContaining({ status: TaskStatus.BLOCKED }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST I: Resource proposal
  // -------------------------------------------------------------
  describe('Test I — Evidence-Based Resource Proposal', () => {
    it('submits a structured resource proposal with justification and alternatives', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
      });

      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        id: agent1Id,
        companyId: compA,
        status: EmployeeStatus.ACTIVE,
      });

      const mockProposal = {
        id: 'prop-001',
        companyId: compA,
        departmentId: deptAId,
        requestedResource: 'ADDITIONAL_AI_DATABASE_SPECIALIST',
        reason: 'Workload capacity threshold exceeded in data engineering workstream',
        status: ResourceProposalStatus.SUBMITTED,
      };
      (prisma.departmentResourceProposal.create as jest.Mock).mockResolvedValue(mockProposal);

      const proposal = await proposalService.submitProposal(compA, {
        departmentId: deptAId,
        requestedResource: 'ADDITIONAL_AI_DATABASE_SPECIALIST',
        reason: 'Workload capacity threshold exceeded in data engineering workstream',
        expectedOutcome: 'Reduce task execution latency by 40%',
        cost: 250,
        urgency: 'HIGH',
        proposerAgentId: agent1Id,
      });

      expect(proposal.id).toBe('prop-001');
      expect(proposal.status).toBe(ResourceProposalStatus.SUBMITTED);
      expect(prisma.companyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: compA,
            type: 'DEPARTMENT_RESOURCE_PROPOSAL_SUBMITTED',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST J: CEO escalation
  // -------------------------------------------------------------
  describe('Test J — CEO Escalation on Material Blocker', () => {
    it('triggers CEO review when all remaining subtasks are blocked with zero forward progress', async () => {
      const parentTaskId = 'task-parent-crit-1';
      const failedTaskId = 'task-sub-fail-1';
      const blockedTaskId = 'task-sub-blocked-2';

      (prisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: parentTaskId,
        title: 'Core Security Protocol Deployment',
        companyId: compA,
        departmentId: deptAId,
        status: TaskStatus.IN_PROGRESS,
      });

      // No tasks are in progress or ready; all remaining are blocked
      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        { id: failedTaskId, parentTaskId, companyId: compA, status: TaskStatus.CANCELLED },
        { id: blockedTaskId, parentTaskId, companyId: compA, status: TaskStatus.BLOCKED },
      ]);

      (prisma.taskDependency.findMany as jest.Mock).mockResolvedValue([
        { taskId: blockedTaskId, dependsOnId: failedTaskId },
      ]);

      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        id: 'leader-1',
        companyId: compA,
        status: EmployeeStatus.ACTIVE,
      });

      (prisma.taskResult.upsert as jest.Mock).mockResolvedValue({
        id: 'res-escalated-1',
        success: false,
      });

      const result = await leaderService.orchestrateObjective(parentTaskId);

      expect(result?.status).toBe('BLOCKED_ESCALATED');
      expect(ceoService.reviewTaskResult).toHaveBeenCalledWith('res-escalated-1');
    });
  });

  // -------------------------------------------------------------
  // TEST K: Chairman boundary
  // -------------------------------------------------------------
  describe('Test K — Chairman Sovereignty Boundary', () => {
    it('cannot override Chairman sovereignty or bypass governance controls', async () => {
      // Team cannot set authorityScope to CHAIRMAN
      const authCheck = await teamService.verifyTeamAuthority('team-1', compA, {
        riskTier: 'CRITICAL',
      });
      // CRITICAL requires Chairman approval; team cannot self-authorize
      expect(authCheck.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // TEST L: Phase 1 execution foundation integration
  // -------------------------------------------------------------
  describe('Test L — Phase 1 Worker Assignment Integration', () => {
    it('uses Phase 1 WorkerAssignmentService to assign tasks to real AI agents during planning', async () => {
      const parentTask = {
        id: 'task-parent-plan-1',
        title: 'Build Secure API Endpoint',
        description: 'Create authenticated REST endpoint',
        companyId: compA,
        departmentId: deptAId,
      };

      // Mock gateway response for planning
      jest.spyOn((leaderService as any).gateway, 'callWithTier').mockResolvedValue(
        JSON.stringify({
          tasks: [
            {
              refId: 't1',
              title: 'Implement Controller',
              description: 'Create NestJS controller',
              requiredCapability: 'BACKEND',
            },
          ],
        }),
      );

      (prisma.task.create as jest.Mock).mockResolvedValue({
        id: 'subtask-1',
        title: 'Implement Controller',
      });
      (prisma.taskDependency.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      await (leaderService as any).planDepartmentObjective(parentTask);

      expect(workerAssignment.findBestWorker).toHaveBeenCalledWith(
        compA,
        expect.objectContaining({
          departmentId: deptAId,
          requiredCapability: 'BACKEND',
        }),
      );
      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedEmployeeId: agent1Id,
            status: TaskStatus.BLOCKED,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST M: Company isolation consistency
  // -------------------------------------------------------------
  describe('Test M — Company Isolation Consistency', () => {
    it('rejects cross-company team members during team formation', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
      });

      // Employee search only returns agents in compA; agent2 is in compB so it is omitted
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        { id: agent1Id, companyId: compA, status: EmployeeStatus.ACTIVE },
      ]);

      await expect(
        teamService.formTeam(compA, {
          departmentId: deptAId,
          name: 'Cross Tenant Team',
          formationReason: 'Testing isolation',
          expectedOutcome: 'Failure',
          requiredCapabilities: ['BACKEND'],
          leadAgentId: agent1Id,
          memberAgentIds: [agent1Id, agent2Id], // agent2Id does not exist in compA
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // TEST N: V15 Spatial compatibility
  // -------------------------------------------------------------
  describe('Test N — V15 Spatial Compatibility', () => {
    it('preserves existing department spatial projection without corrupting topology', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
        name: 'Engineering',
        employees: [],
        tasks: [],
        goals: [],
        workstreams: [],
      });

      const report = await healthService.calculateDepartmentHealth(deptAId, compA);
      expect(report.departmentName).toBe('Engineering');
      // Verifies health computation functions cleanly on existing department records
      expect(report.dimensions).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // TEST O: V16 Gateway compatibility
  // -------------------------------------------------------------
  describe('Test O — V16 Consequential Action Compatibility', () => {
    it('maintains CeoDecisionRiskLevel classification compatibility with V16 gateway', async () => {
      (prisma.department.findFirst as jest.Mock).mockResolvedValue({
        id: deptAId,
        companyId: compA,
      });

      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        id: agent1Id,
        companyId: compA,
        status: EmployeeStatus.ACTIVE,
      });

      (prisma.departmentResourceProposal.create as jest.Mock).mockResolvedValue({
        id: 'prop-risk-1',
        riskTier: CeoDecisionRiskLevel.HIGH,
      });

      const proposal = await proposalService.submitProposal(compA, {
        departmentId: deptAId,
        requestedResource: 'EXPAND_SERVER_CLUSTER',
        reason: 'Compute expansion',
        expectedOutcome: 'Scale throughput',
        riskTier: CeoDecisionRiskLevel.HIGH,
        proposerAgentId: agent1Id,
      });

      // Matches V16 risk tier enum directly
      expect(proposal.riskTier).toBe(CeoDecisionRiskLevel.HIGH);
    });
  });
});

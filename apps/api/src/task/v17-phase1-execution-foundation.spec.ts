import { Test, TestingModule } from '@nestjs/testing';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskQualityGateService } from './task-quality-gate.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { JobTaskBridgeService } from '../job/job-task-bridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobService } from '../job/job.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { DepartmentLeaderAutonomousService } from '../department/department-leader-autonomous.service';
import {
  TaskStatus,
  ExecutionAttemptStatus,
  AttemptFailureType,
  EmergencyState,
  CompanyStatus,
  EmployeeStatus,
  WorkerType,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('V17 Phase 1 — Execution Foundation Specification Tests', () => {
  let taskOrchestrator: TaskOrchestratorService;
  let taskExecution: TaskExecutionService;
  let qualityGate: TaskQualityGateService;
  let workerAssignment: WorkerAssignmentService;
  let jobBridge: JobTaskBridgeService;
  let prisma: PrismaService;
  let jobService: JobService;

  const compA = 'company-alpha-100';
  const _compB = 'company-beta-200';
  const workerAId = 'ai-worker-alpha-1';
  const workerBId = 'ai-worker-beta-1';
  const taskId = 'task-v17-001';

  beforeEach(async () => {
    const mockPrisma = {
      task: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      taskExecutionAttempt: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      taskResult: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      company: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      companyEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
      backgroundJob: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockJobService = {
      enqueue: jest.fn(),
    };

    const mockWorkerRegistry = {
      hasWorker: jest.fn().mockReturnValue(false),
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskOrchestratorService,
        TaskExecutionService,
        TaskQualityGateService,
        WorkerAssignmentService,
        JobTaskBridgeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JobService, useValue: mockJobService },
        { provide: WorkerRegistryService, useValue: mockWorkerRegistry },
        { provide: CeoAutonomousService, useValue: { reviewTaskResult: jest.fn().mockResolvedValue({}) } },
        { provide: DepartmentLeaderAutonomousService, useValue: { reviewTaskResult: jest.fn().mockResolvedValue({}), orchestrateObjective: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    taskOrchestrator = module.get<TaskOrchestratorService>(TaskOrchestratorService);
    taskExecution = module.get<TaskExecutionService>(TaskExecutionService);
    qualityGate = module.get<TaskQualityGateService>(TaskQualityGateService);
    workerAssignment = module.get<WorkerAssignmentService>(WorkerAssignmentService);
    jobBridge = module.get<JobTaskBridgeService>(JobTaskBridgeService);
    prisma = module.get<PrismaService>(PrismaService);
    jobService = module.get<JobService>(JobService);
  });

  // -------------------------------------------------------------
  // TEST A: Atomic claim (Concurrency race test)
  // -------------------------------------------------------------
  describe('Test A — Atomic Task Claiming', () => {
    it('guarantees that between two concurrent workers racing for the same task, exactly ONE succeeds and the other receives null', async () => {
      // Mock company in NORMAL state
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: compA,
        emergencyStatus: EmergencyState.NORMAL,
      });

      // Worker A wins the atomic update (count = 1)
      // Worker B loses the atomic update (count = 0)
      (prisma.task.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        status: TaskStatus.READY,
        claimLockToken: 'lock-worker-a',
      });

      const claimPromiseA = taskOrchestrator.claimTask(taskId, compA, 300000);
      const claimPromiseB = taskOrchestrator.claimTask(taskId, compA, 300000);

      const [claimA, claimB] = await Promise.all([claimPromiseA, claimPromiseB]);

      // Exactly one succeeds, one gets null
      expect(claimA).toBeDefined();
      expect(claimA?.claimed).toBe(true);
      expect(claimB).toBeNull();

      // Verify updateMany was called with atomic lease criteria
      expect(prisma.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: taskId,
            companyId: compA,
            status: TaskStatus.READY,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST B: Company isolation
  // -------------------------------------------------------------
  describe('Test B — Company Isolation', () => {
    it('rejects cross-company execution attempt when worker does not belong to the task company', async () => {
      // Task exists in compA
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
      });

      // Worker query with { id: workerBId, companyId: compA, status: ACTIVE } returns null because worker is in compB
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue(null);

      // Attempting to start an attempt in compA with a worker from compB
      await expect(
        taskExecution.startAttempt({
          taskId,
          companyId: compA,
          workerId: workerBId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.taskExecutionAttempt.create).not.toHaveBeenCalled();
    });

    it('rejects worker assignment when companyId is missing', async () => {
      await expect(
        workerAssignment.findBestWorker('', { requiredCapability: 'BACKEND' }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------
  // TEST C: Real worker attribution (No dummy findFirst())
  // -------------------------------------------------------------
  describe('Test C — Real Worker Attribution', () => {
    it('attributes execution attempt directly to the resolved AI worker and preserves worker identity', async () => {
      const mockWorker = {
        id: workerAId,
        companyId: compA,
        agent: { id: 'agent-v17-alpha' },
        name: 'Alpha Software Agent',
        status: EmployeeStatus.ACTIVE,
        workerType: WorkerType.AI_AGENT,
      };

      (prisma.employee.findFirst as jest.Mock).mockResolvedValue(mockWorker);

      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        retryCount: 0,
        correlationId: 'corr-c-001',
      });

      (prisma.taskExecutionAttempt.count as jest.Mock).mockResolvedValue(0);

      const mockAttempt = {
        id: 'attempt-001',
        taskId,
        companyId: compA,
        workerId: workerAId,
        agentId: 'agent-v17-alpha',
        attemptNumber: 1,
        status: ExecutionAttemptStatus.RUNNING,
        startedAt: new Date(),
      };
      (prisma.taskExecutionAttempt.create as jest.Mock).mockResolvedValue(mockAttempt);

      const attempt = await taskExecution.startAttempt({
        taskId,
        companyId: compA,
        workerId: workerAId,
      });

      expect(attempt.workerId).toBe(workerAId);
      expect(attempt.agentId).toBe('agent-v17-alpha');
      expect(prisma.taskExecutionAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workerId: workerAId,
            agentId: 'agent-v17-alpha',
            companyId: compA,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST D: Missing worker (No fake GENERIC success)
  // -------------------------------------------------------------
  describe('Test D — Missing Worker Handling', () => {
    it('does NOT execute or create fake success if no valid AI worker is available', async () => {
      // No active candidates found in company
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);

      const bestWorker = await workerAssignment.findBestWorker(compA, {
        requiredCapability: 'QUANTUM_COMPUTING',
      });

      expect(bestWorker).toBeNull();

      // When assigning task, throws NotFoundException instead of falling back to dummy or generic worker
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        status: TaskStatus.READY,
      });

      await expect(workerAssignment.assignTask(taskId, compA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------
  // TEST E: Attempt lineage (Multiple attempts preserved independently)
  // -------------------------------------------------------------
  describe('Test E — Attempt Lineage Preservation', () => {
    it('creates distinct consecutive execution attempts without overwriting previous attempts', async () => {
      const mockWorker = {
        id: workerAId,
        companyId: compA,
        agent: { id: 'agent-alpha' },
        name: 'Worker Alpha',
        status: EmployeeStatus.ACTIVE,
      };
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue(mockWorker);

      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        retryCount: 1,
      });

      // Existing 1 attempt in database
      (prisma.taskExecutionAttempt.count as jest.Mock).mockResolvedValue(1);

      (prisma.taskExecutionAttempt.create as jest.Mock).mockResolvedValue({
        id: 'att-2',
        taskId,
        attemptNumber: 2,
        status: ExecutionAttemptStatus.RUNNING,
        companyId: compA,
        workerId: workerAId,
      });

      const attempt2 = await taskExecution.startAttempt({
        taskId,
        companyId: compA,
        workerId: workerAId,
      });

      expect(attempt2.attemptNumber).toBe(2);
      expect(prisma.taskExecutionAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attemptNumber: 2,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST F: Retry budget enforcement
  // -------------------------------------------------------------
  describe('Test F — Retry Budget Enforcement', () => {
    it('transitions task to REVIEW when failure exhausts maxRetries', async () => {
      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: 'att-exhausted',
        taskId,
        companyId: compA,
        workerId: workerAId,
        attemptNumber: 3,
        status: ExecutionAttemptStatus.RUNNING,
        task: {
          id: taskId,
          retryCount: 3,
          maxRetries: 3,
        },
        worker: {
          id: workerAId,
          name: 'Worker Alpha',
        },
      });

      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({
        id: 'att-exhausted',
        status: ExecutionAttemptStatus.FAILED,
        failureType: AttemptFailureType.CAPABILITY_FAILURE,
      });

      (prisma.taskResult.upsert as jest.Mock).mockResolvedValue({
        id: 'result-exhausted',
        success: false,
      });

      (prisma.task.update as jest.Mock).mockResolvedValue({
        id: taskId,
        status: TaskStatus.REVIEW,
      });

      const updatedAttempt = await taskExecution.failAttempt({
        attemptId: 'att-exhausted',
        companyId: compA,
        failureType: AttemptFailureType.CAPABILITY_FAILURE,
        errorMessage: 'Capability missing for complex task',
      });

      expect(updatedAttempt.status).toBe(ExecutionAttemptStatus.FAILED);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: taskId },
          data: expect.objectContaining({
            status: TaskStatus.REVIEW,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST G: Idempotency
  // -------------------------------------------------------------
  describe('Test G — Idempotency on Repeated Delivery', () => {
    it('skips redundant execution when receiving a duplicate background job for an already completed task', async () => {
      const mockJob = {
        id: 'job-v17-dup-1',
        type: 'TASK_EXECUTION',
        companyId: compA,
        payload: {
          taskId,
          companyId: compA,
          workerId: workerAId,
        },
      } as any;

      // Task is already in REVIEW/COMPLETED status
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        status: TaskStatus.REVIEW,
        assignedEmployeeId: workerAId,
      });

      const existingResult = {
        id: 'res-existing-1',
        taskId,
        success: true,
        summary: 'Previously completed execution',
      };
      (prisma.taskResult.findUnique as jest.Mock).mockResolvedValue(existingResult);

      const result = await jobBridge.executeTaskJob(mockJob);

      expect(result.isReplay).toBe(true);
      expect(result.result).toEqual(existingResult);
      // No new execution attempt created on replay
      expect(prisma.taskExecutionAttempt.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // TEST H: Emergency state blocks claims
  // -------------------------------------------------------------
  describe('Test H — Emergency State Claim Blocking', () => {
    it('blocks new autonomous task claims when company is in EMERGENCY_STOP state', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: compA,
        emergencyStatus: EmergencyState.EMERGENCY_STOP,
        emergencyReason: 'Chairman initiated kill-switch containment',
      });

      const claimResult = await taskOrchestrator.claimTask(taskId, compA, 300000);

      expect(claimResult).toBeNull();
      // Ensure no DB updateMany was performed because emergency pre-check halted execution
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // TEST I: Task Quality Gate
  // -------------------------------------------------------------
  describe('Test I — Task Quality Gate', () => {
    it('fails quality gate if title is missing or dependencies are not completed', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        title: '', // Invalid empty title
        company: { status: CompanyStatus.ACTIVE },
        dependencies: [
          {
            dependsOn: { id: 'dep-1', title: 'Prereq Task', status: TaskStatus.IN_PROGRESS },
          },
        ],
      });

      const evalResult = await qualityGate.evaluateTask(taskId, compA);

      expect(evalResult.passed).toBe(false);
      expect(evalResult.blockers.length).toBeGreaterThan(0);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: taskId },
          data: expect.objectContaining({ qualityGatePassed: false }),
        }),
      );
    });

    it('passes quality gate and populates criteria when task meets all requirements', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        title: 'Generate Production Database Schema Migration',
        description: 'Detailed operational parameters for database migration',
        company: { status: CompanyStatus.ACTIVE },
        dependencies: [],
        assignedEmployeeId: workerAId,
      });

      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        id: workerAId,
        companyId: compA,
        name: 'Worker Alpha',
        status: EmployeeStatus.ACTIVE,
      });

      const evalResult = await qualityGate.evaluateTask(taskId, compA);

      expect(evalResult.passed).toBe(true);
      expect(evalResult.blockers.length).toBe(0);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: taskId },
          data: expect.objectContaining({ qualityGatePassed: true }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST J: BackgroundJob durable integration
  // -------------------------------------------------------------
  describe('Test J — BackgroundJob Durable Execution', () => {
    it('enqueues task to BackgroundJob with deterministic idempotency key and correlation', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        priority: 'HIGH',
        retryCount: 0,
        assignedEmployeeId: workerAId,
        correlationId: 'corr-j-1',
      });

      const mockEnqueuedJob = {
        id: 'job-bg-001',
        type: 'TASK_EXECUTION',
        companyId: compA,
        idempotencyKey: `job_task_exec_${taskId}_attempt_0`,
      };
      (jobService.enqueue as jest.Mock).mockResolvedValue(mockEnqueuedJob);

      const job = await jobBridge.enqueueTaskExecution(taskId, compA);

      expect(job.id).toBe('job-bg-001');
      expect(jobService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TASK_EXECUTION',
          companyId: compA,
          idempotencyKey: `job_task_exec_${taskId}_attempt_0`,
          priority: 5,
        }),
      );
    });
  });
});

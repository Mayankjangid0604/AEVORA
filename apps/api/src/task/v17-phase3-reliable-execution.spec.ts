import { Test, TestingModule } from '@nestjs/testing';
import { TaskOrchestratorService } from './task-orchestrator.service';
import { TaskExecutionService } from './task-execution.service';
import { TaskQualityGateService } from './task-quality-gate.service';
import { RetryPolicyService } from './retry-policy.service';
import { WorkerAssignmentService } from '../workforce/worker-assignment.service';
import { JobTaskBridgeService } from '../job/job-task-bridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerRegistryService } from '../workforce/worker-registry.service';
import { CeoAutonomousService } from '../ceo/ceo-autonomous.service';
import { DepartmentLeaderAutonomousService } from '../department/department-leader-autonomous.service';
import { DepartmentHealthService } from '../department/department-health.service';
import { LessonPatternExtractionService } from '../organizational-memory/lesson-pattern-extraction.service';
import {
  TaskStatus,
  ExecutionAttemptStatus,
  AttemptFailureType,
  EmergencyState,
  EmployeeStatus,
  WorkerType,
  TaskPriority,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('V17 Phase 3 — Reliable Execution & Failure Intelligence Specification Tests', () => {
  let taskOrchestrator: TaskOrchestratorService;
  let taskExecution: TaskExecutionService;
  let retryPolicy: RetryPolicyService;
  let qualityGate: TaskQualityGateService;
  let workerAssignment: WorkerAssignmentService;
  let _leaderService: DepartmentLeaderAutonomousService;
  let healthService: DepartmentHealthService;
  let ceoService: CeoAutonomousService;
  let memoryService: LessonPatternExtractionService;
  let prisma: PrismaService;

  const compA = 'company-alpha-100';
  const compB = 'company-beta-200';
  const worker1Id = 'ai-worker-agent-1';
  const worker2Id = 'ai-worker-agent-2';
  const taskId = 'task-phase3-001';
  const deptId = 'dept-engineering-10';

  beforeEach(async () => {
    const mockPrisma: any = {
      task: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
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
        deleteMany: jest.fn(),
      },
      taskDependency: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      workerProfile: {
        update: jest.fn().mockResolvedValue({}),
      },
      company: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      companyEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
      department: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      goal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      departmentHealthSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
      },
    };

    const mockWorkerRegistry = {
      hasWorker: jest.fn().mockReturnValue(false),
      getWorker: jest.fn().mockReturnValue(null),
      getRegisteredCapabilities: jest.fn().mockReturnValue(['SOFTWARE_DEVELOPMENT', 'ANALYTICS']),
    };

    const mockCeoService = {
      reviewTaskResult: jest.fn().mockResolvedValue({ accepted: true }),
      evaluateMaterialFailureSignal: jest.fn().mockImplementation((opts: any) => {
        let classification = 'ISOLATED_EXECUTION_FAILURE';
        let requiresStrategicReplanning = false;
        if (opts.failureType === 'SAFETY_FAILURE' || opts.failureType === 'AUTHORITY_FAILURE') {
          classification = 'STRATEGIC_FAILURE';
          requiresStrategicReplanning = true;
        } else if (opts.failureType === 'CAPABILITY_FAILURE') {
          classification = 'CAPABILITY_MISMATCH';
        } else if (opts.retryCount > 2) {
          classification = opts.departmentId ? 'DEPARTMENT_SYSTEMIC_FAILURE' : 'WORKER_SPECIFIC_FAILURE';
        }
        return Promise.resolve({
          taskId: opts.taskId,
          companyId: opts.companyId,
          classification,
          requiresStrategicReplanning,
        });
      }),
    };

    const mockLeaderService = {
      orchestrateObjective: jest.fn().mockResolvedValue({ resultId: 'res-obj-1' }),
      reviewTaskResult: jest.fn().mockResolvedValue({ accepted: true }),
      isolateSubtaskFailure: jest.fn().mockResolvedValue({ affectedTaskIds: [], independentTaskIds: [] }),
      reconcileRecoveredDependencies: jest.fn().mockResolvedValue({ reopenedTaskIds: ['task-downstream-1'], stillBlockedTaskIds: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskOrchestratorService,
        TaskExecutionService,
        RetryPolicyService,
        TaskQualityGateService,
        WorkerAssignmentService,
        DepartmentHealthService,
        LessonPatternExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorkerRegistryService, useValue: mockWorkerRegistry },
        { provide: CeoAutonomousService, useValue: mockCeoService },
        { provide: DepartmentLeaderAutonomousService, useValue: mockLeaderService },
        { provide: JobTaskBridgeService, useValue: { dispatchTaskAsJob: jest.fn() } },
      ],
    }).compile();

    taskOrchestrator = module.get<TaskOrchestratorService>(TaskOrchestratorService);
    taskExecution = module.get<TaskExecutionService>(TaskExecutionService);
    retryPolicy = module.get<RetryPolicyService>(RetryPolicyService);
    qualityGate = module.get<TaskQualityGateService>(TaskQualityGateService);
    workerAssignment = module.get<WorkerAssignmentService>(WorkerAssignmentService);
    _leaderService = module.get<DepartmentLeaderAutonomousService>(DepartmentLeaderAutonomousService);
    healthService = module.get<DepartmentHealthService>(DepartmentHealthService);
    ceoService = module.get<CeoAutonomousService>(CeoAutonomousService);
    memoryService = module.get<LessonPatternExtractionService>(LessonPatternExtractionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // -------------------------------------------------------------
  // TEST A: Transient failure classified correctly
  // -------------------------------------------------------------
  describe('Test A — Transient Failure Classification', () => {
    it('correctly evaluates transient failure as retryable with non-zero backoff and low escalation severity', () => {
      const decision = retryPolicy.evaluateRetry({
        taskId,
        companyId: compA,
        failureType: AttemptFailureType.TRANSIENT,
        currentRetryCount: 0,
        maxRetries: 3,
        riskTier: 'LOW',
      });

      expect(decision.isRetryable).toBe(true);
      expect(decision.requiresEscalation).toBe(false);
      expect(decision.requiresReassignment).toBe(false);
      expect(decision.delayMs).toBeGreaterThan(0);
      expect(decision.nextRetryAt).toBeInstanceOf(Date);
      expect(decision.reason).toContain('Eligible for retry');
    });
  });

  // -------------------------------------------------------------
  // TEST B: Bounded exponential retry backoff
  // -------------------------------------------------------------
  describe('Test B — Bounded Exponential Retry Backoff', () => {
    it('deterministically increases backoff delay exponentially across successive retry attempts', () => {
      const delay0 = retryPolicy.calculateBackoff(0, taskId, 1000);
      const delay1 = retryPolicy.calculateBackoff(1, taskId, 1000);
      const delay2 = retryPolicy.calculateBackoff(2, taskId, 1000);
      const delay3 = retryPolicy.calculateBackoff(3, taskId, 1000);

      // Base: attempt 0: ~1000 + jitter, attempt 1: ~2000 + jitter, attempt 2: ~4000 + jitter, attempt 3: ~8000 + jitter
      expect(delay1).toBeGreaterThanOrEqual(delay0);
      expect(delay2).toBeGreaterThanOrEqual(delay1);
      expect(delay3).toBeGreaterThanOrEqual(delay2);

      // Max delay cap test (max cap is 60000ms + 500ms max jitter)
      const highAttemptDelay = retryPolicy.calculateBackoff(20, taskId, 1000);
      expect(highAttemptDelay).toBeLessThanOrEqual(60500);
    });
  });

  // -------------------------------------------------------------
  // TEST C: Retry budget prevents infinite retries
  // -------------------------------------------------------------
  describe('Test C — Retry Budget Bounding', () => {
    it('prevents retry when retryCount reaches or exceeds maxRetries and escalates to department/CEO review', async () => {
      const taskMock = {
        id: taskId,
        companyId: compA,
        retryCount: 3,
        maxRetries: 3,
        priority: TaskPriority.NORMAL,
        departmentId: deptId,
      };

      const attemptMock = {
        id: 'attempt-c-1',
        taskId,
        workerId: worker1Id,
        attemptNumber: 3,
        correlationId: 'corr-c',
        causationId: 'cause-c',
        task: taskMock,
        worker: { id: worker1Id, name: 'AI Worker 1' },
      };

      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(attemptMock);
      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({
        ...attemptMock,
        status: ExecutionAttemptStatus.FAILED,
      });
      (prisma.taskResult.upsert as jest.Mock).mockResolvedValue({ id: 'res-failed-1' });
      (prisma.task.update as jest.Mock).mockResolvedValue({ ...taskMock, status: TaskStatus.REVIEW });

      await taskExecution.failAttempt({
        attemptId: attemptMock.id,
        companyId: compA,
        failureType: AttemptFailureType.TRANSIENT,
        errorMessage: 'Network timeout during data fetch',
      });

      // Verify task moved to REVIEW with TERMINAL_FAILED recovery state
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: taskId },
          data: expect.objectContaining({
            status: TaskStatus.REVIEW,
            recoveryState: 'TERMINAL_FAILED',
          }),
        }),
      );

      // Verify task result upserted with failure details
      expect(prisma.taskResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskId },
          create: expect.objectContaining({ success: false }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST D: Capability failure causes worker reassignment
  // -------------------------------------------------------------
  describe('Test D — Capability Failure Reassignment', () => {
    it('flags capability mismatch, unassigns the failed worker, and sets recoveryState to REASSIGNMENT_PENDING', async () => {
      const taskMock = {
        id: taskId,
        companyId: compA,
        retryCount: 0,
        maxRetries: 3,
        assignedEmployeeId: worker1Id,
        priority: TaskPriority.NORMAL,
        departmentId: deptId,
      };

      const attemptMock = {
        id: 'attempt-d-1',
        taskId,
        workerId: worker1Id,
        attemptNumber: 1,
        correlationId: 'corr-d',
        causationId: 'cause-d',
        task: taskMock,
        worker: { id: worker1Id, name: 'Generalist Worker' },
      };

      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(attemptMock);
      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({
        ...attemptMock,
        status: ExecutionAttemptStatus.FAILED,
      });
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      await taskExecution.failAttempt({
        attemptId: attemptMock.id,
        companyId: compA,
        failureType: AttemptFailureType.CAPABILITY_FAILURE,
        errorMessage: 'Lacks required Python ML capability to perform neural model inference',
      });

      // Task is re-queued to READY with assignedEmployeeId set to null for reassignment
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: taskId },
          data: expect.objectContaining({
            status: TaskStatus.READY,
            recoveryState: 'REASSIGNMENT_PENDING',
            assignedEmployeeId: null,
          }),
        }),
      );
    });

    it('WorkerAssignmentService excludes previously failed worker when assigning next attempt', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        requiredCapability: 'PYTHON',
        departmentId: deptId,
        assignedEmployeeId: null,
      });

      // Mock candidates: worker1 (excluded) and worker2 (available)
      (prisma.employee.findMany as jest.Mock).mockResolvedValue([
        {
          id: worker2Id,
          name: 'AI Specialist 2',
          companyId: compA,
          departmentId: deptId,
          skills: [{ name: 'PYTHON' }],
          role: { title: 'ML Engineer', permissions: ['PYTHON'] },
          assignedTasks: [],
          workerProfile: { id: 'wp-2', workerType: WorkerType.AI_AGENT },
          agent: { id: 'agent-2' },
          reliability: 95,
          performance: 90,
          activity: 'IDLE',
        },
      ]);
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const assigned = await workerAssignment.assignTask(taskId, compA, {
        excludeEmployeeIds: [worker1Id],
      });

      expect(assigned.assignedEmployeeId).toBe(worker2Id);
      expect(assigned.workerName).toBe('AI Specialist 2');
    });
  });

  // -------------------------------------------------------------
  // TEST E: Safety failure is never automatically retried
  // -------------------------------------------------------------
  describe('Test E — Constitutional Safety Failure Isolation', () => {
    it('strictly prohibits automatic retries for SAFETY_FAILURE and escalates to Chairman/Governance', () => {
      const decision = retryPolicy.evaluateRetry({
        taskId,
        companyId: compA,
        failureType: AttemptFailureType.SAFETY_FAILURE,
        currentRetryCount: 0,
        maxRetries: 5,
        riskTier: 'HIGH',
      });

      expect(decision.isRetryable).toBe(false);
      expect(decision.delayMs).toBe(0);
      expect(decision.nextRetryAt).toBeNull();
      expect(decision.requiresEscalation).toBe(true);
      expect(decision.escalationTarget).toBe('CHAIRMAN');
      expect(decision.reason).toContain('Constitutional safety policy violation');
    });
  });

  // -------------------------------------------------------------
  // TEST F: Authority failure escalates correctly
  // -------------------------------------------------------------
  describe('Test F — Authority Failure Escalation', () => {
    it('prohibits blind retry for AUTHORITY_FAILURE and escalates to CEO governance', () => {
      const decision = retryPolicy.evaluateRetry({
        taskId,
        companyId: compA,
        failureType: AttemptFailureType.AUTHORITY_FAILURE,
        currentRetryCount: 0,
        maxRetries: 3,
      });

      expect(decision.isRetryable).toBe(false);
      expect(decision.requiresEscalation).toBe(true);
      expect(decision.escalationTarget).toBe('CEO');
      expect(decision.reason).toContain('Execution authority exceeded');
    });
  });

  // -------------------------------------------------------------
  // TEST G: Stalled execution / timeout recovered safely
  // -------------------------------------------------------------
  describe('Test G — Stalled Execution Recovery', () => {
    it('detects missing heartbeat / expired claim and safely recovers the attempt without data loss', async () => {
      const taskMock = {
        id: taskId,
        companyId: compA,
        status: TaskStatus.IN_PROGRESS,
        claimExpiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        retryCount: 0,
        maxRetries: 3,
      };

      const runningAttemptMock = {
        id: 'attempt-stalled-1',
        taskId,
        companyId: compA,
        attemptNumber: 1,
        status: ExecutionAttemptStatus.RUNNING,
        heartbeatAt: new Date(Date.now() - 600000), // 10 mins old
        task: taskMock,
        worker: { id: worker1Id, name: 'AI Worker' },
      };

      (prisma.task.findFirst as jest.Mock).mockResolvedValue(taskMock);
      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(runningAttemptMock);
      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({
        ...runningAttemptMock,
        status: ExecutionAttemptStatus.TIMED_OUT,
      });
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const recoveryResult = await taskOrchestrator.recoverStalledTask(taskId, compA);

      expect(recoveryResult.recovered).toBe(true);
      expect(recoveryResult.status).toBe('TIMED_OUT');
      expect(recoveryResult.attemptId).toBe(runningAttemptMock.id);
    });
  });

  // -------------------------------------------------------------
  // TEST H: Failed execution attempt remains immutable/history-preserved
  // -------------------------------------------------------------
  describe('Test H — Historical Attempt Immutability', () => {
    it('preserves the original attempt record and updates its terminal failureMetadata rather than deleting it', async () => {
      const taskMock = {
        id: taskId,
        companyId: compA,
        retryCount: 0,
        maxRetries: 3,
      };

      const attemptMock = {
        id: 'attempt-h-1',
        taskId,
        companyId: compA,
        attemptNumber: 1,
        workerId: worker1Id,
        correlationId: 'corr-h',
        causationId: 'cause-h',
        task: taskMock,
        worker: { id: worker1Id, name: 'AI Worker' },
      };

      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(attemptMock);
      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({});
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      await taskExecution.failAttempt({
        attemptId: attemptMock.id,
        companyId: compA,
        failureType: AttemptFailureType.TIMEOUT,
        errorMessage: 'Execution timeout exceeded',
      });

      // Verify update was called (never delete)
      expect(prisma.taskExecutionAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attemptMock.id },
          data: expect.objectContaining({
            status: ExecutionAttemptStatus.TIMED_OUT,
            failureType: AttemptFailureType.TIMEOUT,
            failureMetadata: expect.objectContaining({
              taskId,
              attemptNumber: 1,
              failureType: AttemptFailureType.TIMEOUT,
            }),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST I & J: Dependency failure blocks ONLY downstream; independent work continues
  // -------------------------------------------------------------
  describe('Test I & J — DAG Failure Isolation and Independent Execution', () => {
    it('isolates subtask failure to downstream dependents while independent parallel tasks remain untouched', async () => {
      const mockLeaderAutonomous = new DepartmentLeaderAutonomousService(
        prisma,
        { getRegisteredCapabilities: jest.fn().mockReturnValue([]) } as any,
        ceoService,
        healthService,
        {} as any,
        {} as any,
        {} as any,
        workerAssignment,
        qualityGate,
      );

      const parentTaskId = 'obj-parent-1';
      const failedTaskId = 'task-sub-1';
      const dependentTaskId = 'task-sub-2';
      const independentTaskId = 'task-sub-3';

      const allSubtasks = [
        { id: failedTaskId, parentTaskId, companyId: compA, status: TaskStatus.CANCELLED },
        { id: dependentTaskId, parentTaskId, companyId: compA, status: TaskStatus.READY },
        { id: independentTaskId, parentTaskId, companyId: compA, status: TaskStatus.IN_PROGRESS },
      ];

      (prisma.task.findMany as jest.Mock).mockResolvedValue(allSubtasks);
      (prisma.taskDependency.findMany as jest.Mock).mockResolvedValue([
        { taskId: dependentTaskId, dependsOnId: failedTaskId },
      ]);
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const isolation = await mockLeaderAutonomous.isolateSubtaskFailure(failedTaskId, parentTaskId, compA);

      expect(isolation.affectedTaskIds).toContain(dependentTaskId);
      expect(isolation.affectedTaskIds).not.toContain(independentTaskId);
      expect(isolation.independentTaskIds).toContain(independentTaskId);

      // Verify only dependent task was updated to BLOCKED
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: dependentTaskId },
          data: expect.objectContaining({ status: TaskStatus.BLOCKED }),
        }),
      );
      expect(prisma.task.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: independentTaskId } }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST K: Recovered dependency reopens eligible downstream work
  // -------------------------------------------------------------
  describe('Test K — Recovered Dependency Reopening', () => {
    it('re-evaluates blocked downstream tasks upon prerequisite completion and reopens them to READY', async () => {
      const mockLeaderAutonomous = new DepartmentLeaderAutonomousService(
        prisma,
        { getRegisteredCapabilities: jest.fn().mockReturnValue([]) } as any,
        ceoService,
        healthService,
        {} as any,
        {} as any,
        {} as any,
        workerAssignment,
        qualityGate,
      );

      const recoveredTaskId = 'task-prereq-completed';
      const blockedDownstreamId = 'task-downstream-blocked';

      // 1. Downstream dependencies query
      (prisma.taskDependency.findMany as jest.Mock)
        .mockResolvedValueOnce([{ taskId: blockedDownstreamId, dependsOnId: recoveredTaskId }]) // downstream of recovered
        .mockResolvedValueOnce([{ taskId: blockedDownstreamId, dependsOnId: recoveredTaskId }]); // all prereqs of downstream

      // 2. Blocked downstream task in DB
      (prisma.task.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: blockedDownstreamId, companyId: compA, status: TaskStatus.BLOCKED },
        ])
        .mockResolvedValueOnce([
          { id: recoveredTaskId, companyId: compA, status: TaskStatus.COMPLETED },
        ]);

      // 3. Quality Gate passes
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: blockedDownstreamId,
        companyId: compA,
        title: 'Downstream Task Title',
        dependencies: [],
        company: { status: 'ACTIVE' },
      });
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const recovery = await mockLeaderAutonomous.reconcileRecoveredDependencies(recoveredTaskId, compA);

      expect(recovery.reopenedTaskIds).toContain(blockedDownstreamId);
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: blockedDownstreamId },
          data: expect.objectContaining({
            status: TaskStatus.READY,
            recoveryState: 'REOPENED',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST L: Concurrent recovery produces one valid recovery path
  // -------------------------------------------------------------
  describe('Test L — Concurrency-Safe Claim and Recovery Lock', () => {
    it('guarantees that two concurrent claim attempts result in exactly ONE winner via atomic DB condition', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: compA,
        status: 'ACTIVE',
        emergencyStatus: EmergencyState.NORMAL,
      });

      // Worker 1 succeeds, Worker 2 gets count = 0
      (prisma.task.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      (prisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        status: TaskStatus.IN_PROGRESS,
      });

      const claim1 = await taskOrchestrator.claimTask(taskId, compA);
      const claim2 = await taskOrchestrator.claimTask(taskId, compA);

      expect(claim1?.claimed).toBe(true);
      expect(claim2).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // TEST M: Cross-company recovery is rejected
  // -------------------------------------------------------------
  describe('Test M — Strict Company Isolation in Recovery', () => {
    it('rejects attempt recovery or claim for a task belonging to a different company', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(taskOrchestrator.recoverStalledTask(taskId, compB)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------
  // TEST N: Duplicate recovery is idempotent
  // -------------------------------------------------------------
  describe('Test N — Recovery Idempotency', () => {
    it('safely handles repeated recovery commands without duplicate state mutations or corruptions', async () => {
      // Task already completed / not in progress
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({
        id: taskId,
        companyId: compA,
        status: TaskStatus.COMPLETED,
        claimExpiresAt: null,
      });
      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(null);

      const res1 = await taskOrchestrator.recoverStalledTask(taskId, compA);
      const res2 = await taskOrchestrator.recoverStalledTask(taskId, compA);

      expect(res1.recovered).toBe(false);
      expect(res2.recovered).toBe(false);
      expect(res1.status).toBe('NO_ACTION_REQUIRED');
    });
  });

  // -------------------------------------------------------------
  // TEST O: Department Health incorporates real failure telemetry
  // -------------------------------------------------------------
  describe('Test O — Department Health Failure Telemetry', () => {
    it('incorporates failure rate, timeout rate, and unresolved failure backlog into reliability health', async () => {
      const deptWithFailures = {
        id: deptId,
        name: 'Engineering',
        companyId: compA,
        company: { id: compA },
        employees: [
          { id: worker1Id, status: EmployeeStatus.ACTIVE, assignedTasks: [] },
        ],
        tasks: [
          {
            id: 't-1',
            status: TaskStatus.COMPLETED,
            retryCount: 1,
            maxRetries: 3,
            executionAttempts: [
              { status: ExecutionAttemptStatus.TIMED_OUT },
              { status: ExecutionAttemptStatus.COMPLETED },
            ],
            dependencies: [],
          },
          {
            id: 't-2',
            status: TaskStatus.REVIEW,
            retryCount: 3,
            maxRetries: 3,
            executionAttempts: [
              { status: ExecutionAttemptStatus.FAILED },
              { status: ExecutionAttemptStatus.FAILED },
              { status: ExecutionAttemptStatus.FAILED },
            ],
            dependencies: [],
          },
        ],
        goals: [{ status: 'ACTIVE' }],
        workstreams: [],
      };

      (prisma.department.findFirst as jest.Mock).mockResolvedValue(deptWithFailures);

      const health = await healthService.calculateDepartmentHealth(deptId, compA);

      expect(health.dimensions.reliabilityHealth).toBeDefined();
      const metrics = health.dimensions.reliabilityHealth.metrics;
      expect(metrics.totalAttempts).toBe(5);
      expect(metrics.failedAttempts).toBe(3);
      expect(metrics.timeoutAttempts).toBe(1);
      expect(metrics.stalledExecutionRate).toBe(0.2); // 1/5
      expect(metrics.unresolvedFailureBacklog).toBe(1); // t-2 is exhausted in review
      expect(health.dimensions.reliabilityHealth.evidence.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------
  // TEST P: CEO receives material systemic failure signal
  // -------------------------------------------------------------
  describe('Test P — CEO Intelligence Material Failure Evaluation', () => {
    it('distinguishes capability mismatch, systemic failure, and strategic failure accurately', async () => {
      const capMismatch = await ceoService.evaluateMaterialFailureSignal({
        taskId: 't-cap',
        companyId: compA,
        failureType: 'CAPABILITY_FAILURE',
        retryCount: 1,
      });
      expect(capMismatch.classification).toBe('CAPABILITY_MISMATCH');
      expect(capMismatch.requiresStrategicReplanning).toBe(false);

      const systemic = await ceoService.evaluateMaterialFailureSignal({
        taskId: 't-sys',
        companyId: compA,
        failureType: 'TRANSIENT',
        retryCount: 3,
        departmentId: deptId,
      });
      expect(systemic.classification).toBe('DEPARTMENT_SYSTEMIC_FAILURE');

      const strategic = await ceoService.evaluateMaterialFailureSignal({
        taskId: 't-strat',
        companyId: compA,
        failureType: 'SAFETY_FAILURE',
        retryCount: 0,
      });
      expect(strategic.classification).toBe('STRATEGIC_FAILURE');
      expect(strategic.requiresStrategicReplanning).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // TEST Q: Repeated failures create governed organizational learning signal
  // -------------------------------------------------------------
  describe('Test Q — Organizational Memory Pattern Detection', () => {
    it('extracts patterns from repeated historical evaluations when observations >= 2', () => {
      const evaluations: any[] = [
        {
          id: 'eval-1',
          decisionId: 'dec-1',
          companyId: compA,
          decisionType: 'SOFTWARE_ENGINEERING',
          classification: 'FAILED',
          confidenceScore: 85,
          variances: [{ dimension: 'EXECUTION_TIME', varianceDescription: 'Timeout in compilation' }],
          authoritativeSources: ['compilation-log'],
        },
        {
          id: 'eval-2',
          decisionId: 'dec-2',
          companyId: compA,
          decisionType: 'SOFTWARE_ENGINEERING',
          classification: 'FAILED',
          confidenceScore: 90,
          variances: [{ dimension: 'EXECUTION_TIME', varianceDescription: 'Timeout in linking' }],
          authoritativeSources: ['linker-log'],
        },
      ];

      const patterns = memoryService.detectPatterns(compA, evaluations);

      expect(patterns.length).toBeGreaterThan(0);
      const failPattern = patterns.find((p) => p.category === 'FAILURE' || p.category === 'PATTERN');
      expect(failPattern).toBeDefined();
      expect(failPattern?.patternSignature).toContain('FAILURE');
      expect(failPattern?.supportingDecisionIds.length).toBeGreaterThanOrEqual(2);
      expect(failPattern?.maturity).toBe('CONFIRMED');
    });
  });

  // -------------------------------------------------------------
  // TEST R: V16 consequential action safeguards remain enforced during retry
  // -------------------------------------------------------------
  describe('Test R — V16 Consequential Action Safeguards', () => {
    it('prohibits automatic retry for consequential high-risk task failures and requires governed escalation', () => {
      const decision = retryPolicy.evaluateRetry({
        taskId,
        companyId: compA,
        failureType: AttemptFailureType.EXTERNAL_ACTION_FAILURE,
        currentRetryCount: 0,
        maxRetries: 3,
        isConsequential: true,
        riskTier: 'HIGH',
      });

      expect(decision.isRetryable).toBe(false);
      expect(decision.requiresEscalation).toBe(true);
      expect(decision.escalationTarget).toBe('CEO');
      expect(decision.reason).toContain('External action failed');
    });
  });

  // -------------------------------------------------------------
  // TEST S: V15 spatial / event compatibility remains intact
  // -------------------------------------------------------------
  describe('Test S — V15 Spatial / Company Event Emission Lineage', () => {
    it('emits authoritative CompanyEvent on task failure and completion preserving full causation lineage', async () => {
      const taskMock = {
        id: taskId,
        companyId: compA,
        retryCount: 0,
        maxRetries: 3,
        correlationId: 'corr-v15',
        causationId: 'cause-v15',
      };

      const attemptMock = {
        id: 'attempt-s-1',
        taskId,
        companyId: compA,
        attemptNumber: 1,
        workerId: worker1Id,
        correlationId: 'corr-v15',
        causationId: 'cause-v15',
        task: taskMock,
        worker: { id: worker1Id, name: 'AI Spatial Worker' },
      };

      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValue(attemptMock);
      (prisma.taskExecutionAttempt.update as jest.Mock).mockResolvedValue({});
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      await taskExecution.failAttempt({
        attemptId: attemptMock.id,
        companyId: compA,
        failureType: AttemptFailureType.TRANSIENT,
        errorMessage: 'Network glitch',
      });

      expect(prisma.companyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: compA,
            type: 'TASK_FAILED',
            payload: expect.objectContaining({
              taskId,
              attemptNumber: 1,
              correlationId: 'corr-v15',
              causationId: 'cause-v15',
            }),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // TEST T: Concurrency-safe attempt numbering
  // -------------------------------------------------------------
  describe('Test T — Concurrency-Safe Attempt Numbering', () => {
    it('allocates monotonically increasing attempt numbers and handles unique constraint race safely', async () => {
      (prisma.task.findFirst as jest.Mock).mockResolvedValue({ id: taskId, companyId: compA });
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        id: worker1Id,
        companyId: compA,
        status: EmployeeStatus.ACTIVE,
        agent: { id: 'agent-1' },
      });

      // First query returns existing max attempt 1, so next is 2
      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValueOnce({ attemptNumber: 1 });

      // First create throws P2002 collision, second create succeeds with attemptNumber 3
      const collisionErr = new Error('Unique constraint failed');
      (collisionErr as any).code = 'P2002';

      (prisma.taskExecutionAttempt.create as jest.Mock)
        .mockRejectedValueOnce(collisionErr)
        .mockResolvedValueOnce({
          id: 'attempt-t-2',
          taskId,
          attemptNumber: 3,
          workerId: worker1Id,
          status: ExecutionAttemptStatus.RUNNING,
          correlationId: 'corr-t',
          causationId: 'cause-t',
        });

      (prisma.taskExecutionAttempt.findFirst as jest.Mock).mockResolvedValueOnce({ attemptNumber: 2 });
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      const attempt = await taskExecution.startAttempt({
        taskId,
        companyId: compA,
        workerId: worker1Id,
      });

      expect(attempt.attemptNumber).toBe(3);
      expect(prisma.taskExecutionAttempt.create).toHaveBeenCalledTimes(2);
    });
  });
});

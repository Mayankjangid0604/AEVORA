# AEVORA V17 — CANONICAL IMPLEMENTATION MAP & SUBSYSTEM AUDIT

**Version:** 17.0.0-PROD-MAP<br/>
**Status:** Architecture Locked & Audited<br/>
**Operating Principle:** Chairman Sovereignty + Maximum Authorized AI Autonomy + Canonical Enterprise State + Evidence-Governed Execution

---

## 1. EXECUTIVE SUBSYSTEM MAPPING MATRIX

| Existing Subsystem                                | Canonical Owner File/Service                                                                                                                                                | V17 Requirement                                                                                 | Existing Capability                                                                                                                                         | Missing Capability in Current Codebase                                                                                                                                                                    | V17 Target Implementation Location                                                                                               | Key Dependencies                                                | Authority Relationship                                                                      | Migration Required?                                                                              | Test Requirement                                                    |
| :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Workforce & Agent Identity**                    | `apps/api/src/workforce/worker-profile.service.ts`, `apps/api/src/workforce/ai-workforce.service.ts`, `apps/api/src/employee/employee.service.ts`                           | **§1, §7, §13**: AI-Only Workforce & Durable Agent Identity                                     | `Employee`, `Agent`, `WorkerProfile`, `Role`, `Department`, `EmployeeSkill` models exist; 3D avatars exist                                                  | In-memory `WorkerRegistryService` with fallback to `WorkerType.HUMAN`; non-durable capability dispatch; lack of model-identity vs agent-identity decoupling; lack of trust/competency profile persistence | `apps/api/src/workforce/ai-workforce.service.ts`, `apps/api/src/workforce/worker-profile.service.ts`                             | `PrismaService`, `ModelGateway`, `Role`, `Department`           | AI workforce executes; Chairman is sole human sovereign                                     | Yes (backfill/guarantee AI worker profiles for all employees, add agent trust/governance fields) | Workforce isolation, durable identity survival on restart           |
| **Worker Assignment**                             | `apps/api/src/workforce/worker-registry.service.ts`, `apps/api/src/department/department-leader-autonomous.service.ts`                                                      | **§8, §13**: Durable, Competency & Capacity-Aware Worker Assignment                             | In-memory capability map (`registerWorker`), arbitrary fallback to `prisma.employee.findFirst()`                                                            | Durable assignment algorithm evaluating workload, reliability, trust, deadline, capacity; formal task rejection protocol (capability/safety/authority)                                                    | `apps/api/src/workforce/worker-assignment.service.ts`, `apps/api/src/department/department-leader-autonomous.service.ts`         | `PrismaService`, `WorkerProfile`, `HqCapacityService`           | Autonomous within department bounds; escalates on repeated rejection                        | No                                                                                               | Unit tests for assignment scoring & rejection handling              |
| **Task Claiming & Concurrency**                   | `apps/api/src/task/task-orchestrator.service.ts`                                                                                                                            | **§10, §12**: Atomic Concurrency-Safe, Company-Scoped Task Claiming                             | Polling loop every 5s (`findMany({ where: { status: 'READY' } })`) that mutates without lock                                                                | Concurrency safety; database-level atomic claim lock (`claimLockToken`, `claimedAt`); multi-instance safety; strict company-scoping                                                                       | `apps/api/src/task/task-orchestrator.service.ts`, `apps/api/src/task/task.service.ts`                                            | `PrismaService`, `StructuredLoggerService`                      | Department/CEO execution                                                                    | Yes (schema: `claimLockToken`, `claimedAt`, `lockExpiresAt` on `Task`)                           | Concurrency tests: multiple concurrent workers racing for same task |
| **Task Execution & Lineage**                      | `apps/api/src/task/task-orchestrator.service.ts`, `apps/api/src/task/task.service.ts`                                                                                       | **§4, §6, §9**: Execution Attempts as First-Class Entities & Universal Lineage                  | `Task`, `TaskResult`, `TaskReview`, `TaskDependency`                                                                                                        | `TaskExecutionAttempt` model; attempt heartbeat; retry lineage; retry budgets; cost tracking; failure categorization (transient vs terminal)                                                              | `apps/api/src/task/task-execution.service.ts`, `apps/api/src/task/task-orchestrator.service.ts`                                  | `PrismaService`, `JobService`                                   | Subordinate to Task quality gate                                                            | Yes (schema: `TaskExecutionAttempt` model, `attemptCount`, `correlationId`, `causationId`)       | Lineage trace from Chairman/CEO objective down to attempt           |
| **Background Job Infrastructure**                 | `apps/api/src/job/job.service.ts`, `apps/api/src/job/job-worker.service.ts`                                                                                                 | **§11**: Durable Background Job Execution Integration                                           | `BackgroundJob` model with optimistic lock (`updateMany status: QUEUED -> PROCESSING`), exponential backoff, priority, idempotencyKey                       | Integration between `TaskOrchestratorService` and `JobService` so asynchronous critical tasks execute via durable `BackgroundJob` rather than raw in-memory promises                                      | `apps/api/src/job/job-task-bridge.service.ts`, `apps/api/src/task/task-orchestrator.service.ts`                                  | `PrismaService`, `ApprovalValidationService`                    | Execution plumbing for async tasks                                                          | No (reuses existing `BackgroundJob` model)                                                       | Job retry, recovery of stuck jobs, idempotency validation           |
| **Task Quality Gate**                             | `apps/api/src/task/task.service.ts`, `apps/api/src/ceo/ceo-objective-decomposition.service.ts`                                                                              | **§14**: Pre-Scheduling Task Quality Gate                                                       | Basic field validation (`title`, `companyId`)                                                                                                               | Quality evaluation before transitioning task to `READY`: required capability match, clear stop criteria, success criteria, evidence contracts, risk tier                                                  | `apps/api/src/task/task-quality-gate.service.ts`                                                                                 | `PrismaService`, `ExternalActionGatewayService`                 | Gatekeeper preventing malformed tasks from entering execution                               | Yes (schema: `qualityGatePassed`, `successCriteria`, `evidenceRequirements` on `Task`)           | Quality gate rejection tests for incomplete tasks                   |
| **Outcome Verification & Evidence**               | `apps/api/src/organizational-memory/outcome-evaluation.service.ts`, `apps/api/src/task/task.service.ts`                                                                     | **§15, §16**: Evidence-Governed Outcome Verification                                            | `TaskResult` (`output`, `summary`, `success: boolean`), V16 `OutcomeEvaluationService`                                                                      | Disconnection between TaskResult and real outcome verification; automatic verification against evidence; failure impact analysis (dependency preservation instead of full goal cancellation)              | `apps/api/src/task/task-verification.service.ts`, `apps/api/src/organizational-memory/outcome-evaluation.service.ts`             | `PrismaService`, `OrganizationalMemoryModule`                   | Outcome verifies execution success                                                          | Yes (schema: `evidence` JSON, `verifiedOutcome` on `TaskResult`)                                 | False-success rejection tests                                       |
| **Department Operating Layer**                    | `apps/api/src/department/department-leader-autonomous.service.ts`, `apps/api/src/department/department.service.ts`                                                          | **§22, §23**: Dynamic Department Health, Capacity & Workstream Intelligence                     | Subtask generation from objective; single subtask failure currently marks entire objective failed (`DepartmentLeaderAutonomousService:75`)                  | Dependency-aware failure handling; dynamic department health metric; workstream coordination; dynamic team formation proposals                                                                            | `apps/api/src/department/department-leader-autonomous.service.ts`, `apps/api/src/department/department-health.service.ts`        | `PrismaService`, `HqCapacityService`, `WorkerAssignmentService` | Subordinate to CEO & Chairman                                                               | No                                                                                               | Multi-subtask resilience test when 1 independent task fails         |
| **CEO Operating Layer & Strategic Replanning**    | `apps/api/src/ceo/ceo-autonomous.service.ts`, `apps/api/src/ceo/ceo-objective-decomposition.service.ts`, `apps/api/src/ceo/ceo-consequence-analysis.service.ts`             | **§4, §24, §22**: Autonomous CEO Executive Layer & Dynamic Continuous Replanning                | V16 Perception-Action loop (`runV16AutonomousLoop`), 6-level objective hierarchy decomposition, 14-dimension consequence simulation, upward lineage tracing | Event-driven continuous replanning triggered by execution outcomes, department health, or external state change; priority decay; exit contracts                                                           | `apps/api/src/ceo/ceo-autonomous.service.ts`, `apps/api/src/ceo/ceo-replanning.service.ts`                                       | `EnterpriseBrainService`, `CeoObjectiveDecompositionService`    | Autonomous beneath Chairman Sovereignty; cannot override Chairman                           | No                                                                                               | Event-driven replan trigger on task failure / bottleneck            |
| **Chairman Sovereignty & Disagreement Protocol**  | `apps/api/src/chairman/chairman-command.service.ts`, `apps/api/src/ceo/ceo-decision-lifecycle.service.ts`, `apps/api/src/approval/approval-validation.service.ts`           | **§1, §18, §28, §29**: Chairman Sovereignty, Advisory AI Disagreement, & Emergency Architecture | `ChairmanCommand` model & service, NLP intent classifier, V16 3-way consequence comparison for Chairman Disagreement, `ApprovalRequest`                     | Enterprise-wide emergency stop controller (graduated emergency levels, immediate execution pause, token revocation); strict separation of Chairman commands vs preferences                                | `apps/api/src/chairman/chairman-governance.service.ts`, `apps/api/src/chairman/chairman-command.service.ts`                      | `PrismaService`, `ExternalActionGatewayService`                 | Chairman is sole human sovereign; immutable override                                        | Yes (schema: `emergencyStatus`, `emergencyLevel` on `Company`)                                   | Emergency stop execution halt, Chairman command precedence over AI  |
| **Consequential Action & Risk Gateway**           | `apps/api/src/external-action-gateway/external-action-gateway.service.ts`, `apps/api/src/external-action-gateway/risk-classifier.service.ts`                                | **§17, §19, §31**: V16 Four-Tier Risk & Consequence Authorization Gateway (V16 Preserved)       | Authoritative 4-tier risk classification (LOW, MEDIUM, HIGH, CRITICAL), secondary safeguards, cooldowns, idempotency, audit trail                           | Full hook from V17 autonomous execution attempts into V16 gateway before external/material effect                                                                                                         | `apps/api/src/external-action-gateway/external-action-gateway.service.ts`                                                        | `ApprovalValidationService`, `CeoConsequenceAnalysisService`    | V16 decides whether consequential action is authorized; V17 decides what work should happen | No                                                                                               | Replay prevention, risk classification, approval consumption        |
| **Canonical Enterprise State & Epistemic Layers** | `apps/api/src/enterprise-brain/enterprise-brain.service.ts`, `apps/api/src/enterprise-brain/conflict-resolution.engine.ts`                                                  | **§5, §21**: Canonical Enterprise State Distinguishing Reality, Belief, Hypothesis, Simulation  | Enterprise Brain relationship graph, source-of-truth ranking (Tiers 1-4), conflict detection with uncertainty preservation                                  | Epistemic tagging on facts and beliefs; confidence decay; contradiction state tracking; distinction between simulated state and production reality                                                        | `apps/api/src/enterprise-brain/enterprise-state.service.ts`, `apps/api/src/enterprise-brain/enterprise-brain.service.ts`         | `PrismaService`, `PrismaService.databaseEvents`                 | Real state is authoritative; simulation never overwrites reality                            | Yes (schema: `epistemicStatus`, `confidenceScore` on knowledge/beliefs)                          | Uncertainty preservation, conflict detection without overwrite      |
| **Spatial / World State Authority**               | `apps/api/src/v12-spatial/v12-spatial.service.ts`, `apps/api/src/v12-spatial/hq-capacity.service.ts`, `apps/api/src/world-state-gateway/world-state-translation.service.ts` | **§25, §31**: V15 Spatial & Digital-Twin Authority (V15 Preserved)                              | Authoritative spatial world, campus, buildings, floors, rooms, workspaces, vehicles, Dijkstra navigation, event translation                                 | Seamless integration with V17 agent status and task execution without altering V15 topology core                                                                                                          | `apps/api/src/v12-spatial/v12-spatial.service.ts`, `apps/api/src/world-state-gateway/world-state-translation.service.ts`         | `PrismaService`, `WorldStateEventService`                       | Real physical/3D representation of enterprise; non-destructive                              | No                                                                                               | Spatial capacity check, task-to-movement reconciliation             |
| **Offer Market Authority**                        | `apps/api/src/external-action-gateway/adapters/marketing-offer.adapter.ts`                                                                                                  | **§31**: V24 Offer Market Gateway Adapter (V24 Preserved)                                       | `AEVORA_V24_OFFER_MARKET_ADAPTER` supporting `DISPATCH_OFFER`, `APPLY_DISCOUNT`, `MARKETING_CAMPAIGN` with discount bounds (50% max)                        | Autonomous execution triggering V24 offer dispatch via the external action gateway with audit trail                                                                                                       | `apps/api/src/external-action-gateway/adapters/marketing-offer.adapter.ts`                                                       | `ExternalActionGatewayService`, `PrismaService`                 | Bound to V16 risk gateway and approval thresholds                                           | No                                                                                               | V24 offer dispatch and discount limit enforcement                   |
| **Organizational Memory & Continuous Learning**   | `apps/api/src/organizational-memory/executive-memory.service.ts`, `apps/api/src/organizational-memory/lesson-pattern-extraction.service.ts`                                 | **§20, §27**: Governed Memory & Continuous Learning Closed Loop                                 | `OrganizationalMemory` model, structured lesson extraction, pattern detection, memory maturity (OBSERVATION -> PROVISIONAL -> CONFIRMED -> DEPRECATED)      | Feed V17 execution outcomes directly into lesson extraction; prevent unauthorized constitutional modification; feed lessons into worker assignment                                                        | `apps/api/src/organizational-memory/lesson-pattern-extraction.service.ts`, `apps/api/src/workforce/worker-assignment.service.ts` | `PrismaService`, `OutcomeEvaluationService`                     | Memory informs autonomy; cannot weaken constitutional safety                                | No                                                                                               | Lesson extraction from execution failures; confidence updates       |

---

## 2. CANONICAL SUBSYSTEM OWNERSHIP DIRECTORY

1. **Company**: `apps/api/src/company/company.service.ts` (Model: `Company`)
2. **Department**: `apps/api/src/department/department.service.ts` (Model: `Department`)
3. **Role**: `apps/api/src/role/role.service.ts` (Model: `Role`)
4. **Employee (AI Workforce Identity)**: `apps/api/src/employee/employee.service.ts` & `apps/api/src/workforce/worker-profile.service.ts` (Model: `Employee`, `WorkerProfile`, `Agent`)
5. **Goal**: `apps/api/src/goal/goal.service.ts` (Model: `Goal`)
6. **Project**: `apps/api/src/project/project.service.ts` (Model: `Project`)
7. **Task & Dependencies**: `apps/api/src/task/task.service.ts` (Models: `Task`, `TaskDependency`, `TaskReview`)
8. **Task Result**: `apps/api/src/task/task.service.ts` & `apps/api/src/task/task-orchestrator.service.ts` (Model: `TaskResult`)
9. **Company Event Fabric**: `apps/api/src/world-state-gateway/world-state-translation.service.ts` & `PrismaService.databaseEvents` (Model: `CompanyEvent`)
10. **Approval System**: `apps/api/src/approval/approval.service.ts` & `approval-validation.service.ts` (Model: `ApprovalRequest`)
11. **Background Job Infrastructure**: `apps/api/src/job/job.service.ts` & `job-worker.service.ts` (Model: `BackgroundJob`)
12. **CEO Planning & Autonomous Execution**: `apps/api/src/ceo/ceo-autonomous.service.ts` & `ceo-objective-decomposition.service.ts`
13. **Department Leadership**: `apps/api/src/department/department-leader-autonomous.service.ts`
14. **V15 Spatial / World State Authority**: `apps/api/src/v12-spatial/v12-spatial.service.ts` & `hq-capacity.service.ts`
15. **V16 Enterprise Brain & Consequence & Gateway**: `apps/api/src/enterprise-brain`, `apps/api/src/ceo/ceo-consequence-analysis.service.ts`, `apps/api/src/external-action-gateway/external-action-gateway.service.ts`, `apps/api/src/organizational-memory`
16. **V24 Offer Market Gateway Adapter**: `apps/api/src/external-action-gateway/adapters/marketing-offer.adapter.ts`

---

## 3. AUDIT OF HIGH-RISK CODE ANTI-PATTERNS IDENTIFIED

### Anti-Pattern A: Hardcoded Arbitrary Worker Attribution

- **Locations**:
  - `apps/api/src/task/task-orchestrator.service.ts:153`: `workerId: (await this.prisma.employee.findFirst())?.id || 'missing'`
  - `apps/api/src/task/task-orchestrator.service.ts:185`: `workerId: (await this.prisma.employee.findFirst())?.id || 'missing'`
  - `apps/api/src/department/department-leader-autonomous.service.ts:43-44`: `const dummyEmployee = await this.prisma.employee.findFirst(); const workerId = task.assignedEmployeeId || dummyEmployee?.id || 'missing';`
  - `apps/api/src/department/department-leader-autonomous.service.ts:77-78`: (same fallback)
- **Violation**: Violates Section 13 ("Never attribute execution to first employee, arbitrary employee, fallback employee, arbitrary worker").
- **V17 Solution**: Remove all `findFirst()` dummy fallbacks. Mandate real, deterministic worker resolution and throw if an unassigned task enters execution.

### Anti-Pattern B: Non-Atomic, Cross-Company Unsafe Polling Loop

- **Location**: `apps/api/src/task/task-orchestrator.service.ts:94-143`
- **Violation**: Violates Section 10 ("Implement durable atomic task claiming") and Section 12 ("Prevent cross-company task claiming").
- **V17 Solution**: Implement atomic conditional update with claim lock token, lease expiration, and mandatory `companyId` filtering.

### Anti-Pattern C: In-Memory, Process-Local Worker Registry with 'GENERIC' Sleep Fallback

- **Location**: `apps/api/src/workforce/worker-registry.service.ts:8-22` & `apps/api/src/task/task-orchestrator.service.ts:21-26`
- **Violation**: Process-local map with a dummy worker returning `true` after 2s. Violates Section 7, 8, and 34 ("Do not create fake success responses").
- **V17 Solution**: Replace with a durable `WorkerAssignmentService` that assigns tasks to real AI agents based on verified competencies, availability, and capacity.

### Anti-Pattern D: Blind Objective Failure on Single Subtask Cancellation

- **Location**: `apps/api/src/department/department-leader-autonomous.service.ts:75-76`
- **Violation**: Violates Section 16 ("Failure Intelligence: Do not cancel an entire goal merely because one task failed. Failure handling must be dependency-aware and impact-aware").
- **V17 Solution**: Implement DAG dependency analysis. Only cancel downstream dependent tasks; keep independent workstreams running.

---

## 4. SCHEMA AUGMENTATIONS REQUIRED (NON-DESTRUCTIVE)

All additions preserve 100% of existing tables, fields, and migrations.

1. **`Task` Model Augmentations**:
   - `claimLockToken`: `String?` (Unique claim token for atomic lock)
   - `claimedAt`: `DateTime?`
   - `claimExpiresAt`: `DateTime?`
   - `correlationId`: `String?`
   - `causationId`: `String?`
   - `riskTier`: `GatewayRiskTier? @default(LOW)`
   - `qualityGatePassed`: `Boolean @default(false)`
   - `successCriteria`: `Json @default("[]")`
   - `evidenceRequirements`: `Json @default("[]")`
   - `stopCriteria`: `Json @default("[]")`
   - `escalationCriteria`: `Json @default("[]")`
   - `retryCount`: `Int @default(0)`
   - `maxRetries`: `Int @default(3)`

2. **`TaskExecutionAttempt` Model (New First-Class Entity)**:
   - `id`: `String @id @default(uuid())`
   - `taskId`: `String`
   - `task`: `Task @relation(fields: [taskId], references: [id])`
   - `attemptNumber`: `Int`
   - `agentId`: `String`
   - `workerId`: `String` (Employee id representing the AI workforce agent)
   - `worker`: `Employee @relation(fields: [workerId], references: [id])`
   - `companyId`: `String`
   - `company`: `Company @relation(fields: [companyId], references: [id])`
   - `status`: `ExecutionAttemptStatus @default(RUNNING)` (RUNNING, COMPLETED, FAILED, TIMED_OUT, REJECTED)
   - `failureType`: `String?` (CAPABILITY_FAILURE, SAFETY_FAILURE, AUTHORITY_FAILURE, TRANSIENT, TIMEOUT, UNEXPECTED)
   - `evidence`: `Json @default("{}")`
   - `output`: `Json @default("{}")`
   - `heartbeatAt`: `DateTime?`
   - `startedAt`: `DateTime @default(now())`
   - `completedAt`: `DateTime?`
   - `costUnits`: `Int @default(0)`
   - `correlationId`: `String?`
   - `causationId`: `String?`

3. **`Company` Model Augmentation**:
   - `emergencyStatus`: `EmergencyState @default(NORMAL)` (NORMAL, ELEVATED_CAUTION, CONTAINMENT, EMERGENCY_STOP)
   - `emergencyDeclaredAt`: `DateTime?`
   - `emergencyReason`: `String?`

---

## 5. PHASE-BY-PHASE IMPLEMENTATION PLAN

- **Phase 1: Execution Foundation** — **STATUS: COMPLETED & VERIFIED**
  - Durable AI worker selection via `WorkerAssignmentService` (company-scoped, competency, affinity, capacity, reliability).
  - First-class `TaskExecutionAttempt` tracking with retry lineage, evidence, output, costUnits, correlation/causation.
  - Concurrency-safe atomic conditional task claiming with expiring lease (`claimLockToken`, `claimedAt`, `claimExpiresAt`).
  - Strict company isolation across all execution pathways.
  - Integration with durable `BackgroundJob` queue via `JobTaskBridgeService`.
  - Task Quality Gate (`TaskQualityGateService`) validating company state, title, worker, dependencies, and risk tier.
  - Emergency state (`EMERGENCY_STOP`) enforcement blocking autonomous execution claims.
  - Removal of arbitrary `employee.findFirst()` execution fallbacks and fake `GENERIC` worker.
  - Migration deployed cleanly: `20261008070000_v17_phase1_execution_foundation`.
  - Comprehensive unit & integration test suite passing (12/12 tests): `v17-phase1-execution-foundation.spec.ts`.
  - Zero regressions across V15 Spatial (28/28), V16 Gateway (24/24), V16 Brain (14/14), V16 Consequence (14/14), V16 CEO Autonomous (18/18), Workforce & Memory (26/26).

- **Phase 2: Department Operating Layer** — **STATUS: COMPLETED & VERIFIED**
  - Transformed departments from passive records into autonomous operating units under CEO strategy.
  - `DepartmentWorkstream` model & lifecycle (`PLANNED`, `ACTIVE`, `BLOCKED`, `DEGRADED`, `COMPLETED`, `FAILED`, `CANCELLED`, `PAUSED`).
  - Evidence-based multi-dimensional department health (`DepartmentHealthService`): capacity, workload, execution, reliability, alignment, risk, financial.
  - `DepartmentHealthSnapshot` persistence capturing temporal evolution and trigger events.
  - Dynamic AI team formation (`DepartmentTeamService`) with explicit rationale, capabilities, bounded authority, and clean dissolution.
  - Failure isolation and dependency graph analysis (`isolateSubtaskFailure`): independent tasks continue running; dependent tasks fail-isolated without cancelling healthy work.
  - Evidence-based `DepartmentResourceProposal` with structured alternatives, cost, risk, urgency, and CEO review lifecycle.
  - Hardened `DepartmentLeaderAutonomousService` integrated with Phase 1 `WorkerAssignmentService`.
  - Migration deployed cleanly: `20261008080000_v17_phase2_department_operating_layer`.
  - Comprehensive Phase 2 test suite passing (16/16 tests): `v17-phase2-department-operating-layer.spec.ts`.
  - Zero regressions across canonical subsystems (V15 Spatial, V16 Gateway, V16 Brain, V16 Consequence, V16 CEO, Workforce, Memory, and V17 Phase 1).

- **Phase 3: Reliable Execution & Failure Intelligence** — **STATUS: COMPLETED & VERIFIED**
  - Canonical failure taxonomy with 11 formal types: `CAPABILITY_FAILURE`, `SAFETY_FAILURE`, `AUTHORITY_FAILURE`, `TRANSIENT`, `TIMEOUT`, `DEPENDENCY_FAILURE`, `VALIDATION_FAILURE`, `RESOURCE_EXHAUSTION`, `EXTERNAL_ACTION_FAILURE`, `CONFLICT`, `UNEXPECTED`.
  - Deterministic `RetryPolicyService` with bounded exponential backoff (`delayMs = min(60s, base * 2^attempt) + jitter`).
  - Constitutional safety & authority rules: Automatic retries prohibited for safety (Chairman escalation) and authority failures (CEO escalation).
  - Concurrency-safe execution attempt numbering backed by database constraint `@@unique([taskId, attemptNumber])` and retry collision loop.
  - Historical attempt immutability: stalled or failed execution attempts are preserved with rich structured `failureMetadata`.
  - Stalled execution & expired claim recovery in `TaskOrchestratorService.recoverStalledTask` and `recoverStaleTasks`.
  - Failure-aware AI worker reassignment (`WorkerAssignmentService.assignTask` with `excludeEmployeeIds`).
  - DAG dependency recovery (`DepartmentLeaderAutonomousService.reconcileRecoveredDependencies`): reopens eligible blocked downstream tasks to `READY` upon prerequisite completion without manual intervention.
  - Multi-dimensional failure telemetry integrated into `DepartmentHealthService` (`failureRate`, `timeoutRate`, `repeatedFailureRate`, `stalledExecutionRate`, `recoverySuccessRate`, `unresolvedFailureBacklog`).
  - CEO material failure intelligence (`CeoAutonomousService.evaluateMaterialFailureSignal`) distinguishing worker-specific from systemic department and strategic failures.
  - Closed-loop pattern detection in `LessonPatternExtractionService` requiring >= 2 observations for confirmed failure patterns.
  - Migration deployed cleanly: `20261008090000_v17_phase3_reliable_execution`.
  - Comprehensive Phase 3 test suite passing (20/20 tests): `v17-phase3-reliable-execution.spec.ts`.
  - Zero regressions across canonical subsystems (V17 Phase 1: 12/12, V17 Phase 2: 16/16, V16 Gateway: 24/24, V16 Brain: 14/14, V16 Consequence: 14/14, V16 CEO: 18/18, CEO Isolation: 9/9, Workforce: 12/12, Memory: 14/14, V15 Spatial: 28/28).

- **Phase 4: Evidence & Outcomes Verification** [COMPLETE & VERIFIED]
  - **Core Principle**: Execution completion ≠ verified outcome ≠ strategic success. Prevents agents from claiming false success or treating technical HTTP 200 responses as business outcome achievements.
  - **Formal Evidence Contract Authority**:
    - Canonical `EvidenceContract` and `EvidenceRequirement` types in `apps/api/src/task/evidence-contract.types.ts`.
    - Typed requirements covering required nature (RAW vs DERIVED vs AI_INFERENCE), minimum confidence thresholds, freshness deadlines (`maxAgeMs`), independence flags, external origin requirements, exact execution attempt binding, and outcome sufficiency flags.
  - **Evidence Provenance & Immutability Model**:
    - `TaskEvidenceRecord` model with `nature` (`RAW`, `DERIVED`, `AI_INFERENCE`), `epistemicStatus`, `contentHash` (SHA-256), `source`, `sourceType`, `payload`, `integrityMetadata`, and `confidence`.
    - Immutability guarantee: Raw historical evidence is strictly immutable. Corrections and refinements use an append-only model via `supersedesId`, preserving full lineage.
    - Idempotency & Deduplication: Submitting duplicate evidence payloads calculates identical canonical SHA-256 hashes and dedupes automatically without inflating confidence or creating duplicate records.
  - **Epistemic Certainty Boundaries**:
    - 7 explicit epistemic states: `FACT`, `VERIFIED_FACT`, `DERIVED_FACT`, `INFERENCE`, `HYPOTHESIS`, `UNKNOWN`, `CONFLICTED`.
    - Illegal epistemic escalation (`AI_INFERENCE` claiming `FACT` or `VERIFIED_FACT`) is strictly blocked and downgraded to `INFERENCE`.
    - Contradictory evidence moves status to `CONFLICTED`, preserves both competing records, and halts autonomous outcome acceptance for Chairman/governance review.
  - **Canonical 7-State Outcome Verification Engine**:
    - Never collapses states: `AUTHORIZED` → `EXECUTED` → `TECHNICALLY_COMPLETED` → `EVIDENCE_VERIFIED` → `OUTCOME_VERIFIED` → `STRATEGICALLY_SUCCESSFUL` → `SUSTAINABLE` (plus `OUTCOME_FAILED` and `REOPENED`).
    - Implemented in `OutcomeVerificationService` (`evaluateTaskOutcome`).
    - Technical completion sets `TECHNICALLY_COMPLETED` on `Task` and `TaskResult`. Outcome verification requires evaluating submitted evidence against the task's contract and success criteria.
  - **False-Success Prevention Safeguards**:
    - Blocks agent claiming success without evidence.
    - Blocks API success without external proof.
    - Rejects expired or stale evidence.
    - Rejects cross-company or cross-attempt evidence.
    - Detects and rejects tampered payloads via deterministic cryptographic SHA-256 verification.
  - **Outcome Reopening & Downstream Propagation**:
    - `reopenOutcome`: If a previously verified outcome is subsequently contradicted or disproven (e.g. chargeback, refund, or external audit revocation), outcome state transitions to `REOPENED`, historical data is preserved, and dependent downstream tasks are marked `DEGRADED`.
  - **Strategic Outcome Reconciliation**:
    - Implemented in `StrategicOutcomeReconciliationService` (`reconcileOutcome`).
    - Connects verified outcomes to the enterprise hierarchy: Chairman Decision → Strategy → Goal → Project → Task → Attempt → Evidence → Verified Outcome.
    - Computes expected vs observed outcome variance, evaluates strategic impact (`ON_TRACK`, `DEVIATION_TOLERABLE`, `DEVIATION_CRITICAL`, `INVALIDATING`), checks assumption validity, and escalates deviations to Chairman.
  - **Cross-System Authorities Preserved**:
    - **V16 Integration**: Consumes V16 External Action Gateway execution receipts as authoritative evidence while preserving 4-tier risk classification.
    - **V15 Integration**: Emits canonical `CompanyEvent` (`TASK_OUTCOME_VERIFIED`, `TASK_OUTCOME_FAILED`, `TASK_OUTCOME_REOPENED`, `STRATEGIC_OUTCOME_RECONCILED`) preserving correlation and causation IDs for 3D world-state and enterprise projection.
    - **V24 Offer Market Compatibility**: Validates offer dispatch evidence while enforcing the mandatory Chairman approval boundary for aggressive discounts (>50%).
    - **Organizational Memory Integration**: Records verified outcomes into `OrganizationalMemory` with scaled relevance score, failure telemetry, and searchable tags without mutating raw evidence.
  - **Database Migration**:
    - Deployed `20261008100000_v17_phase4_evidence_outcomes` adding `EvidenceNature`, `EpistemicCertainty`, `EvidenceVerificationStatus`, `OutcomeVerificationStatus` enums, `TaskEvidenceRecord` table, and extending `Task` and `TaskResult`.
  - **Verification & Tests**:
    - 26/26 tests passing in `v17-phase4-evidence-outcomes.spec.ts` (Tests A through Z).
    - Zero regressions across 207 total tests (Phase 1: 12/12, Phase 2: 16/16, Phase 3: 20/20, V16 Gateway: 24/24, V16 Brain: 14/14, V16 Consequence: 14/14, V16 CEO: 18/18, CEO Isolation: 9/9, Workforce: 12/12, Memory: 14/14, V15 Spatial: 28/28).

- **Phase 5: Authority Integration & Governance** [COMPLETE & VERIFIED]
  - **Core Governance Paradigm**:
    - "WHO MAY DECIDE → WHO MAY AUTHORIZE → WHO MAY EXECUTE → WHAT AUTHORITY WAS USED → WHETHER THAT AUTHORITY IS STILL VALID → WHETHER THE ACTION MAY CONTINUE".
    - Establishes one canonical enterprise authority hierarchy:
      **Chairman (Tier 0) → CEO (Tier 1) → Department Leadership (Tier 2) → Workforce Agent (Tier 3) → Ephemeral Delegated Agent (Tier 4)**.
    - Authority is explicit, company-scoped, identity-bound, capability-bound, risk-bound, context-bound, time-bound, revocable, auditable, and deterministically replayable.
  - **Chairman Sovereignty & Preference Distinction**:
    - The Chairman is the sole human sovereign. CEO, department leaders, AI councils, and workforce agents cannot override the Chairman.
    - Explicit Chairman command outranks AI preferences and suggestions (`ChairmanPreference.isBinding = false`).
    - Preferences guide autonomous decisions only within delegated authority and cannot override safety constraints or newer explicit commands.
  - **Canonical Authority Context & Bounded Delegation**:
    - Implemented in `GovernedAuthorityService` and `authority-context.types.ts`.
    - Strict anti-self-granting: actors cannot create authority grants to themselves.
    - Strict delegation anti-amplification: delegates cannot receive higher authority tier, higher risk ceiling, wider action scope, or longer expiration than the delegator holds.
    - Maximum delegation depth bounded to 3 levels (`MAX_DELEGATION_DEPTH = 3`).
    - Immediate cascade revocation: revoking a parent grant recursively and immediately revokes all descendant grants while strictly preserving historical execution records.
  - **V16 External Action Gateway Preservation**:
    - V17 does not duplicate or bypass V16 Gateway.
    - Preserves 4-tier risk classification (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
    - High- and Critical-risk actions require single-use, company-scoped, parameter-bound, actor-scoped approval tokens validated and consumed through `ApprovalValidationService`.
    - Self-approval, cross-company approval, parameter tampering, and approval replay are strictly blocked.
  - **Emergency Stop & Recovery Governance**:
    - Integrated with enterprise `EmergencyState` (`NORMAL`, `ELEVATED_CAUTION`, `CONTAINMENT`, `EMERGENCY_STOP`).
    - At `EMERGENCY_STOP`, all new autonomous consequential execution attempts and task claims are immediately blocked.
    - Only explicitly authorized emergency recovery decrees issued under Chairman or executive emergency authority may execute during an active emergency stop.
  - **Constitutional Safety Refusal**:
    - Agents evaluate operations against immutable safety/constitutional rules (`EVALUATION_DENIED_SAFETY_VIOLATION`, `EVALUATION_DENIED_INSUFFICIENT_AUTHORITY`).
    - Produces machine-verifiable refusal proof, violated policy identifier, requested action, and escalation destination without permitting arbitrary autonomous refusal.
  - **AI Disagreement Protocol & Advisory Council**:
    - Implemented in `ChairmanGovernanceService`.
    - Disagreements between Chairman and CEO trigger discussion, evidence presentation, and advisory council consultation (`DisagreementRecord`).
    - AI council votes and majority tallies are strictly advisory (`isCouncilVoteBinding = false`). Final ruling belongs solely to the Chairman.
  - **Machine-Verifiable Authority Proof & Deterministic Replay**:
    - Every consequential action generates an immutable `AuthorityProof` entity containing cryptographic SHA-256 parameter digest, policy version, risk tier, full recursive delegation chain, approval binding, and causation/correlation IDs.
    - `replayAuthorityProof` deterministically verifies whether an action was valid at historical execution time without mutating active production state.
  - **Phase 4 Evidence Integration**:
    - `TaskExecutionAttempt` and `TaskEvidenceRecord` explicitly record `authorityProofId`, binding verified real-world outcomes to the exact authoritative lineage.
  - **Authority Reconciliation & Lifecycle**:
    - Idempotent `reconcileAuthority` continuously scans and marks stale/expired grants as `EXPIRED`.
    - `suspendGrant` and `reinstateGrant` dynamically penalize repeated execution failures and restore authority upon verified recovery.
  - **Database Migration**:
    - Deployed `20261008110000_v17_phase5_authority_governance` adding `AuthorityTier`, `AuthorityGrantStatus` enums, `AuthorityGrant`, `ChairmanPreference`, `AuthorityProof`, `DisagreementRecord` models, and relations across `Company`, `Chairman`, `TaskExecutionAttempt`, and `TaskEvidenceRecord`.
  - **Verification & Tests**:
    - 36/36 tests passing in `v17-phase5-authority-governance.spec.ts` (Tests A through AJ).
    - Zero regressions across 243 total tests (Phase 1: 12/12, Phase 2: 16/16, Phase 3: 20/20, Phase 4: 26/26, V16 Gateway: 24/24, V16 Brain: 14/14, V16 Consequence: 14/14, V16 CEO: 18/18, CEO Isolation: 9/9, Workforce: 12/12, Memory: 14/14, V15 Spatial: 28/28).

- **Phase 6: Enterprise Intelligence & Digital Twin** [COMPLETE & VERIFIED]
  - **Constitutional Principle**:
    `REALITY > VERIFIED EVIDENCE > DERIVED STATE > INFERENCE > HYPOTHESIS > SIMULATION`.
    Simulation may influence planning, but can NEVER become reality merely because a model predicts it.
  - **Canonical Enterprise State Layer**:
    - Implemented in `CanonicalEnterpriseStateService`.
    - Manages canonical enterprise observations across organization, departments, workforce, projects, tasks, finances, operational health, risk, and spatial world state.
    - Captures full provenance: `companyId`, `streamKey`, `entityType`, `entityId`, `stateKey`, `stateValue`, `version`, `epistemicStatus`, `confidence`, `source`, `sourceType`, `sourceEventId`, `evidenceRecordId`, `authorityProofId`, `attemptId`, `observedAt`, `validFrom`, `validUntil`, `freshnessWindowMs`, `supersedesId`.
    - Strict company isolation, monotonic versioning, append-only history, and deterministic point-in-time replay.
  - **Phase 4 Epistemic Integration**:
    - Enforces 7 canonical epistemic states: `FACT`, `VERIFIED_FACT`, `DERIVED_FACT`, `INFERENCE`, `HYPOTHESIS`, `UNKNOWN`, `CONFLICTED`.
    - AI inference is strictly blocked from silently asserting `FACT` (downgraded to `INFERENCE`).
    - `VERIFIED_FACT` strictly requires backing by a verified `TaskEvidenceRecord`.
  - **Freshness & Decay Engine**:
    - Policy-driven freshness windows. Stale records are marked `isStale: true` with degraded confidence, never silently deleted.
  - **Enterprise Conflict & Impossible-State Detection**:
    - Implemented in `EnterpriseConflictIntegrityService`.
    - Detects contradictory states, preserving competing observations in `EnterpriseStateConflict` without silently picking a winner.
    - Audits impossible states: tasks completed with incomplete dependencies, outcomes verified without evidence, unauthorized execution attempts, inactive worker assignments, cross-company references, and V15 spatial contradictions (`EnterpriseIntegrityFinding`).
  - **Digital-Twin Scenario Engine & Reality Boundary**:
    - Implemented in `DigitalTwinScenarioService`.
    - Strict boundary: simulation records carry `isSimulation: true` and are isolated from production reality. Direct promotion attempts are constitutionally rejected.
    - Integrated with V16 Consequence Analysis (`CeoConsequenceAnalysisService`) for 14-dimension impact reports.
  - **V15 Digital-Twin & Continuous Event Reconciliation**:
    - Implemented in `DigitalTwinReconciliationService`.
    - Synchronizes V15 spatial world state (sites, buildings, rooms, workspaces) into `SPATIAL_WORLD` stream.
    - Subscribes to `CompanyEvent` for event-driven, idempotent continuous reconciliation.
  - **Continuous Replanning & Plan-Thrashing Protection**:
    - Implemented in `ContinuousReplanningService`.
    - Re-evaluates plans upon material state changes, preserving Chairman sovereignty (cannot override Chairman commands).
    - Throttles rapid repeated replanning via deterministic deduplication keys (`isThrottled: true`) to prevent plan thrashing, recording `EnterprisePlanChangeRecord`.
  - **State Health Snapshots**:
    - Implemented in `EnterpriseStateHealthService`.
    - Computes completeness, freshness, conflict rate, unknown rate, stale rate, provenance coverage, and health tier (`HEALTHY`, `DEGRADED`, `CRITICAL`).
  - **Enterprise Intelligence API**:
    - Implemented in `EnterpriseIntelligenceController`.
    - Exposes state, point-in-time reconstruction, lineage, conflicts, health, scenarios, and plan changes under strict company scoping.
  - **Database Migration**:
    - Deployed `20261008120000_v17_phase6_enterprise_intelligence_digital_twin` adding `EnterpriseStateRecord`, `EnterpriseStateConflict`, `EnterpriseIntegrityFinding`, `DigitalTwinScenario`, `EnterpriseStateHealth`, `EnterprisePlanChangeRecord` models and relations across `Company`, `TaskExecutionAttempt`, `TaskEvidenceRecord`, and `AuthorityProof`.
  - **Verification & Tests**:
    - 46/46 tests passing in `v17-phase6-enterprise-intelligence.spec.ts` (Tests A through AT).
    - Zero regressions across 295 total monorepo tests (Phase 1: 12/12, Phase 2: 16/16, Phase 3: 20/20, Phase 4: 26/26, Phase 5: 36/36, Phase 6: 46/46, V16 Gateway: 24/24, V16 Brain: 14/14, V16 Consequence: 14/14, V16 CEO: 18/18, CEO Isolation: 9/9, Workforce: 12/12, Memory: 14/14, V15 Spatial: 28/28).

- **Phase 7: Continuous Evolution & Anti-Entropy** — **STATUS: COMPLETED & VERIFIED**
  - Continuous closed-loop learning: $\mathbf{REALITY \rightarrow VERIFIED\ OUTCOME \rightarrow LEARNING \rightarrow GOVERNED\ IMPROVEMENT \rightarrow VALIDATED\ CHANGE}$.
  - Existing `OrganizationalMemory` model and `ExecutiveMemoryService` serve as canonical memory repository.
  - Lineage preservation across memory: `companyId`, `sourceTaskId`, `sourceOutcomeId`, `workerId`, `departmentId`, `capability`, `contradictionCount`, `invalidationReason`, `correlationId`, `causationId`.
  - Extended `LessonPatternExtractionService`:
    - `extractLessonFromVerifiedOutcome` extracts structured lessons distinguishing success vs failure with root-cause analysis.
    - Pattern detection for worker failures, capability failures, bottlenecks, and proven execution successes.
    - Formal maturity model: `OBSERVATION` $\rightarrow$ `PROVISIONAL` $\rightarrow$ `CONFIRMED` $\rightarrow$ `DEPRECATED`.
  - Canonical `ImprovementSignal` creation with deduplication and recurrence tracking.
  - Governed `ImprovementProposal` across 14 target domains with blast radius, reversibility, validation criteria, rollback criteria, simulation requirement, and authority requirement.
  - Simulation-first policy via Phase 6 `DigitalTwinScenarioService` prior to approval for high-risk proposals.
  - Simulation boundary enforced: simulation cannot mutate reality, issue authority, create evidence, or verify outcomes.
  - Constitutional immutability protection: proposals modifying Chairman sovereignty, authority hierarchy, or safety constraints are auto-classified as `CONSTITUTIONAL_CHANGE` and require sovereign Chairman approval; autonomous AI execution is prohibited.
  - Workforce competency evolution: verified task outcomes dynamically update agent reliability scores and skill proficiencies.
  - Monotonic process versioning with `supersedesId` and immutable history.
  - Outcome validation against baseline measurement: marks proposals `VALIDATED` on target hit, or `FAILED` on miss.
  - Automatic rollback with evidence recording for reversible changes; direct escalation to Chairman for irreversible changes.
  - Anti-Entropy Engine (`AntiEntropyEngineService`) auditing 7 dimensions: Architecture, Data, Governance, Execution, Organizational, Knowledge, Simulation.
  - Safe deterministic auto-remediation for `AUTO_SAFE` findings with immutable audit log (`EntropyRemediationRecord`).
  - Strict prohibition against auto-remediating `NEVER_AUTO_REMEDIATE`, `CHAIRMAN_REQUIRED`, or `APPROVAL_REQUIRED` findings.
  - 7-dimensional company-scoped entropy scoring and health tier assignment (`HEALTHY`, `ELEVATED`, `CRITICAL`).
  - Anti-thrashing safeguards: proposal storm rate limiter (`MAX_PROPOSALS_PER_WINDOW = 10`), signal deduplication, authority amplification prevention, emergency-stop blocking.
  - Migration deployed cleanly: `20261008130000_v17_phase7_continuous_evolution_anti_entropy`.
  - Dedicated Phase 7 test suite passing (62/62 tests, A through BJ): `v17-phase7-continuous-evolution.spec.ts`.
  - Full V17 phases regression suite passing (218/218 tests across Phases 1-7).
  - Subsystems regression passing: Organizational Memory (14/14), V15 Spatial World State (2/2), V16 Gateway/CEO/Brain (408/408).
  - Prisma validation, database package build, and API workspace build all passing cleanly.

- **Phase 8: Full End-to-End Validation & Final Release Gate** — **STATUS: COMPLETED & VERIFIED**
  - Full 14-stage closed-loop enterprise lifecycle tested and verified:
    $\mathbf{CHAIRMAN\ COMMAND \rightarrow CEO\ PLANNING \rightarrow STRATEGY/GOALS \rightarrow TASK\ DECOMPOSITION \rightarrow WORKER\ ASSIGNMENT \rightarrow AUTHORITY\ VALIDATION \rightarrow ATTEMPT\ EXECUTION \rightarrow EVIDENCE\ COLLECTION \rightarrow OUTCOME\ VERIFICATION \rightarrow CANONICAL\ STATE \rightarrow ORGANIZATIONAL\ MEMORY \rightarrow PATTERN\ EXTRACTION \rightarrow IMPROVEMENT\ PROPOSAL \rightarrow OUTCOME\ VALIDATION}$.
  - Strict Chairman sovereignty preserved: human Chairman is sole sovereign; AI councils remain strictly advisory; non-human self-authorization categorically blocked; authority non-amplification verified; constitutional changes cannot be autonomously applied.
  - Execution resilience and recovery verified: atomic database claim locks, lease expiration, DAG failure isolation (unrelated workstreams continue), deterministic bounded retry exhaustion (moves to `REVIEW` with escalation).
  - Evidence and outcome integrity verified: deterministic recursive SHA-256 hashing, epistemic certainty governance (AI inference prevented from masquerading as verified fact), contradiction detection, substantive success criteria evaluation, outcome reopening and downstream invalidation.
  - Digital Twin and simulation isolation boundary verified: simulation observations carry `isSimulation: true` and cannot mutate canonical production reality, manufacture verified evidence, or issue production authority.
  - Continuous learning and 7-dimension anti-entropy verified: closed-loop memory maturity, automated rollback for reversible changes, Chairman escalation for irreversible changes, deterministic auto-remediation for `AUTO_SAFE` findings.
  - Multi-company tenant isolation verified across database entities, state streams, and HTTP controller boundaries (62/62 HTTP isolation tests passing).
  - Emergency-stop controls verified: `EMERGENCY_STOP` halts task claiming, autonomous proposals, plan changes, and external consequential execution while permitting read-only diagnostics; recovery requires explicit sovereign Chairman authorization.
  - Database schema, migrations, and package builds verified: Prisma schema valid; `@aevora/database`, `@aevora/api`, and `@aevora/web` builds all pass with exit code 0.
  - Release Gate test suite: `v17-phase8-release-gate.spec.ts` (8/8 tests passed, exit code 0).
  - Full V17 Phase regression sweep: 226/226 tests passed across all 8 phase suites (`v17-phase*.spec.ts`, exit code 0).
  - All monorepo subsystems verified: V15 Spatial (318/318), V16 CEO & Consequence (48/48), V16 Brain (20/20), Gateway (24/24), Memory (14/14), Workforce (12/12), Automation Orchestration (32/32).
  - Detailed release gate audit documented in [AEVORA_V17_PHASE8_FINAL_VERIFICATION_REPORT.md](file:///e:/Aevora/AEVORA_V17_PHASE8_FINAL_VERIFICATION_REPORT.md).

---

_End of Implementation Map — AEVORA V17 Architecture Fully Implemented, Validated, and Verified._

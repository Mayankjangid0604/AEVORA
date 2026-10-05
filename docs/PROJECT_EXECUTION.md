# AEVORA Project Execution & AI Project Management (Phase 6B)

> **Status**: ✅ COMPLETE — All 73 acceptance criteria verified against real PostgreSQL.

---

## 1. Overview

Phase 6B is the project execution layer that bridges **approved client proposals** to **real work executed by the AI workforce**. It connects:

```
Approved Proposal
→ Project
→ Requirements, Plan, Milestones, Risks
→ Project Tasks (via TaskService)
→ Staffing (validated, allocation-capped)
→ Simulation Scheduler
→ AI Employee Work Cycle
→ Policy Engine
→ Task Review / QA
→ Project Delivery
→ Event Audit Trail
```

---

## 2. Project Manager Planning

The AI Project Manager (e.g., Charlie) operates **exclusively through the Agent Runtime**:

```
AgentContextBuilder (builds project context)
→ LocalProvider (deterministic PM response)
→ AgentPolicyService (evaluates each action)
→ WorkCycleService.executeAction()
→ ProjectExecutionService (domain validation)
→ TaskService / PrismaService (DB write)
→ companyEvent (audit trail)
```

### Actions available to the PM

| Action | Permission | Effect |
|--------|-----------|--------|
| `CREATE_PROJECT_PLAN` | `PROJECT_MANAGER_ACCESS` | Creates a plan record, emits event |
| `CREATE_PROJECT_REQUIREMENT` | `PROJECT_MANAGER_ACCESS` | Creates requirement, emits event |
| `CREATE_PROJECT_TASK` | `PROJECT_MANAGER_ACCESS` | Routes through `TaskService.createTask()` then stamps `projectId` |
| `CREATE_PROJECT_MILESTONE` | `PROJECT_MANAGER_ACCESS` | Creates milestone, emits event |
| `CREATE_PROJECT_RISK` | `PROJECT_MANAGER_ACCESS` | Severity computed deterministically: `floor(probability × impact / 100)` |
| `PROPOSE_PROJECT_STAFFING` | `PROJECT_MANAGER_ACCESS` | Validates employee status + allocation; creates PROPOSED assignment |
| `VIEW_PROJECT*` | `BASIC_ACCESS` | Read-only, no DB write |

### What the PM **cannot** do

- Approve its own project plan (Chairman only)
- Execute financial actions (`TRANSFER_AC`, `CHANGE_SALARY`, etc.)
- Access projects or employees from another company
- Insert directly to the database

---

## 3. Task Integration

Every project task is created **through the authoritative `TaskService`**, not raw Prisma:

```typescript
// ProjectExecutionService.createProjectTask()
const task = await this.taskService.createTask({ companyId, createdBy, ... });
await this.prisma.task.update({ where: { id: task.id }, data: { projectId } });
```

This ensures:
- `TASK_CREATED` company event is emitted
- Task dependency graph is managed by `TaskService`
- `BACKLOG → READY` auto-unlock works when all dependencies complete
- Tasks appear in `AgentContextBuilder` as regular employee tasks (the scheduler sees them identically)

---

## 4. Staffing & Workload

Staffing is **domain-validated**, not AI-chosen:

- Employee must be `ACTIVE` status and belong to same company
- `allocation` must be 1-100%
- Sum of all `ACTIVE` allocations for that employee must not exceed 100%
- Proposals start as `PROPOSED` — require explicit activation
- Activation emits `PROJECT_STAFF_ASSIGNED` event

---

## 5. Simulation Integration

Project Manager integration with the simulation engine:

1. `SimulationEngine` ticks → schedules `EMPLOYEE_WORK_CYCLE` events
2. `AgentSchedulerService` finds agents with READY/IN_PROGRESS tasks
3. `WorkCycleService.runWorkCycle()` is called directly (no HTTP)
4. `AgentContextBuilder` injects `managedProjects` context for PM role
5. `LocalProvider` reads the context and returns deterministic PM actions
6. `WorkCycleService.executeAction()` routes to `ProjectExecutionService`
7. All mutations go through domain services, never raw Prisma from the AI

---

## 6. Task Review / QA

The review path is:

```
IN_PROGRESS
→ SUBMIT_MY_TASK_FOR_REVIEW (agent action)
→ REVIEW (task status)
→ reviewTask(decision: APPROVED | CHANGES_REQUESTED | REJECTED)
    ├─ APPROVED → COMPLETED (+ dependency unlock via TaskService)
    └─ CHANGES_REQUESTED / REJECTED → back to IN_PROGRESS
```

Every review creates a `TaskReview` record with `decision` and optional `feedback`. Reviewer must belong to the same company.

---

## 7. Project Delivery

Delivery requires at least one completed task (domain-enforced guard):

```
createDelivery()  →  status: DRAFT
approveDelivery() →  status: APPROVED + approvedAt + emits PROJECT_DELIVERED
markDelivered()   →  status: DELIVERED + deliveredAt
```

**No financial transaction occurs automatically.** Payment / invoicing is deferred to a later phase.

---

## 8. Event Audit Trail

All project lifecycle changes emit `companyEvent` records:

| Event Type | Trigger |
|-----------|--------|
| `PROJECT_CREATED` | `ProjectService.createProjectFromProposal()` |
| `PROJECT_PLAN_CREATED` | `createPlan()` |
| `PROJECT_PLAN_APPROVED` | `approvePlan()` |
| `PROJECT_ACTIVATED` | `activateProject()` |
| `PROJECT_REQUIREMENT_CREATED` | `createRequirement()` |
| `PROJECT_TASK_CREATED` | `createProjectTask()` |
| `PROJECT_TASK_PROGRESS_UPDATED` | `WorkCycleService (UPDATE_MY_TASK_PROGRESS)` |
| `PROJECT_TASK_SUBMITTED_FOR_REVIEW` | `submitTaskForReview()` |
| `PROJECT_TASK_REVIEWED` | `reviewTask()` |
| `PROJECT_MILESTONE_CREATED` | `createMilestone()` |
| `PROJECT_RISK_CREATED` | `createRisk()` |
| `PROJECT_STAFF_PROPOSED` | `proposeStaffing()` |
| `PROJECT_STAFF_ASSIGNED` | `activateAssignment()` |
| `PROJECT_DELIVERY_CREATED` | `createDelivery()` |
| `PROJECT_DELIVERED` | `approveDelivery()` |

---

## 9. Security Boundaries

The following cross-company operations are explicitly blocked:

| Attempt | Where blocked |
|---------|--------------|
| Create task in Company B's project using Company A context | `ProjectExecutionService.createProjectTask()` |
| Propose Company B employee for Company A project | `ProjectExecutionService.proposeStaffing()` |
| Agent action targeting Company B project | `AgentPolicyService.evaluateAction()` |
| Ordinary employee using PM-only actions | `AgentPolicyService` permission check |
| Any agent using financial actions | `AgentPolicyService` hard block |

---

## 10. Financial Isolation

Phase 6B does **not** move money. Verified:
- `ACWallet` balances unchanged after full project lifecycle
- `RealMoneyAccount` balances unchanged
- No `ACTransaction` or `RealMoneyTransaction` created by any project action

Project cost metadata (e.g., `internalEstimatedCost` on `Proposal`) is informational only.

---

## 11. API Endpoints

All routes are under `/projects`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:id/requirements` | List requirements |
| POST | `/projects/:id/requirements` | Create requirement |
| PATCH | `/projects/requirements/:id` | Update requirement |
| GET | `/projects/:id/plans` | List plans |
| POST | `/projects/:id/plans` | Create plan |
| POST | `/projects/plans/:id/approve` | Approve plan (Chairman) |
| GET | `/projects/:id/milestones` | List milestones |
| POST | `/projects/:id/milestones` | Create milestone |
| GET | `/projects/:id/risks` | List risks |
| POST | `/projects/:id/risks` | Create risk |
| GET | `/projects/:id/team` | Get team assignments |
| POST | `/projects/:id/team/propose` | Propose staffing |
| POST | `/projects/project-assignments/:id/activate` | Activate assignment |

---

## 12. Deferred to Phase 6C+

The following are intentionally **not** in Phase 6B:

- **Client-facing communication** — No external email, portal, or notifications
- **Payment / invoicing** — No `ACTransaction` or `RealMoneyTransaction` on delivery
- **Advanced review workflow** — No multi-reviewer, no SLA enforcement
- **2D office / city** — Deferred
- **External client approval of deliverables** — Chairman approves internally only
- **Automated milestone completion** — Milestones are created but not auto-completed by task graph

---

## 13. Test Commands

```bash
# Full build
npm run build

# Unit tests (Phase 6B specs)
npx jest --testPathPattern="work-cycle|project-execution" --passWithNoTests

# Full unit test suite
npm test

# Phase 6B E2E (requires real PostgreSQL)
npx ts-node -P apps/api/tsconfig.json scripts/test-project-execution.ts
```

### E2E Test Results

```
═══════════════════════════════════════════════════════════════
  PHASE 6B PROJECT EXECUTION E2E
═══════════════════════════════════════════════════════════════

✓ PostgreSQL connected

── STAGE 1: Setup Northstar project  ──────── 5 checks
── STAGE 2: Project Creation          ──────── 2 checks
── STAGE 3: Project Requirements      ──────── 2 checks
── STAGE 4: Project Plan              ──────── 3 checks
── STAGE 5: Milestones                ──────── 1 check
── STAGE 6: Risk Register             ──────── 1 check (deterministic severity)
── STAGE 7: Task Graph                ──────── 10 checks
── STAGE 8: Staffing                  ──────── 4 checks
── STAGE 9: Simulation Execution      ──────── 7 checks
── STAGE 10: Dependency Unlock        ──────── 4 checks
── STAGE 11: Task Review (QA)         ──────── 6 checks
── STAGE 12: Progress Calculation     ──────── 2 checks
── STAGE 13: Project Delivery         ──────── 6 checks
── STAGE 14: PM via Real Simulation   ──────── 5 checks
── STAGE 15: Cross-Company Security   ──────── 5 checks
── STAGE 16: Financial Isolation      ──────── 2 checks
── STAGE 17: Event Audit Trail        ──────── 8 checks

RESULT: 73 passed, 0 failed
✅ Phase 6B COMPLETE — All acceptance criteria satisfied.
```

# AEVORA V14 — SLICE 6 REPORT: TASKS / EXECUTION

**Starting commit:** `e82f9f6` (Slice 5). **Slice 6 code commit:** `d904aaf`, created by a previous process with the Slice 6 implementation; not amended. This report is committed on top of it.

## 1. Objective

Audit the whole task/execution surface first. Build a Tasks workspace only if existing backend contracts allow it safely; otherwise keep Tasks blocked.

## 2. Backend audit (global search, not name-based)

Controllers traced:
- **Task:** `TaskController` (`/employees/:id/tasks`, `/tasks/*`)
- **Agents:** `AgentController` (`/agents/*`)
- **Compute:** `ComputeController` (`/compute/*`)
- **Jobs:** `JobController` (`/job`)
- **Project execution:** `ProjectExecutionController` (`/projects/*`, fixed in Slice 4)
- **Delivery:** `DeliveryController` (formal delivery, fixed in Slice 4)
- **Assistant:** `AssistantController` (`/assistant/pc-tasks`)
- **Other:** goal, operating-loop, autonomous-enterprise cycles, CEO autonomous decisions, foundation-intelligence training jobs, research execution, workforce AI provisioning, v12 command / VR execute

Services traced: `TaskService`, `TaskOrchestratorService`, `AgentRuntimeService`, `WorkCycleService`, `AgentSchedulerService`, `ComputeWorkerService`, `TrainingJobService`, `JobService`, `CeoAutonomousService.reviewTaskResult`, `DepartmentLeaderAutonomousService`.

## 3. Route classification

| Method & route | Scope mechanism | Role | Mutates | Sensitive fields | Side effects | Class |
|---|---|---|---|---|---|---|
| GET `/employees/:id/tasks` | `assertResourceAccess(employee)` (Slice 1) | any member | no | `createdBy`, `requiredCapability`, `companyId` | none | **SAFE WITH CONDITIONS** (projection) → consumed |
| GET `/tasks/:id` | `assertResourceAccess(task)` | any | no | as above + dependency rows | none | **SAFE WITH CONDITIONS** → consumed |
| POST `/tasks`, `/tasks/:id/{assign,start,block,complete,cancel}`, PATCH `priority` | company-bound (Slice 1) | any | yes | — | company events; completion feeds orchestration | **not exposed** (read-only slice) |
| `GET/POST /employees/:id/goals`, `/goals/*` | company-bound | any | mixed | — | — | not exposed (goals out of scope) |
| `GET /agents` | **was unscoped** → company via employee | any | no | agent config/budget JSON | none | fixed; not exposed |
| `GET /agents/:id`, `/:id/executions` | **was unscoped** → `assertAgentAccess` (404) | any | no | execution `contextSnapshot` (prompts/context) | none | fixed; not exposed |
| `POST /agents/:id/run`, `/:id/work-cycle` | **was unscoped** → company + **CHAIRMAN** | CHAIRMAN | yes | — | **AI agent execution (model calls)** | fixed; **never exposed** |
| `POST /agents/schedule-work-cycles` | **was global (all companies)** → caller's company only + CHAIRMAN | CHAIRMAN | yes | — | schedules AI work cycles | fixed; never exposed |
| `GET /compute/workers`, `/jobs` | **were all-company** → caller's company (shared null-company workers hidden) | any | no | infra metadata | none | fixed; not exposed |
| `GET /compute/workers/:id`, `/jobs/:id`, `/jobs/:id/logs` | **were by raw id** → company-bound (404) | any | no | logs | none | fixed; not exposed |
| `POST /compute/workers/register\|:id/heartbeat\|:id/drain`, `/jobs/:id/cancel` | **were unscoped** → company-bound + CHAIRMAN/SYSTEM; body `companyId` ignored | CHAIRMAN, SYSTEM | yes | — | worker/job state | fixed; never exposed |
| `POST /job` | company from token; PRODUCTION requires a consumed company-bound approval | any | yes | — | enqueues jobs | **SAFE WITH CONDITIONS**; not exposed |
| `GET /assistant/pc-tasks` | company from token | CHAIRMAN | no | — | PC/computer tasks (V15 territory) | **out of scope** (V15) |
| `/projects/*`, `/delivery/formal/*` | fixed in Slice 4 | — | — | — | — | unchanged |
| `/v12-command/execute`, `/v12-vr-action/execute` | — | — | — | — | spatial execution | **V15, excluded** |

## 4. Security fixes (in `d904aaf`)

- **`AgentController`.** Before: any authenticated user could list every company's agents, read any agent's execution history (including context snapshots), run any company's agent or work cycle, and schedule work cycles for all companies. Now:
  - the list is filtered by the caller's company
  - by-id routes use `AuthorizationService.assertAgentAccess` (agent → employee company; foreign or missing → 404)
  - run / work-cycle / schedule require **CHAIRMAN**, and scheduling only covers the caller's company's eligible agents
- **`ComputeController`.** Before: worker and training-job reads and mutations by raw id across companies, and all-company lists. Now:
  - workers are company-bound via `assertResourceAccess('computeWorker')`, with null-company shared workers hidden
  - jobs are bound through `trainingRun.companyId` (`assertTrainingJobAccess`)
  - lists are filtered to the caller's company
  - mutations require **CHAIRMAN or SYSTEM**
  - worker registration forces the caller's company and ignores any body `companyId`
- **Regression tests:** `apps/api/src/agent/agent-compute-isolation.http.spec.ts` (18 tests).

## 5. Real database counts (read-only queries; nothing created)

| Entity | At audit (this company / all) | At final verification |
|---|---|---|
| Task | 306 / 1,006 | 330 / 1,086 (the safe-mode background loop keeps creating real tasks) |
| Task assignment | 306 of 306 assigned, all to same-company employees (100/100/103/3) | Bob 114 at final check |
| Task status (this company, at audit) | COMPLETED 271, REVIEW 31, BACKLOG 4; priority all NORMAL | — |
| Task links | project 0, department 0, goal 6 | — |
| TaskDependency | 4 (all within this company) | 4 |
| TaskResult | 1,002 (all companies) | — |
| AgentExecution | 232 / 336 | 232 |
| TaskReview, ProjectAssignment, Research/Build/Test/Development executions, PcTask, MpInferenceExecution | 0 | — |

## 6. Side-effect audit

Task **mutations** feed `TaskOrchestratorService`, which runs autonomously on its own `setInterval` (started in `onModuleInit`). It dispatches work and calls `CeoAutonomousService.reviewTaskResult` → model gateway. Agent run / work-cycle routes invoke models. None of these are exposed.

The two consumed routes, `TaskService.getTask` and `listEmployeeTasks`, are plain Prisma reads. During live verification the API log showed `[Gateway] Ollama fetch failed: 404` from `CeoAutonomousService.reviewTaskResult`. That comes from the **pre-existing background orchestration loop**: safe mode only disables `AGENT_WORK_CYCLES`, not the orchestrator. It was not triggered by V14, and it produced no model output because the local model returned 404. There was no SMTP/outreach, `runAgent` or work-cycle activity in the log.

## 7. Decision: **Tasks SAFE (read-only, by assignee)**

There is still **no company-wide task listing endpoint**. The workspace therefore lists tasks per assignee and says that unassigned tasks aren't available. It doesn't stitch together a fake company list or claim a company total. No task mutations are exposed.

## 8. Implementation (in `d904aaf`)

- **`/company/[companyId]/tasks`:**
  - assignee select (from the real company workforce) and status filter, both URL state (`?assignee=`, `?status=`), with options taken only from returned values
  - "N of M tasks assigned to <name>" live region
  - desktop table (Task, Priority, Progress (recorded), Created, Status) and mobile cards
- **`/company/[companyId]/tasks/[id]`:**
  - fields: title, status, description, assignee (link), priority, type, progress "(as recorded)", effort estimated/actual, project link, created/started/completed/due timestamps ("Not recorded" when null), goal-link note
  - dependencies ("Depends on" / "Required by", linked)
  - read-only notice; no buttons
- The Tasks domain moves from `blocked` to `ready`. Earlier slices' tests were updated to keep asserting that **task mutation routes** stay blocked.

## 9. BFF projection

- **Routes:** `employees/:id/tasks` → `TaskSummary[]`; `tasks/:id` → `TaskDetail`. Both require an explicit company.
- **Context ownership:** projections receive the request's company and drop or 404 any task whose `companyId` differs. That keeps a multi-company Chairman inside the selected company.
- **Forwarded:** `id, title, status, priority, type, progress, dueAt, createdAt, completedAt, assignedEmployeeId`. Detail adds `description, estimatedEffort, actualEffort, startedAt, updatedAt, goalId, projectId, departmentId, parentTaskId, dependsOn[], requiredBy[]`.
- **Never forwarded:** `createdBy`, `requiredCapability`, `companyId`, any priority-model fields, TaskResult output/errors.

## 10. Security verification (live, recovered environment)

| Probe | Result |
|---|---|
| Own task | 200, projected keys only, no leak |
| Own assignee list | 200, projected keys only |
| Foreign-company task | 404 |
| Foreign-company assignee | 404 |
| Own task with foreign `X-Company-Id` | 403 |
| No company header | 400 |
| Malformed task id | 404 |
| Nonexistent task / assignee | 404 / 404 |
| `tasks/:id/complete` via BFF | 404 (not allowlisted) |
| `/agents/<foreign>` read / executions / run (API) | 404 ×3, nothing executed (own agent deliberately not run) |
| `/compute/workers`, `/jobs` (API) | own company only (0 / 0) |
| `/agents` (API) | 3 own agents (previously every company's) |

## 11. Browser verification (live: PostgreSQL + `aevora-api-safe` + `aevora-web`)

- **Environment recovery:**
  - Root cause: Docker Desktop was not running, so the `aevora_postgres` container (project setup: `infrastructure/docker/docker-compose.yml`) was down.
  - Started Docker Desktop; the existing container restarted with its persistent volume `docker_postgres_data` and reported healthy.
  - Verified intact: 57 migrations, 2 companies, 3 chairmen, 4 employees, tasks present. Fixture login → 201.
  - No migration, seed or schema change.
- **Rendering:** the Browser pane reported `hidden` intermittently. Hidden pages don't fire `requestAnimationFrame`, so React 19's streamed-boundary reveal stalls. Verified by measuring `visibilityState` and rAF. Each check was paired with screenshots, which force paints; no app change was needed.
- **Task list:** Bob 112, then 114 tasks; Alice 3 (matches the DB). A status filter with no matching rows shows "No matches"; options are only the assignee's real statuses.
- **Task detail** (`cd84d302…`, "Identify reliability risks"): matches the DB.
  - Content: Alice, NORMAL, STANDARD, 0% recorded, effort 1/0, no project, created 28 Sept 2026 IST, "Not recorded" dates, goal note.
  - Dependencies: depends on `0d8f4a40`, required by `0f0a6a7b` (real `TaskDependency` rows).
  - No buttons.
- **States:** foreign task → Not found + "Back to tasks"; nonexistent → Not found; malformed `..%2Fx` → 404 page; foreign assignee in URL → "That employee is not part of this company." (no backend request for it).
- **Console:** exactly 10 errors, all intentional probe responses (8 BFF probes + 2 not-found pages). No React, hydration or runtime errors. Web server log clean.

## 12. Responsive / accessibility (manual)

| Viewport | Result |
|---|---|
| Desktop 1440 (dark) | rail (current = Tasks), 5-column table, no horizontal scroll |
| Tablet 768 (light) | rail, 3 columns (dates hidden), no horizontal scroll |
| Mobile 375 (light) | cards; detail single column; rail collapsed; no horizontal scroll |

- **Keyboard:** from the Status select, Tab reaches the first task link; `:focus-visible` with a 2px solid outline; Enter opens the detail.
- **Semantics:** H1 company → H2 page and panel → H3 sub-sections. Table has caption, `th scope=col/row`. Filters labelled inside `role=search`.

## 13. Tests, typecheck, lint, build (final run, after live verification)

| Check | Result |
|---|---|
| Frontend `npx vitest run` | **7 files, 204/204** |
| Frontend `npx tsc --noEmit` | pass |
| Frontend `npx eslint .` | pass |
| Frontend `npx next build` | pass |
| Backend `npx tsc --noEmit -p tsconfig.json` | pass |
| Backend `npx jest` | **53/53 suites, 428/428 — three consecutive runs, 0 failures** |

**Intermittent failure history:** one earlier full run, immediately after a production build, reported 1 failure. Its name was not captured because only the summary line was printed. Since then **six** consecutive full runs passed 428/428 (three earlier, three in this final pass). This is consistent with the CPU-contention timeout class documented in the Slice 1 closure report. It's recorded as unresolved-but-not-reproduced, not as proven harmless.

## 14. Known non-blocking issues

1. No company-wide task listing; unassigned tasks cannot be shown (needs a backend `GET` for company tasks).
2. Recorded `progress` is often 0% even for COMPLETED tasks. Shown verbatim as "(as recorded)", not corrected.
3. Goals are not surfaced (the link is noted only).
4. Safe mode does not disable `TaskOrchestratorService`, which keeps creating tasks and attempting model calls in the background (pre-existing backend behaviour, not V14).
5. Per-assignee lists are unbounded (114 rows today); the backend has no pagination.
6. Intermittent backend test failure (above) not reproduced in six subsequent full runs.
7. The Browser pane's hidden state stalls streaming reveal; a test-environment artifact, not an app defect.

## 15. Explicit V15 exclusions

No 3D, spatial HQ, avatars, walking, Chairman office, world simulation, WebXR, `v12-*` or `world-engine` usage. `assistant/pc-tasks` (computer interaction) and `v12-command`/`v12-vr-action` execute routes are excluded and not allowlisted. No `@aevora/shared` imports (scan test).

---

**Final acceptance: A — COMPLETE.**

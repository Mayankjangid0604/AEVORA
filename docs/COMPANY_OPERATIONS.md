# AEVORA Company Operations & Management (Phase 6C)

## 1. Overview
The AEVORA Agentic Framework supports full autonomous company operations. Phase 6C introduces the ability for AI managers (e.g., CEO, HR Manager, Engineering Manager) to analyze company health and execute day-to-day operations while adhering to strict policy bounds and escalating consequential decisions to the Chairman.

## 2. Management Hierarchy & Context
- **Roles:** The existing role system (`CEO`, `Manager`, etc.) determines an agent's permissions.
- **Context Injection:** The `AgentContextBuilder` dynamically provides management-level agents with an operational summary:
  - Active KPI metrics (Company & Department level)
  - Active operational alerts
  - Pending management decisions
  - Department headcount & workload status
- **Scoping:** Agents only receive information relevant to their assigned Company, ensuring strict tenant isolation.

## 3. Operational Alerts
The `OperationalAlertService` continuously evaluates system state to generate actionable alerts:
- **TASK_OVERDUE:** A task missed its due date.
- **TASK_BLOCKED:** A task cannot proceed due to missing dependencies.
- **HIGH_PROJECT_RISK:** Project risk severity reached a critical threshold.
- Alerts are deterministic (calculated from PostgreSQL) and categorized by severity (`INFO`, `WARNING`, `CRITICAL`).

## 4. KPI Metrics
The `CompanyMetricsService` computes key performance indicators in real-time without artificial "AI scoring":
- Task completion rates (completed vs overdue vs blocked)
- Employee headcount and departmental grouping
- Aggregate project health status

## 5. Management Decisions & Chairman Escalation
Management actions with high impact require a proposal-and-approval workflow rather than direct execution. This ensures AI agents do not unilaterally alter governance, employment, or financial states.

### Workflow
1. **Proposal:** AI Manager decides on an action (e.g., `CREATE_PROMOTION_PROPOSAL`) and outputs the action via the LocalProvider.
2. **Policy Check:** `AgentPolicyService` intercepts the action. If the action is `requiresChairmanApproval: true`, it permits the *proposal* creation.
3. **Decision Record:** `ManagementDecisionService` records a `ManagementDecision` (status: `PROPOSED`).
4. **Approval:** The Chairman (human or high-authority actor) reviews the queue and approves/rejects.
5. **Execution:** Upon approval, the domain service enforces the change.

### Supported Decision Workflows
- **Workload Rebalancing:** Proposing a reassignment for a blocked or overloaded task (`CREATE_WORKLOAD_REBALANCING_PROPOSAL`). Does not require Chairman approval, automatically reassigns via `WorkloadService`.
- **Promotions:** Proposing a role change (`CREATE_PROMOTION_PROPOSAL`). Requires Chairman approval.
- **Bonuses:** Proposing a one-time financial reward (`CREATE_BONUS_PROPOSAL`). Requires Chairman approval. Uses `EconomyService` to ensure AC invariants.
- **Discipline:** Issuing formal warnings or suspensions (`CREATE_DISCIPLINARY_ACTION`). Uses `DisciplineService`. Requires Chairman approval.
- **Hiring Requests:** Formalizing a staffing shortage (`CREATE_HIRING_REQUEST`). Requires Chairman approval.

## 6. Training System
The `TrainingService` allows managers to assign `TrainingProgram` records to employees to address skill gaps.
- Uses `CREATE_TRAINING_RECOMMENDATION`.
- Training records track `status` (ASSIGNED, IN_PROGRESS, COMPLETED, FAILED).
- Skill upgrades are deterministic based on the completed program.

## 7. Security & Isolation
- **No Cross-Company Access:** `AgentPolicyService` strictly prevents an agent from referencing entities outside its `companyId`.
- **Financial Safety:** `EconomyService` handles all ledger updates. AI cannot mutate `wallet.balance` directly. No money is created out of thin air.
- **Database Safety:** Agents do not touch Prisma. All actions flow through structured domain services.

## 8. Deferred Functionality
- External recruitment and real-world HR integrations.
- UI/Frontend for the Chairman Decision Queue.
- Payroll and automated real-world payments.

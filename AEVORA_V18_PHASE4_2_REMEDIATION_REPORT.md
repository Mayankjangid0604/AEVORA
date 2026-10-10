# AEVORA V18 — PHASE 4.2 TARGETED REMEDIATION REPORT

**Repository:** `E:\Aevora`<br/>
**Date:** October 9, 2026<br/>
**Status:** COMPLETE — READY FOR INDEPENDENT ACCEPTANCE AUDIT<br/>
**Phase:** V18 Phase 4.2 Targeted Remediation (Findings V18-4.1-F01 through V18-4.1-F06)

---

## 1. Executive Summary

Phase 4.2 was authorized exclusively to remediate findings V18-4.1-F01 through V18-4.1-F06 identified in `AEVORA_V18_PHASE4_1_INDEPENDENT_ACCEPTANCE_AUDIT.md`.

All six findings have been resolved with strict adherence to V16 risk classification, authority validation, TOCTOU protection, and Chairman sovereignty. All 252 non-destructive tests across 7 suites passed with zero failures. Zero live, staging, or unverified databases were modified, and zero Phase 5 work was initiated.

---

## 2. Exact Files Modified & Rationale

| File Path | Description of Changes | Rationale |
| :--- | :--- | :--- |
| `packages/database/prisma/schema.prisma` | Made `ApprovalRequest.companyId` nullable (`String?`), added `isGlobal Boolean @default(false)`, added relation `ApprovalRequest.runbookExecutions RunbookExecution[]` and `RunbookExecution.approvalRequest ApprovalRequest?`. | Resolves F03 (`GLOBAL_INFRASTRUCTURE` FK violation) and F01 (genuine persisted ApprovalRequest foreign key binding). |
| `packages/database/prisma/migrations/20261010100000_v18_phase4_runbook_remediation/migration.sql` | Seed script updated to `ON CONFLICT ("id") DO NOTHING;`. Added idempotent DDL for nullable `ApprovalRequest.companyId`, `isGlobal`, and FK constraint from `RunbookExecution.approvalRequestId` to `ApprovalRequest.id`. | Resolves F06 (preserves operator customizations) and provides SQL migration for F01 and F03. |
| `apps/api/src/approval/approval-validation.service.ts` | Updated `ExecutionValidationContext` to support `companyId?: string | null` and normalized nullish company comparisons. | Resolves F03 and F01 to allow safe validation of global infrastructure and tenant approvals. |
| `apps/api/src/external-action-gateway/external-action-gateway.service.ts` | Normalized `'GLOBAL'` and `'GLOBAL_INFRASTRUCTURE'` to `null` before passing to `approvalValidation.validateAndConsumeApproval`. Added `getAuditRecordByIdempotencyKey()`. | Enables gateway to validate global approvals and exposes durable audit records for crash reconciliation (F04). |
| `apps/api/src/external-action-gateway/risk-classifier.service.ts` | Added deterministic rule classifying `IT_REMEDIATION_ACTION` with `payload.isRollback === true` as `LOW` risk tier. | Resolves F02: rollback is independently risk-classified by the gateway. |
| `apps/api/src/external-action-gateway/gateway-authority-validator.service.ts` | Permitted `CHAIRMAN` or `SYSTEM` roles for global rollback actions and validated tenant authority for tenant rollbacks. | Resolves F02: enforces proper authority validation for forward actions and rollbacks. |
| `apps/api/src/reliability/it-remediation.adapter.ts` | In `execute(context)`, detects `payload.isRollback === true` and delegates to `executeRollback()`, returning an `AdapterExecutionResult`. | Resolves F02: routes rollback through the standard gateway adapter dispatch pattern. |
| `apps/api/src/reliability/runbook-engine.service.ts` | 1. `ensureBuiltinRunbooksSeeded()` checks `findUnique` and creates only missing records.<br>2. `planRemediation()` atomically enforces throttling in `$transaction` and creates authentic `ApprovalRequest` record when risk is HIGH/CRITICAL.<br>3. `approveExecution()` enforces Chairman authorization and atomically updates both `ApprovalRequest` and `RunbookExecution`.<br>4. Added `rejectExecution()` to set `ApprovalRequest.status = REJECTED` and `RunbookExecution.status = FAILED`.<br>5. `executeRemediation()` uses atomic state claim and throttling check in `$transaction`, passing authentic `approvalId` to gateway.<br>6. `rollbackRemediation()` routes rollback through `gateway.executeAction(...)` with `isRollback: true`, honoring emergency stops and recording honest `ROLLED_BACK` or `ROLLBACK_FAILED`.<br>7. Added `reconcileStrandedExecution()` with lease threshold, atomic conditional lock, gateway audit query, health verification, and quarantine. | Core engine repairs for F01, F02, F03, F04, F05, and F06. |
| `apps/api/src/reliability/reliability.controller.ts` | Added `@Post('runbooks/executions/:executionId/reject')` and `@Post('runbooks/executions/:executionId/reconcile')` with company access and Chairman authority guards. | Exposes governed endpoints for rejection (F01) and stranded execution reconciliation (F04). |
| `apps/api/src/reliability/v18-phase4-runbook-remediation.spec.ts` | Added Section 9 with 18 comprehensive tests exercising F01–F06, including real `ApprovalValidationService` integration. Updated mocks to support in-place mutation and rollback routing. | Proves closure of findings with end-to-end regression coverage. |

---

## 3. Finding-by-Finding Closure Matrix (V18-4.1-F01 through F06)

### Finding V18-4.1-F01: Authentic Approval Persistence (CRITICAL)
- **Problem:** `approveExecution()` fabricated synthetic approval strings (`app-synth-...`) instead of persisting Prisma `ApprovalRequest` rows, bypassing `ApprovalValidationService.validateAndConsumeApproval()`.
- **Closure:**
  - `planRemediation()` creates an authentic Prisma `ApprovalRequest` record in an interactive transaction (`tx.approvalRequest.create(...)`) with `status: PENDING`, `action: 'IT_REMEDIATION_ACTION'`, `riskLevel: HIGH` or `CRITICAL`, target binding, parameter hash, and 24-hour expiration.
  - `approveExecution()` validates that the caller has `CHAIRMAN` authority, verifies `approval.status === PENDING`, and updates both `ApprovalRequest` to `APPROVED` and `RunbookExecution` to `APPROVED` within an interactive transaction.
  - `rejectExecution()` allows Chairman to reject execution, updating `ApprovalRequest` to `REJECTED` and `RunbookExecution` to `FAILED`.
  - In `executeRemediation()`, the authentic `approvalRequestId` is passed to `ExternalActionGatewayService.executeAction()`, which invokes `ApprovalValidationService.validateAndConsumeApproval()`.
  - `ApprovalValidationService` validates parameters, target, environment, and atomically transitions status to `CONSUMED`. Subsequent attempts to replay the approval fail with `BadRequestException` ("Approval status is CONSUMED, expected APPROVED").
  - Parameter tampering (altering `drainTimeoutMs`) and cross-tenant execution are rejected.

### Finding V18-4.1-F02: Route Rollback Through Gateway Governance (CRITICAL)
- **Problem:** `rollbackRemediation()` invoked `this.adapter.executeRollback()` directly, completely bypassing `ExternalActionGatewayService` governance, risk classification, emergency stop, and audit trails.
- **Closure:**
  - `rollbackRemediation()` now dispatches rollback requests through `this.gateway.executeAction(...)` with `payload: { isRollback: true, runbookActionType, targetName, preExecutionSnapshot, ... }` and `idempotencyKey: rollback:<incidentId>:<executionId>`.
  - `RiskClassifierService` classifies rollback actions (`LOW` risk tier).
  - `GatewayAuthorityValidatorService` validates actor authority (`CHAIRMAN` or `SYSTEM` for global, tenant authority for company-scoped).
  - Sovereign `EMERGENCY_STOP` is validated: if active, rollback gateway execution is blocked with `ForbiddenException`.
  - In `ITRemediationAdapter`, `execute()` recognizes `payload.isRollback === true` and delegates to `executeRollback()`.
  - If the gateway rejects the request (rate limits, policy blocks, or rule violations), the adapter is never called.
  - On gateway failure, `ROLLBACK_FAILED` is recorded honestly with error details, and an incident timeline event `REMEDIATION_FAILED` is logged.
  - `ROLLED_BACK` is recorded only upon confirmed gateway and adapter success.

### Finding V18-4.1-F03: Global Infrastructure Company Scope (HIGH)
- **Problem:** Global infrastructure runbooks passed `'GLOBAL_INFRASTRUCTURE'` into `ApprovalRequest.companyId`, causing a foreign key violation against the `Company` table in PostgreSQL.
- **Closure:**
  - In `schema.prisma`, `ApprovalRequest.companyId` was updated from `String` to `String?` (optional foreign key) and `isGlobal Boolean @default(false)` was added.
  - Global infrastructure runbooks store `companyId: null` and `isGlobal: true`, completely avoiding FK violations.
  - In `ApprovalValidationService`, `companyId` validation normalizes `null` and `undefined`, ensuring strict equality: global approvals can only be consumed by global execution contexts (`companyId: null`).
  - Strict Chairman sovereignty is enforced: tenant-level callers attempting to plan, approve, or execute global runbooks receive `ForbiddenException`.

### Finding V18-4.1-F04: Stranded EXECUTING State Recovery (HIGH)
- **Problem:** Executions left in `EXECUTING` state due to process crashes or network partition had no bounded or safe recovery mechanism.
- **Closure:**
  - Implemented `RunbookEngineService.reconcileStrandedExecution(executionId, companyId, actor, options)`.
  - **Lease Threshold Enforcement:** Rejects executions where `startedAt` is within the active lease threshold (default: 5 minutes) with `ConflictException`.
  - **Atomic Concurrency Claim:** Uses atomic conditional lock `updateMany({ where: { id, status: EXECUTING }, data: { status: VERIFYING } })` to ensure only one claimant can reconcile an execution across multiple application instances.
  - **Durable Audit Evidence Inspection:** Queries gateway audit logs using the idempotency key `rem:<incidentId>:<executionId>`.
    - **Crash Before Dispatch (Audit record null):** Safely marks `FAILED` with step `Reconciliation` noting zero external side effects.
    - **Confirmed Success (`EXECUTED` / `COMPLETED`):** Calls `verifyRemediation()`, probing target health and moving to `VERIFIED_HEALTHY` and incident `MITIGATED` on healthy probe.
    - **Confirmed Failure (`FAILED` / `REJECTED`):** Transitions to `FAILED` with gateway error.
    - **Uncertain Outcome (Audit state pending/uncertain):** Quarantines execution to `FAILED` with `ReconciliationQuarantine` step and attaches `QUARANTINED` timeline alert for manual operator intervention without blind retries.

### Finding V18-4.1-F05: Cooldown & Attempt Limit Concurrency (MEDIUM)
- **Problem:** Concurrency checks in `planRemediation` and `executeRemediation` were performed outside transactions, vulnerable to race conditions under simultaneous requests.
- **Closure:**
  - Created `assertRunbookNotThrottledInTx(tx, incidentId, actionType, maxAttempts, cooldownMinutes, currentExecutionId)`.
  - Concurrency checks are executed directly inside the Prisma interactive transaction `$transaction` during both planning and execution.
  - Transaction evaluates active and recent execution counts using composite key `(incidentId, actionType, companyId)` and throws `ConflictException` before execution slots are reserved.

### Finding V18-4.1-F06: Migration, Seed, and Runtime Consistency (MEDIUM)
- **Problem:** `ensureBuiltinRunbooksSeeded()` used `upsert`, overwriting operator-customized fields (e.g. customized cooldown or description) on server restarts. Seed script in migration SQL also lacked conflict protection.
- **Closure:**
  - Updated `ensureBuiltinRunbooksSeeded()` to execute `findUnique({ where: { id: builtin.id } })` and create definitions only if missing. Operator modifications are preserved.
  - Migration script `20261010100000_v18_phase4_runbook_remediation/migration.sql` uses `INSERT INTO "RunbookDefinition" ... ON CONFLICT ("id") DO NOTHING;`.

---

## 4. Actual Call Paths

### Forward Action Flow:
1. `POST /reliability/runbooks/plan` -> `ReliabilityController.planRemediation()`
2. `RunbookEngineService.planRemediation()`:
   - Validates company access & `EMERGENCY_STOP` status.
   - Interactive transaction:
     - `assertRunbookNotThrottledInTx()` enforces cooldown and max attempts atomically.
     - If high/critical risk: `tx.approvalRequest.create(...)` creates authentic PENDING approval.
     - `tx.runbookExecution.create(...)` creates execution in `PENDING_APPROVAL` (or `APPROVED` if Chairman).
3. If `PENDING_APPROVAL`:
   - `POST /reliability/runbooks/executions/:id/approve` -> `ReliabilityController.approveExecution()`
   - `RunbookEngineService.approveExecution()` validates Chairman authority, updates `ApprovalRequest` to `APPROVED`, and updates `RunbookExecution` to `APPROVED` in a transaction.
4. `POST /reliability/runbooks/executions/:id/execute` -> `ReliabilityController.executeRemediation()`
5. `RunbookEngineService.executeRemediation()`:
   - Atomic conditional lock: `updateMany({ where: { id, status: APPROVED }, data: { status: EXECUTING } })`.
   - Constructs `ExternalActionRequest` with authentic `approvalId`.
   - Calls `ExternalActionGatewayService.executeAction(request)`.
   - Gateway calls `ApprovalValidationService.validateAndConsumeApproval(approvalId, context)`.
   - `ApprovalValidationService` validates parameters, target, environment, company scope, and atomically updates `status: CONSUMED`.
   - Gateway dispatches via `ITRemediationAdapter.executeAction()`.
   - `RunbookEngineService.verifyRemediation()` verifies post-remediation probe health.

### Rollback Flow:
1. `POST /reliability/runbooks/executions/:id/rollback` -> `ReliabilityController.rollbackRemediation()`
2. `RunbookEngineService.rollbackRemediation()`:
   - Validates `assertCompanyNotEmergencyHalted()`.
   - Constructs `ExternalActionRequest` with `payload: { isRollback: true, ... }` and `actionType: 'IT_REMEDIATION_ACTION'`.
   - Calls `ExternalActionGatewayService.executeAction(request)`.
   - `RiskClassifierService` classifies rollback as `LOW` risk.
   - `GatewayAuthorityValidatorService` validates requesting actor authority.
   - Gateway records audit log and delegates to `ITRemediationAdapter.execute()`, which invokes `executeRollback()`.
   - If gateway rejects: adapter is blocked; execution status recorded as `ROLLBACK_FAILED`.
   - On success: execution status atomically updated to `ROLLED_BACK`.

---

## 5. Non-Destructive Test Matrix Results

All tests executed synchronously via Jest in non-interactive band mode:

```bash
# 1. Phase 4 & Phase 4.2 Remediation Spec (F01-F06)
npm run test --prefix apps/api -- v18-phase4-runbook-remediation.spec.ts
# Result: PASS (48/48 passed, 10.92s)

# 2. Phase 3 & 3.1 Diagnostic RCA Regression Spec
npm run test --prefix apps/api -- v18-phase3-diagnostic-rca.spec.ts
# Result: PASS (26/26 passed, 11.55s)

# 3. Phase 1 & Phase 2 Telemetry & Incident Regression Specs
npm run test --prefix apps/api -- v18-phase1-telemetry-probing.spec.ts v18-phase2-incident-triage.spec.ts
# Result: PASS (36/36 passed, 11.06s)

# 4. Multi-Tenant HTTP Isolation Spec
npm run test --prefix apps/api -- tenant-isolation.http.spec.ts
# Result: PASS (62/62 passed, 11.56s)

# 5. V16 Governance & V17 Evolution Regressions
npm run test --prefix apps/api -- ceo-autonomous-v16.spec.ts v17-phase7-continuous-evolution.spec.ts
# Result: PASS (80/80 passed, 11.11s)

# 6. Prisma Schema Validation
npx prisma validate --schema packages/database/prisma/schema.prisma
# Result: The schema at packages/database/prisma/schema.prisma is valid (Exit 0)

# 7. Database Package Build
npm run build --prefix packages/database
# Result: @aevora/database build clean (Exit 0)

# 8. API Package Build
npm run build --prefix apps/api
# Result: @aevora/api build clean (Exit 0)
```

**Total Tests Passing:** 252 automated tests passed across 7 test suites with 0 failures and 0 skipped tests.

---

## 6. Live PostgreSQL Verification Plan & Limitations

### Evidence Classification:
- **Unit & Integration Tests:** Executed against in-memory transactional mock harness (`mockPrisma`, interactive transaction rollback simulation, Jest spies). They prove logic, parameter normalization, TOCTOU state changes, and branch behavior.
- **Live Database Status:** Outstanding. In accordance with safety boundaries, no unverified, staging, or live database was accessed or mutated.

### Execution Plan for Authorized Isolated PostgreSQL Verification:
1. **Prerequisites:**
   - Provision a transient PostgreSQL 16 test database (e.g. Docker container `postgres:16-alpine`).
   - Configure isolated `DATABASE_URL` pointing strictly to the transient instance.
2. **Commands to Run:**
   ```bash
   # Apply V18 migration sequence
   npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

   # Validate table constraints and foreign keys
   psql $DATABASE_URL -c "\d \"ApprovalRequest\""
   psql $DATABASE_URL -c "\d \"RunbookExecution\""

   # Verify seed idempotency
   npx prisma db seed --schema=packages/database/prisma/schema.prisma
   ```

---

## 7. Mandatory Stop Gate

Phase 4.2 implementation and non-destructive verification are complete.
Per the mandate:
- **DO NOT** deploy to production or staging.
- **DO NOT** apply migrations to live or unidentified databases.
- **DO NOT** execute real infrastructure commands.
- **DO NOT** begin Phase 5.

Standing down for independent read-only acceptance audit.

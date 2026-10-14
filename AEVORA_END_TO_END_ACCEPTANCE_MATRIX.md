# AEVORA — End-to-End Business Workflow Acceptance Matrix

**Workspace:** `E:\Aevora`  
**Audit Date:** 2026-10-12  
**Verification Environment:** Local Node.js v20 / npm v11 / Docker (PostgreSQL 15 on Port 5433, Redis 7 on Port 6379)  
**Verification Standard:** Fresh Execution & Code Inspection (Zero Unverified Claims)  

---

## 1. Executive Matrix Summary

| Workflow # | Business Workflow Dimension | Implementation Status | Test Coverage | Live DB Verified | Mocked vs Real Providers | Production Gaps |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | **Authentication, Access & Tenant Isolation** | **VERIFIED** | 420 web tests, `tenant-isolation.http.spec.ts` | Yes | Real JWT, Real PBKDF2/scrypt hashes | No refresh token rotation; token expiration is 1h. |
| **2** | **Task Creation, Scheduling, Execution & Retries** | **VERIFIED** | 26 unit tests (`v17-phase4-evidence-outcomes.spec.ts`) | Yes | Deterministic execution engine | In-memory retry scheduling lacks distributed worker queue (BullMQ/Redis). |
| **3** | **CEO Autonomous Decisions & Sovereign Governance** | **VERIFIED** | 14 consequence tests (`ceo-consequence-v16.spec.ts`) | Yes | Deterministic consequence formulas | LLM strategic rethink requires local Ollama instance running. |
| **4** | **Offer Market, Economics, Approvals & Redemptions** | **VERIFIED** | 26 unit + 8 integration tests against PostgreSQL | Yes | Deterministic financial formulas, real Prisma transactions | External dispatch currently routes to sandbox email/social mocks. |
| **5** | **Marketing Content Generation & External Delivery** | **VERIFIED (SANDBOX)** | 23 tests (`v20-marketing-factory.spec.ts`) | Yes | Sandbox adapters for Meta/X/LinkedIn/Email | Real provider sending disabled by default via environment safety nets. |
| **6** | **Failure Detection, Self-Healing & Incident Triage** | **VERIFIED** | 4 reliability test suites (`v18-phase1` through `phase4`) | Yes | Internal Node process and event-loop probes | Missing host/container OS-level metrics collector. |
| **7** | **Emergency-Stop Controls & Financial Kill Switches** | **VERIFIED** | Validated in Offer Governance & Survival suites | Yes | Database-backed `emergencyStatus` check | UI needs prominent emergency stop toggle on all dashboards. |
| **8** | **Deployment, Health Checks, Monitoring & Recovery** | **PARTIAL** | `/health`, `/health/probes`, `backup-db.sh` | Yes | Local Docker container healthchecks | Missing automated backup restoration test; missing API/Web Dockerfiles. |

---

## 2. Detailed Workflow Analysis & Evidence Trace

---

### Workflow 1: Authentication, Company Access, Permissions & Tenant Isolation

- **Entry Points:**
  - `POST /api/auth/login` (Auth API)
  - `GET /api/bff/auth/me`, `GET /api/bff/auth/companies` (Web BFF Proxy)
- **Permissions & Roles:**
  - Global `JwtAuthGuard` checks Bearer token on every non-public route.
  - Role hierarchy: `CHAIRMAN` > `CEO` > `DEPARTMENT_HEAD` > `EMPLOYEE`.
  - Roles enforced via `@Roles(...)` decorator and `RolesGuard`.
- **Tenant Persistence & Data Isolation:**
  - `companyId` is embedded inside JWT payload at login.
  - BFF proxy (`apps/web/src/app/api/bff/[...path]/route.ts`) checks `X-Company-Id` header and ensures it matches URL path parameter capture groups.
  - Server-side field whitelist (`apps/web/src/server/projections.ts`) scrubs sensitive internal fields before JSON serialization.
  - Database queries uniformly filter by `companyId`.
- **Verification Evidence:**
  - `apps/api/src/authorization/tenant-isolation.http.spec.ts`: Passed. Validates that actor from Company A cannot read or mutate Company B's employees, tasks, departments, or financial records.
  - `apps/api/src/authorization/credential-redaction.http.spec.ts`: Passed. Confirms `credentialHash` and salts are never serialized in API responses.
- **Provider Reality:** Pure internal cryptographic implementation. Real PBKDF2/scrypt key derivation.
- **Unresolved Gaps:**
  - Absence of IP rate limiting on `/api/auth/login`.

---

### Workflow 2: Task Creation, Authorization, Scheduling, Execution, Retry & Outcomes

- **Entry Points:**
  - `POST /tasks` (Create)
  - `POST /tasks/:id/execute` (Trigger)
  - `GET /tasks/:id` (Inspect Status)
- **Implementation & Orchestration:**
  - Handled by `TaskOrchestratorService` (`apps/api/src/task/task-orchestrator.service.ts`).
  - Task quality gate (`TaskQualityGateService`) validates prerequisites, budget authorization, and department scope.
  - Retry policy (`RetryPolicyService`) provides exponential backoff with jitter on transient failures.
  - Strategic reconciliation (`StrategicOutcomeReconciliationService`) evaluates completed tasks against strategic objectives.
- **Evidence & Verification:**
  - Every executed task produces an immutable outcome record with a SHA-256 evidence hash.
  - `apps/api/src/task/v17-phase4-evidence-outcomes.spec.ts`: 26/26 tests passed (5.96s).
  - `apps/api/src/task/v17-phase3-reliable-execution.spec.ts`: Passed. Validates idempotency keys prevent duplicate execution.
- **Provider Reality:** Fully deterministic state engine backed by PostgreSQL.
- **Unresolved Gaps:**
  - Background task scheduling runs in-process via NestJS `@nestjs/schedule` timers. In a multi-replica deployment, an external Redis-backed queue (e.g. BullMQ) is required to prevent duplicate execution across workers.

---

### Workflow 3: CEO Decision-Making, Approval Enforcement & Consequence Verification

- **Entry Points:**
  - `GET /ceo/operating-state`
  - `POST /ceo/autonomous-decisions`
  - `POST /ceo/autonomous-decisions/:id/approve`
  - `POST /ceo/autonomous-decisions/:id/execute`
- **Governance Invariants:**
  - The Autonomous CEO evaluates decisions across 6 consequence dimensions: Financial Exposure, Strategic Alignment, Brand & Reputation, Workforce & Morale, Legal & Compliance, and Systemic Risk.
  - Risk classification tiers: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
  - **Sovereign Rule:** Any decision with risk tier `HIGH` or `CRITICAL`, or financial exposure exceeding company policy limits, STRICTLY requires Chairman approval.
  - **Anti-Self-Approval:** The CEO is programmatically prohibited from approving its own escalated decisions.
- **Verification Evidence:**
  - `apps/api/src/ceo/ceo-consequence-v16.spec.ts`: 14/14 tests passed (6.39s).
  - `apps/api/src/governance/v17-phase5-authority-governance.spec.ts`: Passed.
- **Provider Reality:** Consequence calculation is purely deterministic mathematical logic. Narrative generation and alternative suggestions fall back gracefully to template heuristics when local Ollama is offline.
- **Unresolved Gaps:**
  - If Ollama is unavailable, advanced LLM reasoning uses fallback heuristics.

---

### Workflow 4: Offer Creation, Evaluation, Approval, Activation & Redemption

- **Entry Points:**
  - `POST /offers` (Create draft)
  - `POST /offers/:id/evaluate` (CEO financial evaluation)
  - `POST /offers/:id/approve` (Sovereign approval)
  - `POST /offers/:id/activate` (External gateway dispatch)
  - `POST /offers/:id/redeem` (Atomic redemption)
  - `GET /offers/:id/measurement` (Variance reconciliation)
- **Financial & Governance Rules:**
  - Deterministic unit economics: gross revenue, incremental volume, contribution profit, margin erosion, cannibalization risk, break-even volume.
  - Negative margin guardrail: `finalPrice < unitCost` flags critical margin erosion.
  - Sovereign Chairman Discount Rule: `discountPct > 50` requires Chairman role (`CHAIRMAN`). Non-Chairman approval attempts throw `ForbiddenException`.
  - Cryptographic binding: SHA-256 hash over canonical terms (`computeParametersHash`). Any material edit invalidates prior approval (`approvalBinding = undefined`, status resets to `REVISION_REQUIRED`).
  - Anti-replay protection: `OfferConsumedApproval` table prevents reuse of approval tokens.
  - Atomic redemptions: Protected by PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) in `prisma.$transaction`. Concurrency cannot exceed `maxRedemptions`.
- **Verification Evidence:**
  - `apps/api/src/offer-market/v24-offer-market.spec.ts`: 26/26 unit tests passed (17.92s).
  - `apps/api/src/offer-market/v24-offer-market-postgres.integration.spec.ts`: 8/8 tests passed against live PostgreSQL on port 5433 (8.16s).
- **Provider Reality:** Fully persisted in PostgreSQL (`Offer`, `OfferMaterialTermsRecord`, `OfferTermsVersion`, `OfferApprovalRecord`, `OfferConsumedApproval`, `OfferRedemptionRecord`).
- **Unresolved Gaps:**
  - Outbound customer notification for redeemed offers currently routes to console logger/sandbox.

---

### Workflow 5: Marketing Content Generation, Approval & Provider Delivery

- **Entry Points:**
  - `POST /marketing-content/generate`
  - `POST /marketing-content/approve`
  - `POST /marketing/campaigns`
  - `GET /marketing/tracking/:code` (Attribution redirect)
- **Implementation & Adapters:**
  - `SocialPublishingGatewayService` (`apps/api/src/marketing/social-publishing-gateway.service.ts`).
  - Multi-channel copy generation for Twitter/X, LinkedIn, Meta, and Email.
  - Attribution tracking engine computes click-throughs, conversions, and customer acquisition costs.
- **Provider Reality & Sandboxing:**
  - Adapters detect `ENABLE_REAL_PRODUCTION_SENDING`. When `false` (default), outbound API calls are redirected to internal sandbox mocks, recording simulated external reference IDs.
  - In safe mode (`AEVORA_SAFE_MODE=true`), outbound HTTP calls are blocked by `installSafeModeNetworkGuard`.
- **Verification Evidence:**
  - `apps/api/src/marketing/v20-marketing-factory.spec.ts`: 23/23 tests passed (5.28s).
- **Unresolved Gaps:**
  - Webhook ingestion for live delivery reports from SendGrid/Meta needs end-to-end provider credentials configured in production.

---

### Workflow 6: Failure Detection, Idempotent Retries, Escalation & Self-Healing

- **Entry Points:**
  - `GET /health/probes`
  - `POST /reliability/incidents/triage`
  - `POST /reliability/runbooks/:id/execute`
- **Reliability Engine:**
  - Health probes (`HealthProbeService`) monitor memory usage, event-loop lag, database latency, and Redis connectivity.
  - Incident triage engine (`IncidentTriageService`) categorizes incidents by severity (`P0`, `P1`, `P2`, `P3`).
  - Runbook engine (`RunbookEngineService`) executes automated remediation actions (e.g. cache eviction, connection pool refresh, query throttling) with rollbacks on failure.
- **Verification Evidence:**
  - `apps/api/src/reliability/v18-phase1-telemetry-probing.spec.ts`: Passed.
  - `apps/api/src/reliability/v18-phase2-incident-triage.spec.ts`: Passed.
  - `apps/api/src/reliability/v18-phase4-runbook-remediation.spec.ts`: Passed.
- **Provider Reality:** Pure internal telemetry and rule-based diagnostic engine.
- **Unresolved Gaps:**
  - Centralized alerting (PagerDuty, Slack webhook, Prometheus Alertmanager) is not connected.

---

### Workflow 7: Emergency-Stop Controls & Rejection of Unauthorized Actions

- **Control Surface:**
  - Database field `company.emergencyStatus` (`ACTIVE` vs `EMERGENCY_STOP`).
  - API Safe Mode (`AEVORA_SAFE_MODE=true`).
  - Survival financial kill switch (`SurvivalService.checkFinancialHealth()`).
- **Fail-Closed Behavior:**
  - In `OfferGovernanceService.verifyEmergencyStatus()`: When `emergencyStatus === 'EMERGENCY_STOP'`, every activation and dispatch throws `ForbiddenException`.
  - In `SafeModeNetworkGuard`: All outbound HTTP requests are rejected at process level.
  - In `SurvivalService`: If balance drops below `MIN_BALANCE_PAISE`, automated marketing, hiring, and capital deployment are immediately halted.
- **Verification Evidence:**
  - Unit test `v24-offer-market.spec.ts` (test 4.6): Passed. Verifies emergency stop halts offer activation.
  - `apps/api/src/survival/` test suites: Passed.
- **Provider Reality:** Authoritative database state check in PostgreSQL.
- **Unresolved Gaps:**
  - Chairman UI needs an emergency stop button accessible from any page.

---

### Workflow 8: Deployment, Health Checks, Monitoring & Disaster Recovery

- **Existing Infrastructure:**
  - Docker Compose file `infrastructure/docker/docker-compose.yml` for PostgreSQL 15 and Redis 7.
  - Backup script `infrastructure/scripts/backup-db.sh` using `docker exec pg_dump ... | gzip`.
  - Health endpoints: `/health` (basic liveness), `/health/probes` (system metrics), `/health/models` (Ollama status).
- **Verification Evidence:**
  - `docker ps`: `aevora_postgres` healthy on port 5433, `aevora_redis` healthy on port 6379.
  - Database migrations: 68/68 applied successfully.
  - Monorepo Turbo build: 5/5 packages compiled cleanly with exit code 0.
- **Unresolved Gaps:**
  - No container definitions (Dockerfiles) for `@aevora/api` and `@aevora/web`.
  - No automated disaster recovery restoration test script.
  - PostgreSQL and Redis port bindings currently expose `0.0.0.0` rather than `127.0.0.1`.

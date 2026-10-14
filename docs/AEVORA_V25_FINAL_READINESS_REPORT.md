# AEVORA — V25 Final Pre-Deployment Acceptance & Readiness Report

**Workspace:** `E:\Aevora`  
**Date:** 2026-10-13  
**Evaluator:** Autonomous Verification Agent (DeepMind Antigravity)  
**Standard:** Empirical Execution & Zero-Unverified Claims  
**Verification Environment:** Verified Disposable PostgreSQL (`localhost:5444/aevora_e2e`) & Redis (`localhost:6380`)  

---

## 1. Executive Summary & Official Gate Decisions

| Evaluation Gate | Verdict | Core Rationale & Deciding Factors |
| :--- | :---: | :--- |
| **Staging Deployment** | **CONDITIONAL GO** | Full workspace build (5/5 packages), container definitions, Traefik reverse proxy routing, backup/restore runbooks, and preflight tooling are verified. Pending target Linux host allocation and `.env.staging` file configuration. |
| **Inbound Customer Pilot** | **CONDITIONAL GO** | Public intake route (`/request`, `POST /public/requests`), bot honeypot, body/field limits, Crockford Base32 references (`REQ-XXXXXXXXXX`), secure status lookup (`POST /public/requests/status`), operator request queue (`/company/:id/requests`), compare-and-set transitions, and audit logs are 100% verified in code and DB integration tests. Pending staging host commissioning and setting `PUBLIC_INTAKE_COMPANY_ID`. |
| **Live Outbound Communications** | **STRICT NO-GO** | **Security & Safety Blockers**: (1) Historical Gmail app password in commit history remains unverified as rotated by the operator; (2) `UNSUBSCRIBE_SECRET` (≥32 chars), `PUBLIC_API_URL` (RFC 8058), and real SMTP credentials remain unconfigured; (3) Outbound safety kill-switches (`ENABLE_REAL_PRODUCTION_SENDING=false`, `DEMO_PUBLISHING_ENABLED=false`) remain active. |
| **Production General Availability** | **NO-GO** | Blocked on successful staging pilot execution, credential rotation verification, real provider provisioning, and off-site backup storage configuration. |

---

## 2. Test Execution & Empirical Verification Evidence

All tests were executed against the isolated disposable PostgreSQL container (`aevora_e2e_pg` on port `5444`) and disposable Redis (`aevora_e2e_redis` on port `6380`). Developer databases (`aevora_postgres` on `:5433` and `aevora_redis` on `:6379`) were verified untouched.

### Empirical Test Summary

| Test Suite / Area | Command / Target | Passed | Failed | Skipped | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Disposable DB-Backed E2E Suites** | `bash scripts/verify-disposable-db.sh` | **40** | 0 | 0 | **PASS** |
| — `v24-offer-market-postgres.integration.spec.ts` | Offer lifecycle, approvals, discount gates | 8 | 0 | 0 | **PASS** |
| — `intake.e2e.spec.ts` | Intake submission, honeypot, status retrieval | 5 | 0 | 0 | **PASS** |
| — `revenue-loop.e2e.spec.ts` | Full revenue pipeline integration | 4 | 0 | 0 | **PASS** |
| — `autonomous-outreach.e2e.spec.ts` | Draft creation, approval gate, sandbox sending | 5 | 0 | 0 | **PASS** |
| — `job-worker.e2e.spec.ts` | Stale-worker protection, lease CAS, job timeouts | 7 | 0 | 0 | **PASS** |
| — Spatial & World State E2E (5 suites) | Movement, meetings, cross-capability tasks | 11 | 0 | 0 | **PASS** |
| **Targeted Intake & Outbound Safety Specs** | `npx jest [inquiry, job, gate3, outbound, outreach]` | **117** | 0 | 0 | **PASS** |
| — `gate4a.spec.ts` | Public intake unit, sanitization, length caps | 18 | 0 | 0 | **PASS** |
| — `job-security.spec.ts` | Job authorization, tenant isolation, replay limits | 4 | 0 | 0 | **PASS** |
| — `gate3-safety.spec.ts` | Unsubscribe tokens, rate limits, emergency stop | 22 | 0 | 0 | **PASS** |
| — `outbound-gate.spec.ts` | Outbound email approval gate & sandbox enforcement | 16 | 0 | 0 | **PASS** |
| — `outreach.service.spec.ts` | Outreach claim, deduplication, suppression | 14 | 0 | 0 | **PASS** |
| — `validate-env.spec.ts` | Outbound configuration & secret startup hardening | 23 | 0 | 0 | **PASS** |
| — `health.controller.spec.ts` | Probe security & credential non-exposure | 12 | 0 | 0 | **PASS** |
| — `rate-limit.spec.ts` | Inbound intake rate limiting (5 req/min) | 8 | 0 | 0 | **PASS** |
| **Preflight Infrastructure Validation** | `npm run test:preflight` | **6** | 0 | 0 | **PASS** |
| — Secret & environment validation | Weak/strong secret classification & required vars | 4 | 0 | 0 | **PASS** |
| — Docker Compose port isolation | Loopback port bindings (staging) & isolation (prod) | 2 | 0 | 0 | **PASS** |
| **Web Frontend Test Suite (`apps/web`)** | `npm test` (vitest) | **439** | 0 | 7* | **PASS** |
| — `bff.test.ts` | BFF proxy & tenant header enforcement | 33 | 0 | 0 | **PASS** |
| — `gate4a-intake.test.ts` | Client intake form validation & honeypot | 9 | 0 | 0 | **PASS** |
| — `slice2` through `slice10` & executive consoles | Operator console panels and workflow views | 397 | 0 | 0 | **PASS** |
| **Full Workspace Build (`turbo run build`)** | 5 packages in scope | **5** | 0 | 0 | **PASS** |
| — `@aevora/database` | Prisma client & schema generation | - | - | - | **PASS** |
| — `@aevora/shared` | Core types, spatial math, protocol contracts | - | - | - | **PASS** |
| — `@aevora/model-gateway` | AI model gateway & Ollama abstractions | - | - | - | **PASS** |
| — `@aevora/api` | NestJS backend compilation | - | - | - | **PASS** |
| — `@aevora/web` | Next.js production bundle compilation | - | - | - | **PASS** |
| **Static Code Quality & Typecheck** | `npm run lint` & `tsc --noEmit` | **0 errors** | 0 | 0 | **PASS** |
| — `apps/api` Typecheck | `npx tsc --noEmit` | 0 errors | 0 | 0 | **PASS** |
| — `apps/web` Typecheck | `npx tsc --noEmit` | 0 errors | 0 | 0 | **PASS** |
| — Workspace Linter | `npm run lint` (ESLint across all packages) | 0 errors | 0 | 0 | **PASS** |

*\*Note: 7 skipped tests in `apps/web` are `src/test/e2e.live.test.ts`, which require a running live web server.*

---

## 3. Verified Functionality & Invariants

### A. Authentication, Role Enforcement & Tenant Isolation
- **Role Gating:** NestJS guards strictly enforce caller roles (`CHAIRMAN`, `MANAGEMENT`, `EMPLOYEE`). Routes modifying business state (such as `/company/:id/requests` transitions or `/offers` activations) require Management or Chairman privileges.
- **Tenant Clamping:** All authenticated requests pass through BFF middleware (`apps/web/src/proxy.ts`), attaching caller `companyId` from validated JWTs. API queries enforce tenant boundaries; requests referencing cross-tenant entities fail with HTTP 404.
- **Session & Cookie Security:** Session tokens are stored in `HttpOnly`, `SameSite=Lax` cookies with `Secure` flags enforced in staging and production.

### B. Public Intake & Abuse Prevention
- **Intake Pipeline:** Prospective customers submit inquiries via `apps/web/src/app/request/page.tsx` (`POST /api/public/request` → `POST /public/requests`).
- **Bot Mitigation:** Hidden honeypot field (`website`) silently traps automated submission bots.
- **Payload Caps:** Request body capped at 16 KB; text fields capped at 4,000 characters; maximum 3 URLs permitted; ASCII control characters stripped.
- **Rate Limiting:** NestJS rate limiter restricts public intake to 5 requests/minute per IP.
- **Idempotency & References:** Submissions generate Crockford Base32 identifiers (`REQ-[2-9A-HJKMNP-Z]{10}`). Duplicate submissions with matching email, business name, and service return the existing reference idempotently.
- **Status Privacy:** Customers check status at `POST /public/requests/status`. Requires exact reference code and matching contact email. Returns coarse status (`RECEIVED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`). Internal notes, staff identities, and database IDs are never leaked.

### C. Operator Queue & Workflow Management
- **Workspace UI:** Operator workspace at `/company/:companyId/requests` connects directly to BFF endpoints.
- **Concurrency Control:** Status transitions enforce compare-and-set queries (`where: { id, status: from }`), preventing conflicting updates from concurrent operators (HTTP 409).
- **Audit Logging:** Every status change and internal note append logs a persistent `CustomerAuditEvent` containing the actor ID, timestamp, and modification payload.

### D. Job Worker Safety & Execution Timeouts
- **Optimistic Lease Compare-and-Set:** `JobWorkerService` executes state updates with `where: { id: job.id, status: JobStatus.PROCESSING, workerId: this.workerId }`. Stale workers whose lease expired or was recovered cannot overwrite job state.
- **Execution Timeouts:** Worker tasks are wrapped in `Promise.race` timeouts clamped between 1 ms and 300,000 ms (`DEFAULT_JOB_TIMEOUT_MS = 60_000`). Hanging executions reject cleanly, increment retry attempts, and requeue with exponential backoff.
- **Re-entrancy Protection:** `isProcessing` lock prevents concurrent polling passes on the same worker instance.

---

## 4. Empirical Backup & Restoration Drill

A non-destructive disaster recovery drill was executed on the isolated database container `aevora_e2e_pg` using the repository's native scripts.

### Backup Verification
- **Command:** `POSTGRES_USER=postgres POSTGRES_DB=aevora_e2e POSTGRES_PASSWORD=e2e_local_only BACKUP_DIR=/tmp/aevora_test_backup ./infrastructure/scripts/backup-db.sh aevora_e2e_pg`
- **Result:** **SUCCESS**
- **Artifact:** `/tmp/aevora_test_backup/db_backup_2026-10-13_20-14-08.dump`
- **Size:** 1,477,911 bytes (~1.48 MB)
- **Format:** PostgreSQL Custom Archive (`-Fc`) with native zlib compression.
- **Catalog Integrity Check:** Passed `pg_restore -l` catalog parsing without errors.

### Restoration Verification
- **Command:** `POSTGRES_USER=postgres POSTGRES_DB=aevora_e2e POSTGRES_PASSWORD=e2e_local_only ./infrastructure/scripts/restore-db.sh /tmp/aevora_test_backup/db_backup_2026-10-13_20-14-08.dump aevora_e2e_pg`
- **Result:** **SUCCESS**
- **Header Inspection:** Auto-detected format `GzipCompressed=false, CustomFormatPGDMP=true`. Restored via `pg_restore --clean --if-exists --no-owner --no-privileges`.
- **Database Consistency Audit:** Verified table count immediately following restore:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
  -- Result: 380 tables present
  ```
- **Safety Guards Verified:** `restore-db.sh` actively blocks developer databases (`aevora_postgres`, `hostel-postgres`) and requires `CONFIRM_PRODUCTION_RESTORE=true` for any container name containing `prod`.

---

## 5. Security & Historical Credential Audit

### A. Historical Leaked Gmail App Password
- **Finding:** A test Gmail app password was committed to the repository in commits prior to `23cd0ce`.
- **Status:** **UNVERIFIED ROTATION.** There is no documented proof or external API verification that the operator has revoked this credential in Google Account security settings.
- **Disposition:** **ABSOLUTE BLOCKER** for enabling live outbound email sending (`ENABLE_REAL_PRODUCTION_SENDING=true`).

### B. Outbound Sending Safety Switches
- `ENABLE_REAL_PRODUCTION_SENDING=false`: Strictly enforced. All outbound email paths delegate to `SandboxEmailProvider`.
- `DEMO_PUBLISHING_ENABLED=false`: Strictly enforced. Outbound demo publishing to social/public platforms fails closed.
- `emergencyStopActive()`: Sovereign Chairman emergency stop blocks all outbound emails, Chairman notifications, and autonomous offers immediately.
- `RazorpayWebhookController`: Fails closed (HTTP 400) when `RAZORPAY_WEBHOOK_SECRET` is unset.
- WhatsApp Integration: Configured as manual-only / mock adapter.

---

## 6. Confirmed Local Defects Fixed in Scope

During this readiness evaluation, the workspace linter (`npm run lint`) reported a fatal lint failure in `apps/api`:
- **File:** [`apps/api/src/sales-outreach/email-outreach.service.ts`](file:///e:/Aevora/apps/api/src/sales-outreach/email-outreach.service.ts#L3)
- **Defect:** Unused import `ExecutionEnvironment` from `@prisma/client` violated ESLint rule `@typescript-eslint/no-unused-vars` and aborted turbo pipeline builds.
- **Resolution:** Removed unused import; preserved all functional logic and dependencies.
- **Verification:** Re-ran `npx eslint src --quiet` (0 errors) and root `npm run lint` (0 errors across entire monorepo).

---

## 7. Incomplete Customer-Facing Features & Architectural Limitations

To ensure full transparency prior to pilot onboarding, the following boundaries are formally recorded:

1. **Inbound Inquiry → Direct Proposal UI:**
   - The operator queue allows transitioning inquiries (`NEW` → `UNDER_REVIEW` → `QUALIFIED` → `CONVERTED`) and appending audit notes.
   - However, converting a qualified inquiry directly into a formal commercial proposal currently requires using the Offer Market workspace or API; there is no single-click "Generate Proposal from Inquiry" button in the web UI.
2. **Social Marketing UI:**
   - `/company/:id/marketing` displays drafted social posts from PIXEL in read-only mode. Directly triggering generation or publishing from the browser is intentionally omitted from this release.
3. **Outbound Outreach Campaign Trigger UI:**
   - `/company/:id/sales` displays lead-generation runs and discovered leads. Initiating autonomous email outreach campaigns is not exposed in the web UI; outreach is managed through background jobs.
4. **Single-Replica Deployment Constraint:**
   - The staging stack is architected for single API and Web replicas. In-memory idempotency caches (`createIdempotencyCache`) are not yet cluster-distributed across multi-node replicas.

---

## 8. Deployment & Configuration Prerequisites for Pilot Launch

Before live visitor inquiries can be processed:

1. **Host Commissioning:**
   - Provision a Linux VM (Ubuntu 22.04 or 24.04 LTS, ≥2 vCPUs, ≥4 GB RAM) per [`docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md`](file:///e:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md).
2. **DNS Routing:**
   - Direct `A`/`AAAA` DNS records for `staging.aevora.com` and `api.staging.aevora.com` to the host public IP.
3. **Environment Configuration (`.env.staging`):**
   - Set `PUBLIC_INTAKE_COMPANY_ID=<target_company_id>` (without this, `/request` returns HTTP 503).
   - Generate strong random secrets for `JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and `WEBHOOK_SECRET_PROD`.
   - Maintain `ENABLE_REAL_PRODUCTION_SENDING=false` and `DEMO_PUBLISHING_ENABLED=false`.
4. **Container Launch:**
   - Execute `docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging up -d`.

---

## 9. Single Next Action Toward First Revenue

### **Commission the Staging Host and Set `PUBLIC_INTAKE_COMPANY_ID`**

1. Provision the target staging Linux host in accordance with [`docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md`](file:///e:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md).
2. Populate `.env.staging` with strong random secrets and assign `PUBLIC_INTAKE_COMPANY_ID` to the active commercial company entity.
3. Execute `docker compose -f infrastructure/docker/docker-compose.staging.yml up -d` to launch the Traefik ingress, API, and Web containers.
4. Share `https://staging.aevora.com/request` with the first prospective client to begin ingesting real, controlled customer demand into the verified operator queue.

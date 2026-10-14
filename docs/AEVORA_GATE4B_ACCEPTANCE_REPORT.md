# AEVORA — Gate 4B Acceptance Report: Real-World Readiness & First-Revenue Acceptance

**Workspace:** `E:\Aevora`  
**Date:** 2026-10-13  
**Verification Environment:** Verified Disposable PostgreSQL (`localhost:5444/aevora_e2e`) & Redis (`localhost:6380`)  
**Standard:** Empirical Execution & Zero-Unverified Claims  

---

## 1. Verified Changes

1. **Job Worker Lease Ownership Protection (`apps/api/src/job/job-worker.service.ts`):**
   - Replaced unconditional updates with optimistic compare-and-set queries (`where: { id: job.id, status: JobStatus.PROCESSING, workerId: this.workerId }`).
   - If a lease expires, is recovered after 5 minutes, or is modified by an operator, stale workers cannot overwrite the state (completion or error updates are safely discarded).
   - Added `isProcessing` lock to prevent re-entrant polling loops on the same worker instance.
   - Cleared `lockedAt` and `workerId` upon job completion or terminal failure.

2. **Per-Job Execution Timeout (`apps/api/src/job/job-worker.service.ts`):**
   - Implemented `Promise.race` timeout wrapping around `taskBridge.executeTaskJob(job)`.
   - Supports payload-configured `timeoutMs` (clamped between 1 ms and `MAX_JOB_TIMEOUT_MS = 300_000`), defaulting to `DEFAULT_JOB_TIMEOUT_MS = 60_000`.
   - Hanging tasks reject with `Job execution timed out after ${timeoutMs}ms`, increment attempts, and requeue with exponential backoff.

3. **Job Worker Regression Tests (`apps/api/src/job/job-worker.e2e.spec.ts`):**
   - Added test: `enforces per-job timeout on hanging task executions`.
   - Added test: `stale worker cannot overwrite status after lease is lost or stolen`.
   - All 7 background job E2E tests pass against the disposable PostgreSQL.

4. **Outbound Sending Configuration Guard (`apps/api/src/config/validate-env.ts`):**
   - Added fast-failing startup validation when `ENABLE_REAL_PRODUCTION_SENDING === 'true'`.
   - Validates that `UNSUBSCRIBE_SECRET` is at least 32 characters and does not use known development placeholders.
   - Validates that `PUBLIC_API_URL` is configured and is a valid HTTP(S) URL.
   - Documented `PUBLIC_INTAKE_COMPANY_ID`, `UNSUBSCRIBE_SECRET`, `PUBLIC_API_URL`, and `DEMO_PUBLISHING_ENABLED` in `OPTIONAL_ENV`.
   - Added regression test suite in `apps/api/src/config/validate-env.spec.ts` (all 23 tests pass).

5. **Chairman Notification Outbound Safety (`apps/api/src/notifications/chairman-mailer.ts`):**
   - Integrated `emergencyStopActive()` guard into `configured`, `sendTo`, and `sendRaw`.
   - Guaranteed that active emergency stops halt internal notifications from triggering outbound SMTP transports.

---

## 2. Test Execution & Pass/Fail Totals

| Test Suite / Area | Command | Passed | Failed | Skipped | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Disposable DB-Backed E2E Suites** | `bash scripts/verify-disposable-db.sh` | **40** | 0 | 0 | **PASS** |
| — `v24-offer-market-postgres.integration.spec.ts` | Included in above | 8 | 0 | 0 | **PASS** |
| — `intake.e2e.spec.ts` | Included in above | 5 | 0 | 0 | **PASS** |
| — `revenue-loop.e2e.spec.ts` | Included in above | 4 | 0 | 0 | **PASS** |
| — `autonomous-outreach.e2e.spec.ts` | Included in above | 5 | 0 | 0 | **PASS** |
| — `job-worker.e2e.spec.ts` | Included in above (with new regression tests) | 7 | 0 | 0 | **PASS** |
| — Spatial & World State E2E (5 suites) | Included in above | 11 | 0 | 0 | **PASS** |
| **Targeted Intake & Safety Specs** | `npx jest [inquiry, job, gate3, outbound, outreach]` | **96** | 0 | 0 | **PASS** |
| — `gate4a.spec.ts` (Intake unit & validation) | Included in above | 18 | 0 | 0 | **PASS** |
| — `job-security.spec.ts` (Job authorization/tenant) | Included in above | 4 | 0 | 0 | **PASS** |
| — `gate3-safety.spec.ts` (Unsubscribe, limits, kill-switches) | Included in above | 22 | 0 | 0 | **PASS** |
| — `outbound-gate.spec.ts` (Approval enforcement & conformance) | Included in above | 16 | 0 | 0 | **PASS** |
| — `outreach.service.spec.ts` (Outreach claim & filtering) | Included in above | 14 | 0 | 0 | **PASS** |
| **Config & Secret Validation** | `npx jest src/config/validate-env.spec.ts` | **23** | 0 | 0 | **PASS** |
| **Web Frontend Test Suite** | `npm test` (in `apps/web`) | **439** | 0 | 7* | **PASS** |
| — `gate4a-intake.test.ts` (Client validation, honeypot, SSR) | Included in above | 9 | 0 | 0 | **PASS** |
| **TypeScript Typecheck (`apps/api`)** | `npx tsc --noEmit` | **0 errors** | 0 | 0 | **PASS** |
| **TypeScript Typecheck (`apps/web`)** | `npx tsc --noEmit` | **0 errors** | 0 | 0 | **PASS** |

*\*Note: 7 skipped tests in `apps/web` are `src/test/e2e.live.test.ts`, which require a running local web server.*

---

## 3. Disposable Database Status

- **Host Binding:** `localhost:5444/aevora_e2e` (`aevora_e2e_pg`)
- **Isolation Guard:** Host cluster system identifier matches container internal `pg_control_system()`.
- **Protected Database Safety:** Developer services `aevora_postgres` (`:5433`) and `aevora_redis` (`:6379`) remained completely untouched and unaffected.
- **Migration Count:** 70 applied migrations; schema is completely up-to-date (`Database schema is up to date!`).

---

## 4. End-to-End Customer Journey Verification

| Journey Step | Implementation & Verification | Result |
| :--- | :--- | :---: |
| **1. Unauthenticated Submission** | Public `POST /public/requests` and web page `/request`. Tenant resolved via server config `PUBLIC_INTAKE_COMPANY_ID`. | **VERIFIED** |
| **2. Abuse & Boundary Rejection** | Rejects missing fields, invalid emails, honeypot traps (`website` field), payload > 16 KB, description > 4000 chars, excessive URLs (>3), and throttled via NestJS rate limiter (5/min). | **VERIFIED** |
| **3. Deterministic Persistence** | Persisted in `ClientInquiry` with `source: 'PUBLIC_FORM'`, status `NEW`, and an unguessable Crockford-encoded reference `REQ-XXXXXXXXXX`. Duplicates return identical reference without double-insert. | **VERIFIED** |
| **4. Secure Status Retrieval** | Customer retrieves coarse status (`RECEIVED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`) via `POST /public/requests/status` requiring both matching `reference` and `contactEmail`. Internal notes and tenant IDs are never exposed. | **VERIFIED** |
| **5. Operator Queue & Isolation** | Authenticated operators access inquiries via `/inquiries` (BFF `/company/:id/requests`). Strictly tenant-scoped by JWT `companyId` (foreign inquiries return 404). Transitions are compare-and-set (conflicts return 409). Notes append atomically with timestamp and actor ID. Audited via `CustomerAuditEvent`. | **VERIFIED** |
| **6. Draft-Only AI Responses** | Outbound messages created by AI or automations are queued strictly as `PENDING_APPROVAL` in `OutreachDraft`. No outbound send occurs without human Chairman/Management approval. | **VERIFIED** |
| **7. Zero Outbound Leakage** | All tests run against `SandboxEmailProvider`. Zero network fetch, zero SMTP transport calls. Emergency stop actively halts all outbound attempts. | **VERIFIED** |
| **8. Unsubscribe & Suppression** | `EmailSuppression` table enforces tenant-level opt-outs. HMAC-SHA256 signed tokens prevent tampering. Opt-outs block sends, drafts, retries, and lead import. | **VERIFIED** |
| **9. Job Controls & Resilience** | Operator pause/resume/replay strictly role-gated (`CHAIRMAN`/`MANAGEMENT`). Replay capped at 3 for `TASK_EXECUTION`. Stale worker execution prevented via lease-checked compare-and-set. Per-job timeouts prevent hung worker loops. | **VERIFIED** |

---

## 5. Remaining Blockers & Operational Items

### Configuration Blockers for Real Outbound Communications
1. **Real Provider Credentials:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (or SendGrid API Key) must be configured with authorized production credentials.
2. **Sender Identity & Unsubscribe Configuration:**
   - `PUBLIC_INTAKE_COMPANY_ID`: Set to the active production Company ID.
   - `UNSUBSCRIBE_SECRET`: Set to a strong random secret (≥32 chars).
   - `PUBLIC_API_URL`: Set to the publicly accessible API hostname (e.g. `https://api.aevora.com`).
3. **Leaked Gmail Credential Rotation:** Operator must rotate the previously leaked Gmail app password from historical commits before enabling real SMTP.
4. **Kill Switches:** Default `ENABLE_REAL_PRODUCTION_SENDING=false` and `DEMO_PUBLISHING_ENABLED=false` must remain active until live pilot authorization.

---

## 6. Official Gate Decisions

### Decision 1: Accepting Real Customer Inquiries
### **Verdict: GO**
**Rationale:** The public intake pipeline (`/request`, `POST /public/requests`, `POST /public/requests/status`), operator request queue, role gating, tenant isolation, anti-spam honeypot, payload caps, and audit logging are fully implemented, verified across unit/BFF tests, and validated against the real disposable database. It runs safely without sending outbound communications.

### Decision 2: Enabling Real Outbound Communications
### **Verdict: NO-GO (PENDING OPERATOR CONFIGURATION)**
**Rationale:** Outbound safety gates, approval barriers, email suppression, send limits, and emergency kill switches are structurally solid and verified. However, real external sending remains disabled by design until the operator configures real provider credentials, sets `UNSUBSCRIBE_SECRET` and `PUBLIC_API_URL`, rotates historical test credentials, and explicitly flips `ENABLE_REAL_PRODUCTION_SENDING=true`.

---

## 7. Smallest Next Action Toward First Paying Customer

1. **Deploy Public Intake in Live Staging/Production:**
   - Configure `PUBLIC_INTAKE_COMPANY_ID` to point to the authorized company.
   - Direct inbound prospective clients to `https://<domain>/request`.
2. **Review Incoming Inquiries in the Operator Queue:**
   - Company staff reviews and qualifies incoming inquiries in `/company/:companyId/requests`.
   - Operators draft proposals and generate offers internally.
3. **Complete Outbound Credentials Configuration:**
   - Generate a fresh 64-char `UNSUBSCRIBE_SECRET`.
   - Set `PUBLIC_API_URL` and production email sender credentials.
   - Run live sandbox verification with test recipient before flipping `ENABLE_REAL_PRODUCTION_SENDING=true`.

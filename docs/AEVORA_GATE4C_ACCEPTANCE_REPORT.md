# AEVORA V25 — Gate 4C Acceptance Report: Production Inbound Pilot Readiness

**Workspace:** `E:\Aevora`  
**Date:** 2026-10-13  
**Evaluator:** Autonomous Verification Agent  
**Verification Standard:** Empirical Execution & Zero-Unverified Claims  

---

## 1. Executive Summary & Gate Verdicts

### Decision 1: Controlled Inbound Pilot Readiness
# **Verdict: CONDITIONAL GO**
**Evidence & Basis:**
- **Local Route Contract & Engine:** Fully functional and verified. Public submission (`/request`, `POST /public/requests`), bot honeypot, body/field length caps, duplicate deduplication, Crockford Base32 reference issuance (`REQ-XXXXXXXXXX`), secure status lookup (`POST /public/requests/status`), operator request queue (`/company/:id/requests`), compare-and-set transitions, atomic note appending, and `CustomerAuditEvent` logging are all verified across unit, component, BFF, and database-backed suites.
- **Why CONDITIONAL:** No live production or staging host deployment currently exists. `PUBLIC_INTAKE_COMPANY_ID` is unset in live configuration (fails closed with 503). To accept a real visitor inquiry in the wild, an authorized host must be commissioned, DNS routed, and `PUBLIC_INTAKE_COMPANY_ID` assigned.

---

### Decision 2: Live Outbound Communications
# **Verdict: STRICT NO-GO**
**Evidence & Basis:**
- **Security & Safety Blockers:**
  1. **Historical Credential Exposure:** The test Gmail app password in repository commit history remains unverified as rotated by the operator in Google Account settings.
  2. **Missing Production Outbound Config:** `UNSUBSCRIBE_SECRET` (≥32 chars), `PUBLIC_API_URL` (RFC 8058 links), and real production SMTP/provider credentials are not yet provisioned.
  3. **Safety Defaults Maintained:** `ENABLE_REAL_PRODUCTION_SENDING=false` and `DEMO_PUBLISHING_ENABLED=false` remain strictly enforced.

---

## 2. Verified Route Contract & Security Invariants

| Dimension | Implementation Details | Verified Result |
| :--- | :--- | :---: |
| **Public Submission** | `apps/web/src/app/request/page.tsx` → `POST /api/public/request` → `POST /public/requests` | **VERIFIED** |
| **Abuse & Bot Rejection** | Honeypot trap (`website`), body size capped at 16 KB, description ≤ 4000 chars, ≤ 3 URLs, control character stripping. Throttled at 5 requests/min. | **VERIFIED** |
| **Deterministic Reference** | Generates Crockford Base32 code `REQ-[2-9A-HJKMNP-Z]{10}`. Duplicate submissions for same company & content return existing reference idempotently. | **VERIFIED** |
| **Customer Status Lookup** | `POST /api/public/request/status` → `POST /public/requests/status`. Requires exact `reference` and matching `contactEmail`. Returns coarse status (`RECEIVED`, `ACCEPTED`, `IN_PROGRESS`, etc.). Never exposes tenant IDs, notes, or foreign records. | **VERIFIED** |
| **Operator Queue** | `/company/:id/requests` (BFF) → `GET /inquiries`. Role-gated (`CHAIRMAN`, `MANAGEMENT`, `EMPLOYEE`). Tenant-clamped to caller's JWT `companyId` (foreign records return 404). | **VERIFIED** |
| **Atomic Transitions & Notes** | Status changes use compare-and-set (conflicts return 409). Notes append atomically with timestamp and operator ID. Audited via `CustomerAuditEvent`. | **VERIFIED** |
| **Job Resilience & Timeouts** | Background jobs enforce per-job execution timeouts (`DEFAULT_JOB_TIMEOUT_MS = 60_000`). Stale workers cannot overwrite status after lease loss. | **VERIFIED** |
| **Outbound Zero-Leakage** | All tests run against `SandboxEmailProvider`. Zero network or SMTP calls permitted (`netFetch` and `smtp` spies confirm 0 calls). Emergency stop halts Chairman mailer. | **VERIFIED** |

---

## 3. Deployment & Infrastructure Inventory

- **Production / Staging Host Status:** **NOT COMMISSIONED.**
  - No remote server or cloud container is currently connected or accessible.
  - No live DNS records or public ingress routing is currently configured.
  - `git remote -v` contains no remote deployment targets.
  - Staging host deployment runbook is documented at [`docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md`](file:///e:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md) and awaits user host allocation.
- **Local Services Status:**
  - `aevora_postgres` (`0.0.0.0:5433`): Protected local developer DB (**untouched**).
  - `aevora_redis` (`0.0.0.0:6379`): Protected local developer Redis (**untouched**).
  - `hostel-postgres` (`0.0.0.0:5432`): Unrelated user container (**untouched**).
  - `aevora_e2e_pg` (`0.0.0.0:5444`): Isolated disposable test DB (**verified & passing**).
  - `aevora_e2e_redis` (`127.0.0.1:6380`): Isolated disposable test Redis (**verified & passing**).

---

## 4. Test Totals & Quality Audit

| Test Suite | Total Tests | Passed | Failed | Skipped | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **DB-Backed E2E Suites** (`scripts/verify-disposable-db.sh`) | 40 | 40 | 0 | 0 | **PASS** |
| **Targeted Intake & Outbound Safety Specs** | 96 | 96 | 0 | 0 | **PASS** |
| **Config & Secret Startup Hardening Specs** | 23 | 23 | 0 | 0 | **PASS** |
| **Health & Rate-Limiting Specs** | 8 | 8 | 0 | 0 | **PASS** |
| **Web Frontend Test Suite** (`apps/web`) | 446 | 439 | 0 | 7* | **PASS** |
| — `bff.test.ts` (BFF proxy & tenant header enforcement) | 33 | 33 | 0 | 0 | **PASS** |
| — `gate4a-intake.test.ts` (Client validation & honeypot) | 9 | 9 | 0 | 0 | **PASS** |
| **TypeScript Typecheck (`apps/api`)** | - | 0 errors | 0 | 0 | **PASS** |
| **TypeScript Typecheck (`apps/web`)** | - | 0 errors | 0 | 0 | **PASS** |

*\*7 skipped tests are `src/test/e2e.live.test.ts`, requiring a live running web server.*

---

## 5. Security & Historical Credential Audit

- **Historical Leaked Gmail App Password:**
  - Found in historical commits prior to commit `23cd0ce`.
  - **Status:** **UNVERIFIED ROTATION.** There is no documented verification or external API check confirming the password has been revoked in the Google Account.
  - **Action Required:** Retained as an absolute blocker for enabling live production email sending (`ENABLE_REAL_PRODUCTION_SENDING=true`).
- **Secret Redaction & Protection:**
  - Zero secrets or credential strings printed during tests or reports.
  - `HealthController` (`/health`, `/health/probes`, `/health/models`) verified to never expose database URLs, credentials, or internal tokens.

---

## 6. Smallest Next Action Toward First Paying Customer

**Action:** **Commission a staging/pilot host and set `PUBLIC_INTAKE_COMPANY_ID`.**

Specifically:
1. Provide a Linux VM / staging host meeting the specifications in [`HOST_COMMISSIONING_STAGING_RUNBOOK.md`](file:///e:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md).
2. Configure `.env.staging` with `PUBLIC_INTAKE_COMPANY_ID=<your_active_company_id>` and deploy the container stack via `docker compose -f infrastructure/docker/docker-compose.staging.yml up -d`.
3. Route DNS to the host and share `https://<domain>/request` with the first prospective client to safely ingest real inquiries into the operator queue.

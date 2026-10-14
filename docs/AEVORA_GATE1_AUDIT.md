# AEVORA Production Readiness Gate 1: Verified Audit

Date: 2026-10-13 · Read-only audit (no code changes made in this gate). **Verdict: NOT ready for a controlled pilot. P0 defects are open.**

## 1. Repository and application state
- Root `E:\Aevora`, branch `master`. 236 modified/untracked paths and 137 deleted report files, all preserved; no git writes.
- Authoritative docs: `docs/AEVORA_MASTER_EXECUTION_PLAN.md`, `AEVORA_CAPABILITY_MATRIX.md`, `AEVORA_OPERATIONS_RUNBOOK.md`, `AEVORA_MARKET_READINESS_REPORT.md`.
- Apps:
  - `apps/api`: NestJS, about 80 modules, 377 Prisma models.
  - `apps/web`: Next.js. There is **no customer UI**: one `/login` page plus the operator "company OS" (`(os)/company/[companyId]/*`, 28 pages).
- Unauthenticated API surface: `POST /auth/login`, `GET /delivery/samples/:id`, `POST /delivery/webhooks/razorpay`, `POST /devices/pairing/verify`, and the health endpoints.
- Logins exist only for the Chairman and for employees. **Customers have no account, registration, portal, intake form or status page.**

## 2. Customer journey
| Stage | Status | Evidence |
|---|---|---|
| Registration / login | FAIL (does not exist) | Auth only resolves Chairman/Employee (`authorization/auth.service.ts:64-120`) |
| Business onboarding | FAIL (does not exist) | No public endpoint or page |
| Request / form submission | FAIL (does not exist) | No `@Public()` intake route; customers only reach AEVORA by replying to email |
| Customer record created from contact | NOT VERIFIED | `InboundMessageService.ingest` matches lead by address; IMAP disabled (`INBOX_ENABLED=false`) |
| Customer-visible status | FAIL (does not exist) | Only the `GET /delivery/samples/:id` demo link |
| Payment | NOT VERIFIED live | Razorpay webhook HMAC tests pass (8, historical); no live payment run |
| Unsubscribe link | FAIL | No unsubscribe link or `List-Unsubscribe` header in any outbound email; no public opt-out endpoint |

**Can a customer submit a request that an operator can process? No.** The only inbound channel is an email reply, and the inbox poller is off.

## 3. Revenue loop
| Stage | Status | Evidence |
|---|---|---|
| Lead discovery (OSM/Google) | NOT VERIFIED live | Parser/scoring unit tests only; `LEAD_GEN_PROVIDER_ENABLED=true` in dev `.env` |
| Import / normalize / dedup / score explanation | PASS (DB + HTTP) | `revenue-loop.e2e.spec.ts` B; HTTP run in the previous session |
| Draft → review → approve/reject (`/outreach`) | PASS (DB + HTTP, sandbox) | Journey D; concurrent approvals → 1 sent, 1 × 409 |
| Suppression on the approval path | PASS for the draft path only | `outreach.service.ts` `isSuppressed` |
| Suppression on other send paths | **FAIL** | 10 other `sendEmail` callers never check it (§4 P0-3) |
| Recording an unsubscribe | **FAIL** | Nothing in code creates `OutreachResponse` UNSUBSCRIBED; only a matched lead becomes DISQUALIFIED |
| Human approval before cold outreach | **FAIL** | `SalesAgentWorker.contact` sends directly (§4 P0-1) |
| Rate limiting | PASS (unit) | 1 client email per 30 min (`email-outreach.service.ts checkRateLimit`), cold-email path only |
| Inbound reply classification | PASS (real model) | qwen2.5:7b, 11/12, injection case blocked (previous session) |
| Inbound polling | NOT VERIFIED | IMAP never exercised |
| Jobs: claim / retry / dead-letter / idempotency | PASS (DB) | `job-worker.e2e.spec.ts` 4/4 |
| Jobs: pause / resume / replay | FAIL (does not exist) | No such endpoints in `job/` |
| Jobs: tenant scoping | **FAIL** | §4 P0-4, P0-5 |
| Funnel reconciles with persisted rows | PASS (DB + HTTP, synthetic) | Journey H |
| AI local-first | PASS with caveat | `REAL_PROVIDER_CALL=true` routes every tier to Gemini (`packages/model-gateway/src/gateway.ts:145`); only qwen2.5:7b installed, other tiers default to unpulled models |

## 4. Critical findings

### P0: safety, security, data integrity (block any pilot)
1. **Autonomous cold outreach with no human approval.**
   - What happens: `simulation-engine.service.ts:26` ticks every second. Whenever any `SimulationState` is RUNNING, `business-loop.service.ts:73-83` runs `sales.processQueue` for **every company** every 60 s.
   - Why it sends: the business loop ignores `SALES_AUTO_PROCESS`. `sales-agent.worker.ts:88-89` then calls `email.sendOutreachEmail` / `whatsapp.sendOutreachMessage` directly, with no approval step.
   - Same path: `ceo/pipeline-management.service.ts:147,176` sends follow-ups automatically.
   - Current mitigation: only the `ENABLE_REAL_PRODUCTION_SENDING=false` test redirect and kill switches.
2. **Arbitrary email endpoint.** `integration/integration.controller.ts:11-22`, `POST /integration/email`:
   - Any authenticated user of any role can send any subject/body to any address.
   - The client chooses `environment`, including PRODUCTION.
   - There is no approval, suppression or audit of intent.
3. **Suppression is not enforced on any send path except `OutreachService`.** Unchecked callers:
   - `email-outreach.service.ts:320,427`
   - `inbound-message.service.ts:546` (AI auto-reply when `SALES_AUTO_PROCESS=true`)
   - `pipeline-management.service.ts`, `delivery-agent.worker.ts:117`, `invoice-payment.service.ts:110`
   - `client-meeting.controller.ts:36`, `email-action.adapter.ts:37`
4. **Cross-tenant task execution.** `POST /job` (`job/job.controller.ts`, JWT only, no role) accepts `payload.companyId`. `job-task-bridge.service.ts:80-89` uses the payload's `companyId` instead of `job.companyId`, so a user can execute another tenant's task.
5. **Cross-tenant job disclosure / key squatting.** `BackgroundJob.idempotencyKey` is globally unique. `job.service.ts:50-62` returns the existing job for that key **without a companyId check**, which leaks another tenant's job and payload.
6. **WhatsApp bypasses every guard.** `whatsapp-outreach.service.ts:75-79,105-126`: when `WHATSAPP_API_TOKEN` is set, it messages the lead's real phone via Meta. It has no SANDBOX mode, test redirect or approval. Latent today (token empty); safe mode blocks it.
7. **No unsubscribe mechanism in outbound mail.** There's no link or header, and replies to draft-only recipients are never suppressed. Running cold outreach like this violates CAN-SPAM, GDPR/PECR and India IT-rules norms.

### P1: launch blockers
1. No customer intake: no public request form, customer account or status page (§2).
2. No job pause/resume/replay; no per-job timeout (stale-lock recovery after 5 min can double-run long jobs).
3. The dev `.env` has `OUTREACH_ENVIRONMENT=PRODUCTION` plus a real SMTP host. Every process that loads it without `AEVORA_ENV_OVERRIDE` is one flag (`ENABLE_REAL_PRODUCTION_SENDING`) away from real mail.
4. The test suite isn't green: `company/company-provisioning.spec.ts:718,733` fails to compile (`ForbiddenException` not imported). 5 suites fail only in the full run and pass in isolation (flaky).
5. Schema/migration drift: about 48 FK delete-action differences, a few default mismatches, and two missing `Task` indexes (`prisma migrate diff`, previous session).
6. Backup/restore has never run against a real database. Only mocked script tests exist (historical), plus `infrastructure/scripts/BACKUP_RESTORE_RUNBOOK.md`.
7. The V22 report claims a `/healthz` probe, but only `/health`, `/health/probes` and `/health/models` exist (`/healthz` returns 404). Compose uses `/health`, so the deployment itself is fine; the report is wrong.
8. The web build and Playwright e2e tests weren't run in this gate. No staging host exists.

### P2: improvements
- OSM-vs-import cross-source dedup.
- Eval sets: the AI eval has 12 cases; drafting quality has no eval at all.
- Model tiers point at unpulled models.
- An operations-console panel for the funnel, approvals and failed jobs.

## 5. Tests actually executed in this gate
| Command | Result |
|---|---|
| `prisma validate` | valid |
| `apps/api tsc --noEmit` | 0 errors |
| `apps/web tsc --noEmit` | 0 errors |
| `apps/web eslint .` | no output (clean) |
| `apps/web vitest run` | 17 files passed, 1 skipped; **430 passed, 7 skipped** |
| `apps/api jest` (full, DB = disposable :5444) | 88 suites passed, **6 failed to run**, 3 skipped; **1088 passed, 10 skipped, 0 assertion failures** |
| Re-run of the 5 failing suites in isolation | all pass (61 tests); `company-provisioning.spec.ts` still fails to compile |

**Not run:** web production build, Playwright e2e, backup/restore, live lead discovery, IMAP, any real provider. **Earlier-session evidence (not re-run):** journeys A–H, the real-model eval.

## 6. Required before a controlled pilot
1. Fix P0-1…P0-7:
   - One approval-gated outbound service that **every** send path goes through: approval record → suppression → rate limit → environment → audit.
   - Remove `POST /integration/email` or restrict it to the Chairman in SANDBOX only.
   - Make the business loop honor an explicit `AUTONOMOUS_OUTREACH` flag that defaults to off; sales cycles may only produce drafts.
   - Bind job execution to `job.companyId`; scope idempotency to `(companyId, key)`.
   - Put WhatsApp behind the same gateway.
   - Add a signed unsubscribe link plus `List-Unsubscribe` header, a public opt-out endpoint, and a persisted suppression list.
2. Make the API suite green (the compile fix; stabilize the flaky suites).
3. Run backup → restore on the disposable DB.
4. Hard-fail startup when `OUTREACH_ENVIRONMENT=PRODUCTION` unless an explicit pilot allow-list of recipients is configured.
5. Operator decisions (§8).

## 7. Required before public production
- A customer-facing intake: public request form → lead/opportunity → operator queue → customer status (email or portal).
- Job pause/resume/replay plus timeouts.
- A migration that fixes the drift.
- Staging host commissioning (TLS, secrets, monitoring/alerting, backups, rollback drill).
- Live provider verification; privacy policy and data-retention/deletion flow.
- Larger AI evals; load test. Production stays single-replica until distributed locks and rate limits are verified.

## 8. Decisions / credentials needed from the operator
1. Email provider plus a verified sender domain (SPF/DKIM/DMARC), and a sender identity.
2. A pilot audience: a small explicit list with lawful basis to contact, and the target customer profile and pricing.
3. Whether customers need a portal or whether an email-only intake plus a status-email flow is enough for the pilot (recommended: email-only plus a public request form).
4. Whether autonomous follow-ups are ever allowed, or every outbound needs per-message approval (recommended for the pilot: per-message approval).
5. A staging host and budget.

## 9. Safest implementation sequence
1. **Tenant fixes (P0-4, P0-5).** Small, isolated, testable on the disposable DB.
2. **Close the bypasses (P0-2, P0-6).** Lock `/integration/email`; WhatsApp gets SANDBOX/test-redirect parity.
3. **Single outbound gate (P0-1, P0-3).** Route all `sendEmail` callers through an approval-checked, suppression-checked service; the business loop creates drafts only. One DB journey proves no path can send without an approval row.
4. **Unsubscribe (P0-7).** Signed link plus header, public opt-out endpoint, suppression table and migration (disposable DB first).
5. **Green suite.** Fix the compile error and the flaky suites; add the new journeys to CI.
6. **Backup/restore drill** on the disposable DB.
7. **Public request form → operator queue** (minimal customer intake).
8. **Job pause/resume/replay plus timeout.**
9. **Schema drift migration**, then staging commissioning once a host exists.

---

## Gate 2 disposition (2026-10-13)

| Finding | Disposition | Fix | Evidence |
|---|---|---|---|
| P0-1 Autonomous cold outreach | **FIXED** | `IntegrationService.sendEmail` is the single gate: without an approved draft it only queues a `PENDING_APPROVAL` OutreachDraft (deduplicated per campaign or content). `EmailOutreachService` records "Awaiting human approval" and leaves the campaign SCHEDULED. CEO follow-ups report "Drafted (awaiting your approval)". No flag (`SALES_AUTO_PROCESS`, simulation, `OUTREACH_ENVIRONMENT`) bypasses it. | `autonomous-outreach.e2e.spec.ts` (real DB, real `SalesAgentWorker.processQueue`, `SALES_AUTO_PROCESS=true`): 5/5 |
| P0-2 `POST /integration/email` | **FIXED** | CHAIRMAN/MANAGEMENT only; tenant and environment server-derived; only queues a draft | `outbound-gate.spec.ts` |
| P0-3 Suppression only on one path | **FIXED** | Suppression (UNSUBSCRIBED response or DISQUALIFIED lead) and kill switches (`GLOBAL_PRODUCTION`, `OUTBOUND_EMAIL`; lookup errors fail closed) are enforced inside the gate for every email, and checked again at approved-send time | `outbound-gate.spec.ts`, DB journey |
| P0-4 Cross-tenant task execution | **FIXED** | `JobTaskBridgeService.executeTaskJob` uses `job.companyId`; payload tenant mismatch or a missing tenant is refused. `POST /job` is CHAIRMAN/MANAGEMENT only, tenant from the token, env forced SIMULATION, only `TASK_EXECUTION` allowed | `job-security.spec.ts` 4/4 |
| P0-5 Cross-tenant job idempotency leak | **FIXED** | Keys stored as `<companyId\|system>:<key>` (no migration) | `job-worker.e2e.spec.ts` 5/5 (real DB) |
| P0-6 WhatsApp bypass | **FIXED** | Business-API sender removed. WhatsApp outreach is only pushed to the Chairman's device for a manual (human-approved) send | conformance test: no `graph.facebook.com` in source |
| P0-7 No unsubscribe mechanism | **OPEN** (next gate) | — | — |
| NEW P0-8 `ClientMeetingController` took `companyId` from the body (cross-tenant) and fell back to a fabricated `client@example.com` | **FIXED** | Tenant from the token, CHAIRMAN/MANAGEMENT only, meeting ownership checked on every route, no fallback recipient, sends via `sendWithApprover` | typecheck + conformance |
| NEW P0-9 Hardcoded Gmail SMTP credential and direct SMTP sends in `apps/api/scripts/send-{invoice,proposal}-vanilla.ts` (in git history since `efc8851`) | **MITIGATED in working tree; ROTATION REQUIRED by the operator** | Direct sends replaced by a fail-closed error; credential removed from the files | conformance test (no `createTransport` outside the provider and the Chairman mailer) |
| Emailed Chairman commands ("REPLY:/send") | **CHANGED** | Mail can be spoofed, so these now only queue a draft for in-app approval | code: `notifications/chairman-mail.service.ts` |

**Allowed remaining transport paths (by design):**
- `production-email.provider.ts`, reachable only through the gate.
- `notifications/chairman-mailer.ts`, internal mail to the configured Chairman/test inboxes only, never to leads.

**Remaining risks:**
1. Demo-site deploys to Vercel (`demo-factory.service.ts`) still run automatically during drafting when `VERCEL_API_TOKEN` is set. That publishes content externally; it isn't a message, but it should be gated in the next gate.
2. Approved-send rate limiting relies on per-message human approval; there's no numeric cap on approvals.
3. `ClientMeetingService.clientConfirmsTime` etc. now need operator auth; clients have no portal.

**Tests that could not be completed:** Docker Desktop's engine began returning HTTP 500 mid-gate. DB-backed tests were stopped, per the safety rule.
- Ran before the outage: `job-worker.e2e` 5/5, `autonomous-outreach.e2e` 5/5.
- Not re-run after the gate changes: `revenue-loop.e2e`.
- V24 Postgres suite: 8 failures, all "Can't reach database server at localhost:5444" (infrastructure, not code).

---

## Gate 3 disposition (2026-10-13)
Statuses: **FIXED & TESTED** (unit/conformance tests, no DB) · **IMPLEMENTED, NOT FULLY VERIFIED** (needs the DB) · **BLOCKED**.

| Item | Status | Notes |
|---|---|---|
| P0-7 Unsubscribe | FIXED & TESTED (unit); DB persistence IMPLEMENTED, NOT FULLY VERIFIED | New `EmailSuppression` model (per tenant, unique `companyId+email`, reason and source as audit). Migration `20261013180000_gate3_email_suppression` was generated offline and **not applied**. Public `/unsubscribe` with an HMAC-SHA256 token over (tenant, email): GET only confirms; POST, or an RFC 8058 one-click client, records it idempotently. The gate appends the signed link and `List-Unsubscribe`/`List-Unsubscribe-Post` headers to every email after the approval check. Opt-outs are enforced on approved sends, automated drafts, retries and lead import. "unsubscribe"/"stop emailing" replies are persisted (`INBOUND_REPLY`); autoresponders are not. |
| P2 Vercel publishing | FIXED & TESTED | `DemoFactoryService.createDemoForLead` needs server `DEMO_PUBLISHING_ENABLED=true` plus an open PUBLISH channel; otherwise it returns no link and drafting continues. Takedowns are blocked by the emergency stop. No request input reaches either. |
| NEW Fabricated `VERCEL_LIVE` deployment URL (`factory-deployment.service.ts`) | FIXED | Now throws "not implemented" instead of reporting an undeployed `*.vercel.app` URL. The health probe for the *mock* provider is still synthetic (`Math.random`) and labeled as a mock: P2. |
| P3 Send limits | FIXED & TESTED (unit) | Per rolling 24 h: recipient (1), tenant (20), global (50), all configurable; malformed values block. Counts include other in-flight SENDING drafts, so concurrency can only under-send. |
| P3 Emergency stop | FIXED & TESTED | `AEVORA_EMERGENCY_STOP` (`true` or any malformed value = stopped), plus DB kill switches `OUTBOUND_ALL`/`OUTBOUND_EMAIL`/`OUTBOUND_WHATSAPP`/`EXTERNAL_PUBLISH`/`GLOBAL_PRODUCTION`. An unreadable switch store fails closed. Covers email, the WhatsApp push and publishing. |
| `company-provisioning.spec.ts` compile error | FIXED | Missing `ForbiddenException` import; 22/22, no assertions changed. |
| Intermittent full-suite failures | DIAGNOSED & FIXED | Root cause: Jest worker heap exhaustion (`FATAL ERROR … JavaScript heap out of memory`) under 50% parallel workers. Config now `maxWorkers: 2`, `workerIdleMemoryLimit: 1GB`. Full run: only the DB-requiring V24 suite fails (DB deliberately unreachable). |
| Docker Desktop | BLOCKED | `docker ps -a` hangs over 30 s; the engine returned HTTP 500 in Gate 2. No DB tests or migrations were run in Gate 3. |
| Leaked Gmail app password | BLOCKED on operator | Must be rotated; it is still in git history. |

---

## Gate 4A disposition (2026-10-13)
Docker stayed unresponsive (`docker ps -a`, `docker version` and `docker info` all time out), so **no DB-backed test or migration ran**. Everything below is FIXED & TESTED at the unit/BFF level (mocked Prisma or a mocked backend) and IMPLEMENTED, NOT DB-VERIFIED.

| Item | Status | Notes |
|---|---|---|
| Customer intake (Gate 1 §2: registration/request/status all FAIL) | IMPLEMENTED; unit-tested | Public `/request` page and `POST /public/requests`, which extends `ClientInquiry`. Tenant comes from server `PUBLIC_INTAKE_COMPANY_ID` (fail closed). Validation runs on server and client, with a honeypot, 5/min throttle, 16 KB body cap and link cap. Duplicates return the original reference. Every submission is audited. Nothing is sent or published. Status lookup is by `REQ-` reference plus matching email, over POST (the email is never in a URL), and shows a coarse status only. |
| Operator queue | IMPLEMENTED; unit-tested | `/company/:id/requests` and `GET/POST /inquiries…`. Staff read; Chairman/management transition and add notes. Transitions are validated and compare-and-set (a concurrent duplicate gets 409). Notes append atomically and are never in public responses. Audited via `CustomerAuditEvent`. The previously unscoped `InquiryService` methods were replaced with tenant-scoped ones. |
| Job pause/resume/replay | IMPLEMENTED; unit-tested | New `JobStatus.PAUSED`. Compare-and-set transitions, tenant from the token, management only, audited via `ManagementAuditEvent`. Replay only for `TASK_EXECUTION` (internal effects), at most 3 per job. The list never includes the payload. The BFF now allows `GET job`, `GET job/:id` and `POST job/:id/(pause\|resume\|replay)`; the old "job stays blocked" tests were changed to keep blocking other job paths. |
| `verify-disposable-db.sh` hardening | DONE (syntax-checked; not run) | Adds a host-port `system_identifier` match against the in-container cluster, a Redis identity check (`aevora_e2e_redis` → 127.0.0.1:6380, PONG) with `REDIS_URL` pinned, a schema-drift report, and runs the new `intake.e2e.spec.ts`. |
| Unapplied migrations | PENDING | `20261013180000_gate3_email_suppression`, `20261013200000_gate4a_intake_job_pause` (`ALTER TYPE "JobStatus" ADD VALUE 'PAUSED'` plus 9 nullable `ClientInquiry` columns and 3 indexes). |

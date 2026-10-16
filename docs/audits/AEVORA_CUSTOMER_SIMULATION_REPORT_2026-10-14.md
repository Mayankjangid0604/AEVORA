# AEVORA — Customer Simulation Report (2026-10-14)

**Verdict: CUSTOMER SIMULATION PASSED WITH LIMITATIONS**

Test customer contact: `mayankjangid598@gmail.com`. Run ID: `AEVORA-LOCAL-TEST-20261014`. Branch `local-completion/v25-local-use` (HEAD `1ea0d82`, nothing committed).

## How the test was split (and why)

| Layer | Where | What it proved |
|---|---|---|
| **Live** (your real local app) | web `localhost:3000` → API `127.0.0.1:13000` → live DB `aevora` on `127.0.0.1:5456`, tenant *AEVORA Technologies* | The 15 leads were really submitted through the public form endpoint, persisted, and are waiting in your CRM. |
| **Disposable** (synthetic tenants, DB `aevora_e2e` on `:5444`) | `apps/api/src/inquiry/customer-simulation.e2e.spec.ts` | The full lead-to-sales workflow (CRM list/detail, notes, transitions, conversion, isolation, roles) with real HTTP guards, controllers, services and Postgres. |

Why: the live CRM and the conversion step need the Chairman login. Only you hold that password, and I did not reset or bypass it, so I did **not** move your live leads past `NEW`. Converting them is left for you (steps at the bottom).

## Safety checks before writing

- Branch/state: `local-completion/v25-local-use`, uncommitted work preserved.
- Live DB identity verified: API's configured target is `127.0.0.1:5456`, db `aevora`; container `aevora_postgres_fresh` maps `5456`; tenant `AEVORA Technologies` (ACTIVE) is the configured public-intake company. Port 5433 never touched.
- Backups before writing: `E:\Aevora_local_backups\db_backup_2026-10-14_14-24-40.dump` and a fresh `db_backup_2026-10-14_14-57-38.dump` (7,504,038 bytes, catalog check passed).
- No migrations, seeds or direct inserts on the live DB. All live data went through the real intake endpoint. Safe mode stayed on; no email/SMS/WhatsApp/publishing/payment (the disposable E2E also asserts no network call is made).

## Business test cases (6) and customer inquiries (15) — live results

The product has no separate "business" record at intake: a business is the `businessName` on the inquiry, and it becomes a **Client** record on conversion. The six business cases are therefore inquiries 1-6. All 15 use the same contact email; each has a different contact name, business, request and unique reference. `service` is limited by the product to `WEBSITE / AUTOMATION / CUSTOM_SOFTWARE / CRM / OTHER`, so the finer category is in the title text.

| # | Scenario | Business name | Service | Customer reference | Saved in live DB? | Visible in CRM? | Result |
|---|---|---|---|---|---|---|---|
| 1 | Hostel website + booking | AEVORA TEST Hostel | WEBSITE | REQ-NM584NW5P6 | Yes (NEW) | Not checked live (login needed); verified in disposable E2E | PASS (live intake) |
| 2 | Hotel website + reservations | AEVORA TEST Hotel | WEBSITE | REQ-FCHFZN9CP3 | Yes | same | PASS (live intake) |
| 3 | Restaurant website + menu | AEVORA TEST Restaurant | WEBSITE | REQ-BNKY24YEKN | Yes | same | PASS (live intake) |
| 4 | Gym website + membership CRM | AEVORA TEST Gym | CRM | REQ-QBXGD4W3D6 | Yes | same | PASS (live intake) |
| 5 | B2B website + sales CRM | AEVORA TEST B2B Services | CRM | REQ-YCJZR45SZF | Yes | same | PASS (live intake) |
| 6 | B2C business + customer mgmt | AEVORA TEST B2C Retail | WEBSITE | REQ-UWZAW6U4DF | Yes | same | PASS (live intake; first attempt throttled, retried) |
| 7 | Custom website | AEVORA TEST Custom Web Studio | WEBSITE | REQ-UCZFHRE7ZT | Yes | same | PASS (live intake) |
| 8 | CRM + sales pipeline | AEVORA TEST CRM Labs | CRM | REQ-Z2BN3M2WJY | Yes | same | PASS (live intake) |
| 9 | SaaS product | AEVORA TEST SaaS Ventures | CUSTOM_SOFTWARE | REQ-X5NRPG72E8 | Yes | same | PASS (live intake) |
| 10 | E-commerce website | AEVORA TEST Online Store | WEBSITE | REQ-QS52HATCCU | Yes | same | PASS (live intake) |
| 11 | Mobile application | AEVORA TEST Mobile Apps | CUSTOM_SOFTWARE | REQ-UU74XNT22W | Yes | same | PASS (live intake) |
| 12 | AI business automation | AEVORA TEST AI Automation | AUTOMATION | REQ-UUG4FUJ54N | Yes | same | PASS (live intake) |
| 13 | Support chatbot | AEVORA TEST Support Chatbot | AUTOMATION | REQ-M6VWDQXUUJ | Yes | same | PASS (live intake) |
| 14 | Dashboard and reporting | AEVORA TEST Analytics Co | CUSTOM_SOFTWARE | REQ-DDR8UZ5JQ7 | Yes | same | PASS (live intake) |
| 15 | Integration + workflow automation | AEVORA TEST Integrations | AUTOMATION | REQ-V2G73RC29V | Yes | same | PASS (live intake) |

Each description ends with its unique tag `[AEVORA-LOCAL-TEST-20261014-NN]`. Read-only SQL on the live DB confirmed: 15 rows, 15 distinct references, all `status=NEW`, `source=PUBLIC_FORM`, all with the right contact email, all in the AEVORA Technologies tenant, 15 matching `INQUIRY_SUBMITTED` audit events, 0 rows in any other tenant. The live DB now holds 16 inquiries (1 existed before this run and was left untouched).

## Workflow results

### Live (real running app)

| Check | Result |
|---|---|
| 15 submissions through `localhost:3000/api/public/request` | 15 / 15 created (HTTP 201) |
| Public throttle (5 per minute): 6th rapid submission | HTTP 429, then succeeded after the window — works as designed |
| Duplicate: resubmitting #1 identically | HTTP 201 with the **same** reference, no new row — PASS |
| Customer status lookup, correct email | `RECEIVED` for all 15 (#11-15 repeated after the rate limit reset) |
| Status lookup with a wrong email | 404 (no information leaked) |
| Protected `/inquiries` without a token | 401 |
| Wrong login | 401 (no session created) |

### Disposable DB, real HTTP stack (`customer-simulation.e2e.spec.ts`, 14 tests, all passed)

The same 15 payloads from `apps/api/test-data/customer-simulation-scenarios.json`:

| Check | Result |
|---|---|
| Dataset: 15 distinct scenarios, one shared email | PASS |
| 8 invalid submissions (empty name, bad email, bad phone, bad service, short text, honeypot, too many links) → 400 with field errors, nothing saved | PASS |
| 15 submitted, 15 unique references, no ids/tenant/notes leaked in the response | PASS |
| 15 persisted in Postgres with correct fields | PASS |
| Duplicate handling; same email with different text = separate inquiry | PASS (no constraint weakened; no extra accounts) |
| CRM list shows 15, survives reload; detail opens; status filter; bad filter → 400; staff can read | PASS |
| Access control: anonymous 401; employee cannot transition/annotate (403); tenant B sees 0 and gets 404 on A's records; foreign company header 403 | PASS |
| Operator workflow: notes, NEW → UNDER_REVIEW → QUALIFIED, illegal moves → 400, stale move → 409, data unchanged after failures, REJECTED → reopen | PASS |
| Conversion of 13 inquiries: exactly 13 clients (each with the contact) and 13 linked opportunities | PASS |
| Repeat conversion refused; no duplicate client/opportunity; audit trail intact | PASS |
| Repeat customer (same business + email): reuses its client, gets its own new opportunity | PASS |
| Converted opportunities visible in the sales pipeline (`listOpportunities`) and tenant-scoped | PASS |
| Customer status lookup shows coarse status only; wrong email 404 | PASS |
| Final state consistent; no outbound network call attempted | PASS |

## Defect found and fixed

**D1 — one email used for different businesses merged clients (fixed).** Conversion reused a client by contact email alone, so converting "AEVORA TEST Hotel" after "AEVORA TEST Hostel" (same email) would have attached the Hotel to the Hostel client. Reuse now needs the same email **and** the same business name in the same tenant. File: `apps/api/src/inquiry/inquiry.service.ts`; tests: `apps/api/src/inquiry/gate4a.spec.ts` (+1 test) and the new E2E. The live API was rebuilt and restarted so your manual conversions use the fix.

## Not implemented / blocked / limits

| Area | Status | Notes |
|---|---|---|
| Proposal / quotation generation | **NOT IMPLEMENTED** | A `Proposal` table and `ProposalService` exist but `ProposalController` is an empty stub, so there is no API or screen. Exposing it needs a product decision (tenant scoping, pricing and approval gate). Not faked by changing a status. |
| Project creation from an opportunity, tasks, approvals, assignment | **NOT TESTED in this run** | Project/task/approval modules exist (customer-operations, project-delivery, sales stages with a WON approval gate) but nothing links an inquiry to a project automatically, and they need staff/employee fixtures. No module-local tests exist for sales, approval, customer-operations. Not claimed. |
| Customer communication history | **NOT IMPLEMENTED for inquiries** | Only internal notes + an audit trail exist; no email confirmation is sent by design. |
| Server-side search of inquiries | **NOT IMPLEMENTED** | Only a status filter (and the UI filters client-side). |
| Dashboard counts | **PARTIAL** | The office-screens service reads recent inquiries; no inquiry count dashboard was verified in the UI. |
| Live CRM screen, live conversion, live approvals | **BLOCKED** | Needs the Chairman login (password not available to me; not reset or bypassed). Verified instead in the disposable stack. |
| "Separate business entity" at intake | Limitation | Intake only captures a business name; the Client record is created on conversion. |
| Automation | See below | No automation reacts to a new inquiry. |

### Automation actually checked

| Workflow | Evidence | Result |
|---|---|---|
| Background job worker (queue, retry, replay, pause/resume) | `job-worker.e2e.spec.ts`, `intake.e2e.spec.ts` job tests on the disposable DB; live API log shows the worker polling | PASS |
| Autonomous outreach and revenue loop | `autonomous-outreach.e2e.spec.ts`, `revenue-loop.e2e.spec.ts` on the disposable DB (sandbox provider, no network) | PASS |
| Enterprise autonomous loop | live API log: runs every minute, no errors | PASS (runs); outcomes not audited |
| Sales outreach cron | live log: "Auto-processing disabled" (`SALES_AUTO_PROCESS=false`) | Disabled by design |
| Reaction to a new inquiry (auto-reply, task, job) | none exists in code | NOT IMPLEMENTED |
| External sending/publishing | all switches off; E2E asserts no network calls | Confirmed disabled |

## Totals

| Item | Count |
|---|---|
| Business test cases created (live) | 6 (as inquiries 1-6; no separate business entity exists at intake) |
| Customer inquiries created (live) | 15 (plus 1 repeat-customer inquiry in the disposable DB only) |
| Records verified in the live database | 15 / 15 |
| Records visible in the live CRM UI | 0 verified — blocked by login (verified through the authenticated HTTP API on the disposable DB: 15 / 15) |
| Successful conversions | 0 live (left for you); 14 in the disposable DB (13 + 1 repeat customer) |
| Automation workflows verified | 3 ran and were checked (job worker, outreach/revenue loop, enterprise loop); 1 disabled by design; 1 absent |
| Tests this phase | disposable-DB suite 11 suites / 54 tests passed (14 new); `gate4a` 44 passed; `tsc` 0 errors; ESLint clean |
| Failed / blocked / skipped | 0 failed; blocked: live login-dependent steps; not implemented: proposals, search, inquiry→project link |
| Defects fixed / remaining | 1 fixed (D1); remaining gaps are the product decisions listed above |

## Notes on throttled lookups

The status endpoint is limited to 10 lookups a minute, so lookups for #11-15 and the wrong-email check hit HTTP 429 in the main run. They were repeated after the window reset: #11-15 all returned `RECEIVED`, and the wrong email returned `404`.

## How to inspect it yourself

1. Make sure Docker's `aevora_postgres_fresh` is running, then start the apps (see `docs/LOCAL_USE_RUNBOOK.md`): API `cd apps\api; node dist/main.js`, web `cd apps\web; npm run dev`.
2. Open **`http://localhost:3000/login`** (not 127.0.0.1) and sign in with your Chairman account.
3. Go to the company's **Requests** page: `/company/9d98b53b-3b79-45b8-9bb9-6cbac171bc3c/requests`. Look for the 15 rows whose business names start with `AEVORA TEST` and whose text ends with `[AEVORA-LOCAL-TEST-20261014-NN]`.
4. Open any row to see details and notes. Use the buttons to move it NEW → UNDER_REVIEW → QUALIFIED, then **Convert to client + opportunity**. A converted request becomes a Client plus an Opportunity (see Sales).
5. Customer view: `http://localhost:3000/request` — look up a request with its reference (above) and `mayankjangid598@gmail.com`.
6. Re-run the tests: `cd apps\api; & "C:\Program Files\Git\bin\bash.exe" scripts/verify-disposable-db.sh` (includes the 15-scenario simulation). To re-submit the live data: `node apps\api\scripts\customer-simulation-live.js <out.json>` (duplicates are ignored by design).

The test records are left in place. Nothing was deleted.

## Final Email and Customer Workflow Verification (2026-10-14, follow-up)

### Email
- Config shape check (values never printed): `SMTP_HOST` holds an email address instead of `smtp.gmail.com`; `SMTP_USER` is not a full email address; `SMTP_PASS` is present. Config is INVALID.
- Safe mode: `OUTREACH_ENVIRONMENT=SANDBOX`, `ENABLE_REAL_PRODUCTION_SENDING=false`, `AEVORA_SAFE_MODE=true`, `SALES_AUTO_PROCESS=false`, `INBOX_ENABLED=false`. Left unchanged.
- No controlled-test switch is enabled (`EMAIL_TEST_ENABLED` unset). Real sending would require PRODUCTION mode, real sending enabled, `UNSUBSCRIBE_SECRET` and `PUBLIC_API_URL`. That is general outreach enablement, so it is a BLOCKER.
- **Result: 0 emails sent.** Neither SMTP acceptance nor inbox delivery has been verified.
- Fix: startup warnings added in `validate-env.ts` (3 tests, 26 pass). To unblock: set `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=<full Gmail address>`, then explicitly authorize one controlled send. Even then, only SMTP acceptance is verifiable, not inbox delivery.

### Logged-in customer workflow
- API (127.0.0.1:13000) and web (http://localhost:3000) are running. 15 test leads remain NEW in the live DB, none converted.
- Live UI run was NOT completed: owner login was not entered, and credentials were not bypassed.
- Workflow logic is covered by automated tests (gate4a 44 tests, customer-simulation e2e on the disposable DB): status transitions, conversion to client plus opportunity, and duplicate conversion rejected.

### Downstream functions
- Proposal generation: NOT IMPLEMENTED (service/models only, controllers are empty stubs; no API/UI).
- Project linking from inquiry: NOT IMPLEMENTED. Sales stages exist (Chairman-only). No automation reacts to new inquiries.

### Verdict
READY WITH LIMITATIONS for local use (lead intake, CRM queue, conversion). Email sending is not usable until SMTP is corrected and a single test is authorized. Proposals and project linking are not available.

### Update: live logged-in workflow completed (2026-10-14, after owner login)
- The owner logged in as the Chairman. Local Chairman password was reset on request (backup taken first); credentials are not recorded here.
- Through the real UI, the `AEVORA TEST Hostel` (REQ-NM584NW5P6) and `AEVORA TEST Hotel` (REQ-FCHFZN9CP3) leads each got an internal note, then NEW -> Under review -> Qualified -> Convert to client + opportunity, once each, with no errors.
- Read-only DB verification: ClientInquiry = 2 CONVERTED, 14 NEW (13 test leads plus 1 pre-existing); 2 Clients (AEVORA TEST Hostel / Hotel); 2 Opportunities linked by `inquiryId` (stage NEW); 0 duplicate clients by name. The converted filter lists both.
- The other 13 test leads were not touched. No records deleted.

### Update: Real-World Master Integration Complete (2026-10-14)

1. **Email Configuration & Single Controlled Send Verified**:
   - `SMTP_HOST` was corrected to `smtp.gmail.com` and `SMTP_USER` set to the full sending address.
   - Dedicated standalone test command `node apps/api/scripts/email-test.js` executed.
   - Exactly 1 test email sent to `mayankjangid598@gmail.com`.
   - SMTP response: `250 2.0.0 OK 1791972868 a92af1059eb24-169a31f6f5csm44580738c88.11 - gsmtp`, messageId `<6c447c49-3768-585e-a9a4-33aee381e08a@gmail.com>`.
   - Mail server acceptance confirmed. Inbox delivery recorded as `NOT_VERIFIED` (inbox read credentials not configured).
   - General sending remained strictly disabled (`OUTREACH_ENVIRONMENT=SANDBOX`, `ENABLE_REAL_PRODUCTION_SENDING=false`, `AEVORA_SAFE_MODE=true`).

2. **Opportunity -> Proposal Generation Implemented**:
   - API endpoints (`GET /opportunity`, `POST /opportunity/:id/proposals`, `GET /proposal/:id`, `POST /proposal/:id/update`, `POST /proposal/:id/submit`, `POST /proposal/:id/decision`, `POST /proposal/:id/mark-sent`, `POST /proposal/:id/customer-response`, `POST /proposal/:id/project`).
   - UI workspace on `/company/:companyId/pipeline` with proposal editor, draft validation, Chairman approval controls, external send/accept recorders, and start-project handoff.
   - Full idempotency with advisory locks and audit trail.

3. **Project Linking and Delivery Tracking Implemented**:
   - Backend service `ProjectFlowService` and controller `ProjectController`.
   - UI workspace on `/company/:companyId/delivery`.
   - Project created from accepted proposal links to client, opportunity, and proposal.
   - Task creation, assignment within tenant, and status progression (`BACKLOG` -> `READY` -> `IN_PROGRESS` -> `REVIEW` -> `COMPLETED`).
   - Project delivery lifecycle (`PLANNED` -> `ACTIVE` -> `IN_QA` -> `DELIVERED` -> `ACCEPTED` -> `COMPLETED`). Customer acceptance restricted to Chairman. Project completion requires all tasks to be finished.

4. **Safe Automatic Lead Processing Implemented**:
   - `INQUIRY_TRIAGE` job registered with `JobWorkerService` and `InquiryAutomationService`.
   - Automatically transitions complete requests from `NEW` to `UNDER_REVIEW`, records `[auto-triage]` internal note and system audit event.
   - Safe pause switch `INQUIRY_AUTOMATION_ENABLED=false` supported.
   - Retry endpoint `POST /inquiries/:id/automation/retry` with visible status tracking on UI.

5. **Data Preservation**:
   - All 15 customer simulation inquiries intact: 13 `NEW`, 2 `CONVERTED`.
   - 2 Clients and 2 Opportunities intact. No data wiped.


# AEVORA V14 — SLICE 1 CLOSURE REPORT

**Date:** 2026-10-06 · **Base checkpoint:** `efc8851` · **Scope:** closure audit of Slice 1 (no domain workspaces built)

---

## 1. Slice 1 objective

Secure foundation for the V14 Company OS: backend tenant isolation for the legacy controllers, BFF session (JWT only in an httpOnly cookie), one server-side API client, protected OS layout, company-context gate, truthful domain shells. This pass also checks that the claims in `AEVORA_V14_AUTHORIZATION_FOUNDATION_REPORT.md` match the code, and closes the gaps found.

## 2. Files changed during this closure pass

| File | Change | Why |
|---|---|---|
| `apps/api/package.json` | jest `"maxWorkers": "50%"` | test infra: root cause of the full-suite failures (§3) |
| `apps/api/src/authorization/jwt-auth.guard.ts` | Chairman with no owned company: `companyId = null` (was `undefined`) | **cross-tenant leak**: Prisma drops `undefined` filters (§9) |
| `apps/api/src/authorization/authorization.service.ts` | `'ceoAutonomousDecision'` added to `CompanyScopedModel` | for the CEO execute fix |
| `apps/api/src/ceo/ceo.controller.ts` | `POST /ceo/autonomous-decisions/:id/execute` asserts resource company | **IDOR**: service executed any company's decision by id |
| `apps/api/src/intelligence/controllers/intelligence.controller.ts` | `GET /intelligence/sessions/:id` filtered by caller company; 404 when absent | **IDOR**: unscoped read |
| `apps/api/src/company-intelligence/company-intelligence.controller.ts` | company check fails closed when no company context | `req.user.companyId &&` skipped the check |
| `apps/api/src/operating-loop/itl-error-pool.service.ts` | `processPool(companyId?)` adds an optional `companyId` filter | company-scoped manual scan (§8) |
| `apps/api/src/operating-loop/operating-loop.controller.ts` | `error-pool/scan` requires `X-Company-Id`, asserts access, passes it | §8 |
| `apps/api/src/authorization/tenant-isolation.http.spec.ts` | + scan isolation, + JWT signed with another secret, + session token in `?token=` | regression tests |
| `apps/api/src/ceo/ceo-execute-isolation.http.spec.ts` (new) | CEO execute isolation | regression test |
| `apps/api/src/intelligence/intelligence-isolation.http.spec.ts` (new) | sessions, company-intelligence fail-closed, company-less Chairman → `null` | regression tests |
| `apps/api/src/operating-loop/itl-error-pool.service.spec.ts` (new) | `processPool('A')` touches only A; no-arg path unchanged | regression test |
| `apps/web/src/test/bff.test.ts` | real SAAHVIK company UUID replaced by a synthetic one; + cross-origin/origin-less logout | test hygiene, coverage |
| `apps/web/src/lib/domains.ts` | readiness notes reflect this review | truthfulness |
| `AEVORA_V14_SLICE1_CLOSURE_REPORT.md` (new) | this report | — |

No Prisma schema, migration, seed, business-logic or unrelated change.

## 3. Full backend test result

### Root cause of the 5 (and later 3) failures — established, not assumed

| Evidence | Value |
|---|---|
| Failing tests across runs | different every run: run 1 = tenant-isolation ×2, v12-vr-action ×2, closure-gate ×1; cold rerun = v12-vr-action ×2, v12-http-sse-multi-client (hook) |
| Error | always `thrown: "Exceeded timeout of 5000 ms for a test/hook"` — never an assertion |
| Trivial 401 request in a failing run | **40 842 ms** |
| Default `npx jest` workers on this machine | 21 (22 logical CPUs). The package `test` script uses `--runInBand`; bare `npx jest` did not |
| Warm cache, 21 workers | 350/350 pass, **76 s** |
| Cold cache (`--clearCache`), 21 workers, verbose | **3 failed**, **867 s**; slowest suite 862 s (normally ~40 s) |
| Cold cache, `--maxWorkers=50%` (no other change) | **47/47 suites, 358/358, 88.8 s** |

**Root cause: resource exhaustion from worker oversubscription.** With a cold ts-jest cache, each of 21 workers type-checks the full Nest dependency graph at the same time, while CPU-heavy benchmark specs (`world-state-closure-gate`, `world-state-pass2`, `v12-navigation.benchmark`) run alongside. The machine thrashes (suite times ×10–20), and whichever suite is unlucky crosses Jest's 5 s per-test/hook default. The first run after Slice 1 had a cold cache because those edits invalidated it. Ruled out:
- **logic regression:** every failing test passes in isolation and in the 3-suite rerun, and every failure is a timeout, never an assertion.
- **shared state / ordering:** different suites fail each run, and all suites use per-suite in-memory fixtures.
- **DB / port contention:** no test touches PostgreSQL (it isn't running), and supertest uses ephemeral ports.

**Fix (test infrastructure only):** `"maxWorkers": "50%"` in the API jest config. No timeout raised, no test skipped, no assertion changed.

### Final authoritative runs (finished code, bare `npx jest`)

### 3a. Final runs

| Run | Suites | Tests | Time | Timeouts |
|---|---|---|---|---|
| `npx jest --clearCache && npx jest` (cold) | **47/47** | **361/361** | 92.1 s | 0 |
| `npx jest` (warm) | **47/47** | **361/361** | 21.6 s | 0 |

Earlier runs, made before the last edits: cold 47/47 suites, 360/360 (133 s); warm 47/47, 361/361 (114 s).

**OPEN (non-failing):** Jest still prints "A worker process has failed to exit gracefully" — open handles (e.g. `ItlErrorPoolService`'s un-`unref`'d scanner timer started in `onModuleInit`). It doesn't fail tests; fixing it means touching service lifecycles, which is outside this closure.

## 4. Frontend test result

`apps/web`: `npx vitest run` → **35/35 pass** (2 files).

## 5. Typecheck result

`apps/api`: `npx tsc --noEmit -p tsconfig.json` → pass. `apps/web`: `npx tsc --noEmit` → pass. `apps/web`: `npx eslint .` → pass, 0 warnings.

## 6. Build result

`apps/web`: `npx next build` → compiled successfully; 28 routes + proxy.

## 7. Authorization review matrix (read-only, controller + directly called services)

Legend: **S** SAFE · **SC** SAFE WITH CONDITIONS · **U** UNSAFE · **?** UNKNOWN. Columns A–M as specified; only notable answers are listed per row.

**Global condition C0 (applies to every row using `req.user.companyId`):** company context comes only from the token / validated `X-Company-Id` (JwtAuthGuard). Since this pass, a company-less Chairman gets `null`, so queries fail closed. Without `X-Company-Id`, a Chairman silently gets their *first* company → **the BFF must always send `X-Company-Id` on company-scoped calls** (it does, via the company layout).

| Controller · routes | A | B | C/D | E/F/G | Notes (H–M) | Class |
|---|---|---|---|---|---|---|
| **chairman** · overview, financials, employees, employees/:id, projects, projects/:id, departments, alerts, decisions, activity, communication/*, knowledge, knowledge/:id(/provenance), training-*, artifacts, candidate-models | ✓ | CHAIRMAN (class) | via `getCompanyForChairman` (ownership re-checked); by-id rows compared to company | none | knowledge cross-company → 403 (K: should be 404) | **SC** (C0) |
| chairman · alerts/:id/read\|resolve, decisions/:id/approve\|reject, knowledge/:id/validate\|archive | ✓ | CHAIRMAN | `where {id, companyId}` / service checks company | none | mutations | **SC** (C0) |
| chairman · commands (GET/POST), commands/:id/approve\|reject, broadcast | ✓ | CHAIRMAN | command bound to `chairmanId` | none | M: approved commands execute actions; not-owned → `null` 200 (K: should be 404) | **SC** (C0, K) |
| chairman · kill-switch, capability | ✓ | CHAIRMAN | company | `body.feature/capability` free strings | M: changes runtime capability flags | **SC** (admin, explicit confirmation UI) |
| chairman · simulation, simulation/*, world | ✓ | CHAIRMAN | company | none | simulation/world = V12/V15 material | **U for V14** (out of scope) |
| chairman · operating-loop/cycles\|pending\|trigger, cycle/:id/verdict, agent-performance | ✓ | CHAIRMAN | — | — | reads `req.user.chairmanId`, which no JWT carries → **always 403** (broken); verdict has no company check behind that | **U** (broken; blocked) |
| **ceo** · operating-state, staffing, reviews, feed, questions, weekly-reports, autonomous-decisions, budgets(*), financial-authority (GET), strategy/plans/:id, strategy/health | ✓ | class guard; reads open to any role | `req.user.companyId`; by-id services filter `{id, companyId}` (verified: dialogue, strategic, budget, financial-authority) | none | — | **SC** (C0) |
| ceo · priorities, v3-objective, delegate, staffing/run, questions/:id/answer, ask, weekly-reports/run, reviews/run, autonomous-decisions/run\|:id/approve\|:id/reject, budgets POST/status/allocate/adjust, financial-authority grant/suspend/revoke, strategy approve/reject/pause/resume | ✓ | CHAIRMAN | company-scoped services | none | M: LLM calls (ask, reviews/run) and weekly-report email | **SC** (C0, side-effect confirmations) |
| ceo · **autonomous-decisions/:id/execute** | ✓ | **none** | service looked up by id only | — | **FIXED this pass** (`assertResourceAccess`, test added). Still any role in the company may execute | **SC** (role gating OPEN) |
| ceo · notify-test | ✓ | CHAIRMAN | — | — | M: sends real email | **U for V14** (ops tool) |
| ceo · staffing/office-rooms | ✓ | CHAIRMAN | company | body rooms | 3D-office input (V15) | **U for V14** |
| ceo · reservation(/release), strategy plans/objectives/risks create, propose, archive, objectives progress, financial-authority/check | ✓ | **no role** | company-scoped | none | any authenticated company member | **SC** (role gating OPEN) |
| ceo · performance/*, succession/* | ✓ | CHAIRMAN, MANAGEMENT | company + plan/candidate checked | body ids checked against company (succession verified) | — | **SC** (C0) |
| **workforce** · all GET (profiles, :id, direct-reports, analytics, hiring, hiring/:id, skills/:id, reviews, reviews/:id, bonuses, ai/*, plans, audit) | ✓ | none | `req.user.companyId`; by-id `!row \|\| row.companyId !== companyId → 404` (verified ×6) | JWT only (comments enforce) | `listProfiles` includes salary | **S** (C0) |
| workforce · all mutations | ✓ | none at controller | `verifyActor` = active **employee** of company | none | Chairman actor → 403 (not an employee); self-review/self-bonus guards present | **SC** (Chairman cannot act; role gating is service-side only) |
| **organization** · GET '', chart, departments, departments/:id, activity, audit, employees | ✓ | none | `req.user.companyId`; department `{id, companyId}` | none | — | **S** (C0) |
| organization · **employee/:id, employee/:id/history** | ✓ | none | **none** (`getEmployee(id)`) | — | cross-company read of any employee | **U** |
| organization · employee POST, PATCH, onboard/activate/suspend/reactivate/terminate, promote, transfer | ✓ | none | `EmployeeService` → `checkPermission` on target's company | — | PATCH uses `departmentId \|\| id` (odd); promote doesn't check role company (legacy controller does since Slice 1) | **SC** — use `/workforce/*` |
| organization · employee/:id permissions, responsibilities, kpis, budget, performance, succession | ✓ | none | — | — | **hard-coded stubs** (`[]`, `{allocatedAmount:0}`, `{status:'Evaluated'}`) — fabricated responses | **U** (never expose) |
| **research** (`chairman/research`) · proposals, projects, experiments, datasets, models, evaluations, safety, deployments (GET) | ✓ | CHAIRMAN, MANAGEMENT, SYSTEM, EMPLOYEE | `where companyId` | none | — | **S** (C0) |
| research · proposals POST, proposals/:id/approve, improvement/scan | ✓ | approve: CHAIRMAN, MANAGEMENT | company-checked | none | — | **SC** (C0) |
| research · inference | ✓ | any listed | service receives companyId | `body.deploymentId` | ? whether `runInference` binds deployment to company was not traced | **?** |
| research · **improvement/hypotheses/:signalId, improvement/proposals/:hypothesisId, improvement/comparisons/:planId** | ✓ | incl. EMPLOYEE | **none** (lookup by id only) | — | cross-company create/compare | **U** |
| **research** (`research`) · POST, :id, :id/start, :id/executions, :id/sources, :id/findings | ✓ | all roles | service gets `(id, companyId)` | none | M: start triggers model/web research | **SC** (C0) |
| **marketing** · all 32 routes | ✓ | none | `req.user.companyId`; by-id `row.companyId !== companyId → 404` (campaign verified) | none | mutations require active employee (Chairman → 403); M: `content/:id/publish`, agent generate (LLM) | reads **S**; mutations **SC** |
| **marketing-content** · posts, calendars (GET) | ✓ | CHAIRMAN | company | none | — | **S** |
| marketing-content · posts/generate, :id/approve, :id/posted, calendars/generate, pixel/run, whatsapp/broadcast | ✓ | CHAIRMAN | company | body text (length-capped) | M: LLM; whatsapp/broadcast generates text only (not traced further) | **SC** (side-effect confirmation) |
| **sales** · all 26 routes | ✓ | CHAIRMAN | company; by-id → 404 (lead verified); referenced `ownerId`, `employeeId`, grantor checked against company | none | — | **SC** (C0; Chairman-only role while mutations call `verifyActor`, so some may 403 — not traced per route) |
| **outreach** (sales-outreach) · campaigns, discovery-calls, inbound (GET) | ✓ | per-route roles | company | none | — | **S** |
| outreach · campaigns/:id/outcome, discovery-calls/:id/transcript, inbound POST | ✓ | CHAIRMAN/MANAGEMENT | service gets companyId (not traced per id) | body channel/from | — | **?** (by-id binding not traced) |
| outreach · **process, whatsapp/:leadId, inbound/poll-email** | ✓ | CHAIRMAN/MANAGEMENT | lead `{id, companyId}` | — | **M: real outreach email / WhatsApp / IMAP** (interlock + rate limit exist) | **U for V14 UI** until a confirmation/sandbox design exists |
| **intelligence** · company/:companyId/proposals, assistance-requests | ✓ | none | `req.user.companyId !== companyId → 403` | path companyId (validated) | — | **S** |
| intelligence · sessions/:id | ✓ | none | **FIXED** (`findFirst {id, companyId}` → 404) | — | test added | **S** |
| **company-intelligence** · company/:companyId | ✓ | none | **FIXED** fail-closed | path (validated) | — | **S** |
| company-intelligence · group/:groupId | ✓ | CHAIRMAN | service `where {id, chairmanId}` | — | — | **S** |
| **autonomous-enterprise** · all GET (objectives, :id, operating-cycles, :id, escalations, decisions, :id, recommendations, dashboard/summary, audit) | ✓ | none | `req.user.companyId`; by-id `companyId !== → 404` (decision verified) | none | — | **S** (C0) |
| autonomous-enterprise · all POST/PATCH | ✓ | none | `verifyActor` = active employee of company | none | "Chairman decisions" cannot be decided by the Chairman (not an employee → 403) | **SC** (product gap) |
| **boardroom** · all 17 routes | ✓ | CHAIRMAN | `load()` = `findFirst {id, companyId, kind:'BOARD'}` → 404 | `ledBy` from body stripped | M: LLM turns; summary-file PDF | **SC** (C0) |

**UNKNOWN** rows exist because the by-id binding inside those services wasn't traced in this pass. They must be traced before exposure.

## 8. Operating Loop status

- `POST /operating-loop/error-pool/scan` — **FIXED.** The service already filtered on `phase: FAILED`; adding an optional `companyId` to the same `where` keeps every per-cycle rule (backoff, retry, escalation) unchanged. The HTTP route now requires an explicit `X-Company-Id` (no implicit first-company fallback), asserts access, and passes it. The background scanner (`startPoolScanner`) still calls `processPool()` with no argument, which is the existing system-wide behaviour, not user-triggered. Tests: `itl-error-pool.service.spec.ts` + tenant spec (400 without header, 403 for B/employee, called with `'A'` only).
- All other `/operating-loop/*` routes were company-scoped in Slice 1 (tested).
- `/chairman/operating-loop/*` — **BLOCKED**: they read `req.user.chairmanId`, which the JWT never carries, so they always 403. Repairing them changes behaviour beyond closure.
- Frontend: Operating Loop stays not exposed (BFF allowlist excludes it).

## 9. Company-context verification

Traced path: URL `[companyId]` → `isSafeId` (else 404) → `backendFetch(..., { companyId })` → `X-Company-Id` → **JwtAuthGuard**: Chairman → `company.findFirst({id, chairmanId})`, else **403**; employee → must equal token `companyId`, else **403** → `req.user.companyId` → controller (`assertCompanyAccess` / `getCompanyForChairman` / service filters) → service.

| Attack | Result |
|---|---|
| Change URL companyId to a foreign company | guard 403 → "You do not have access to this company." No data fetched, no switch (tests: tenant spec, BFF test) |
| Change `X-Company-Id` directly (BFF header or raw API) | 403 (Chairman and employee tested) |
| Header injection in company id | rejected 400 by `isSafeId` before any request (test) |
| Body `companyId` / `chairmanId` / `x-actor-id` | ignored or asserted (tests) |
| Foreign by-id resource | 404 (tests across 19 routes + CEO execute + intelligence sessions) |
| **Company-less Chairman** | **was a leak**: `companyId undefined` → Prisma ignored the filter → all-company lists on every `req.user.companyId` route. **Fixed** (`null`, fail closed); test added |
| Silent fallback | the backend falls back to the first company only when **no** header is sent; the V14 company layout always sends one; Home calls only actor-scoped `/auth/companies` |
| Permission escalation via URL | none: roles come only from the verified JWT |

## 10. Session verification

| Case | Behaviour (test) |
|---|---|
| Login success | cookie `aevora_session` HttpOnly, SameSite=Strict, Path=/, Max-Age=3600, Secure in production; body has no token (bff.test) |
| Invalid login | 401, no cookie |
| Missing fields | 400, backend not called |
| Cross-origin / origin-less login | 403, backend not called |
| Logout POST | cookie cleared (Max-Age=0); client clears the query cache and does a full reload to `/login` |
| Cross-origin / origin-less logout POST | 403, cookie untouched (**new**) |
| Expired JWT | backend 401 (tenant spec); BFF clears cookie; layouts redirect once via `/api/auth/logout` → `/login?reason=expired&next=…` |
| Malformed JWT (`not.a.jwt`) | 401 |
| Forged JWT (other secret) | 401 (**new**) |
| Session token in `?token=` | 401 (**new**; only `purpose:'sse'` tokens are accepted in URLs) |
| Missing JWT | backend 401; BFF 401 without calling backend; proxy redirects pages to `/login?next=` |
| Wrong `X-Company-Id` | 403 (not a session failure) |
| Unsafe `next` (`//evil`, `https://…`, `/\evil`, `/login…`, `/api…`) | replaced with `/` |
| Backend unavailable | login 503 "AEVORA backend is unavailable", no cookie; OS layout shows "Backend unavailable" (no loop) |
| Revocation / refresh | **do not exist**; logout only removes the cookie from this browser |

**OPEN (low):** `GET /api/auth/logout` can be triggered by a cross-site top-level navigation (forced logout). It cannot read or escalate anything; making it POST-only requires an alternative way for server components to clear the cookie.

## 11. Security-search results (`apps/web`)

| Term | Occurrences | Classification |
|---|---|---|
| `access_token` | `api/auth/login/route.ts` (server) | legitimate server-side |
| `Authorization` / `Bearer` | `server/api.ts` | legitimate server-side |
| `localStorage`, `sessionStorage`, `document.cookie` | none (test regex only) | — |
| `chairmanId` | none (test regex only). Note: `GET /companies/:id` returns the scalar `chairmanId` to the server component; it is never rendered or used | legitimate backend field, not frontend authority |
| `actorId` | login body to backend (server); `Me` type (display) | legitimate |
| `companyId` | company layout, BFF route, `server/api.ts`, `bff-client.ts` (navigation state → header), domain endpoint labels | legitimate navigation state |
| Hardcoded UUIDs | none in app code; one **real company id in a test was replaced** | fixed |
| Secrets / credentials | none; `AEVORA_API_URL` server-only | — |
| V12 / V15 / world-engine / WebXR / spatial / 3D / `@aevora/shared` | none (scan test) | — |
| Client components importing `@/server/*` | none (scan test) | — |
| Fake metrics / activity / employees / projects / tasks | none; shells show readiness text + real endpoint names only | — |
| BFF allowlist | `auth/me\|companies\|capabilities`, `groups`, `groups/:id`, `companies/:id`, all verified isolation-safe; blocked domains → 404 (test) | — |

Backend occurrences of `actorId`/`companyId`/`chairmanId` are legitimate domain fields. Client-supplied ones were removed or asserted in Slice 1 and here.

## 12. Live-login status

**NOT VERIFIED.** PostgreSQL on `localhost:5432` was not running; per instructions it was not started, modified or seeded. Ready to run once the user starts PostgreSQL:

1. In the Claude Code desktop preview: start `aevora-api-safe` (safe-mode override + `CHAIRMAN_EMAIL_NOTIFICATIONS=false`), then `aevora-web` (`.claude/launch.json`).
   The scratchpad override file `v14-verify.env` is session-specific. Outside this session, use the repo file instead:
   ```bash
   AEVORA_ENV_OVERRIDE=../../scripts/safe-local.env npm run start --workspace=@aevora/api
   ```
   ```bash
   npm run dev --workspace=@aevora/web
   ```
2. Open `http://localhost:3000`, sign in with an existing Chairman email + password (`npm run set-chairman-password` sets one if needed; that is a DB write the user must choose to do).
3. Expected: Home lists only owned companies; `/company/<owned id>` renders; `/company/<other id>` shows "You do not have access to this company."; Sign out returns to `/login`.

## 13. Remaining blockers

| # | Item | Status |
|---|---|---|
| 1 | Live login against real backend | **BLOCKED** (DB not running) |
| 2 | `/chairman/operating-loop/*` broken (reads non-existent `chairmanId` claim) | **BLOCKED** |
| 3 | `GET /organization/employee/:id`, `/history` unscoped | **OPEN — UNSAFE**, not exposed |
| 4 | `/organization/employee/:id/{permissions,responsibilities,kpis,budget,performance,succession}` return fabricated stubs | **OPEN — UNSAFE**, never expose |
| 5 | `POST /chairman/research/improvement/*` (3 routes) unscoped | **OPEN — UNSAFE**, not exposed |
| 6 | UNKNOWN: `research/inference` deployment binding; outreach `:id` outcome/transcript binding | **OPEN** |
| 7 | Workforce / AE / marketing mutations require an employee actor → Chairman gets 403 | **OPEN** (product decision) |
| 8 | Several CEO mutations have no role gate (any company member) | **OPEN** |
| 9 | 403-vs-404 inconsistencies (chairman knowledge 403; command approve returns `null` 200) | **OPEN** (low) |
| 10 | Jest open-handle warning ("worker failed to exit gracefully") | **OPEN** (non-failing) |
| 11 | Forced logout via cross-site GET `/api/auth/logout` | **OPEN** (low) |
| 12 | No refresh / revocation; Socket.IO auth undecided | **OPEN** (by design for Slice 1) |
| 13 | Background `processPool()` stays global (system job, not user-triggered) | **ACCEPTED** (existing semantics) |

## 14. Exact prerequisites for Slice 2

1. User starts PostgreSQL and the live-login checklist in §12 passes.
2. Pick the Slice 2 domains only from rows classified **S** / **SC** in §7, and resolve their stated condition first (e.g. always send `X-Company-Id`; confirmation UI for side effects).
3. Before exposing any route, add it to the BFF allowlist *with* a test. The allowlist stays GET-only until a mutation design (CSRF/Origin check, confirmation, error mapping) is agreed.
4. Decide the Chairman-as-actor question for workforce / AE / marketing mutations (blocker 7) before building any action UI in those domains.
5. Trace the UNKNOWN rows before using them.

## 15. Explicit V14/V15 boundary confirmation

No V15 work. `apps/web` imports nothing from `@aevora/shared`, `shared/v12`, `world-engine`, `v12-*`, WebXR or any 3D/spatial library (enforced by `security-scan.test.ts`). Simulation/world/office-rooms routes are classified out of scope. No legacy frontend restored. No schema changes.

---

**Slice 1 status: NOT COMPLETE.** All automated acceptance criteria pass (see §3a). Live login is BLOCKED (§12), and the OPEN items in §13 remain.

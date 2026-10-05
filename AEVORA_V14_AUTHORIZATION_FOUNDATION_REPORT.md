# AEVORA V14 — AUTHORIZATION FOUNDATION REPORT

**Date:** 2026-10-06 · **Slice:** V14 slice 1 (authorization core + secure route foundation) · **Follows:** `AEVORA_V14_FRONTEND_ARCHITECTURE_AUDIT.md`

---

## 1. Backend isolation fixes

All fixes reuse the existing guard chain (`JwtAuthGuard` → `RolesGuard`) and extend the existing `AuthorizationService`; no second authorization system, no schema change.

New `AuthorizationService` methods (`apps/api/src/authorization/authorization.service.ts`):

| Method | Rule |
|---|---|
| `accessibleCompanies(user)` | Chairman → companies with `chairmanId = actorId`; others → token `companyId` only |
| `assertCompanyAccess(user, companyId)` | 403 unless Chairman owns it / employee belongs to it |
| `assertResourceAccess(user, model, id)` | Resolves row's `companyId`, then `assertCompanyAccess`; missing **or other-tenant** row → 404 (no cross-tenant id probing) |
| `assertGroupOwnership(user, groupId)` | 403 unless the Chairman owns the group |
| `assertRoleUsable(companyId, roleId)` | Role must be that company's or global (`companyId null`) |

| Controller | Before | After |
|---|---|---|
| `company` | `GET /companies` returned **all** companies; any id mutable; body `chairmanId` trusted | list scoped; every `:id` asserted; mutations `@Roles('CHAIRMAN')`; owner = token actor; `groupId` ownership checked; PATCH copies only whitelisted fields |
| `department` | path `companyId` / any id | asserted; create/patch `CHAIRMAN, MANAGEMENT` |
| `employee` | path `companyId` / any id; **acting principal from spoofable `x-actor-id` header** | asserted; actor = `req.user.actorId` (service `checkPermission` now receives the real actor); promote checks role ownership |
| `task` | any id, body `companyId`, `x-actor-id` | asserted; body `companyId` asserted; referenced employee/goal/dependency tasks must be same company; `createdBy` = token actor |
| `goal` | any id; body `companyId` | asserted; goal company forced to the employee's company; department must match |
| `continuous-improvement` | path `companyId`, any id, client-supplied approver name | asserted; approve/reject/rollback `CHAIRMAN, MANAGEMENT`; approver = token actor |
| `operating-loop` | **Verified: services perform no ownership checks** (`listCycles`, `getCycle`, `getPoolSnapshot`, `forceRetry`, `dismiss`… take raw ids) | every `:companyId`, cycle id and employee id asserted at controller |
| `group` *(not in audit — found while verifying)* | `GET/PATCH /groups/:id` unscoped; `POST` trusted body `chairmanId` | ownership asserted; owner = token actor |
| `JwtAuthGuard` | wrong `X-Company-Id` → **401** | → **403** (authenticated but not permitted; a 401 would wrongly end the session in the UI). One existing spec updated accordingly. |

## 2. Authentication architecture

Unchanged backend model: `POST /auth/login {actorId, credential}` → JWT (1 h, `actorId`, `actorRole`, employee `companyId`). New, read-only, no secrets:

- `GET /auth/me` → `{actorId, actorType, actorRole, name, email, companyId}` from DB + verified token.
- `GET /auth/capabilities` → role, accessLevel, role permissions (UX hint only).
- `GET /auth/companies` → scoped company list (§6).

No refresh, no revocation exist; none were invented.

## 3. Session architecture

- `POST /api/auth/login` (BFF): same-origin check → backend login → JWT stored **only** in cookie `aevora_session`: `HttpOnly`, `Secure` (production), `SameSite=Strict`, `Path=/`, `Max-Age=3600` (= JWT life). Response body never contains the token.
- `POST /api/auth/logout`: clears cookie; client then `queryClient.clear()` + full navigation to `/login`. **The backend cannot revoke the JWT**; it stays valid until expiry but the browser no longer holds it.
- Expiry: any backend 401 → `GET /api/auth/logout?next=…` clears the cookie and 303s to `/login?reason=expired&next=…` once. `next` sanitised by `safeNextPath` (no `//`, schemes, `/login`, `/api`). No loop: the cleared cookie makes `/login` public.

## 4. Authorization architecture

- One frontend gate: `src/app/(os)/layout.tsx` calls `GET /auth/me`; 401 → `redirectIfUnauthenticated` (one helper, `src/server/guard.ts`); other errors → `SystemState`.
- One error vocabulary (`src/lib/http.ts`): 401 unauthenticated · 403 forbidden · 404 not_found · 409 conflict · 400/422 validation · 502–504 unavailable.
- TanStack Query never retries 4xx. Roles/capabilities are display only; no page contains role checks.

## 5. Company-context architecture

`/company/[companyId]/…` is navigation state. `company/[companyId]/layout.tsx` validates id shape, calls `GET /companies/:id` with `X-Company-Id` set by the server client; backend decides. 403/404 → **"You do not have access to this company."** with no fallback/auto-switch. Browser→BFF calls carry `x-aevora-company`; the BFF validates format and forwards as `X-Company-Id`.

## 6. Scoped company list

`GET /auth/companies` (and the now-fixed `GET /companies`) → `AuthorizationService.accessibleCompanies(req.user)`. Accepts no parameters; returns `{id, name, status, groupId}`.

## 7. Frontend route architecture (`apps/web`)

```
/login
/(os)/                         Home: backend company list
/(os)/group/[groupId]          GET /groups/:id (ownership-checked)
/(os)/company/[companyId]/     context gate + domain nav
   ceo workforce[/id] departments[/id] projects[/id] tasks[/id]
   research marketing sales intelligence improvement operations
/(os)/attention decisions reports assistant admin
```
Domain pages are structural shells driven by one registry (`src/lib/domains.ts`) stating truthfully *"Workspace not built yet"* or *"Blocked"* with the backend routes confirmed to exist. No metrics, records or activity are shown anywhere except the backend-returned company list, company header and group page.

## 8. BFF architecture

- `src/server/api.ts` — the **only** API client: Bearer from cookie, `X-Company-Id`, `cache: no-store`, cancellation via `AbortSignal`, status-preserving normalised errors, network failure → 503.
- `src/app/api/bff/[...path]` — GET-only proxy restricted to an allowlist of verified routes: `auth/me|companies|capabilities`, `groups`, `groups/:id`, `companies/:id`. Everything else (tasks, operating-loop, improvement, …) → 404. Backend 401 clears the cookie.
- `src/proxy.ts` — cookie-presence gate + return path; validity always decided by the backend.
- Stack: Next.js 16 (App Router), React 19, TypeScript strict (+`noUncheckedIndexedAccess`), Tailwind 4 (CSS-variable tokens, dark-first, full light theme, reduced motion), Radix DropdownMenu (user menu), TanStack Query 5. Dev: ESLint 9 + `eslint-config-next`, Vitest 3. No other dependencies.

## 9. Security decisions

- JWT never reaches browser JS (httpOnly cookie; enforced by test scan).
- CSRF: `SameSite=Strict` + Origin check on login/logout POST; BFF exposes no mutations yet.
- Header/path injection: ids must match `^[A-Za-z0-9_-]{1,64}$` before use in paths/headers.
- Cross-tenant rows return 404, not 403, to avoid enumeration.
- `AEVORA_API_URL` is server-only (no `NEXT_PUBLIC_`). No secrets copied from `.env`.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `poweredByHeader: false`.

**Security search results (`apps/web/src`, excluding tests):** `access_token` only in the login route handler (server); `Authorization` only in `server/api.ts`; `localStorage`/`sessionStorage`/`document.cookie`: none; `chairmanId`: none; ownership logic: none; hardcoded UUIDs/credentials/secrets: none; V12/V15 imports: none. Automated in `src/test/security-scan.test.ts`.

## 10. Tests executed

| Command | Result |
|---|---|
| `npx tsc --noEmit -p apps/api/tsconfig.json` | pass |
| `npx jest src/authorization/tenant-isolation.http.spec.ts` (new, 59 tests) | **59/59 pass** |
| `npx jest src/authorization/tenant-isolation.http.spec.ts src/world-state-gateway` | 14 suites, 192/192 pass |
| `npx jest` (full backend) | see §10a |
| `apps/web: npx tsc --noEmit` | pass |
| `apps/web: npx eslint .` | pass, 0 warnings |
| `apps/web: npx vitest run` (34 tests) | **34/34 pass** |
| `apps/web: npx next build` | pass (28 routes + proxy) |
| Live browser (Next dev, backend down) | unauthenticated `/company/abc/ceo` → `/login?next=%2Fcompany%2Fabc%2Fceo`; login with fake test values → "AEVORA backend is unavailable", no cookie; forged cookie → "Backend unavailable" state, no loop; `/api/bff/tasks/x` → 404 |

New backend tests cover: missing/forged/expired token 401; `/auth/me` without secrets; scoped `/auth/companies` (Chairman + employee); capabilities; `X-Company-Id` manipulation 403 (Chairman + employee); company list/get/patch/pause/resume/close on B; body `chairmanId` ignored; foreign `groupId`; role restriction; departments, employees (read + all mutations), tasks, goals, improvement, operating-loop via URL and body manipulation; proof no domain service is reached across tenants; `x-actor-id` spoof ignored; cross-company task references, role promotion, goal redirection.

New frontend tests cover: login success cookie flags + no token in body; invalid login; missing fields; cross-origin login; backend down; logout POST/GET; open-redirect drop; BFF 401 w/o session; allowlist blocks blocked domains; Bearer + X-Company-Id attached server-side; 403 passthrough; malformed company context; backend 401 clears cookie; error normalisation 400/401/403/404/409/422/500; cancellation; proxy redirect/public login/safe next; static no-JWT/no-fake-data/no-V15 scan.

**Not executed:** live login against the real backend — local PostgreSQL (`localhost:5432`) is not running (API start failed with Prisma P1001). It was not started or modified. Re-run once the DB is up: start `aevora-api-safe` + `aevora-web` from `.claude/launch.json`.

### 10a. Full backend suite
`npx jest` (all 44 suites): **345/350 pass, 5 fail** — 2 in the new tenant suite, 2 in `v12-vr-action.http.spec.ts`, 1 in `world-state-closure-gate.spec.ts`. The new suite took 155 s and the v12 one 255 s under full-suite load (jest default per-test timeout 5 s). Re-running exactly those three suites together: **68/68 pass**. Classified as load/timeout flakiness, not a logic regression, but it is unresolved: the full suite is not green in one run on this machine.

## 11. Remaining blockers

1. **`POST /operating-loop/error-pool/scan`** calls `processPool()` across **all companies**. Fixing it requires a service-level company parameter (business-logic change) — left as is, CHAIRMAN-only, not reachable from the frontend. Operating Loop stays hidden.
2. No company-wide task listing endpoint → Tasks workspace blocked.
3. No refresh/revocation; Socket.IO auth vs httpOnly session still undecided (no realtime in this slice).
4. Domain controllers listed as "not built" (CEO, workforce, organization, research, marketing, sales, intelligence, autonomous-enterprise, boardroom, chairman/*) had **route existence** verified only. Each must get the same per-controller isolation review before its workspace renders data.
5. Live end-to-end login unverified until PostgreSQL is running.

## 12. Files changed

Backend (`apps/api/src`): `authorization/authorization.service.ts`, `authorization/auth.service.ts`, `authorization/auth.controller.ts`, `authorization/jwt-auth.guard.ts`, `company/company.controller.ts`, `department/department.controller.ts`, `employee/employee.controller.ts`, `task/task.controller.ts`, `goal/goal.controller.ts`, `continuous-improvement/continuous-improvement.controller.ts`, `operating-loop/operating-loop.controller.ts`, `group/group.controller.ts`, `world-state-gateway/world-state-gateway.http.spec.ts` (401→403 expectation); **new** `authorization/tenant-isolation.http.spec.ts`.

Root: `package.json` (workspace `apps/web`), `package-lock.json`, `.claude/launch.json` (web port 3000, `aevora-api-safe` with safe-mode override + Chairman email off).

Frontend (**new** `apps/web`): `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`; `src/proxy.ts`; `src/lib/{http,session-cookie,bff-client,types,domains}.ts`; `src/server/{api,guard,origin}.ts`; `src/components/{providers,system-state,user-menu,os-shell,domain-workspace,company-list,login-form}.tsx`; `src/app/{globals.css,layout.tsx}`, `src/app/login/page.tsx`, `src/app/api/auth/{login,logout}/route.ts`, `src/app/api/bff/[...path]/route.ts`, `src/app/(os)/{layout,page,loading,error}.tsx`, `src/app/(os)/group/[groupId]/page.tsx`, `src/app/(os)/company/[companyId]/{layout,page}.tsx` + 15 domain `page.tsx`, 5 OS domain `page.tsx`; `src/test/{bff,security-scan}.test.ts`.

No schema, migration, seed or business-logic change.

## 13. V14/V15 boundary verification

No import of `@aevora/shared`, `shared/v12`, `world-engine`, `v12-*`, `office/screens`, `map`, `simulation`, WebXR or any 3D/spatial library in `apps/web` (enforced by `security-scan.test.ts`). No spatial UI, assets or navigation. No legacy frontend restored.

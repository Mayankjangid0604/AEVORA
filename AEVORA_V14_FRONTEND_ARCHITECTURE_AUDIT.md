# AEVORA V14 — INITIAL FRONTEND ARCHITECTURE AUDIT

**Date:** 2026-10-06
**Phase:** V14 (Company OS frontend) — audit only, no code written
**Scope:** read-only inspection of `F:\Aevora`. No application, schema or backend file was modified.

---

## 1. Executive Summary

- **There is no frontend.** `apps/web` was removed in V13; root `package.json` workspaces are `apps/api` + `packages/*`. V14 is a true greenfield app.
- **The backend is large and real:** NestJS 10 (`apps/api`), ~80 controllers, 157 module references in `app.module.ts`, Prisma/PostgreSQL with **345 models**.
- **Auth is usable as-is:** `POST /auth/login` → 1 h JWT (`actorId`, `actorRole`), global `JwtAuthGuard` (APP_GUARD), `RolesGuard` + `@Roles`, `X-Company-Id` header validated server-side against `Company.chairmanId`, short-lived SSE stream tokens.
- **Company isolation is inconsistent — this is the #1 blocker.** Newer domains (finance, sales, marketing, research, intelligence, world-state, groups, boardroom) scope by `req.user`. Several **legacy V1 controllers do not** (companies, departments, employees, tasks, goals, continuous-improvement, operating-loop path params). `GET /companies` returns **every company in the database**. V14 must not build on these until the backend fixes them.
- **Missing session primitives:** no `/auth/me`, no refresh, no logout, no "list my companies" endpoint that is scoped. These must be decided before the shell is built.
- **Realtime exists in two forms:** SSE (`/world-state/stream/:companyId`, `/company-conversations/stream`) and a Socket.IO gateway (`devices/realtime.gateway.ts`, per-user rooms).
- **No API contract artefact** (no OpenAPI/Swagger, no shared DTO package). Types must be derived from controllers/Prisma.

**Recommendation:** proceed with V14 only after a small, separately-authorised backend pass closes the isolation gaps (§16, §V14 Readiness). The frontend slice 1 (shell, auth, layout, design system) can be built in parallel against `/auth/*`, `/groups`, `/chairman/overview` which are already safe.

---

## 2. Current Repository State

| Path | Content |
|---|---|
| `apps/api` | NestJS 10 backend, Jest + supertest specs, Dockerfile |
| `packages/database` | Prisma schema (345 models), migrations, seed |
| `packages/shared` | `currency.ts`, `v12/*` (world-state, spatial, events, streaming, intents, webxr, physics — V15 material) |
| `packages/model-gateway` | LLM provider gateway (Ollama/Gemini/Anthropic) — backend-only |
| `infrastructure/`, `n8n/`, `scripts/`, `briefs/`, `docs/` | ops / automation / docs |
| `turbo.json` | Turborepo pipeline (`build`, `test`, `dev`, `lint`) |
| `.env`, `.env.example`, `.env.production.example` | backend config (secrets backend-only) |

Not a git repository at the root (`Is a git repository: false`) — recommend `git init` before V14 so every slice is reviewable.

## 3. Existing Frontend State

| Item | State |
|---|---|
| Apps / directories / Next.js structure / entry points | **None** (removed in V13, verified in `AEVORA_V13_FINAL_FRONTEND_REMOVAL_REPORT.md`) |
| Frontend / design-system / component dependencies | **None** in any workspace `package.json` |
| Styling, routing, state management, API client | **None** |
| Auth integration | None client-side; backend contract exists |
| Realtime integration | None client-side; backend SSE + Socket.IO exist |
| Testing | Backend only (Jest, ts-jest, supertest) |
| Hints of prior hosting | CORS dev origins `localhost:3000/3001`; `ALLOWED_ORIGINS` comment cites a Vercel origin; `.env.example` has `EXPO_PUBLIC_API_URL` (legacy mobile — not to be revived) |

## 4. Backend Capability Map

Global: `helmet`, `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` (unknown body fields → 400), `AppExceptionFilter`, CORS with credentials, port `PORT || PORT_API || 13000`, `/health`.

Controllers by domain (route prefix):

| Domain | Prefixes |
|---|---|
| Auth | `auth` |
| Group | `groups` (CHAIRMAN, scoped by actor) |
| Company | `companies` ⚠, `organization`, `business-units`, `capital-allocation` |
| Department | `companies/:companyId/departments` ⚠, `departments/:id` ⚠, `organization/departments` |
| Workforce | `employees/*` ⚠, `workforce/*`, `organization/employee/*`, `roles`, `agents`, `office/employees` |
| AI CEO | `ceo/*` (operating-state, feed, questions, ask, decisions, budgets, strategy, staffing, reviews, weekly-reports) |
| Chairman cockpit | `chairman/*` (overview, financials, employees, projects, departments, alerts, decisions, activity, communication, knowledge, operating-loop, kill-switch, agent-performance) |
| Projects | `projects/:projectId/*` (requirements, plans, milestones, risks, team), `project-delivery`, `delivery`; `project` controller is **empty** |
| Tasks | `employees/:id/tasks`, `tasks/*` ⚠ |
| Goals | `employees/:id/goals`, `goals/*` ⚠ |
| Research | `research/*`, `chairman/research/*`, `lab`, `rd-flywheel` |
| Marketing | `marketing/*`, `marketing-content/*` |
| Sales | `sales/*`, `outreach/*`, `lead-gen/*`, `inbox/*`, `client-meeting/*`, `proposal`, `opportunity`, `client`, `inquiry` |
| Intelligence | `intelligence/*`, `company-intelligence/*`, `foundation-intelligence/*` |
| Improvement | `continuous-improvement/*` ⚠ |
| Orchestration / autonomy | `autonomous-enterprise/*` (objectives, operating-cycles, escalations, decisions, recommendations, dashboard, audit), `operating-loop/*` ⚠ |
| Decisions / approvals | `approval/*`, `chairman/decisions`, `ceo/autonomous-decisions`, `autonomous-enterprise/decisions` |
| Assistant | `assistant/*` (message, voice/transcribe, messages, pc-tasks), `voice`, `company-conversations` |
| Notifications / events | `chairman/alerts`, `chairman/communication/notifications`, `chairman-mail/*`, Socket.IO user room |
| Reports | `groups/:id/report`, `boardroom/*` (incl. PDF summary), `ceo/weekly-reports`, `finance/*` |
| Finance | `finance/*` (38 routes, CHAIRMAN), `invoice`, `currency-rates` |
| Admin / settings | `model-platform`, `compute`, `integration`, `devices`, `chairman/kill-switch`, `chairman/capability` |
| Spatial (V12 — V15 only) | `world-state/*`, `world-engine`, `v12-*`, `office/screens`, `map`, `simulation` |

⚠ = company isolation not enforced at controller (see §8).

## 5. Domain / API Map (V14-relevant, verified)

| V14 Area | Primary read | Primary actions |
|---|---|---|
| Session | `POST /auth/login` | `POST /auth/stream-token` |
| Group | `GET /groups`, `GET /groups/:id`, `GET /groups/:id/report` | `POST/PATCH /groups` |
| Chairman Home | `GET /chairman/overview`, `/financials`, `/alerts`, `/decisions`, `/activity` | alerts read/resolve, decisions approve/reject, commands, broadcast |
| AI CEO | `GET /ceo/operating-state`, `/feed`, `/questions`, `/reviews`, `/weekly-reports`, `/budgets`, `/strategy/health` | priorities, delegate, ask, answer, approve plans/decisions |
| Workforce | `GET /workforce/profiles`, `/analytics/*`, `/ai/workers`, `/hiring`, `/organization/chart` | hiring, reviews, AI provisioning (approve/execute), autonomy level |
| Departments | `GET /organization/departments`, `/chairman/departments` | — (legacy mutate routes ⚠) |
| Projects | `GET /chairman/projects`, `/projects/:id/{requirements,plans,milestones,risks,team}` | plan approve, team propose/activate |
| Tasks | `GET /employees/:id/tasks`, `/tasks/:id` ⚠ | assign/start/block/complete/cancel ⚠ |
| Research | `GET /chairman/research/*`, `/research/*` | role-gated CHAIRMAN/MANAGEMENT |
| Marketing / Sales | `/marketing/*`, `/sales/*`, `/outreach/*`, `/lead-gen/*`, `/inbox/*` | outreach gated by backend interlock + 30-min rate limit |
| Intelligence | `/intelligence/company/:companyId/{proposals,assistance-requests}`, `/company-intelligence/*` | — |
| Improvement | `/continuous-improvement/company/:companyId/{detect,proposals}` ⚠ | approve/reject/rollback/outcomes ⚠ |
| Autonomous ops | `/autonomous-enterprise/dashboard/summary`, cycles, escalations, recommendations | open/review/close cycle, resolve/defer |
| Assistant | `GET /assistant/messages` | `POST /assistant/message`, `/voice/transcribe` |
| Realtime | `GET /world-state/stream/:companyId` (SSE, ?token), `GET /company-conversations/stream` (SSE), Socket.IO | — |

Full per-route detail must be generated per slice from the controller source — there is no OpenAPI spec.

## 6. Authentication Architecture

- `POST /auth/login` `{ actorId, credential }` — `actorId` is Chairman id **or email**, or Employee id. PBKDF2-SHA256/512, ≥600k iterations, timing-safe compare.
- Returns `{ access_token }` — JWT, `expiresIn: '1h'`, payload `{ actorId, actorRole }` (`CHAIRMAN` | `MANAGEMENT` | `EMPLOYEE` | …). Employee tokens carry `companyId`.
- Global `JwtAuthGuard` (APP_GUARD): `Authorization: Bearer`; `@Public()` opt-out; SSE routes accept only `purpose:'sse'` tokens via `?token=`, and session tokens are rejected in URLs.
- `POST /auth/stream-token` → 60 s SSE-only token bound to the resolved company.
- **Absent:** `/auth/me`, refresh, logout/revocation, MFA, password reset. On expiry the UI can only re-login.

**Frontend integration:** a thin Next.js server layer (route handlers) holds the JWT in an **httpOnly, Secure, SameSite=Strict cookie** and proxies to the API; the browser never sees the session token. Stream tokens (60 s, SSE-only) are the only tokens exposed to client JS. Identity for the shell is decoded server-side from the JWT until a `/auth/me` exists.

## 7. Authorization Architecture

- Coarse: `@Roles(...)` + `RolesGuard` on `actorRole` (most cockpit domains `CHAIRMAN`; some `CHAIRMAN, MANAGEMENT`; research admits `SYSTEM, EMPLOYEE`).
- Fine: `AuthorizationService.checkPermission(actorId, permission, companyId)` — Chairman owns company → allow; employee → same company + `role.permissions[]` or `accessLevel SYSTEM`.
- **No capability-discovery endpoint.** The frontend cannot ask "what may I do here?".

**Frontend integration:** render controls from role (decoded server-side) as a *hint only*; every action's 401/403 is authoritative and rendered as a first-class state. Never hide a backend refusal behind optimistic UI. A `GET /auth/capabilities` (or `/me`) endpoint is recommended as backend work.

## 8. Company Isolation Architecture

Mechanism (`jwt-auth.guard.ts`):
- Chairman: optional `X-Company-Id` header → server verifies `company.chairmanId === actorId`, else 401; absent → first owned company.
- Employee/other: `X-Company-Id` must equal token `companyId`.
- SSE tokens carry the company bound at issue time.
- Scoped controllers then compare path `:companyId` to `req.user.companyId` (e.g. world-state, intelligence).

**Verified gaps (controllers read ids from path/body, never `req.user`):**

| Controller | Problem |
|---|---|
| `company/company.controller.ts` | `GET /companies` → `prisma.company.findMany()` (all tenants); get/patch/pause/resume/close any id; `POST` trusts body `chairmanId` |
| `department/department.controller.ts` | list/create by path `companyId`, patch any id |
| `employee/employee.controller.ts` | list/create by path `companyId`; hold/suspend/terminate/transfer/promote any id |
| `task/task.controller.ts`, `goal/goal.controller.ts` | any id |
| `continuous-improvement/continuous-improvement.controller.ts` | path `companyId`, no user check |
| `operating-loop/operating-loop.controller.ts` | CHAIRMAN-gated but path `companyId` not checked against ownership at controller level (service-level not verified) |

**Frontend rule:** company context = the `X-Company-Id` header the BFF attaches; the backend decides. URL/query/body/localStorage company ids are navigation state only. **V14 must not call ⚠ routes until fixed**; use `organization/*`, `workforce/*`, `chairman/*` equivalents meanwhile.

## 9. Reusable Infrastructure

| Reuse | Why |
|---|---|
| Backend REST contracts, guards, SSE stream-token flow, Socket.IO gateway | authoritative |
| `@aevora/database` Prisma **types** (type-only import) | entity shapes without a second model |
| `@aevora/shared` `currency.ts` | consistent money formatting (paise) |
| Turborepo pipeline | add `apps/web` to workspaces |
| Jest/supertest | backend contract tests for any backend fix |

Not reusable for V14: `packages/shared/v12/*` (V15 spatial), `model-gateway` (server-only), anything from the deleted `apps/web`.

## 10. Proposed V14 Frontend Architecture

- **App:** `apps/web` — Next.js (App Router, TypeScript strict), added to root workspaces.
- **Routing** (hierarchy mirrors the OS; ids in URL are navigation only):
  ```
  /login
  /(os)/                       Chairman Home
  /(os)/group/[groupId]
  /(os)/company/[companyId]/   company home  (sets X-Company-Id via BFF)
       departments/[id]  workforce/[id]  ceo  projects/[id]  tasks/[id]
       research  marketing  sales  intelligence  improvement  operations
  /(os)/attention  /(os)/decisions  /(os)/reports  /(os)/assistant  /(os)/admin
  ```
- **Layout:** persistent OS shell = left rail (domains) + context bar (Group › Company › Department › …) + main workspace + right panel (Attention / Assistant). Command palette for cross-hierarchy jumps.
- **API client:** one typed `api(path, init)` in the BFF that adds Bearer + `X-Company-Id`, normalises errors to `{status, code, message}`; one browser `fetch` wrapper to the BFF. No per-domain client classes.
- **Company context:** `[companyId]` segment → BFF sets header → backend validates → 401/403 shows "no access", never a fallback company.
- **Workspace:** each domain page = list/detail panes driven by real endpoints; adaptive density by viewport and data volume.
- **Error/loading/empty:** route-level `loading.tsx` / `error.tsx` / explicit empty components distinguishing *empty*, *not permitted*, *backend unavailable*, *not supported by backend*.

## 11. State Management Strategy

- **Server state:** TanStack Query (cache, invalidation on mutations and realtime events). Server Components for first paint where no interactivity is needed.
- **UI state:** URL (filters, tabs, selection) + React state. No global store until a measured need appears.
- **Never persisted client-side:** tokens, company authority, permissions.

## 12. Realtime Strategy

1. SSE first: BFF mints `POST /auth/stream-token` → `EventSource(API/world-state/stream/:companyId?token=…)` / `company-conversations/stream`; reconnect re-mints (60 s TTL).
2. Events invalidate TanStack Query keys; they do not become a second source of truth.
3. Socket.IO user room (Chairman notifications) — needs the session JWT in `handshake.auth`; that conflicts with httpOnly storage. Decide: either a socket-purpose short token (backend change) or defer sockets and poll alerts. **Note:** gateway CORS is `origin: true`.
4. `world-state` events are V12 spatial deltas — in V14 use only as change signals, never render spatially.

## 13. Design System Strategy

- Tailwind CSS with CSS-variable tokens (colour, surface, elevation, motion, density), dark-first with full light theme via `data-theme`.
- Radix UI primitives for accessible behaviour (dialog, menu, popover, tabs, tooltip); own thin styled layer in `apps/web/ui`. No heavy component kit.
- Provenance tokens: distinct, non-colour-only markers for **Human / AI CEO / AI employee / System** on every actor-attributed item.
- Motion only for state change (arrival, status transition, realtime update); respects `prefers-reduced-motion`.
- WCAG 2.2 AA: keyboard-complete, focus visible, contrast-checked tokens.

## 14. Testing Strategy

- Unit/component: Vitest + Testing Library (+ axe for a11y).
- E2E: Playwright against a **local** API + seeded test DB (`npm run db:seed`), never production providers; `ENABLE_REAL_PRODUCTION_SENDING=false` / safe-mode override.
- Contract: a smoke suite asserting each consumed route's status + shape; tenant tests asserting a second company's ids 403.
- No mock production dashboards; fixtures only in tests.

## 15. V14/V15 Boundary

| V14 (now) | V15 (later — do not touch) |
|---|---|
| Login → Company OS, 2D enterprise UI | 3D HQ, spawn, walking, Chairman office, sitting, computer/OS transition |
| Consume REST/SSE as data | `world-state` snapshots rendered spatially, `world-engine`, `v12-*`, `office/screens`, `map`, `simulation`, `shared/v12` |
| Assistant as text/voice panel | `v12-assistant`, spatial audio, VR actions |

## 16. Gap Analysis

| V14 Requirement | Backend Capability | Existing Frontend | Missing | Recommended Approach |
|---|---|---|---|---|
| Login | `/auth/login`, 1 h JWT | none | refresh, logout, `/me` | BFF httpOnly cookie; re-login on expiry; request `/auth/me` |
| Authorization UI | `@Roles`, `checkPermission` | none | capability endpoint | role hint + render 403s; request `/auth/capabilities` |
| Group | `/groups*` scoped | none | — | build directly |
| Company list/switch | `X-Company-Id` validation | none | **scoped "my companies"**; `/companies` leaks all | backend fix; interim via `/groups` report / `chairman/overview` (verify) |
| Chairman Home | `/chairman/overview`, alerts, decisions, activity | none | — | slice 1 |
| Departments | `organization/departments` | none | legacy routes unscoped | use `organization/*`; fix legacy |
| Workforce / AI workers | `workforce/*`, `organization/*` | none | legacy `employees/*` unscoped | use `workforce/*` |
| AI CEO | `ceo/*` | none | — | build |
| Projects | `projects/:id/*`, `chairman/projects` | none | project list/CRUD (`project` controller empty) | read via `chairman/projects` |
| Tasks | `tasks/*` | none | **scoping** | block until fixed |
| Research | `research/*`, `chairman/research/*` | none | — | build |
| Marketing | `marketing/*`, `marketing-content/*` | none | — | build |
| Sales | `sales/*`, `outreach/*`, `lead-gen`, `inbox` | none | — | build; surface interlock/rate-limit errors verbatim |
| Intelligence | `intelligence/*`, `company-intelligence/*` | none | — | build |
| Improvement | `continuous-improvement/*` | none | **scoping** | block until fixed |
| Autonomous ops | `autonomous-enterprise/*`, `operating-loop/*` | none | operating-loop scoping verification | AE first; OL after verification |
| Attention / Decisions | alerts + 4 decision sources | none | unified queue endpoint | client-side merged view, each item links to its source action |
| Reports | group report, boardroom, weekly reports, finance | none | — | build |
| Assistant | `assistant/*` | none | streaming replies (not verified) | request/response panel |
| Notifications | alerts, chairman-mail, Socket.IO | none | socket auth vs httpOnly | SSE/poll first |
| Realtime | SSE + stream tokens | none | non-spatial event stream | world-state as invalidation signal only |
| Admin/settings | model-platform, compute, integration, kill-switch | none | — | late slice, high-risk confirmations |
| API typing | none | none | OpenAPI | add `@nestjs/swagger` later (backend) or hand types per slice |

## 17. Implementation Sequence

0. **Prerequisite (backend, separately authorised):** scope legacy controllers; scoped "my companies"; `/auth/me`; decide socket auth.
1. `apps/web` shell + design tokens + theme
2. Login + BFF session cookie + logout (cookie clear)
3. Global OS layout + navigation + context bar
4. Group/Company context (header-based)
5. Chairman Home (`/chairman/overview`, alerts, decisions, activity)
6. API client + error normalisation
7. Authorization states (401/403 UI)
8. Loading / empty / error system
9. Realtime foundation (stream-token SSE → query invalidation)
10. Design-system components hardened + a11y tests
11. Then domains in order: AI CEO → Workforce → Departments → Projects → Attention/Decisions → Autonomous Ops → Intelligence → Research → Sales → Marketing → Reports → Assistant → Improvement/Tasks (after fixes) → Admin

## 18. Risks

| Risk | Severity |
|---|---|
| Unscoped legacy controllers allow cross-tenant read/write | **Critical** (backend) |
| No API spec → drift between UI types and backend | High |
| 1 h JWT, no refresh → session loss mid-work | Medium |
| Multiple overlapping decision/approval sources | Medium (UX confusion) |
| Socket.IO `origin: true` + token in client | Medium |
| 345-model surface invites scope creep | High |
| V12 spatial endpoints tempting to reuse for "living" UI | Medium (V15 leakage) |
| Outreach endpoints have real-world side effects | High — confirmations + safe env in dev |

## 19. Anti-Entropy Rules

1. No endpoint, no screen. A feature appears only after its route is verified in source.
2. One API client, one query layer, one token store (server-side).
3. No frontend-derived authority: company, role and permissions come from the backend response.
4. No mock data outside tests.
5. No V15 imports (`shared/v12`, `world-engine`, `v12-*`) in `apps/web`.
6. No new dependency without a written reason; prefer native/Radix/Tailwind.
7. Every slice ships with tests and a tenant-isolation check.
8. Backend changes are never made "while in there" from a frontend task.

## 20. Final Recommendation

Build V14 as a new Next.js `apps/web` with a server-side session layer, header-based company context, TanStack Query and a token-driven Tailwind/Radix design system. Start slice 1 against the already-safe routes now if desired, but **do not ship any company/department/employee/task/goal/improvement screens until the backend isolation gaps are closed** under a separately approved backend task.

---

## V14 IMPLEMENTATION READINESS

**Ready**
- Login, JWT guard, roles, `X-Company-Id` validation, SSE stream tokens
- Scoped domains: groups, chairman, ceo, workforce, organization, finance, sales, marketing, research, intelligence, autonomous-enterprise, boardroom
- Prisma types, Turborepo, local seed + safe-mode for testing

**Missing**
- Entire frontend (by design)
- `/auth/me`, refresh/logout, capability discovery, scoped company list
- OpenAPI/contract artefact
- Unified attention/decision feed; project list/CRUD controller

**Must be resolved before implementation (beyond slice 1)**
1. Company isolation in `companies`, `departments`, `employees`, `tasks`, `goals`, `continuous-improvement`, and verification of `operating-loop`
2. A scoped "companies I can access" endpoint
3. Session strategy decision (BFF cookie recommended) and Socket.IO auth approach
4. `git init` / version control for reviewable slices

**Do NOT touch**
- Database schema and migrations
- Backend behaviour (except a separately approved isolation fix)
- Deleted legacy `apps/web` (no restore)
- V12/V15 spatial: `world-engine`, `world-state` rendering, `v12-*`, `shared/v12`, `office/screens`, `map`, `simulation`
- Outreach interlocks (`ENABLE_REAL_PRODUCTION_SENDING`, rate limiter), secrets in `.env`

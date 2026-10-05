# AEVORA V14 — SLICE 2 REPORT

**Date:** 2026-10-06 · **Base:** `29901e3` · **Scope:** Login → Company selection → Company OS home (Chairman Home) on real backend contracts

> **LIVE LOGIN = NOT VERIFIED.** PostgreSQL on `localhost:5432` was not reachable (TCP probe failed; no Postgres service running). It was not started or modified. Every check below that needs an authenticated session against real data is marked accordingly.

## 1. Slice objective

First real Company OS vertical: an authenticated session lands on company selection, enters a company through the backend-authorised context gate, and sees a Chairman Home built only from verified backend responses, inside a reusable OS shell (rail, top bar, command entry, workspace, attention panel).

## 2. Backend endpoints actually consumed

| Endpoint | Where | Verified contract (controller source) |
|---|---|---|
| `POST /auth/login` | BFF login route | unchanged (Slice 1) |
| `GET /auth/me` | `(os)/layout.tsx` | unchanged (Slice 1) |
| `GET /auth/companies` | `(os)/page.tsx` (server) | `AuthorizationService.accessibleCompanies`, returns `{id,name,status,groupId}[]` |
| `GET /companies/:id` + `X-Company-Id` | company layout | guard 403 for non-owned; assertCompanyAccess |
| `GET /chairman/overview` | Chairman Home (BFF) | `ChairmanController.getOverview`: `company`, `employees{total,active}`, `projects{total,active}`, `alerts`, `pendingDecisions` (DB counts). **`treasury` and `financials` are returned but not rendered:** balance units and report shape are unverified |
| `GET /chairman/alerts` | Attention panel | `operationalAlert.findMany({companyId}, take 100)`: `severity`, `category`, `title`, `status`, `createdAt` |
| `GET /chairman/decisions` | Pending decisions | `managementDecision.findMany` + `proposer{id,name}`: `type`, `title`, `status`, `createdAt` |
| `GET /chairman/activity` | Recent activity | `companyEvent.findMany`: `type`, `createdAt` (payload not rendered) |

All four `chairman/*` routes are `@Roles('CHAIRMAN')` and scoped by `getCompanyForChairman` (ownership re-checked). The BFF allowlist gained exactly these four, and **refuses them without an explicit company (400)**, so the backend's "first company" fallback can never fire. No backend code changed in this slice. No endpoint or field was invented.

## 3. Frontend routes implemented / changed

| Route | Behaviour |
|---|---|
| `/` | Company selection from `GET /auth/companies`. 0 → empty state; 1 → server redirect into that company (still authorised by the company layout); >1 → explicit choice. `/?choose=1` shows the list even with one company ("Switch company") |
| `/company/[companyId]` | Context bar (breadcrumb, name, backend status, legal name, Switch company) + Chairman Home |
| `/company/[companyId]/*`, OS domains | unchanged truthful shells (registry) |

## 4. Components / primitives created

- **Shell:** `nav-rail.tsx` (client; `aria-current`; company section only inside a company; blocked domains labelled), `os-shell.tsx` (skip link, sticky top bar, `<main id=workspace>`), `command-palette.tsx` (native `<dialog>`, Ctrl/⌘+K, filter, Enter = first match; it is also the navigation below `md`).
- **Data:** `company-selector.tsx` (+ `StatusBadge`), `chairman-home.tsx` (four independent TanStack queries), `chairman-sections.tsx` (pure `OverviewFigures`, `AttentionList`, `DecisionList`, `ActivityList`, `Panel`), `query-state.tsx` (`QueryError`, `SectionSkeleton`).
- **Lib:** `company-selection.ts`, `query-keys.ts` (company-partitioned keys), `navigation.ts` (`companyFromPath`, `commandEntries` from the domain registry).
- **Tokens (`globals.css`):** soft status surfaces for dark and light, `--radius`/`--radius-sm`, motion tokens (`--ease-out`, `--dur-*`), a global `:focus-visible` ring, `.motion-enter` (content arrival), `.skeleton` (loading shape), `dialog::backdrop`. Reduced-motion override is retained.
- **Removed:** `company-list.tsx` (replaced by the server-rendered selection).
- **No new dependencies.**

## 5. Authentication verification status

**LIVE LOGIN = NOT VERIFIED** (no PostgreSQL). Verified without a database:
- Unauthenticated `/company/abc` → `/login?next=%2Fcompany%2Fabc`.
- Login page renders at desktop and mobile, in dark and light.
- `/login?reason=expired` shows "Your session ended. Sign in again."
- `GET /api/auth/logout` → 405 (POST-only, from Slice 1).

## 6. Company-selection verification

- Unit/render tests: exactly the returned companies, linked by their ids; empty → "No accessible company"; one → enter; many → choose; empty list renders no link.
- The backend-failure path renders `SystemState` by kind.
- **Live: not verified** (needs a session).

## 7. Company-context verification

- Tests: `chairman/*` without a company → 400 with no backend call; with a company → `X-Company-Id` forwarded; a backend 403 passes through unchanged (one call, no retry and no other company); query keys are partitioned by company id.
- The layout renders "You do not have access to this company." on 403/404 with a link back to the list, and never switches company.
- **Live: not verified.**

## 8. Chairman Home data sources

| Section | Source | Shown | Not shown (and why) |
|---|---|---|---|
| Overview figures | `/chairman/overview` | employees total/active, projects total/active (ACTIVE+PLANNED+IN_REVIEW), active alerts, pending (PROPOSED) decisions, each labelled with the backend's definition | treasury (units unverified), financials (shape unverified) |
| Attention (right panel, xl; stacked below) | `/chairman/alerts` | ACTIVE alerts only: severity, title, category, time; "Showing N of M" when truncated | — |
| Pending decisions | `/chairman/decisions` | PROPOSED only: title, type, proposer, time | approve/reject actions (explicitly "not available in this release") |
| Recent activity | `/chairman/activity` | event type + time | payload (untyped JSON) |

Non-Chairman actors get 403 from these routes, rendered per section as "This view is available to the company Chairman only."

## 9. Loading / empty / error behaviour

- **Loading:** skeleton shapes with `role=status` and an sr-only label; never placeholder values.
- **Empty:** explicit per-section copy.
- **Errors:** 401 redirects to `/login?reason=expired` (fetcher); 403, 404, 409, 400/422, 502–504 and other failures each show fixed copy. Backend messages and stack traces are never rendered (test feeds a stack-like message and asserts it's absent).
- TanStack never retries a 4xx. Sections fail independently.

## 10. Accessibility verification

Implemented:
- skip link; landmarks (`nav` Primary, `header`, `main`, `aside` Attention, breadcrumb `nav`)
- `aria-current` on the active rail item and breadcrumb
- labelled sections; `dl` for figures; `time[datetime]`
- status text carried by words, not colour alone
- global `:focus-visible` ring
- native `<dialog>` (focus trap, Escape)
- labelled command input; `aria-haspopup`
- `aria-busy` on loading; reduced-motion override; token palette chosen for contrast

**Not verified:** no automated axe/contrast run (no DOM test runner installed; adding one is a dependency decision deferred to the user). Keyboard paths in the authenticated shell could not be exercised live without a session.

## 11. Responsive verification

| Breakpoint | Behaviour |
|---|---|
| < md | rail hidden; command palette is the navigation |
| md+ | 15rem sticky rail |
| xl | Chairman Home switches to main + 22rem Attention aside |
| below xl | Attention stacks under the main content |
| figures | 2 columns → 4 at lg |
| company cards | 1 → 2 (sm) → 3 (xl) |

Live check: the login screen at 375×812 (light). **The authenticated shell couldn't be viewed live** without a session.

## 12. Test results

| Check | Result |
|---|---|
| Frontend `npx vitest run` | **59/59** (3 files) |
| Frontend `npx tsc --noEmit` | pass |
| Frontend `npx eslint .` | pass, 0 warnings |
| Frontend `npx next build` | pass |
| Backend `npx jest` (regression, no backend change) | **50/50 suites, 385/385** |

## 13. Browser verification

| Step | Result |
|---|---|
| 1 `/login` | ✓ renders (desktop, mobile, light) |
| 2 real authentication | **NOT VERIFIED** (no DB) |
| 3 company selection | **NOT VERIFIED live** (tests only) |
| 4 selected company context | **NOT VERIFIED live** (BFF tests) |
| 5 Company OS shell | **NOT VERIFIED live** (requires session) |
| 6 Chairman Home | **NOT VERIFIED live** (render tests only) |
| 7 logout | GET → 405 ✓; POST path tested in unit tests |
| 8 unauthorized company manipulation | unauthenticated → login ✓; authenticated: not verifiable |
| 9 backend unavailable | ✓ "Backend unavailable" with a session cookie present, no loop |
| 10 blocked routes | ✓ `/api/bff/chairman/operating-loop/cycles` → 404; `/api/bff/chairman/overview` without company → 400 |

The only console errors were those three intentional probes (400/404/405).

## 14. Security scan (`apps/web/src`, excluding tests)

`access_token`: only `api/auth/login/route.ts` (server). Not found anywhere:
- localStorage / sessionStorage / `document.cookie`
- `chairmanId`
- UUIDs / hardcoded company ids
- V12/V15/world-engine/WebXR/three/`@aevora/shared`/simulation

Also confirmed:
- No fabricated metrics: render test asserts no currency or treasury figures.
- The BFF allowlist exposes no blocked route (tested: operating-loop, simulation, world, financials, organization placeholders, outreach side effects, notify-test, world-state).

## 15. Remaining blockers

1. **LIVE LOGIN = NOT VERIFIED.** It needs PostgreSQL started by the operator. Start the API in safe mode from `apps/api`:
   ```bash
   AEVORA_ENV_OVERRIDE=../../scripts/safe-local.env npm run start --workspace=@aevora/api
   ```
   Then start the web app from the repository root:
   ```bash
   npm run dev --workspace=@aevora/web
   ```
   Then walk §13 steps 2–8.
2. Live browser verification of the authenticated shell, Chairman Home, responsive layout and keyboard paths depends on (1).
3. No automated accessibility tooling (axe/jsdom). Adding it needs a dependency decision.
4. Treasury and financials are omitted until their units and shape are verified.
5. Decision actions are not exposed (needs a mutation design: CSRF/Origin, confirmation, error mapping).

## 16. V14/V15 boundary verification

2D enterprise web only. No 3D, WebXR, world engine, office rooms, spatial navigation, simulation or V12/V15 imports (scan test + grep). No spatial metaphors in copy or layout. Simulation/world/office-room routes stay unreachable through the BFF.

# AEVORA V14 — SLICE 3 REPORT: ORGANIZATION / WORKFORCE

**Date:** 2026-10-06 · **Base:** `78653fd` · **Classification:** see §23

## 1. Objective

First real operational domain: a trustworthy, read-only view of Company → Departments → Workforce built only from verified, company-scoped backend data. It establishes reusable entity list/detail patterns for later V14 domains.

## 2. Backend routes audited

Controllers and services traced: `OrganizationController` / `OrganizationService`, `EmployeeController` / `EmployeeService` (legacy), `DepartmentController`, `WorkforceController` / `WorkerProfileService`, `ChairmanController` (`employees`, `employees/:id`, `departments`).

**Genuine security defect found:**
- Every route returning Employee rows used `include` with no `select`, so responses carried **`credentialHash`, `credentialSalt`, `hashAlgorithm`, `workFactor`**.
- Any authenticated member of a company, including the EMPLOYEE role, could read every colleague's password hash and salt.
- Affected routes: `/organization/employees`, `/organization/employee/:id`, `/organization` (root), `/chairman/employees(/:id)`, `/chairman/departments`, `/companies/:id/employees`, `/employees/:id`, `/workforce/profiles/:employeeId`, plus any other route that includes Employee.

**Fix (backend, minimal):** `CredentialRedactionInterceptor`, a global `APP_INTERCEPTOR` registered in `AuthorizationModule`.
- It strips those four fields from every plain object and array in every HTTP response.
- Only `AuthService` reads them, and it reads directly from Prisma, so nothing depends on them in HTTP responses (repo-wide search).
- Dates, streams and observables are not walked.
- Verified live: the four routes return no credential fields.
- Test: `credential-redaction.http.spec.ts` (4 tests).

## 3. Route disposition matrix

Columns follow the requested audit: A auth · B role · C company isolation · D resource ownership · E list scoping · F–H search/filter, pagination, sort · I referenced entities · J mutation · K sensitive fields · L real vs placeholder.

| Route | A | B | C/D/E | F–H | I | J | K (raw API) | L | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| `GET /organization/departments` | JWT | any member | `where {companyId: req.user.companyId}` | none / none / none | — | no | none | real | **SAFE WITH CONDITIONS** (explicit company) |
| `GET /organization/departments/:id` | JWT | any | `findUnique {id, companyId}` → **200 `null`** for foreign/missing | — | — | no | none | real | **SAFE WITH CONDITIONS** (BFF maps `null` → 404) |
| `GET /organization/employees` | JWT | any | company list | none / none / none (unbounded; headcount backstop `MAX_HEADCOUNT`=100) | role, department | no | salary, identitySeed, performance, reliability, experience, internal ids (credentials now redacted) | real | **SAFE WITH CONDITIONS** (BFF projection) |
| `GET /organization/employee/:id` | JWT | any | `assertResourceAccess` → 404 foreign (Slice 1 closure) | — | role, department | no | as above | real | **SAFE WITH CONDITIONS** (BFF projection) |
| `GET /workforce/profiles` | JWT | any | company list | `?workerType` only | employee{name,status,salary,…} | no | salary, AI budget | real | **SAFE WITH CONDITIONS** (projected to `employeeId`, `workerType`) |
| `GET /workforce/profiles/:employeeId` | JWT | any | `profile.companyId !== companyId → 404` | — | full employee, skills | no | salary etc. | real | **SAFE WITH CONDITIONS** (projected) |
| `GET /organization/chart` | JWT | any | company | — | full profiles + employee | no | salary etc. | real | **not used** (no hierarchy data: 0 worker profiles live) |
| `GET /organization`, `/activity`, `/audit` | JWT | any | company | — | — | no | full rows | real | **not used** |
| `GET /organization/employee/:id/history` | JWT | any | company-bound | — | — | no | — | real | **not used** (out of scope) |
| `/organization/employee/:id/{permissions,responsibilities,kpis,budget,performance,succession}` | JWT | any | — | — | — | GET/PATCH/POST stubs | fabricated | **placeholder** | **BLOCKED** (not allowlisted, test) |
| `/organization/employee*` mutations, `/employees/:id/*` mutations, `/companies/:id/departments` POST, `/departments/:id` PATCH | JWT | permission-checked | company-bound | — | — | yes | — | real | **not exposed**: read-only slice; mutation design pending |
| `/chairman/employees`, `/chairman/departments` | JWT | CHAIRMAN | company | — | performanceRecord, skills, employees | no | salary, performance | real | **not used**; organization routes serve all roles with the same scoping |
| `/workforce/*` analytics, reviews, hiring, compensation, AI provisioning | JWT | varies | company | — | — | some | compensation | real | **not used** |

## 4. Backend contracts consumed (via the BFF)

| BFF path | Backend | Projected to (browser receives only) |
|---|---|---|
| `organization/departments` | `OrganizationService.getDepartments` | `{id, name, status}[]` |
| `organization/departments/:id` | `getDepartment(companyId, id)` | `{id, name, status}` or **404** (backend `null`) |
| `organization/employees` | `EmployeeService.listEmployees` | `{id, name, status, hireDate, role:{title}, department:{id,name}}[]` |
| `organization/employee/:id` | `getEmployee` (+ `assertResourceAccess`) | same shape |
| `workforce/profiles` | `WorkerProfileService.listProfiles` | `{employeeId, workerType}[]` |
| `workforce/profiles/:employeeId` | `getProfile` | `{employeeId, workerType}`; 404 = no profile |

All six routes require an explicit company (else BFF 400), as `chairman/*` does. Without that, the backend would use `req.user.companyId`, which falls back to the Chairman's first company. The BFF no longer forwards query strings.

## 5. Frontend routes created

- `/company/[companyId]/organization`: overview (departments + workforce entry)
- `/company/[companyId]/organization/departments`: redirects to the overview (the list lives there)
- `/company/[companyId]/organization/departments/[id]`: department detail with its members
- `/company/[companyId]/organization/workforce`: workforce list with URL filters
- `/company/[companyId]/organization/workforce/[id]`: employee detail

Removed: the Slice 1 shells `/company/[id]/departments(/[id])` and `/company/[id]/workforce(/[id])`. The domain registry now has one `organization` entry with status `ready`.

## 6. Components / primitives created (each has a consumer)

`PageHeader` + `DetailList` (`page-header.tsx`), `StatusBadge` (moved out of company-selector, generalised), `ProvenanceBadge` + `provenanceLabel`, `WorkforceList` (desktop table / mobile cards), `organization-views.tsx` (`OrganizationOverview`, `WorkforceView`, `DepartmentDetail`, `EmployeeDetail`). Supporting libraries: `org-queries.ts` (TanStack hooks), `workforce-filter.ts` (URL filter logic), `server/projections.ts` (BFF whitelists). Reused: `Panel`, `QueryError`, `SectionSkeleton`, `SystemState`. No `DataTable` abstraction (one table consumer). No new dependencies.

## 7. Organization UI behaviour

Departments sorted by name, showing the backend status and a headcount computed from the returned workforce ("Headcount unavailable" if that request fails); "N returned" is labelled as such; the workforce panel links to the full list. Read-only note in the header. No org chart: the backend's chart is built from WorkerProfile `managerId`, and **0 worker profiles exist** live, so there is no hierarchy to show.

## 8. Workforce UI behaviour

- **Columns:** Name, Role, Department, Worker type, Status.
- **Filters (URL state):** `q` (name/role), `status`, `department`, `type` (backend workerType values or `none`). Options come only from values present in the returned data. Results show "N of M people" in a polite live region.
- **Filtering happens client-side over the complete backend list.** The backend has no filter or pagination parameters. Headcount is bounded by `MAX_HEADCOUNT`, and the code carries a `ponytail:` note naming the upgrade path.
- **Provenance:** labelled only from `WorkerProfile.workerType`. With no profile it shows "Not recorded". If the provenance request fails it shows "Unavailable" with a notice, never a guess. Live: "Alice / CEO" shows **Not recorded**, not "AI".

## 9. Employee detail behaviour

Name + status badge; Role, Department (link), Worker type, Hire date; "Compensation and performance data are not shown". States: valid ✓, missing → Not found + back link ✓, foreign → Not found (indistinguishable) ✓, 403 → Access denied, backend down → Backend unavailable ✓.

## 10. Authorization verification

The backend is authoritative throughout: the guard validates `X-Company-Id`, services scope by `req.user.companyId`, and by-id reads are company-bound. The frontend holds no authorization logic. All views are read-only, and no button reaches a mutation route.

## 11. Company-isolation verification (live, real foreign ids from a read-only SELECT)

| Attempt | Result |
|---|---|
| URL: foreign company `/company/<foreign>/organization/workforce` | "You do not have access to this company.", no switch |
| URL: foreign employee under own company | Not found |
| URL: foreign department under own company | Not found |
| BFF: foreign `x-aevora-company` on employees / departments / own employee id | 403 ×3 |
| BFF: own company + foreign employee / department / profile id | 404 ×3 |
| BFF: no company | 400 |
| BFF: placeholder `employee/:id/kpis`, `history`, `chairman/employees` | 404 (not allowlisted) |

## 12. Sensitive-data handling

- **Defence in depth:**
  - The backend interceptor removes credentials from every response.
  - The BFF projects each route to a whitelist.
  - TypeScript types contain only the projected fields.
  - The UI renders a subset of those.
- Live, the browser's `organization/employees` response keys were exactly `id,name,status,hireDate,role,department`, with no salary, identity seed, performance, reliability, companyId or accessLevel.

## 13. Loading / empty / error states

Skeletons (`role=status`). Empty states: "No departments", "No workforce", "No matches", "No people" (department). Errors use fixed copy by status. The worker-type failure notice is separate. Verified live: backend down → "Backend unavailable" + "Worker type could not be loaded" (TanStack retried the 5xx twice: 6 × 503 in the console).

## 14. Responsive behaviour (live)

- **1440 px (dark):** rail + full table.
- **768 px (tablet, light):** rail kept; 2-column department grid; no overflow.
- **375 px (mobile, light):** table hidden, card list shown, filters wrap, rail collapses into the palette, no horizontal scroll.

## 15. Accessibility (manual check; no axe)

- Headings: company `h1` → page `h2` → section `h3`.
- Table: `caption` (sr-only), `th scope=col` and `scope=row`.
- Filters: `role=search`, each control labelled. Results count announced via `aria-live`.
- Status badges are text, with `aria-label` on detail pages. Provenance carries text, not colour alone.
- Keyboard: Tab from the last filter reaches the first row link with a 2px outline; Enter opens the detail. Filters can be changed with arrow keys.
- Reduced motion: CSS override present (not emulable here).

## 16. Automated tests

| Check | Result |
|---|---|
| Frontend `npx vitest run` | **106/106** (59 → 106; +47 in `slice3.test.tsx`) |
| Frontend `npx tsc --noEmit` | pass |
| Frontend `npx eslint .` | pass, 0 warnings |
| Frontend `npx next build` | pass |
| Backend `npx jest` | **51/51 suites, 389/389** (+1 suite, +4 tests: credential redaction) |

## 17. Browser verification (live: PostgreSQL + `aevora-api-safe` + `aevora-web`)

| # | Step | Result |
|---|---|---|
| 1 | Organization navigation | ✓ rail "Organization" current; login `next` straight to `/organization` |
| 2 | Department list | ✓ 6 departments = API; headcounts 2/1/0/1/0/0 sum to 4 |
| 3 | Workforce list | ✓ 4 people = API; filter by department → "2 of 4" (Bob, Charlie); `q=zzz` → "No matches" |
| 4 | Employee detail | ✓ Alice: CEO, Executive, hire date, Not recorded |
| 5 | Company URL manipulation | ✓ access state |
| 6 | Foreign employee | ✓ Not found |
| 7 | Foreign department | ✓ Not found |
| 8 | Loading | skeletons transient (fast local backend); unit-tested |
| 9 | Error states | ✓ backend down → section errors |
| 10 | Mobile | ✓ |
| 11 | Desktop | ✓ |
| 12 | Keyboard | ✓ |
| 13 | Console | only expected 4xx/503 from probes, foreign pages, profile-less employees (`workforce/profiles/:id` 404 → "Not recorded") and the backend-down test; no React/hydration errors; web server log clean |

## 18. Security scan (`apps/web/src`, excluding tests)

`access_token`: only the server login route. None found:
- localStorage / sessionStorage / `document.cookie`
- `chairmanId`
- UUIDs (no hardcoded company or employee ids)
- spatial / V15 terms

`salary` / `credential` appear only in comments and the login route's own field names. There are no fake employees, departments or metrics; tests use clearly synthetic fixtures. No placeholder route is reachable through the BFF (tested).

## 19. Remaining blockers / limitations (non-blocking)

1. No backend pagination, filter or sort for employees. Client-side filtering is bounded by `MAX_HEADCOUNT` and should move server-side if companies grow.
2. No org chart (no worker profiles exist; the chart endpoint returns unprojected salary data and isn't used).
3. Read-only: no create, edit, promote or delete. A mutation design (CSRF, confirmation, error mapping) is still needed.
4. Profile-less employees produce an expected 404 per detail view (`workforce/profiles/:id`). Harmless console noise.
5. The legacy raw API still returns salary/identitySeed to any company member on these routes (authorized by design, but broad). V14 never forwards them; tightening the backend contract is a product decision.
6. Non-Chairman and multi-company paths not live-tested (no such fixtures).

## 20. V14/V15 boundary

2D enterprise UI only. No spatial, 3D, WebXR, world-engine, simulation or `@aevora/shared` imports (scan test + grep).

## 23. Acceptance

**A — COMPLETE.** The real Organization / Workforce journey was verified live against PostgreSQL. No unsafe route is exposed (allowlist + tests), no fake data is used, and the one security defect found (credential exposure) is fixed, regression-tested and verified live.

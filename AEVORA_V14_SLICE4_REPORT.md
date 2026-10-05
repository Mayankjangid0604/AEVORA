# AEVORA V14 — SLICE 4 REPORT: PROJECTS

**Date:** 2026-10-06 · **Base:** `ac420cf` · **Classification:** see the end

## 1. Objective

First Projects workspace: a company-scoped project list and project detail built on verified backend contracts with server-side projection. It reuses the Slice 3 entity patterns. Tasks are out of scope.

## 2. Project backend audit

Controllers traced: `ProjectExecutionController` (`/projects/*`), `ChairmanController` (`/chairman/projects`, `/chairman/projects/:id`), `DeliveryController` (`/delivery/*`, incl. formal delivery), `ProjectController` (`/project`, empty class: no routes). Service: `ProjectExecutionService`, `FormalDeliveryService`.

**Genuine authorization defects found and fixed:**

1. **`/projects/*` (13 routes) had no company or actor checks at all.** Any authenticated user could, with any company's project id:
   - read requirements, plans, milestones, risks and team
   - create requirements, plans, milestones and risks
   - propose staffing
   - approve plans (`plans/:id/approve`)
   - activate assignments (`project-assignments/:id/activate`)
   - update requirements

   The service read `project.companyId` only to emit events. **Fix:** `:projectId` routes call `assertResourceAccess(user, 'project', id)`. Child-id routes call the new `assertProjectChildAccess` (resolve `projectId`, then the project check). Foreign or missing → 404, anti-enumeration. Plan approval and assignment activation now require `CHAIRMAN, MANAGEMENT`, matching the existing approval gates.
2. **`/delivery/formal/:projectId/package`, `/delivery/formal/deliveries/:id/accept|revise`** looked the project/delivery up by id only. They also recorded the actor as `req.user.id`, which the JWT never carries, so every package was attributed to `'system'` and accept/revise to a company id. **Fix:** company binding as above, and the actor is now `req.user.actorId`. The service only records these values, never compares them.

Regression tests: `project-execution/project-isolation.http.spec.ts` (21 tests).

## 3. Route disposition matrix

Columns: A auth · B role · C/D company and resource · E list scoping · F body companyId · G actor · H referenced entities · I sensitive fields · J external effects · K placeholder · L pagination/filter/sort.

| Route | A | B | C/D/E | F | G | H | I | J | K | L | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `GET /chairman/projects` | JWT | CHAIRMAN | `getCompanyForChairman` (header-validated) | – | – | client, assignments+employee | quotedPrice, revenue, cost, margin, financialStatus, opportunity/proposal ids, employee salary/identitySeed | none | real | none / none / `createdAt desc` | **SAFE WITH CONDITIONS** (explicit company + projection) → **consumed** |
| `GET /chairman/projects/:id` | JWT | CHAIRMAN | `companyId !== company.id → 404` | – | – | client, requirements, plans, milestones, risks, **tasks (50)**, assignments+employee, deliveries, revenueRecords, projectCosts | as above + revenue/cost records, tasks | none | real | – | **SAFE WITH CONDITIONS** (projection drops tasks/finance/plans/deliveries) → **consumed** |
| `GET /projects/:projectId/{requirements,plans,milestones,risks,team}` | JWT | any | **was none → fixed** | – | – | – | team includes full employees | none | real | – | **SAFE WITH CONDITIONS after fix**; not consumed (detail covers it) |
| `POST /projects/:projectId/{requirements,plans,milestones,risks}`, `team/propose`; `PATCH requirements/:id` | JWT | any | **fixed** | body not used for company | service: no actor | propose checks employee company | – | events | real | – | **not exposed** (read-only slice) |
| `POST /projects/plans/:id/approve`, `project-assignments/:id/activate` | JWT | **CHAIRMAN, MANAGEMENT (added)** | **fixed** | – | – | – | – | events | real | – | **not exposed** |
| `GET /delivery/projects` | JWT | class roles | `req.user.companyId` | – | – | – | `ClientProject` (separate model) | none | real | `?status` | **not used** (different model: client delivery pipeline) |
| `POST /delivery/process`, `projects/:id/{revision,approve,mark-paid}` | JWT | CHAIRMAN/MGMT | service gets companyId | – | – | – | – | **payments / delivery worker** | real | – | **not exposed** (side effects) |
| `POST /delivery/formal/:projectId/package`, `deliveries/:id/{accept,revise}` | JWT | CHAIRMAN, MGMT (+CLIENT, never issued) | **was none → fixed** | – | **was `req.user.id` → fixed** | – | – | records delivery | real | – | **not exposed** |
| `GET /delivery/samples/:id` | **Public** | – | none | – | – | – | sample HTML only (CSP sandbox) | none | real | – | **not exposed**; intentionally public client link |
| `POST /delivery/webhooks/razorpay` | Public (signature) | – | – | – | – | – | – | payments | real | – | **not exposed** |
| `/project` | – | – | – | – | – | – | – | – | **empty controller** | – | **BLOCKED** (nothing to expose) |
| Task routes (`/tasks/*`, `/employees/:id/tasks`) | – | – | company-bound (Slice 1) | – | – | – | – | – | real | **no company/project listing** | **TASKS = BLOCKED** |

## 4. Backend contracts consumed

`GET /chairman/projects` and `GET /chairman/projects/:id` only, through the BFF. Both need an explicit company (BFF 400 otherwise). `CHAIRMAN` only: other roles get 403, rendered as "Projects are available to the company Chairman only."

## 5. Response projections (`server/projections.ts`)

- **List** → `{id, name, description, type, status, startDate, targetEndDate, client:{name}|null, assignmentCount}`.
- **Detail** → base fields plus:
  - `milestones[] {id, name, sequence, dueAt, status}`
  - `risks[] {id, title, severity, status}`
  - `requirements[] {id, title, priority, status}`
  - `team[] {employeeId, name, role, allocation, status}`
- **Never forwarded:**
  - quotedPrice, expectedRevenue, realizedRevenue, estimatedCost, actualCost, acCost, margin, financialStatus
  - opportunityId, proposalId, companyId, clientId
  - plans, **tasks**, deliveries, revenueRecords, projectCosts
  - full employee rows (salary, identity seed)
- `null` detail → 404. Tests assert none of these values or keys reach the response or the rendered HTML.

## 6. Project list

- **Desktop:** table with caption and row/column headers.
  - Columns: Project (link), Client, Type, Start and Target end (lg+), Status.
- **Mobile:** cards with name, client · type, status, target end.
- **Not shown:** the backend has no owner, department, progress, health or budget field, so none is displayed.
- Status uses the real `ProjectStatus` enum via the shared `StatusBadge` tone map; text always visible, no health inferred.

## 7. Project detail

Name + status, description, client, type, start and target end dates ("Not set" when null). Then Team (links to the Slice 3 employee detail), Milestones (sorted by sequence), Requirements, Risks (backend `severity` value labelled as such). Each section has explicit empty text. Footer: "Tasks, deliveries and financial figures are not shown". Foreign, missing or malformed id → Not found + "Back to projects".

## 8. Filters / search

URL state: `q` (project or client name), `status`, `type`. Options come only from returned values, with an "N of M projects" live region. The backend has **no** filter, sort or pagination parameters and **no cap** on project count (one per won deal, unlike `MAX_HEADCOUNT` for employees). Filtering runs over the complete list the backend already returns, with a `ponytail:` note to move server-side as lists grow. The filter form is hidden when there are no projects.

## 9. Mutation disposition

All project mutations remain **unexposed**. They're now company-bound, but none has a V14 confirmation and error design, and several emit events or touch payments. The UI has no action buttons.

## 10. Task disposition

**TASKS = BLOCKED.**
- No company-wide or project-scoped task listing endpoint exists.
- `chairman/projects/:id` includes up to 50 tasks, but the projection drops them.
- No task route is in the BFF allowlist (tested: `chairman/projects/:id/tasks`, `tasks/:id`, `employees/:id/tasks` → 404).
- The Tasks domain stays `blocked`, and no task counts or progress are shown.

## 11. Company-isolation verification

- **Backend (live API, fixture Chairman token):**
  - `/projects/<missing>/requirements|team` → **404** (previously an empty 200)
  - `/chairman/projects` own company → `[]`
  - foreign `X-Company-Id` → **403**
  - `/chairman/projects/<missing>` → 404
- **BFF (live, in the signed-in browser):**
  - own company → 200 `[]`
  - foreign company → 403
  - no company → 400
  - missing project → 404
  - `projects/<id>/team`, `chairman/projects/<id>/tasks`, `tasks/<id>` → 404 (not allowlisted)
- **UI:**
  - foreign company URL → "You do not have access to this company."
  - missing project → Not found
  - malformed id `..%2Fx` → 404 page
- Body `companyId` and referenced ids can't redirect: tests send body `companyId: 'A'` against foreign ids → 404, service never reached.

## 12. Security verification

`apps/web/src` (excluding tests): `access_token` only in the server login route. No localStorage, sessionStorage or `document.cookie`. No UUIDs or hardcoded project ids. No V15 or spatial code. The financial terms appear only in explanatory comments. No fake projects: **the real database has 0 projects** (read-only count), and none were created.

## 13. Responsive verification (live)

| Viewport | Result |
|---|---|
| 375 px (light) | rail collapsed, empty-state card, no horizontal scroll |
| 768 px (dark) | rail kept, no overflow |
| 1440 px | rail + workspace; table columns adapt (dates at lg+) |

The table and card layouts with populated data are verified by render tests only, since there is no real data.

## 14. Accessibility (manual; no axe)

- **Fixed this slice:** `SystemState` rendered its title as an `h2`, so a section `h3` was followed by an `h2` (bad heading order; the same pattern existed in Slice 3 views). The title is now a styled `<p>` inside the `role=status`/`alert` box. Live heading order: `H1 company → H2 Projects → H3 Results`.
- Landmarks unchanged. Filters labelled with `role=search`. Live-region result count. Table semantics.
- The rail link opens Projects with Enter, and `aria-current` updates.
- Focus ring verified by keyboard in Slices 2–3; programmatic focus correctly shows no `:focus-visible`.
- Reduced motion: CSS override present (not emulable here).

## 15. Automated tests

| Check | Result |
|---|---|
| Frontend `npx vitest run` | **135/135** (+29 in `slice4.test.tsx`) |
| Frontend `npx tsc --noEmit` | pass |
| Frontend `npx eslint .` | pass |
| Frontend `npx next build` | pass |
| Backend `npx tsc --noEmit` | pass |
| Backend `npx jest` | **52/52 suites, 410/410** (+1 suite, +21 tests) |

## 16. Live browser verification (PostgreSQL + `aevora-api-safe` + `aevora-web`)

| # | Step | Result |
|---|---|---|
| 1 | Projects navigation | ✓ rail `aria-current=Projects`; Enter from rail |
| 2 | Real project list | ✓ **real empty state**: "No projects. The backend has no projects for this company." (DB has 0 projects) |
| 3 | Real project detail | ✓ not-found path only (no real project exists); populated detail covered by render tests |
| 4 | Foreign project manipulation | ✓ 404 (API and BFF) |
| 5 | Company URL manipulation | ✓ access state |
| 6 | Company header manipulation | ✓ 403 |
| 7 | Loading / error / empty | empty ✓ live; not-found ✓ live; loading transient; 403/5xx unit-tested |
| 8–10 | Desktop / tablet / mobile | ✓ |
| 11 | Keyboard | ✓ |
| 12 | Console | only intentional 403/400/404 probes (plus 503s and HMR WebSocket errors carried over from the stopped Slice 3 session in the same tab); no React or hydration errors; both server logs clean |

## 17. Remaining blockers / limitations

1. **TASKS = BLOCKED** (no listing endpoint).
2. No populated project exists, so the populated list/detail is verified by tests only. Projects appear once the business creates them; none were fabricated.
3. Projects are Chairman-only, because the only list endpoint is `chairman/projects`. Non-Chairman roles see the access state.
4. No server-side filter or pagination for projects.
5. Read-only; mutations need a V14 action design.
6. `GET /delivery/samples/:id` is public by design (sandboxed HTML for clients). Noted, not changed.

## 18. V14/V15 boundary

2D enterprise UI only. No spatial, 3D, WebXR, world-engine, simulation or `@aevora/shared` code (scan test + grep).

---

**Slice 4 classification: A — COMPLETE.** The real project journey was browser-tested against PostgreSQL. The database holds zero projects, and the real empty state is correctly implemented and verified, which the acceptance gate explicitly allows. Project authorization is resolved: two unscoped controllers were fixed and regression-tested. No unsafe route is exposed, and no data is fabricated.

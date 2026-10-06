# AEVORA V14 — Slice 9 Report: Continuous Improvement, Autonomous Operations, Reports

## 1. Objective
Expose only the improvement, operations and report data the backend already persists and can serve safely, read-only.

## 2. Starting commit
`3923e66`. No backend, schema, migration or data changes.

## 3. Continuous Improvement audit
- `continuous-improvement/*` (ContinuousImprovementController):
  - `GET company/:companyId/detect` computes improvement opportunities. It is a GET with analysis semantics, so it was not exposed.
  - `GET company/:companyId/proposals`, guarded by `assertCompanyAccess`.
  - `GET proposals/:id`, guarded by `assertResourceAccess('improvementProposal')`.
  - Mutations: `POST proposals`, `approve`, `reject`, `rollback` and `outcomes`.
- `chairman/research/improvement/*` mutates (scan, hypotheses, proposals).
- Data: ImprovementSignal, ImprovementProposal, ImprovementOutcome, Experiment, ExperimentPlan and ModelFeedback are all **0 for every company**.
- **Decision: no Improvement workspace.** The placeholder route and its navigation entry were removed; `/company/[id]/improvement` now returns 404.

## 4. Autonomous Operations audit
- `autonomous-enterprise/*` (JwtAuthGuard, `req.user.companyId`) covers objectives, operating cycles, escalations and decisions.
  - Its tables (AeEnterpriseObjective, AeOperatingCycle, AeEscalation, AeChairmanDecision, AeRecommendation, AeAuditEvent) are **0 for every company**. Not exposed.
- `operating-loop/*` (OperatingLoopController):
  - `GET :companyId/cycles` uses `assertCompanyAccess` and returns the latest 20.
  - `GET cycle/:id` uses `assertResourceAccess('operatingLoopCycle')`, so a foreign or missing id is a 404.
  - Mutations: `POST :companyId/cycle` (runs a full cycle), `cycle/:id/verdict`, `:companyId/scan-opportunities`, `error-pool/scan` and `error-pool/retry/:cycleId`.
  - Context, memory, performance and error-pool reads hold internal company memory and agent performance, so they were not exposed.
- OperatingLoopCycle has **45 rows for this company, 45 overall**, all `phase=COMPLETE` and `trigger=scheduled_business_loop`.
  - They are produced by `BusinessLoopService` through `OperatingLoopService.runFullCycle`.
  - The service is **rule-based**: there is no ModelGateway import in `operating-loop/`, and the options and recommendation come from fixed rules (lines 103–153).
- `chairman/operating-loop/*` stays blocked and is not bypassed.
- CeoAutonomousDecision, ManagementCycle and EscalationRecord are 0.
- **Decision:** a read-only Operations workspace (list plus by-id detail) over the operating-loop cycle reads.

## 5. Reports audit
- WeeklyReport: **0 for this company**, 1 overall.
  - It is model-generated (WeeklyReportService.generateAndSend uses ModelGateway). `GET ceo/weekly-reports` carries revenue in paise.
  - The CEO feed (Slice 7) already includes weekly reports when they exist.
- `boardroom/*` (CHAIRMAN): meetings are not reports. `summary-file` serves files, and every mutation drives model turns.
- `groups/:id/report` belongs to Group, which is Slice 10.
- **Decision: no Reports workspace.** There is no persisted report data for this company. The OS-level `/reports` placeholder page and its navigation entry were removed.

## 6. Route classification (relevant subset)
| Method / route | Scope | Side effects | Class |
|---|---|---|---|
| GET operating-loop/:companyId/cycles | assertCompanyAccess(path) + BFF pathCompany==header | none | **SAFE WITH CONDITIONS**: only phase, trigger, verdict, timestamps, recommendation labels and dispatch state are projected |
| GET operating-loop/cycle/:id | assertResourceAccess | none | **SAFE WITH CONDITIONS**: same projection plus a company check in the BFF |
| GET operating-loop/:companyId/context, memory/search, performance, error-pool, pending-approvals; performance/agent/:employeeId | company/resource | none | Not exposed: internal memory and agent performance |
| POST operating-loop/:companyId/cycle, cycle/:id/verdict, scan-opportunities, error-pool/* | CHAIRMAN | DB mutation; may dispatch services | **UNSAFE**: blocked |
| GET continuous-improvement/company/:id/detect | company | computed analysis | Not exposed |
| GET continuous-improvement/company/:id/proposals, proposals/:id | company/resource | none | SAFE, but 0 rows: not exposed |
| POST continuous-improvement/* | CHAIRMAN/MGMT + resource | mutation | Blocked |
| GET/POST autonomous-enterprise/* | req.user.companyId | mutations on POST | 0 rows: not exposed |
| ceo/weekly-reports(/run) | company | /run calls a model and sends a report | Not exposed / **UNSAFE** |
| boardroom/* | CHAIRMAN | model turns, files | Blocked |

## 7. Tenant isolation
- **List:** the BFF requires `x-aevora-company`. It rejects a path company that differs from the header (400), and the backend asserts company access (403 for a foreign company).
- **Detail:** the backend's `assertResourceAccess` returns 404 for a foreign or missing id. The BFF projection also returns 404 if a returned row's `companyId` differs from the header.
- A malformed id fails the BFF id pattern: 404, with no backend call.
- The actor always comes from the JWT.
- Verified live:
  - foreign header: 403
  - mismatched path/header: 400
  - no header: 400
  - malformed id: 404
  - nonexistent UUID: 404

## 8. Real database counts (selected company / all), read-only transaction
- **Improvement:** ImprovementSignal 0/0 · ImprovementProposal 0/0 · ImprovementOutcome –/0 · Experiment –/0 · ExperimentPlan 0/0 · ModelFeedback 0/0
- **Operations:** **OperatingLoopCycle 45/45** · AeEnterpriseObjective 0/0 · AeOperatingCycle 0/0 · AeEscalation 0/0 · AeChairmanDecision 0/0 · AeRecommendation 0/0 · AeAuditEvent 0/0 · CeoAutonomousDecision 0/0 · ManagementCycle 0/0 · EscalationRecord 0/0
- **Reports:** WeeklyReport 0/1 · boardroom Meeting 5 (this company; these are meetings, not reports)

No data was created.

## 9. Background-job audit
The API starts about 18 timers or crons regardless of the frontend:
- **Business loop** (`simulation/business-loop.service.ts`, every `BUSINESS_LOOP_INTERVAL_MS`): writes OperatingLoopCycle rows, runs lead generation and pipeline follow-ups.
- **CEO autonomous review**: calls the model.
- **TaskOrchestrator** (5 s) and **EnterpriseOrchestrator** (`@Cron` every minute).
- **JobWorker** (5 s poll).
- **Payroll** (hourly) and **month-end** (hourly): these mutate the DB.
- **Chairman mail poll** (120 s).
- **Assistant scheduled tasks** (5 min).
- **Boardroom tick**, **cafeteria** (10 min), **idle codegen** (5 min).
- **Sales-outreach cycle**, **compute scheduler/heartbeat**, **ITL error pool** (300 s).
- **Company autonomy** (3 s), **simulation engine** (1 s), **world-state replay maintenance**.

`scripts/safe-local.env` sets:
- `AEVORA_SAFE_MODE=true`: no egress except local Ollama and Chairman mail.
- `OUTREACH_ENVIRONMENT=SANDBOX` and `ENABLE_REAL_PRODUCTION_SENDING=false`.
- `LEAD_GEN_PROVIDER_ENABLED=false`, `INBOX_ENABLED=false`, `SALES_AUTO_PROCESS=false`, `AGENT_WORK_CYCLES=false`.

**Running the API still writes to the database through these loops**; the OperatingLoopCycle rows themselves were written by earlier API runs. During this verification:
- CEO autonomous review attempted model calls, all failing with Ollama 404 and falling back.
- TaskOrchestrator and EnterpriseOrchestrator ticked.
- No outreach log lines appeared besides route mapping.
- OperatingLoopCycle stayed at **45 before and after**.

None of this activity is caused by the Operations page, which only issues GETs. I stopped the servers after verification.

## 10. Side-effect audit
The Operations page performs two GETs (list and detail), both plain `findMany`/`findUniqueOrThrow` reads. Every mutation, model and dispatch route above returns 404 at the BFF without a backend call; 27 paths are regression-tested.

## 11. Safe capabilities selected
- Operations: operating-loop cycles, list and detail, read-only.
- Improvement: none (no data).
- Reports: none (no data for the company).

## 12. Frontend implementation
- `components/operations-views.tsx`:
  - `OperationsWorkspace` (list)
  - `CycleDetail` (`/company/[id]/operations/[id]`)
  - loading, empty, error, forbidden and not-found states via the shared components
  - progressive disclosure: the list shows the summary, the detail shows the recorded labels
- There are no buttons.
- Registry: `operations` is now `ready`. The `improvement` and `reports` entries and their pages were removed. Slice 10 entries are untouched.

## 13. BFF projections
`operatingCycle` and `operatingCycles` keep:
- id, phase, trigger, chairmanVerdict, startedAt, completedAt
- `failed`: a boolean derived from whether `error` is present; the error text is not sent
- recommendation `{title, impact, effort, risk}`
- execution `{action, dispatched, result}`

They drop observations, analysis, options, measurements (including the `healthScore` placeholder), lessons, the execution `service`, the error text and companyId.

## 14. Provenance
- The trigger is shown as "Scheduled business loop (system)" or "Started by the Chairman". The page states that cycles come from a rule-based loop, not a model.
- Recommendation values are shown as "labels, as recorded", not scores.
- An execution with `dispatched=false` is shown as "Not dispatched (…recorded result…)", never as executed.
- The Chairman verdict shows "None recorded" when null.

## 15. Tests
- Vitest: **10 files, 318 tests passed**. The new `slice9.test.tsx` covers:
  - projection stripping, and the foreign-company detail 404
  - missing header, path/header mismatch, malformed id, nonexistent id
  - X-Company-Id forwarding, 401/403 preservation
  - 27 blocked routes
  - provenance and states, and the registry
- `slice6.test.tsx` was updated: `operating-loop/A/cycles` is now intentionally open, and its blocked-route example became `operating-loop/A/cycle`, the run route.
- Backend Jest: **53 suites, 428 tests passed** (no backend change).
- tsc, eslint and next build: clean.

## 16. Live verification (real PostgreSQL, fixture Chairman)
- The list shows 20 real cycles. Each reads "Continue current operations · Scheduled business loop (system) · Not dispatched (no matching dispatcher)".
- The detail page renders the real record.
- The payload keys are exactly the projection; no observations, analysis, lessons, measurements, companyId, error or service.
- Isolation results are as in §7.
- Blocked routes (`operating-loop/:id/cycle`, `continuous-improvement/…/proposals`, `autonomous-enterprise/decisions`, `ceo/weekly-reports`) return 404.
- Console errors came only from the deliberate negative probes and dev HMR.

## 17. Responsive / accessibility
- Mobile (375px): no horizontal overflow. I fixed a cramped row (the title column now has a minimum width, so the badge and time wrap below it).
- Desktop was checked; tablet uses the same fluid layout.
- Keyboard: a focused cycle link opens the detail page with Enter.
- The detail page uses `DetailList` (dl/dt/dd).

## 18. Known non-blocking issues
1. The backend's background loops write to the DB and attempt model calls whenever the API runs, even in safe mode. They are not caused by the UI.
2. The operating loop only ever records "Continue current operations / no matching dispatcher". The data is truthful but not very informative.
3. The cycle list is capped at 20 (the backend default; the BFF does not forward query strings).
4. Improvement and Reports stay absent until real data exists.

## 19. Explicit Slice 10 exclusions
Assistant, Realtime, Notifications, Administration, the AI worker roster and Group were not touched; the `group`, `assistant` and `admin` OS entries are unchanged.

## 20. V15 boundary verification
A grep of the changed files for 3D, spatial, avatar, walking, world engine and Chairman office found nothing.

## 21. Final acceptance
**A — COMPLETE** for the implemented scope: Operations, read-only. Continuous Improvement and Reports were deliberately not implemented because there is no data for this company; they were removed from navigation rather than left as placeholders.

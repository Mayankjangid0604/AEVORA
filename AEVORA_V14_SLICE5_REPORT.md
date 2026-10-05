# AEVORA V14 — SLICE 5 REPORT: INTELLIGENCE

**Date:** 2026-10-06 · **Base:** `031c943` · **Classification:** see the end

## 1. Objective

A read-only Intelligence workspace answering "what does AEVORA currently know about this company?", using only existing backend intelligence capabilities. No new engine, no model invocation, no fabricated insight.

## 2. Intelligence backend audit

| Controller | Routes | Persistence / computation | External / LLM |
|---|---|---|---|
| `IntelligenceController` (`/intelligence`) | `GET sessions/:id`, `GET company/:companyId/proposals`, `GET company/:companyId/assistance-requests` | Prisma reads of `IntelligenceSession` (+assessments, evidence, plans, proposals), `DecisionProposal` (+options, reviews), `AssistanceRequest` | none on these routes |
| `CompanyIntelligenceController` (`/company-intelligence`) | `GET company/:companyId`, `GET group/:groupId` (CHAIRMAN) | **computed on request** from `CompanyStateService.collectState` + `SalesPipelineService.getPipelineMetrics`, both **read-only** (no create/update/upsert/fetch) | none |
| `FoundationIntelligenceController` (`/foundation-intelligence`) | 24 routes: datasets, training jobs, checkpoints, model versions, evaluations, analytics, audit | company from JWT; by-id `companyId !==` → 404 (verified for datasets, models, jobs) | model training lifecycle (mutations) |
| `ResearchController` (`/chairman/research/inference`) | inference | runs a local model (Slice 1 closure: company-bound) | **local model execution** |
| `ChairmanController` knowledge | `knowledge`, `knowledge/:id`, `provenance`, `validate`, `archive` | company-bound (404 for foreign since closure) | none |
| `v12-assistant`, `assistant/*` | — | — | LLM, **not intelligence data** (V15 / assistant scope) |

The intelligence services under `intelligence/services/` (assessment, planning, risk detection, decision proposal) are invoked by agents, not by these HTTP routes.

**Data reality (read-only `SELECT count(*)`):** for this company, `IntelligenceSession`, `DecisionProposal`, `AssistanceRequest`, `IntelligenceAssessment` and `KnowledgeRecord` are all **empty**. The only intelligence content with data is the computed company summary. Nothing was created.

## 3. Route disposition matrix

A auth · B role · C company · D resource · E list scoping · F companyId · G actor · H referenced entities · I sensitive fields · J side effects · K LLM · L placeholder · M filters · N read/mutate.

| Route | A | B | C/D/E | F | I | J/K | L | M | N | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|
| `GET /intelligence/sessions/:id` | JWT | any | `findFirst {id, companyId: req.user.companyId ?? '__none__'}` → 404 (closure fix, **re-verified**) | token | employeeId, taskId, raw JSON risks/uncertainties/assumptions/options, evidence, plan steps | none | no | – | read | **SAFE WITH CONDITIONS** (projection) → consumed |
| `GET /intelligence/company/:companyId/proposals` | JWT | any | `req.user.companyId !== companyId → 403` | path, ParseUUIDPipe | employeeId, reviewerId | none | no | none (no pagination) | read | **SAFE WITH CONDITIONS** (path = header; projection) → consumed |
| `GET /intelligence/company/:companyId/assistance-requests` | JWT | any | as above | path | requester/target ids, taskId | none | no | none | read | **SAFE WITH CONDITIONS** → consumed |
| `GET /company-intelligence/company/:companyId` | JWT | any | `!req.user.companyId \|\| ≠ → 403` (closure fail-closed, **re-verified**) | path | finance metrics (units unverified), **hard-coded `confidence: 0.95`**, boilerplate uncertainty/limitations | none; read-only aggregation | **partially** (confidence) | `?question/period` echoed only | read | **SAFE WITH CONDITIONS** (projection drops confidence/boilerplate/finance) → consumed |
| `GET /company-intelligence/group/:groupId` | JWT | CHAIRMAN | group `chairmanId` | – | group-wide aggregates | none | partially | – | read | **not consumed** (group scope, later slice) |
| `/foundation-intelligence/*` (24) | JWT | none | company from token, by-id 404 | token | model metadata | **training lifecycle mutations** | no | `?status/family` | mostly mutate | **not exposed** (ML ops, not company intelligence) |
| `POST /chairman/research/inference` | JWT | research roles | company-bound | body deploymentId | — | **local model run** | no | – | effect | **not exposed** (would invoke a model) |
| `chairman/knowledge*` | JWT | CHAIRMAN | company-bound | – | full content, metadata JSON | validate/archive mutate | no | keyword/type | both | **not consumed** (0 records; candidate for a later slice) |

## 4. Security findings / fixes

- **Re-verified (live API + tests), no new defect:**
  - `intelligence/sessions/:id`: nonexistent → 404; malformed → 400 (ParseUUIDPipe); foreign company header → 403 (guard); a foreign session is indistinguishable from a missing one (Slice 1 closure regression test still passing).
  - `company-intelligence/company/:id`: own → 200; foreign path → 403; foreign header → 403; company-less caller → 403 (closure test).
- **BFF hardening (new):** the three path-company routes are refused with **400 "Company context mismatch"** when the path company differs from the explicit company header, before any backend call. The backend already enforces this; the BFF check is defence in depth.
- **Fabricated backend value contained:** `CompanyIntelligenceService` hard-codes `confidence: 0.95` and generic uncertainty/limitation text. These are **never forwarded** (projection plus test). Backend behaviour is unchanged; it's not an authorization defect.
- **Frontend bug found by tests:** `Intl.DateTimeFormat` rejects `dateStyle`/`timeStyle` combined with `timeZoneName`, which would have crashed the module at load. Fixed before it shipped.

No backend code changed in this slice.

## 5. Backend contracts consumed (via BFF; all require explicit company)

`GET /company-intelligence/company/:companyId` · `GET /intelligence/company/:companyId/proposals` · `GET /intelligence/company/:companyId/assistance-requests` · `GET /intelligence/sessions/:id`.

## 6. Response projections (`server/projections.ts`)

- **Summary:**
  - `generatedAt`
  - `metrics` (only Workforce/Projects counts)
  - `facts{statement, source}`
  - `risks`/`opportunities{title, count}`
  - `trends{title, description}`
  - `missingData[]`
  - `sources{name, asOf}` from `sourceFreshness`

  Dropped: `confidence`, `uncertainty`, `limitations`, finance metrics, `companyId`, `scope`, `supportingSources`, raw `provenance`.
- **Proposal:**
  - `id, title, problem, recommendation, rationale`
  - `confidence, impactLevel` (backend strings, verbatim)
  - `status, createdAt, sessionId`
  - `proposerId` (= `employeeId`, same company)
  - `options{id, title, description, estimatedEffort, estimatedImpact, score}`
  - `reviews{id, result, feedback, createdAt}`

  Dropped: reviewer ids, companyId, any unknown fields (e.g. prompts or raw model output, if ever added).
- **Assistance request:** `id, question, reason, urgency, status, createdAt`. Requester and target ids dropped.
- **Session:** `id, objective, status, createdAt, updatedAt, assessments{id, summary, recommendation, createdAt}, proposals{id, title, status}`. Dropped: employeeId, taskId, projectId, raw JSON assessment fields, evidence, plans and steps.

## 7. Intelligence overview (`/company/[companyId]/intelligence`)

- **Company summary:**
  - Headline: "Computed by AEVORA from current company records at <timestamp, IST>. No model was run."
  - Count tiles; Facts (with source); Risks / Opportunities / Trends, each with honest empty copy; Missing data (when reported).
  - Collapsible **Sources** with as-of timestamps.
- **Decision proposals** and **Assistance requests:** lists or honest empty states.

## 8. Intelligence detail

- `/intelligence/proposals/[id]`:
  - Data: resolved from the company-scoped list, since there is no by-id proposal endpoint. A foreign or missing id → Not found.
  - Content: impact and confidence labelled "(as recorded)", "Raised by" (resolved via the company workforce list, linked), problem / recommendation / rationale, options (score "as recorded"), reviews, and a session link.
- `/intelligence/sessions/[id]`:
  - Content: objective, timestamps, assessments (summary visible; recommendation behind `<details>`, so progressive disclosure), and proposals from the session.
  - Missing, foreign or malformed (backend 400) → Not found.

## 9. Filters / search

None. The backend offers no filter or pagination on these lists, and live data is empty. No query semantics invented.

## 10. Provenance

- **Shown:** the summary's own `generatedAt` and per-source `sourceFreshness` timestamps; fact `source`; the proposal's raising employee (explicit `employeeId`); assessment and review timestamps.
- **Not shown:** "AI-generated" labels, model names or confidence derived from prose. Worker type isn't shown for proposers (no worker profiles exist; the Slice 3 rule applies).
- **Timestamps:** absolute, in the viewer's timezone with the zone named (e.g. "6 Oct 2026, 4:21 am IST"); never relative.

## 11. External-provider behaviour

Every consumed route is a database read or read-only aggregation. The API log during the live journey shows **no model-gateway (Ollama) activity**. Inference, assistant, research-run, training and group routes are blocked at the BFF (tested). The UI has no "run", "generate", "ask" or "refresh" buttons.

## 12. Company isolation (live)

| Probe | Result |
|---|---|
| Summary without company | 400 |
| Path foreign + header own | 400 mismatch |
| Path foreign + header foreign | 403 (guard) |
| Proposals for a foreign path | 400 mismatch |
| Session missing | 404 |
| Session malformed | 400 → UI Not found |
| Session with foreign header | 403 |
| `company-intelligence/group`, `foundation-intelligence/datasets`, `chairman/research/inference` | 404 (not allowlisted) |
| Foreign company URL | "You do not have access to this company." |
| Missing proposal / session pages | Not found + "Back to intelligence" |

## 13. Responsive behaviour (live)

- **1440 px (dark):** two-column facts/risks grid; proposals and assistance side by side.
- **768 px (dark):** rail kept, no overflow.
- **375 px (light):** single column, tiles 2-up, no horizontal scroll.

## 14. Accessibility (manual; no axe)

- **Heading order verified live:** H1 company → H2 Intelligence / panels → H3 Facts, Risks, Opportunities, Trends. The summary subsections had been `h4` directly under `h2`; fixed before commit.
- Lists are semantic `ul`/`ol`; timestamps are `<time datetime>`.
- The `<details>` "Sources" disclosure opens with Enter.
- Status text sits inside badges; "as recorded" labels give context for backend values.
- Rail `aria-current=Intelligence`. Reduced motion: CSS override present.

## 15. Automated tests

| Check | Result |
|---|---|
| Frontend `npx vitest run` | **6 files, 172/172** (+37 in `slice5.test.tsx`) |
| `npx tsc --noEmit` / `npx eslint .` / `npx next build` | pass / pass / pass |
| Backend `npx jest` | **52/52 suites, 410/410** (unchanged; no backend changes) |

## 16. Live browser verification (PostgreSQL + `aevora-api-safe` + `aevora-web`)

| # | Step | Result |
|---|---|---|
| 1 | Navigation | ✓ rail current = Intelligence |
| 2 | Real intelligence data | ✓ computed summary matches the live API: 4 employees, 0 active projects, fact "Company has 4 employees across 6 departments.", no risks/opportunities/trends, 2 sources with IST timestamps; the browser payload keys exclude `confidence` |
| 3 | Real empty states | ✓ proposals and assistance requests (0 rows in DB) |
| 4 | Details | ✓ not-found paths (no real sessions or proposals exist) |
| 5–8 | Manipulation (company URL, foreign records, header, malformed) | ✓ (§12) |
| 9–11 | Desktop / tablet / mobile | ✓ |
| 12 | Keyboard | ✓ |
| 13 | Console | only intentional probe 4xx and HMR WebSocket errors from the earlier stopped dev server; no React/hydration errors; server logs clean; no model activity |

## 17. Security scan (`apps/web/src`, excluding tests)

`access_token`: only the server login route. Not found anywhere:
- localStorage / sessionStorage / `document.cookie`
- UUIDs / intelligence ids
- prompts, raw model fields, provider keys
- V15 / spatial / WebXR / world-engine

The only "secret" mentions are comments stating files hold none. Tests use synthetic fixtures and assert leak patterns are absent from projections and rendered HTML.

## 18. Remaining blockers / limitations

1. No persisted intelligence exists yet (sessions, proposals, assistance, knowledge = 0), so populated detail views are verified by render tests only.
2. No by-id proposal endpoint; detail is resolved from the company list (fine at current volume; no backend pagination).
3. Knowledge records and group-level intelligence are not yet surfaced (candidates for a later slice).
4. The backend's hard-coded `confidence: 0.95` remains in the raw API (not forwarded). Correcting it is a backend product decision.

## 19. Tasks disposition

**TASKS = BLOCKED.** No task data, counts, boards or links in Intelligence. `taskId` fields are dropped by the projection, and task routes stay off the allowlist.

## 20. V14/V15 boundary

2D enterprise UI only. No spatial, 3D, WebXR, world-engine, `v12-assistant` or `@aevora/shared` usage (scan test + grep).

---

**Slice 5 classification: A — COMPLETE.**
- Intelligence authorization is resolved: the earlier fixes were re-verified live, and the BFF now also enforces path = header.
- The real journey was browser-tested against PostgreSQL.
- No fake data was used.
- No external provider or model was triggered.
- Sensitive and fabricated fields are filtered server-side.
- No V15 leakage.

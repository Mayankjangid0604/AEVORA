# AEVORA V14 — Slice 7 Report: AI CEO, Decisions, Attention

Base: `141e60e`. Status: **COMPLETE (read-only)**. No backend, schema, migration or data changes.

## 1. Backend audit (classification)

| Route | Kind | Scope | Classification |
|---|---|---|---|
| GET /ceo/feed | read; built from CeoReview (with logged CEO actions) + last 4 WeeklyReport | req.user.companyId (JWT guard resolves X-Company-Id) | **SAFE**: exposed |
| GET /ceo/questions | read (CeoQuestion, take 50) | companyId | **SAFE WITH CONDITIONS**: `context` JSON is dropped |
| GET /chairman/decisions | read (ManagementDecision + proposer/target) | CHAIRMAN + getCompanyForChairman | **SAFE WITH CONDITIONS**: `payload` and `approvedBy` dropped |
| GET /chairman/alerts | read (OperationalAlert) | CHAIRMAN + company | **SAFE WITH CONDITIONS**: `relatedEntityId` dropped |
| GET /ceo/reviews, /ceo/weekly-reports | read | companyId | Not exposed: carries `balancePaise` / revenue in paise; the feed already covers this content |
| GET /ceo/operating-state | read, but includes evaluations and succession plans with full employee rows | companyId | Not exposed (employee row leak risk) |
| GET /ceo/autonomous-decisions | read | companyId | Not exposed: 0 rows; would need its own projection |
| POST /ceo/ask, /ceo/reviews/run, /ceo/weekly-reports/run | **model call** | CHAIRMAN | **UNSAFE** for this slice: blocked |
| POST /ceo/autonomous-decisions/:id/execute or /approve, /ceo/questions/:id/answer, /ceo/delegate, /ceo/priorities | mutation | CHAIRMAN | Blocked (not needed for read-only) |
| POST /ceo/notify-test | **real email** | CHAIRMAN | **UNSAFE**: blocked |
| POST /chairman/decisions/:id/approve or /reject, /chairman/alerts/:id/read or /resolve | mutation | CHAIRMAN + company | Blocked (not needed for read-only) |
| /autonomous-enterprise/decisions, /escalations | read/mutation | company | Not exposed (0 rows; separate engine) |

Before this slice, the BFF passed `chairman/alerts` and `chairman/decisions` through with no projection, so `payload` and `approvedBy` reached the browser. Both are now projected and filtered to the company.

## 2. Real DB counts (own company / all), read-only queries
CeoQuestion 3/10 (3 OPEN) · CeoReview 2/14 · ManagementDecision 1/7 (APPROVED) · WeeklyReport 0/1 · OperationalAlert 0/0.
Empty: AeChairmanDecision, AeEscalation, CeoAutonomousDecision, DecisionProposal, ExecutiveDecision, Notification, ChairmanAlert, EscalationRecord.
No data was created.

## 3. Frontend
- `/company/[id]/ceo`: the CEO record (feed) plus questions to the Chairman.
  - Each feed item is tagged "AI CEO", and its outcome is shown verbatim as "recorded outcome: X". Nothing is shown as executed unless the backend recorded it.
  - A Chairman answer is labelled "Chairman's answer (human)".
- `/company/[id]/decisions`: ManagementDecision rows newest first.
  - Status is shown verbatim, with no scores.
  - The proposer is shown as "employee X". AI or human status is not inferred.
  - There are no approve/reject controls.
- `/company/[id]/attention`:
  - operational alerts, labelled "system alert"
  - OPEN AI CEO questions
  - no activity events
- `[id]` decision detail was skipped: the list already shows every projected field, and there's no by-id endpoint.
- Navigation: AI CEO, Decisions and Attention are now `ready` company domains. The OS-level `/decisions` and `/attention` placeholder pages were removed (they now return 404, and nothing links to them).
- New BFF rules: `ceo/feed`, `ceo/questions`; projections `alerts`, `decisions`, `ceoFeed`, `ceoQuestions`.

## 4. Verification
- Vitest: 8 files, 235 tests passed (new `slice7.test.tsx`, which covers projections, BFF company requirement and blocked mutations/model routes, rendering, states and the registry).
- tsc, eslint and next build: clean. Backend unchanged, so Jest was not re-run.
- Live, as the fixture Chairman:
  - CEO page shows 4 real feed items and 3 OPEN questions.
  - Decisions shows the 1 real APPROVED decision.
  - Attention shows "No alerts" plus the 3 open questions.
  - The foreign company is denied.
  - BFF responses contain no `companyId`, `context`, `payload`, `approvedBy` or `balancePaise`.
  - `ceo/ask` and `chairman/decisions/x/approve` return 404 from the BFF.

## 5. Non-blocking issues
- CEO feed items carry no companyId, so isolation relies on the backend scoping by the forwarded X-Company-Id (same as Slice 3).
- The decision proposer's AI/human provenance isn't joined to WorkerProfile.
- CEO budgets, strategy and autonomous decisions are not surfaced (empty tables or financial data).

## 6. V15 boundary
No Slice 8–10 domains were touched. No AI engine, decision engine or notification engine was added.

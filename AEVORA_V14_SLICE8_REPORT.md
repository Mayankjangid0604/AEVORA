# AEVORA V14 — Slice 8 Report: Research, Marketing, Sales

## 1. Objective
Expose only the Research, Marketing and Sales data the backend already persists and can safely serve, read-only, through the BFF.

## 2. Starting commit
`30ec582` (Slice 7). There are no backend, schema, migration or data changes.

## 3. Research audit
- `chairman/research/*` (ResearchController) is the **ML research lab**: proposals, projects, experiments, datasets, models, evaluations and deployments.
  - `POST inference` runs a model. `POST improvement/*` runs analysis.
- `research/*` (ResearchExecutionController) is market research execution:
  - `POST /` creates a research record; `POST :id/start` runs it (model/network).
  - The GET routes are **by-id only, with no list endpoint**: `:id`, `:id/executions`, `:id/sources`, `:id/findings`.
- `marketing/research` and `marketing/personas` are company-scoped reads.
- Every research table is empty for **all** companies:
  - ResearchProposal, ResearchProject, ResearchExecution, ResearchSource, ResearchFinding, ResearchSynthesis, ResearchResult: 0.
- **Decision: no Research workspace.**
  - There is no data, and the by-id-only contract can't be browsed without a list.
  - The placeholder route and its navigation entry were removed; `/company/[id]/research` now returns 404.

## 4. Marketing audit
- `marketing/*` (MarketingController, JwtAuthGuard only) covers brand, personas, strategies, campaigns, content, calendar and analytics, all on `req.user.companyId`.
  - Every one of those tables is **0 rows for all companies** (BrandProfile, MarketingStrategy, MarketingCampaign, MarketingContent, ContentCalendarEntry, MarketingAnalytics).
  - `content/:id/publish` is an external publication. `analytics/optimization` and `content/:id/brand-check` are computed or model output.
- `marketing-content/*` (CHAIRMAN, `req.user.companyId`) has real data: **ContentPost 14 / 28** and ContentCalendar 2 / 4.
  - `GET posts` reads the latest 50 for the company.
  - `posts/generate`, `calendars/generate` and `pixel/run` call a **model** (Ollama via ModelGateway).
  - `posts/:id/approve` and `posts/:id/posted` are status mutations.
  - `whatsapp/broadcast` is **external messaging**.
- Provenance is verified from code: ContentPost rows are created in only two places, `generatePost` and `generateWeeklyCalendar`, and both persist model output. So every post is labelled "AI-generated (PIXEL)".
  - "POSTED" is a manual status the Chairman marks; AEVORA does not post anything.
- **Decision:** a read-only Marketing workspace over `GET marketing-content/posts`.

## 5. Sales audit
- `sales/*` (CHAIRMAN) covers leads, accounts, opportunities, activities, qualification, pipeline and the chairman queue.
  - `GET sales/leads` is **unbounded** (1,669 rows for the company) and returns full contact data. It is not exposed.
  - Opportunity, SalesActivity, QualificationRecord, OpportunityScore and Client are all 0 rows.
  - `pipeline/recommendations` is computed and was not exposed.
- `lead-gen/*` (JWT or integration key, `req.user.companyId`):
  - `GET runs` returns the latest 50 runs; `GET leads` the latest 200 leads that have a Google Place id.
  - `POST trigger` (CHAIRMAN) calls the **external Places provider**.
- `outreach/*` (two controllers):
  - `drafts/:id/approve` **sends email**.
  - `process` sends queued outreach.
  - `whatsapp/:leadId` **sends WhatsApp**.
  - `inbound/poll-email` **reads the mailbox**.
  - `campaigns/:id/outcome` and `discovery-calls/:id/transcript` are mutations.
  - All of these stay blocked.
- `inbox/*` (CHAIRMAN): `check` reads mail, and `messages/:id/reply` **sends email**. It holds third-party message bodies (InboundMessage: 3 for this company), so it stays blocked.
- `client-meeting/*`: see §17.1.
- **Decision:** a read-only Sales workspace over `GET lead-gen/runs` and `GET lead-gen/leads`.

## 6. Route classification (exposed and notable)
| Method / route | Scope / actor | Side effects | Class |
|---|---|---|---|
| GET marketing-content/posts | CHAIRMAN, req.user.companyId | none | **SAFE WITH CONDITIONS**: `imagePrompt` (raw prompt) and `createdByEmployeeId` stripped |
| GET lead-gen/runs | authenticated member, companyId | none | **SAFE WITH CONDITIONS**: `error` text stripped |
| GET lead-gen/leads | authenticated member, companyId | none | **SAFE WITH CONDITIONS**: contactName/Role/Email/Phone, notes, metadata, website, googlePlaceId, qualityScore and assignedToId stripped |
| GET sales/leads, sales/leads/:id | CHAIRMAN, companyId | none | Not exposed: unbounded, full contact data |
| GET marketing/* | member, companyId | none | Not exposed: all tables empty |
| GET research/:id(/…) | member, companyId | none | Not exposed: no list, no data |
| POST marketing-content/posts/generate, calendars/generate, pixel/run | CHAIRMAN | model call | **UNSAFE**: blocked |
| POST marketing-content/whatsapp/broadcast, marketing/content/:id/publish | CHAIRMAN / member | external messaging or publication | **UNSAFE**: blocked |
| POST lead-gen/trigger | CHAIRMAN | external provider | **UNSAFE**: blocked |
| POST outreach/drafts/:id/approve, outreach/process, outreach/whatsapp/:leadId, inbox/messages/:id/reply | CHAIRMAN/MGMT | email / WhatsApp | **UNSAFE**: blocked |
| POST research, research/:id/start, chairman/research/inference | member | model / network | **UNSAFE**: blocked |
| client-meeting/* | body `companyId` | email to client | **BLOCKED** (backend defect, §17.1) |
| All other sales/marketing/research POST/PUT | various | internal mutations | Blocked (read-only slice) |

## 7. Tenant isolation
- Every exposed route takes its company from `req.user.companyId`. The JWT guard resolves it from `X-Company-Id` after the membership check, and the actor comes from the token.
- The BFF requires an explicit company and forwards it.
- Each projection also drops any row whose `companyId` differs from the selected company (defence in depth).
- None of the exposed routes take an object id, so there are no by-id lookups to verify.
- Verified live:
  - foreign company header: **403**
  - missing header: **400**
  - foreign company page: access denied
  - any id-suffixed variant (e.g. `lead-gen/leads/l1`): 404 at the BFF with no backend call

## 8. Real database counts (selected company / all), read-only transaction
- **Research:** ResearchProposal 0/0 · ResearchProject 0/0 · ResearchExecution –/0 · ResearchSource –/0 · ResearchFinding –/0 · ResearchSynthesis –/0 · ResearchResult 0/0
- **Marketing:** BrandProfile 0/0 · BrandGuideline 0/0 · MarketingStrategy 0/0 · MarketingCampaign 0/0 · MarketingContent 0/0 · ContentCalendarEntry 0/0 · MarketingAnalytics 0/0 · **ContentPost 14/28** · ContentCalendar 2/4
- **Sales:** **SalesLead 1669/2462** · **LeadGenRun 45/103** · OutreachCampaign 0/399 · OutreachScript 1/8 · OutreachDraft 0/0 · OutreachResponse 0/0 · DiscoveryCall 0/1 · InboundMessage 3/7 · Opportunity 0/0 · SalesActivity 0/0 · QualificationRecord 0/0 · OpportunityScore 0/0 · Client 0/0 · ClientContact –/0 · ClientMeeting 0/0

"–" means the table has no companyId column. No data was created.

## 9. Side-effect audit
Every mutation listed in §6 is unreachable from the browser; the BFF returns 404 without calling the backend, and this is regression-tested for 30 paths. The exposed routes are plain `findMany` reads.

Separately, the live API log showed the backend's **own background loops** running while the API was up:
- a scheduled pipeline lead follow-up for the *foreign* company, refused by the outreach rate limiter
- CEO autonomous model calls, which failed because the Ollama model returned 404

The safe-local env sets `OUTREACH_ENVIRONMENT=SANDBOX` and `ENABLE_REAL_PRODUCTION_SENDING=false`, so no real send is possible. These loops were not triggered by any Slice 8 request, and I stopped the servers after verification.

## 10. Safe capabilities selected
- Marketing: content posts (read-only).
- Sales: lead-generation runs and leads (read-only, business fields only).
- Research: none.

## 11. Frontend implementation
- `components/growth-views.tsx`:
  - `MarketingWorkspace`: post list with progressive disclosure (the caption is a `<details>`).
  - `SalesWorkspace`: runs table plus a lead list with a status filter built from the returned values.
- Pages `/company/[id]/marketing` and `/company/[id]/sales`. The `research` page and its registry entry were removed.
- Loading, empty, error and forbidden states use the shared components. There are no buttons or mutations.

## 12. BFF projections
`contentPosts`, `leadGenRuns` and `salesLeads` in `server/projections.ts`. The fields they keep and drop are listed in §6.

## 13. Provenance
- Posts are labelled "AI-generated (PIXEL)" (verified from code). A posted time reads "Marked as posted by the Chairman".
- Leads are described as found "from external business listings".
- A lead with no `lastContactedAt` shows "no contact recorded", and the page states that a lead record does not mean the business was contacted.
- Statuses are shown verbatim. No scores, conversion rates or KPIs are shown; `qualityScore` is not forwarded.

## 14. Tests
- Frontend Vitest: **9 files, 277 tests passed**. The new `slice8.test.tsx` covers:
  - projection stripping and foreign-row dropping
  - missing company header
  - X-Company-Id forwarding
  - preservation of backend 401/403
  - 30 blocked mutation, side-effect and model routes
  - provenance rendering, and loading/empty/error/forbidden states
  - the registry
- Backend Jest: **53 suites, 428 tests passed** (unchanged code).
- `tsc`, `eslint` and `next build`: clean.

## 15. Live verification (real PostgreSQL, fixture Chairman)
- Marketing: 14 posts, matching the DB count of 14.
- Sales: 45 runs, matching the DB count of 45, plus 200 leads (the backend's cap; 1,669 in the DB).
- Payload keys are exactly the projected fields. No `@`, contact fields, `imagePrompt`, `qualityScore`, `companyId`, `googlePlaceId`, notes or error text appears.
- Foreign header returns 403, missing header 400, and blocked routes 404.
- Console errors came only from the deliberate negative probes and dev HMR.

## 16. Responsive / accessibility
- Mobile (375px): no horizontal overflow; `scrollWidth` equals the viewport.
- The runs table uses `th scope`. The status filter is a labelled native `<select>`. Captions use native `<details>`, so they are keyboard-operable.
- Desktop was checked; tablet uses the same fluid layout.

## 17. Known non-blocking issues
1. **`client-meeting/*` takes `companyId` from the request body**, not from the token. Any authenticated user could address another company's meetings. It is not exposed through the BFF; fixing it needs a backend change and is recommended before any exposure.
2. The background business loops run in the safe environment (see §9). They are sandboxed, but they are noisy and make model calls.
3. Leads are capped at 200 by the backend, with no pagination contract.
4. Research is absent until data exists and a list contract is added.

## 18. Explicit Slice 9/10 exclusions
Group, Continuous Improvement, Autonomous Operations, Reports, Assistant, Realtime and Administration were not touched.

## 19. V15 boundary verification
The changed files contain no 3D, spatial, world, avatar or HQ code.

## 20. Final acceptance
**A — COMPLETE** for the implemented scope: Marketing (read-only) and Sales (read-only). Research was deliberately not implemented: there is no data and no list contract.

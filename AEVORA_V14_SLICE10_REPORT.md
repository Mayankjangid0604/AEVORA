# AEVORA V14 — Slice 10 Report (final V14 slice)

## 1. Objective
Close V14 with the following, read-only and backed by verified contracts only:
- Assistant
- Realtime and notifications
- Group navigation
- Administration overview
- AI worker roster
- Automated E2E and accessibility verification

## 2. Starting commit
`08116b6`. No backend, schema, migration or data changes.

## 3. Assistant audit
- `assistant/*` (AssistantController, CHAIRMAN, `req.user.companyId`):
  - `POST message` → `AssistantService.processMessage`: **model call**, plus intent execution (it creates tasks, triggers outreach and meetings, and writes records). **UNSAFE**, blocked.
  - `POST voice/transcribe`: audio to a provider. **UNSAFE**, blocked.
  - `GET messages` → `assistantMessage.findMany({companyId}, take 20)`: **SAFE WITH CONDITIONS**. The `intent`/`result` JSON (parsed intents and execution output) is dropped.
  - `GET pc-tasks`: PC automation queue (0 rows). Not exposed.
- `v12-assistant/*` (V15 spatial) and `voice/*` call models. Blocked.
- A genuine read-only history exists: AssistantMessage has **11 rows for this company at audit time, 54 overall**. Background loops add "Executive Briefing" system messages.
- **Decision:** a read-only Assistant history. Interactive sending is **not** exposed: it runs a model and acts on the company, and the V14 contract does not approve that.

## 4. Realtime / notifications audit
- **Socket.IO** (`devices/realtime.gateway.ts`) now verifies a JWT in the handshake (`auth.token` or the Authorization header). Using it from the browser would require exposing the JWT to page script, which contradicts the V14 rule that the JWT is never in the browser. No BFF socket proxy or stream-token path is built.
  - **Realtime transport remains EXPLICITLY DEFERRED** (requirements 24 and 45). It is not polled or simulated.
- **Notification** model: **0 rows** (`chairman/communication/notifications`). Not exposed.
- **ChairmanMail** (`chairman-mail/*`, CHAIRMAN, `req.user.companyId`): these are the system notices AEVORA raises for the Chairman. **10 for this company, all 10 unread; 27 overall.**
  - `GET /` uses an explicit safe `select`: no body, data or email ids.
  - `GET unread-count` returns a real count.
  - **`GET :id` marks the notice read** (a GET with a side effect), so it is **not exposed**.
  - `POST :id/reply` runs the Assistant and may email; `close` and `check-replies` mutate or poll mail. All blocked.
- **Decision:** a Notifications page over authenticated HTTP (list plus real unread count). It does not update live, and the page says so.

## 5. Group audit
- `groups/*` (CHAIRMAN):
  - `GET /` → `listGroups(req.user.actorId)`.
  - `GET :id` uses `assertGroupOwnership`: foreign or missing returns 403/404.
  - `GET :id/report` builds a computed report. Not exposed, because that would be a new report surface.
  - POST/PATCH mutate.
- AevoraGroup: **0 rows overall**.
- The existing `/group/[groupId]` page (Slice 1) was unreachable.
- **Implemented:** a conditional "Groups" section on the Companies page, built only from `GET /groups`. It is hidden when the list is empty or the request is refused. With 0 groups it renders nothing; no group was fabricated.

## 6. Administration audit
Candidate sources:
- `model-platform/*`: provider and model configuration
- `compute/*`
- `chairman/kill-switch`
- `capability`
- raw `ceo/operating-state`

These carry provider names, keys, configuration or control toggles, so none is exposed. Roles: 0 for this company.

**Implemented:** a read-only overview built only from contracts already verified in earlier slices:
- department and employee counts from the projected `organization/*` reads
- the workspace availability registry

There are no settings and no inputs.

## 7. AI worker audit
- WorkerProfile: **0 for this company**, 4 overall. Provenance badges already use it (Slice 3).
- `GET /agents` (`agent.findMany({employee: {companyId: req.user.companyId}})`): Agent records bound to employees. 10 overall; 3 for this company (live).
  - `configuration` (provider, model, systemInstructions) and `budget` are dropped.
  - `agents/:id`, `:id/executions` (AgentExecution: 232 for this company) and `:id/run` / `work-cycle` / `schedule-work-cycles` (agent execution) stay blocked.
- **Implemented:** the AI worker roster. It joins Agent rows (status, autonomy level, created) to the projected employee list (name, role) and links to the workforce detail.

## 8. Route classification (Slice 10)
| Route | Scope | Effect | Class |
|---|---|---|---|
| GET assistant/messages | CHAIRMAN, req.user.companyId | read | **SAFE WITH CONDITIONS** (intent/result stripped; BFF company filter) |
| POST assistant/message, assistant/voice/transcribe, v12-assistant/*, voice/* | CHAIRMAN | model + actions | **UNSAFE**: blocked |
| GET chairman-mail, chairman-mail/unread-count | CHAIRMAN, companyId | read | **SAFE** (projected) |
| GET chairman-mail/:id | CHAIRMAN, companyId | **marks read** | **UNSAFE** for a read-only UI: blocked |
| POST chairman-mail/:id/reply, close, check-replies | CHAIRMAN | Assistant / mail | **UNSAFE**: blocked |
| GET chairman/communication/notifications | CHAIRMAN | read (0 rows) | not exposed |
| GET agents | member, companyId via employee | read | **SAFE WITH CONDITIONS** (configuration and budget stripped) |
| GET agents/:id, /executions; POST agents/:id/run, work-cycle, schedule-work-cycles | assertAgentAccess / CHAIRMAN | execution payloads / agent runs | blocked |
| GET groups (server-side, Companies page) | CHAIRMAN, actorId | read | SAFE (names and ids only rendered) |
| GET groups/:id/report, model-platform/*, compute/*, kill-switch | various | computed / config / control | blocked |
| Socket.IO gateway | JWT handshake | push | **DEFERRED** (would require the JWT in the browser) |

## 9. Tenant isolation
- All new BFF routes require `x-aevora-company`, which becomes `X-Company-Id`, which becomes `req.user.companyId` after the backend membership check. The actor comes from the JWT.
- AssistantMessage is also filtered by `companyId` in the projection. ChairmanMail and Agent rows carry no companyId, so their isolation is backend-enforced.
- Verified by the live E2E for every read: foreign company **403**, missing header **400**, mismatched path/header **400**, malformed id **404** (no backend call), nonexistent id **404**.

## 10. Real database counts (selected company / all), read-only
- **Assistant:** AssistantMessage 11/54 · PcTask 0/0
- **Notifications:** Notification 0/0 · ChairmanMail 10/27 (unread 10) · ChairmanMailMessage –/12
- **Groups:** AevoraGroup –/0 · Company –/2
- **Administration:** Department 6/12 · Employee 4/11 · Role 0/35
- **AI workers:** WorkerProfile 0/4 · Agent –/10 (3 live for this company) · AgentExecution 232/336

No data was created.

## 11. Side-effect audit
- The new pages issue only GETs: `assistant/messages`, `chairman-mail`, `chairman-mail/unread-count`, `agents`, and `organization/*`.
- The notice detail endpoint (which marks mail read) is unreachable. Unread ChairmanMail stayed at **10 before and after** every verification run.
- 20 Slice 10 side-effect, model and execution paths are regression-tested as BFF 404 with no backend call. Live E2E confirms the 9 most dangerous.

## 12. Background-job audit
Database snapshots were taken before the first API start and after the last stop:

| Table | Before | After |
|---|---|---|
| AssistantMessage | 54 | 54 |
| ChairmanMail | 27 | 27 |
| unread mail (this company) | 10 | 10 |
| Notification | 0 | 0 |
| **OperatingLoopCycle** | **45** | **48** |
| AgentExecution | 336 | 336 |
| LeadGenRun | 103 | 103 |
| ContentPost | 28 | 28 |
| CeoReview | 15 | 15 |

- The +3 operating-loop cycles were written by the scheduled business loop (`BusinessLoopService`); no UI route can create them.
- The API log shows the CEO autonomous review attempting the model every minute (Ollama 404, fallback), plus TaskOrchestrator and EnterpriseOrchestrator ticks.
- There were no outreach, mail-send or lead-generation provider calls (safe-local: `AEVORA_SAFE_MODE`, sandbox outreach, provider disabled).
- The servers were stopped after verification.

## 13. Implemented frontend
- `/company/[id]/assistant`: message history. Sender provenance: "Chairman (human)", "Assistant (AI-generated)", "AI CEO", "System". The page notes that replies are model output, not verified fact.
- `/company/[id]/notifications`: real unread count (`aria-live`), notices with an unread marker (screen-reader text "Unread:"), ref, category and status. The page states it does not update live.
- `/company/[id]/workers`: agent roster table (caption, `th scope`).
- `/company/[id]/administration`: record counts and the workspace registry.
- Companies page: a conditional Groups entry.
- Removed:
  - the OS-level `/assistant` and `/admin` placeholders
  - the `DomainWorkspace` placeholder component and `findDomain`, now unused
  - the "Operating system" nav section, hidden when empty
- **Every navigation entry is now a built page.**
- **Heading fix (accessibility):** workspace panels were `h2` siblings of the workspace `h2` title. `Panel` now defaults to `h3`; Chairman Home keeps `h2`, directly under the company `h1`.
- **Mobile fix:** the roster date column no longer wraps character by character.

## 14. BFF projections
- `assistantMessages`: id, from, to, content, status, createdAt.
- `chairmanMail`: id, ref, event, category, title, status, read (boolean), createdAt, messageCount.
- `unreadCount`: `{count}`.
- `agents`: id, employeeId, status, autonomyLevel, createdAt.
- **Slice 7 leak found and fixed:** a persisted CEO feed `detail` contained a raw Prisma error, including the server file path and a source excerpt with `configuration: { systemInstructions: … }`. `ceoFeed` now replaces any detail or title matching internal-error patterns with "An internal error was recorded for this action (details are not shown)." It is regression-tested, including benign text that must be kept.

## 15. Provenance
- Assistant messages: labelled by sender as the backend records it.
- Notices: "system notice".
- Agents: "agent record … as recorded".
- No worker is labelled AI or human beyond the Agent record's existence and WorkerProfile.

## 16. Automated E2E (new)
- **Vitest live HTTP suite** (`src/test/e2e.live.test.ts`, opt-in via `E2E_*` env), 7 tests:
  - unauthenticated redirect and BFF 401
  - httpOnly, SameSite=Strict cookie with no token in the response body
  - every navigation entry returns 200
  - removed placeholders return 404
  - own-company reads contain no sensitive fields
  - foreign 403, missing 400, mismatched 400
  - malformed/nonexistent ids fail closed (the malformed company page streams Next's 404 boundary, `NEXT_HTTP_ERROR_FALLBACK;404`)
  - side-effect routes return 404
  - **Result: 7/7 pass.**
- **Playwright browser suite** (`e2e/company-os.spec.ts`, installed system Chrome via `channel: 'chrome'`; no browser download), 12 tests:
  - UI login
  - no token in `document.cookie`, localStorage or sessionStorage
  - click-through of every nav link (no dead or placeholder pages)
  - axe with **colour contrast** in dark **and** light mode on the Slice 9–10 pages
  - heading hierarchy
  - keyboard Tab focus reaches interactive controls with a visible focus indicator
  - desktop 1440, tablet 768 and mobile 375 with no horizontal overflow
  - foreign-company forbidden state and malformed-id not-found
  - no action controls on the Slice 10 pages, and a real unread count
  - **Result: 12/12 pass, three consecutive runs.** Two early failures were a test race against dev-mode route streaming; `settled()` now waits for the route `role=status` to clear. This was not an app defect.
- `npm run test:e2e` runs both suites.

## 17. Accessibility
- **axe-core in Vitest/jsdom** (`src/test/a11y.test.tsx`): 13 workspaces with data, 6 loading states, and the heading-hierarchy check. 0 violations.
- Contrast is measured in real Chrome (Playwright) in both themes: 0 violations.
- Manual checks: keyboard Enter on links, a labelled `select`, `details`/`summary`, table semantics, and the skip link present.

## 18. Browser verification (real PostgreSQL, fixture Chairman, in-app browser and Playwright)
- Assistant: the recorded history renders.
- Notifications: "10 unread", 10 notices.
- Workers: Alice/CEO, Bob/CTO and Charlie/Project Manager, all ACTIVE and CONTROLLED.
- Administration: 6 departments, 4 employees, 4 active.
- Light and dark, tablet and mobile: verified with screenshots.
- The console showed only deliberate negative probes and dev HMR.

## 19. Full regression
- Vitest: **12 files, 375 passed** (+7 live E2E, skipped unless configured).
- Backend Jest: **53 suites, 428 passed** (no backend change).
- Playwright: **12/12**.
- `tsc`, `eslint` (src, e2e, config) and `next build`: clean.
- Dev dependencies added to `apps/web`: `jsdom`, `axe-core`, `@playwright/test`.

## 20. V15 boundary
A grep of the changed and new files for three.js, spatial, avatar, walking, world engine and Chairman office found nothing. `v12-assistant/*` (spatial) stays blocked.

## 21. Original 45-requirement final matrix
| # | Requirement | Status | Evidence / justification |
|---|---|---|---|
| 1 | Login | COMPLETE | S1/S2; E2E login |
| 2 | Company selection/context | COMPLETE | S2; E2E isolation |
| 3 | Company OS shell | COMPLETE | S2; nav click-through |
| 4 | Chairman Home | COMPLETE | S2 |
| 5 | Group | COMPLETE (real empty) | `/group/:id` (assertGroupOwnership) plus a conditional entry on Companies; 0 groups exist, so nothing is shown. Group report not built (would be a new report surface) |
| 6 | Companies | COMPLETE | S2 |
| 7 | Departments | COMPLETE | S3 |
| 8 | Workforce | COMPLETE | S3 |
| 9 | AI CEO | COMPLETE (read-only) | S7; feed error-leak fixed in S10 |
| 10 | AI workers + provenance | COMPLETE (read-only) | S3 provenance + S10 roster |
| 11 | Projects | COMPLETE | S4 |
| 12 | Tasks | COMPLETE (within backend capability) | S6 |
| 13 | Research | EXPLICITLY DEFERRED | S8: every research table is 0 and there is no list contract; the placeholder was removed |
| 14 | Marketing | COMPLETE (read-only) | S8: content posts; campaign tables are 0 |
| 15 | Sales | COMPLETE (read-only) | S8: runs and leads, contacts stripped, no outreach |
| 16 | Intelligence | COMPLETE | S5 |
| 17 | Continuous Improvement | EXPLICITLY DEFERRED | S9: all CI tables 0; placeholder removed |
| 18 | Autonomous Operations | COMPLETE (read-only) | S9: operating-loop cycles; AE tables 0 |
| 19 | Attention | COMPLETE | S7 |
| 20 | Decisions | COMPLETE (read-only) | S7; approve/reject needs a mutation design (deferred) |
| 21 | Reports | EXPLICITLY DEFERRED | S9: no persisted report data for the company; generation calls a model; placeholder removed |
| 22 | Assistant | COMPLETE (read-only history) | S10; interactive sending deferred (model + actions) |
| 23 | Notifications | COMPLETE (HTTP) | S10 ChairmanMail list plus a real unread count |
| 24 | Realtime state | EXPLICITLY DEFERRED | S10: the socket requires the JWT in the browser (forbidden); no SSE proxy built; not faked |
| 25 | Administration | COMPLETE (read-only overview) | S10 |
| 26 | Hierarchy navigation | COMPLETE | Group entry (S10), Company → Org → Project → Task → Operations (S9) |
| 27 | Next.js App Router | COMPLETE | |
| 28 | BFF session, JWT never in browser | COMPLETE | E2E: cookie flags, no token in JS or storage |
| 29 | One API client + typed queries | COMPLETE | no new client |
| 30 | Company context authoritative | COMPLETE | E2E 403/400 |
| 31 | Authorization UX | COMPLETE | E2E forbidden/not-found |
| 32 | UI states | COMPLETE | unit tests per slice |
| 33 | Dark + light | COMPLETE | Playwright axe in both themes |
| 34 | Motion + reduced motion | COMPLETE | S2 |
| 35 | Accessibility (WCAG 2.2 AA target) | COMPLETE | axe (jsdom + real Chrome incl. contrast), heading fix |
| 36 | Responsive | COMPLETE | Playwright at 1440/768/375 |
| 37 | Command entry | COMPLETE | S2 |
| 38 | Provenance never inferred | COMPLETE | S3–S10 |
| 39 | No fake data / contracts | COMPLETE | |
| 40 | Testing architecture incl. E2E | COMPLETE | Vitest + live HTTP E2E + Playwright browser E2E + axe |
| 41 | Backend tenant isolation | COMPLETE | Jest 428 |
| 42 | V14/V15 separation | COMPLETE | §20 |
| 43 | Session primitives | COMPLETE | |
| 44 | Session refresh/revocation | EXPLICITLY DEFERRED | no backend refresh exists; not invented |
| 45 | Socket.IO auth vs httpOnly | EXPLICITLY DEFERRED | see #24 |

**Totals: 39 COMPLETE, 6 EXPLICITLY DEFERRED (13, 17, 21, 24, 44, 45), 0 partial, 0 not implemented, 0 blocked.**

## 22. Remaining issues (non-blocking)
1. **`client-meeting/*` (backend) takes `companyId` from the request body.** It is not exposed, but it needs a backend fix before any use.
2. The backend's background loops write to the DB and attempt model calls whenever the API runs, even in safe mode.
3. Data caps follow backend defaults: assistant 20, leads 200, cycles 20, notices 100. The BFF does not forward query strings.
4. Research, Continuous Improvement and Reports return only when real data and contracts exist.
5. Realtime needs an SSE/stream-token proxy design before it can be enabled.
6. In Next dev streaming, a malformed company URL renders the 404 boundary with HTTP 200.

## 23. Final V14 status
**A — V14 COMPLETE.**
- Every one of the 45 requirements is implemented, or explicitly justified as unavailable for lack of backend data or contract, or deferred by an earlier security decision.
- Security, real-data, E2E, accessibility, unit, backend, typecheck, lint, build and browser checks all pass.
- There is no V15 contamination.

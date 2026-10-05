# AEVORA V13 — FRONTEND AUDIT

Version: V13
Purpose: Frontend removal / backend preservation / clean architectural baseline
Audit status: COMPLETE — AUDIT PHASE ONLY
Deletion status: NONE PERFORMED
V14/V15 status: NOT STARTED

## 1. Baseline

Repository: Mayankjangid0604/AEVORA
Default branch observed: main
Observed V12-associated baseline commit: d909e6d335b33fcd492f7e909899ff4611305648

The repository is an npm/Turbo monorepo with workspaces:
- apps/web
- apps/api
- packages/*

Root build/test/dev/lint/database tooling is not frontend-only and must be preserved unless later proven otherwise.

## 2. Existing frontend architecture

Primary frontend: apps/web

Technology confirmed:
- Next.js 14
- React 18
- React DOM
- TypeScript
- React Three Fiber
- Three.js
- @react-three/drei
- Socket.IO client
- Phosphor icons

The web application contains the current App Router pages, application shell, authentication UI, API client, realtime UI, business dashboards, V12 world renderer, replay presentation, navigation presentation, and frontend styling/configuration.

Confirmed shell:
- apps/web/app/layout.tsx
- apps/web/app/components/GameShell.tsx
- apps/web/app/components/OfficeOS.tsx
- apps/web/app/components/AuthGate.tsx

Classification: FRONTEND ONLY — REMOVE during implementation.

## 3. Frontend routes identified

Confirmed representative routes include:
- apps/web/app/world/page.tsx
- apps/web/app/overview/page.tsx
- apps/web/app/chairman/page.tsx
- apps/web/app/ceo/page.tsx
- apps/web/app/employees/page.tsx
- apps/web/app/employees/[id]/page.tsx
- apps/web/app/departments/page.tsx
- apps/web/app/company-intelligence/page.tsx
- apps/web/app/group-intelligence/page.tsx
- apps/web/app/improvement/page.tsx
- apps/web/app/research/page.tsx
- apps/web/app/research/models/page.tsx
- apps/web/app/research/improvement/page.tsx
- apps/web/app/marketing/page.tsx
- apps/web/app/sales/page.tsx
- apps/web/app/financials/page.tsx
- apps/web/app/management/page.tsx
- apps/web/app/strategy/page.tsx
- apps/web/app/workforce/page.tsx
- apps/web/app/global-operations/page.tsx
- apps/web/app/business-units/page.tsx
- apps/web/app/capital-allocation/page.tsx
- apps/web/app/product-factory/page.tsx
- apps/web/app/lab/page.tsx
- apps/web/app/foundation-intelligence/page.tsx
- apps/web/app/rd-flywheel/page.tsx
- apps/web/app/autonomous-enterprise/page.tsx
- apps/web/app/customer-operations/page.tsx
- apps/web/app/communication/page.tsx
- apps/web/app/knowledge/page.tsx
- apps/web/app/ideas/page.tsx
- apps/web/app/browser-ai/page.tsx
- apps/web/app/chairman-mail/page.tsx
- apps/web/app/projects/page.tsx
- apps/web/app/projects/[id]/page.tsx
- apps/web/app/simulation/page.tsx
- apps/web/app/replay/page.tsx
- apps/web/app/activity/page.tsx
- apps/web/app/alerts/page.tsx
- apps/web/app/decisions/page.tsx
- apps/web/app/inbox/page.tsx
- apps/web/app/notes/page.tsx
- apps/web/app/diary/page.tsx
- apps/web/app/minutes/page.tsx
- apps/web/app/delivery/page.tsx
- apps/web/app/ventures/page.tsx
- apps/web/app/survival/page.tsx
- apps/web/app/acquisition/page.tsx
- apps/web/app/model-platform/page.tsx
- apps/web/app/boardroom/page.tsx
- apps/web/app/assistant/page.tsx
- apps/web/app/os/page.tsx

These are presentation routes and are deletion candidates after the final reference scan.

## 4. Frontend components and utilities

Confirmed frontend-only areas include:
- apps/web/app/components/*
- apps/web/app/lib/api.ts
- apps/web/app/lib/officeLink.ts
- apps/web/components/ui/*
- apps/web/app/globals.css
- apps/web/next.config.js
- apps/web/tsconfig.json
- apps/web/.eslintrc.json
- apps/web/next-env.d.ts

apps/web/app/lib/api.ts is a frontend API adapter. It is NOT the backend API and can be removed with the old frontend.

## 5. V12 frontend boundary

Confirmed V12 visual implementation:
- apps/web/app/world/page.tsx
- apps/web/components/v12-world/WorldViewer.tsx
- apps/web/components/v12-world/WorldRenderer.tsx
- apps/web/components/v12-world/EntityMesh.tsx
- apps/web/components/v12-world/DigitalHuman.tsx
- apps/web/components/v12-world/DigitalVehicle.tsx
- apps/web/components/v12-world/DynamicCamera.tsx
- apps/web/components/v12-world/NavigationOverlay.tsx
- apps/web/components/v12-world/UIOverlay.tsx
- apps/web/components/v12-world/ReplayTimeline.tsx
- apps/web/components/v12-world/HistoricalInspector.tsx
- apps/web/components/v12-world/ExecutiveVoice.tsx
- apps/web/components/v12-world/worldContext.ts
- apps/web/components/v12-world/replay.module.css
- apps/web/components/v12-poc/V12RendererAdapter.tsx

V12 completion reports explicitly describe these as the Next.js/React Three Fiber presentation layer.

Classification: FRONTEND ONLY — REMOVE.

## 6. Frontend-only package candidates

apps/web/package.json identifies:
- @react-three/drei
- @react-three/fiber
- @types/three
- three
- next
- react
- react-dom
- @phosphor-icons/react
- socket.io-client

Repository search during this audit found Three.js and React Three Fiber usage in apps/web. These are candidates for removal from the web workspace after the frontend is deleted.

Do not blindly uninstall anything. Every dependency must receive a repository-wide usage scan before removal.

## 7. V12 backend — MUST PRESERVE

Confirmed backend modules:
- apps/api/src/world-state-gateway/
- apps/api/src/v12-spatial/

World-State Gateway includes:
- WorldStateGatewayService
- WorldStateEventService
- WorldStateEventTranslationService
- WorldStateReplayService
- ReplaySessionService
- WorldStateGatewayController
- Prisma integration

V12 Spatial includes:
- V12SpatialService
- V12NavigationService
- V12CommandAdapter
- V12AssistantAdapter
- V12CommandController
- V12AssistantController
- authorization integration
- employee/department/communication integration
- Prisma integration

apps/api/src/app.module.ts explicitly registers WorldStateGatewayModule and V12SpatialModule.

Classification: V12 BACKEND/SPATIAL — PRESERVE.

## 8. Shared V12 infrastructure — MUST PRESERVE

packages/shared/src/index.ts exports the V12 package.

Confirmed shared V12 contracts:
- packages/shared/src/v12/world-state.ts
- packages/shared/src/v12/events.ts
- packages/shared/src/v12/consumer/index.ts
- WorldStateConsumer
- WorldStateReplayEngine
- world-state reducer
- spatial entities
- transforms
- navigation topology
- movement state
- replay contracts
- event envelopes

The V12 shared consumer is renderer-agnostic. It does not require Three.js or React.

Classification: SHARED — PRESERVE.

## 9. V12 spatial systems to preserve

Preserve:
- world-state gateway
- world-state snapshots
- spatial state
- world-state event translation
- spatial events
- SSE world-state streaming
- company-scoped sequence management
- replay/history
- replay sessions
- navigation topology
- navigation nodes
- pathfinding
- movement state
- person spatial state
- vehicle spatial state
- company isolation
- spatial authorization
- V12 command boundary
- V12 assistant boundary
- spatial persistence
- world-state shared contracts

V13 removes the renderer, not these systems.

## 10. Database preservation plan

Database package: packages/database
Provider: PostgreSQL through Prisma.

The Prisma schema contains authoritative enterprise relationships for Chairman, groups, companies, departments, roles, employees, tasks, projects, intelligence, improvement, research, marketing, orchestration/autonomy, finance, workforce, strategy, world-engine systems, and world/spatial events.

Hard V13 rules:
- DO NOT reset the database.
- DO NOT recreate the database.
- DO NOT delete historical migrations.
- DO NOT delete business data.
- DO NOT remove models merely because the frontend consumed them.
- Preserve models required by backend and world-state systems.

Default V13 decision: preserve the database schema intact.

## 11. API preservation plan

apps/api is a NestJS backend containing modules for:
- company
- group
- department
- employee
- role
- authorization
- Chairman
- CEO
- assistant
- intelligence
- research
- marketing
- continuous improvement
- automation orchestration
- world engine
- world-state gateway
- V12 spatial
- communication
- knowledge
- finance
- sales
- management
- strategy
- workforce
- model platform
- production
- integrations
- and other V1–V12 capabilities

Classification: BACKEND — PRESERVE.

## 12. Authentication and authorization

Backend authorization is under apps/api/src/authorization/.

Confirmed:
- JwtModule
- JwtAuthGuard
- RolesGuard
- AuthorizationService
- AuthService
- AuthController
- global APP_GUARD registration

V12 world-state controllers also enforce authentication/company scope.

Classification: BACKEND — PRESERVE.

Frontend AuthGate may be deleted later; backend security must remain independent.

## 13. Security impact

Frontend removal must not weaken:
- authentication
- authorization
- company isolation
- Chairman authority
- CEO authority
- employee access
- department access
- assistant actions
- spatial company isolation
- V12 command authorization

Security must be verified directly against the backend after deletion.

## 14. Model Gateway

apps/api depends on @aevora/model-gateway.

Classification: BACKEND — PRESERVE.

It must not be removed because the frontend disappears.

## 15. Tests

Preserve:
- backend unit tests
- backend integration tests
- API tests
- database tests
- authorization/security tests
- company-isolation tests
- V1–V12 regression tests
- intelligence tests
- improvement tests
- orchestration tests
- V12 spatial tests
- world-state gateway tests
- navigation tests
- replay/history tests
- shared package tests

Review/remove only tests that exclusively exercise deleted Next.js/React UI or rendering.

Do not delete a test merely because it mentions V12.

## 16. V14 foundation

V13 must leave intact:
- backend API
- database
- authentication
- authorization
- company isolation
- Chairman
- CEO
- employees/departments
- intelligence
- improvement
- research
- marketing
- autonomous orchestration
- V12 spatial backend
- world-state APIs
- navigation
- realtime world-state transport
- shared contracts

V14 will create the replacement frontend from scratch.

DO NOT create V14 UI during V13.

## 17. V15 foundation

V15 will consume:
- spatial state
- company locations
- buildings
- floors
- rooms
- workspaces
- people
- vehicles
- navigation
- pathfinding
- movement state
- world-state events
- realtime SSE
- replay/history
- authorization
- company isolation

DO NOT create a new 3D model or renderer during V13.

## 18. Exact deletion plan

Phase A — this audit:
- Audit only.
- No deletion.

Phase B — implementation:
1. Remove old apps/web frontend.
2. Remove frontend-only configuration.
3. Remove frontend-only tests.
4. Remove frontend-only assets.
5. Audit and remove frontend-only dependencies.
6. Preserve backend/shared/spatial infrastructure.
7. Search for broken imports.
8. Search for deleted frontend references.
9. Search for obsolete dependencies.
10. Format/type-check/build.
11. Run backend/shared tests.
12. Run database verification.
13. Run security/company-isolation tests.
14. Run V12 spatial/world-state tests.
15. Verify API starts independently.
16. Verify health, authentication, authorization, Chairman, CEO, employees, departments, intelligence, improvement, research, marketing, orchestration, world-state, navigation, and realtime endpoints.

Phase C — final report:
- Create AEVORA_V13_FINAL_FRONTEND_REMOVAL_REPORT.md

## 19. Decision matrix

| Area | Classification | V13 decision |
|---|---|---|
| apps/web | FRONTEND ONLY | REMOVE |
| Next.js routes | FRONTEND ONLY | REMOVE |
| React UI | FRONTEND ONLY | REMOVE |
| OfficeOS/GameShell | FRONTEND ONLY | REMOVE |
| Frontend API client | FRONTEND ONLY | REMOVE |
| Frontend CSS/assets | FRONTEND ONLY | REMOVE |
| Three.js/R3F renderer | FRONTEND ONLY | REMOVE |
| V12 visual overlays | FRONTEND ONLY | REMOVE |
| V12 backend | V12 BACKEND/SPATIAL | PRESERVE |
| World-State Gateway | V12 BACKEND/SPATIAL | PRESERVE |
| V12 navigation | V12 BACKEND/SPATIAL | PRESERVE |
| V12 replay/history | V12 BACKEND/SPATIAL | PRESERVE |
| V12 SSE | V12 BACKEND/SPATIAL | PRESERVE |
| V12 shared contracts | SHARED | PRESERVE |
| WorldStateConsumer | SHARED | PRESERVE |
| API | BACKEND | PRESERVE |
| Authentication | BACKEND | PRESERVE |
| Authorization | BACKEND | PRESERVE |
| Company isolation | BACKEND | PRESERVE |
| Chairman/CEO | BACKEND | PRESERVE |
| Employees/departments | BACKEND | PRESERVE |
| Research/Marketing | BACKEND | PRESERVE |
| Intelligence/Improvement | BACKEND | PRESERVE |
| Autonomous orchestration | BACKEND | PRESERVE |
| Model Gateway | BACKEND | PRESERVE |
| Prisma/database | BACKEND | PRESERVE |
| Database migrations | BACKEND | PRESERVE |
| Backend/V12 tests | TEST | PRESERVE |
| Frontend-only tests | TEST | REVIEW/REMOVE |
| Root tooling | TOOLING | REVIEW |
| Unknown files | UNKNOWN | DO NOT DELETE |

## 20. Unknowns requiring final verification

Do not delete without a final repository-wide reference scan:
- root-level configuration
- scripts outside apps/web
- packages shared by API and web
- database models
- migrations
- shared types
- V12 backend files
- world-state event infrastructure
- navigation/pathfinding infrastructure
- realtime transport
- authentication/authorization code
- tests outside the web application
- package-lock entries

Classification rule: UNKNOWN → DO NOT DELETE.

## 21. Audit conclusion

The V13 deletion boundary is established.

REMOVE: the old frontend presentation layer, including the existing Next.js/React application and its Three.js/V12 renderer.

PRESERVE: backend, API, database, shared package, Model Gateway, authentication, authorization, company isolation, intelligence, improvement, research, marketing, autonomous orchestration, and V12 world-state/spatial backend infrastructure.

DO NOT START: V14 frontend, V15 3D model, backend rewrite, new UI, placeholder UI, or new 3D renderer.

CURRENT V13 STATE: AUDIT COMPLETE / NO DELETIONS PERFORMED / READY FOR CONTROLLED FRONTEND REMOVAL IMPLEMENTATION
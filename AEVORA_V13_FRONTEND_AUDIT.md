# AEVORA V13 — FRONTEND ERADICATION AUDIT & GOVERNING BOUNDARY

**Date:** 2026-10-05  
**Objective:** Complete eradication of the old AEVORA frontend (`apps/web`), old visual 3D renderers, browser-only tests, and all associated frontend entropy while strictly preserving all backend systems, database models/migrations, shared contracts, and V12 spatial/world-state infrastructure.

---

## 1. Executive Summary & Boundary

The V13 boundary strictly delineates:
- **PRESENTATION (Target for Eradication):** The Next.js web application (`apps/web`), React components, hooks, CSS, state, Three.js/R3F visual renderers (`WorldViewer`, `WorldRenderer`, `EntityMesh`, `DigitalHuman.tsx`, `DigitalVehicle.tsx`, `NavigationOverlay.tsx`, `UIOverlay.tsx`, `VRButton.tsx`, `ReplayTimeline.tsx`, etc.), browser e2e Playwright suites, and frontend-only build/docker configurations.
- **ENTERPRISE CAPABILITY & INFRASTRUCTURE (Explicitly Protected):** NestJS API (`apps/api`), Prisma database models and migrations (`packages/database`), shared contracts, models, and reducers (`packages/shared`, including `packages/shared/src/v12/**`), model gateway (`packages/model-gateway`), and all V12 spatial backend services (`apps/api/src/v12-spatial/**`, `apps/api/src/world-state-gateway/**`).

---

## 2. Inventory of Targets for Eradication

### A. Frontend Application Directory: `apps/web`
Complete eradication of `apps/web`, comprising:
- **Next.js App Router Structure:**
  - `apps/web/app/` (all routes: `acquisition`, `activity`, `alerts`, `assistant`, `autonomous-enterprise`, `boardroom`, `browser-ai`, `business-units`, `capital-allocation`, `ceo`, `chairman`, `chairman-mail`, `communication`, `company-intelligence`, `customer-operations`, `decisions`, `delivery`, `departments`, `diary`, `employees`, `financials`, `foundation-intelligence`, `global-operations`, `group-intelligence`, `ideas`, `improvement`, `inbox`, `knowledge`, `lab`, `management`, `marketing`, `minutes`, `model-platform`, `notes`, `os`, `overview`, `product-factory`, `projects`, `rd-flywheel`, `replay`, `research`, `sales`, `simulation`, `strategy`, `survival`, `ventures`, `workforce`, `world`)
  - `apps/web/app/components/` (all React UI: `AuthGate.tsx`, `CeoQuestionDialog.tsx`, `ClientMapCard.tsx`, `CompanyAutonomyDashboard.tsx`, `CompanyContextSelector.tsx`, `CompanyConversationPlayer.tsx`, `GameShell.tsx`, `OfficeOS.tsx`, `OutreachPanel.tsx`, `PixelContent.tsx`, `RealtimeToasts.tsx`, `Sidebar.tsx`, `ui.tsx`, `VoiceButton.tsx`, `VoiceProfileSection.tsx`, `WeeklyReports.tsx`)
  - `apps/web/app/globals.css`
  - `apps/web/app/layout.tsx` & `page.tsx`
  - `apps/web/app/lib/` (`api.ts`, `officeLink.ts`)
- **Visual 3D & V12 Frontend Components:**
  - `apps/web/components/v12-world/` (`DigitalHuman.tsx`, `DigitalVehicle.tsx`, `DynamicCamera.tsx`, `EntityMesh.tsx`, `ExecutiveVoice.tsx`, `HistoricalInspector.tsx`, `NavigationOverlay.tsx`, `replay.module.css`, `ReplayTimeline.tsx`, `SpatialAudioOverlay.tsx`, `UIOverlay.tsx`, `VRButton.tsx`, `VRControllerTargeting.tsx`, `worldContext.ts`, `WorldRenderer.tsx`, `WorldViewer.tsx`)
  - `apps/web/components/v12-world/__tests__/v12-streaming-lifecycle.spec.tsx`
  - `apps/web/components/v12-poc/V12RendererAdapter.tsx`
  - `apps/web/components/ui/` (`badge.tsx`, `card.tsx`)
- **Frontend Configuration & Build Artifacts:**
  - `apps/web/next.config.js`
  - `apps/web/next-env.d.ts`
  - `apps/web/tsconfig.json`
  - `apps/web/vitest.config.ts`
  - `apps/web/.eslintrc.json`
  - `apps/web/.env.local`
  - `apps/web/Dockerfile`
  - `apps/web/package.json`
  - `apps/web/node_modules/`
  - `apps/web/.turbo/`

### B. Frontend-Only E2E Tests & Runners
- `e2e/smoke.spec.ts` (tests port 3001 Next.js web login UI)
- `e2e/full-audit.spec.ts` (tests port 3001 Next.js 3D office splash & dashboard pages)
- `playwright.config.ts` (E2E browser test runner configuration)
- `playwright-report/` & `test-results/` (transient browser test outputs)
- `scripts/verify-browser-live.js` (launches Chrome against web UI)

### C. Workspace & Tooling References
- Root `package.json`:
  - Workspace list: remove `"apps/web"`
  - DevDependencies: remove `"@playwright/test"`
- `turbo.json`:
  - Output definitions: remove `".next/**"`, `"!.next/cache/**"`
- `start.bat`:
  - Remove step [3/4] starting web dashboard `apps\web`
  - Remove browser launch `start chrome http://localhost:3001`
- Docker Compose:
  - `infrastructure/docker/docker-compose.staging.yml`: remove `web` service
  - `infrastructure/docker/docker-compose.prod.yml`: remove `web` service
- Environment Variables:
  - `.env`, `.env.example`, `.env.production.example`: clean up `PORT_WEB`, `NEXT_PUBLIC_*`, `WEB_PORT`, `WEB_DOMAIN`
- Provenance references:
  - `apps/api/src/v12-spatial/v12-asset-registry.service.ts`: replace `apps/web/components/v12-world/...` provenance paths with backend canonical mesh identifiers (`v12-mesh-chassis#...`, `v12-mesh#digital-human-body`)

---

## 3. Explicit Protection Registry

The following systems are protected against modification, reduction, or deletion:

1. **`apps/api/**` (NestJS Backend)**
   - Core Modules: Authentication, Authorization, JWT, Roles, Multi-Company Isolation
   - Autonomous Enterprise: Chairman, CEO, Employee FSM, Departments, Groups, Projects, Tasks, Intelligence, Research, Marketing, Sales, Finance, Management, Strategy, Workforce, Continuous Improvement, Automation Orchestration, Communication, Knowledge, Assistant
   - V12 Spatial Infrastructure (`apps/api/src/v12-spatial/**`):
     - `V12SpatialService`
     - `V12NavigationService`
     - `V12VehicleService`
     - `V12SpatialAudioService`
     - `V12AssetRegistryService`
     - `V12CommandController` & `V12CommandAdapter`
     - `V12AssistantController` & `V12AssistantAdapter`
     - `V12VRActionAdapter` & controller
   - V12 Gateway & Event-Sourcing (`apps/api/src/world-state-gateway/**`):
     - `WorldStateGateway` & Controller
     - `WorldStateGatewayService`
     - `WorldStateEventService`
     - `WorldStateTranslationService`
     - `WorldStateReplayService`
     - `ReplaySessionService`
     - Persistence-before-broadcast guarantees, SSE streams, snapshotting, multi-viewer convergence
2. **`packages/database/**` (Authoritative Data Model)**
   - `prisma/schema.prisma` (including all business entities and spatial models: `WorldSnapshot`, `WorldEventRecord`, `NavigationNode`, `NavigationEdge`, `SpatialZone`, `VehicleRecord`, etc.)
   - Migrations history (`prisma/migrations/**`)
   - Seeding and migration scripts (`prisma/seed.ts`, `scripts/db-migrate.js`, etc.)
3. **`packages/shared/**` (Renderer-Agnostic Contracts)**
   - `packages/shared/src/v12/**`:
     - `WorldEntity`, `WorldSnapshot`, `MovementState`, `Transform`
     - V12 event contracts and envelopes (`WorldStateEvent`, `EventEnvelope`)
     - Navigation and replay contracts
     - `WorldStateConsumer`, `WorldStateReplayEngine`, world-state reducer
     - `webxr.ts`, `assets.ts`, `physics.ts`, `streaming.ts`
4. **`packages/model-gateway/**` (AI Model Gateway)**
   - Model gateway integrations, provider adapters, LLM routing

---

## 4. Verification & Anti-Entropy Gateways

Following eradication, the repository must pass:
1. `packages/shared` build (`tsc`)
2. `packages/database` Prisma generation & schema validation
3. `apps/api` typecheck & build (`nest build`)
4. Full API test suite (`npm test` in `apps/api`: all 40 suites / 276 tests must pass)
5. Repository-wide symbol sweep confirming zero broken imports and zero orphaned frontend residue
6. Final verification report generation (`AEVORA_V13_FINAL_FRONTEND_REMOVAL_REPORT.md`)

# AEVORA — Repository Cleanup & Decoupling Inventory

**Workspace:** `E:\Aevora`  
**Audit Date:** 2026-10-12  
**Audit Stage:** Stage 1 — Audit Only (Zero Modifying Actions Taken)  

---

## 1. Cleanup Objectives & Preservation Invariants

The goal of this inventory is to establish a rigorous, evidence-based catalog of every artifact identified for cleanup, refactoring, consolidation, or preservation.

### Non-Negotiable Preservation Invariants:
1. **Database Migrations:** All 68 Prisma migration directories in `packages/database/prisma/migrations/` (including historical milestones `..._v12_...`, `..._v18_...`, `..._v24_...`) MUST BE PRESERVED EXACTLY AS WRITTEN. Migration files represent immutable database schema evolution history. Renaming or deleting them corrupts the Prisma migration checksum table (`_prisma_migrations`).
2. **Unrelated User Services:** The `hostel-postgres` container on port `5432` and any unrelated Docker volumes/networks must NEVER be modified, stopped, or removed.
3. **Database Volume:** The Docker persistent volume `docker_postgres_data` containing the migrated Aevora PostgreSQL database on port `5433` must be preserved without data loss.
4. **Test Verification Integrity:** No test assertion may be weakened, commented out, or deleted merely to pass checks. Redundant tests may only be consolidated when identical coverage is demonstrably proven.
5. **Public API Contracts & Stored Data:** Internal module refactoring must not break existing frontend-to-BFF contracts or corrupt persisted database records.

---

## 2. Genuinely Obsolete Implementation Files & Scratch Scripts

| Target File Path | Purpose / Description | Dependency & Usage Evidence | Risk Level | Proposed Action | Required Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/src/v10-test.ts` | Ad-hoc bootstrap script used during early V10 testing. | Never imported by any module, controller, or package script. Contains hardcoded console logs and manual exit. | **LOW** | Delete file during authorized cleanup phase. | Verify `npm run build` and `npm run test` in `apps/api`. |
| `apps/api/src/lead-generation/lead-generation.module.ts` | Abandoned 2-line stub module. | Not imported in `app.module.ts` or any service. The active production module is `apps/api/src/lead-gen/`. | **LOW** | Delete directory `apps/api/src/lead-generation/`. | Verify NestJS module graph resolves cleanly. |
| `scripts/safe-local.env` (already deleted in WT) | Legacy environment override file. | Deleted in working tree. Referenced in `apps/api/src/main.ts` comments only. | **LOW** | Finalize deletion in Git. | Confirm `.env.example` contains all needed settings. |
| Legacy script stubs (`scripts/*.js`) | Old JavaScript migration and seeding scripts deleted in working copy. | Root `package.json` had scripts pointing to them (`db:migrate`, `db:local:setup`). | **MEDIUM** | Finalize deletion of `scripts/` directory and update `package.json` scripts to use Prisma CLI directly. | Run `npm run db:migrate` with new Prisma definition. |

---

## 3. Version-Coupled Runtime Modules & Controllers

These components represent active runtime implementations whose names, routes, or namespaces are coupled to development milestone numbers.

| Component / File Path | Current Version Coupling | Dependency & Usage Evidence | Risk Level | Proposed Transformation | Verification Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/src/v12-spatial/` | Entire directory and 36 files prefixed with `v12-`. | Imported in `app.module.ts` as `V12SpatialModule`. Used by spatial gateway and 3D office scene. | **MEDIUM** | Consolidate and rename directory to `apps/api/src/spatial/`. Rename classes: `V12SpatialService` → `SpatialService`, `V12VehicleService` → `VehicleService`, etc. | Run all 8 spatial test suites in `apps/api`. Full build. |
| `apps/api/src/v12-spatial/*.controller.ts` | Routes: `@Controller('v12-command')`, `@Controller('v12-assistant')`, `@Controller('v12-capacity')`, `@Controller('v12-vehicles')`, `@Controller('v12-vr-action')`, `@Controller('v12-spatial-audio')`. | Called by web clients and internal adapters. | **MEDIUM** | Normalize routes to canonical paths: `/spatial/command`, `/spatial/assistant`, `/spatial/capacity`, `/spatial/vehicles`, `/spatial/vr-action`, `/spatial/audio`. Provide backward-compatible alias route decorators if external clients exist. | Run `v12-vr-action.http.spec.ts` and E2E spatial tests. |
| `packages/shared/src/v12/` | Entire spatial shared library directory namespaced under `v12/`. | Exported by `packages/shared/src/index.ts` as `export * from './v12'`. Consumed by `@aevora/api` and `@aevora/web`. | **MEDIUM** | Move to `packages/shared/src/spatial/`. Export as `export * from './spatial'`. Maintain temporary re-export in `v12` for zero-breakage transition until consumers update. | Run all 16 shared package test suites. |
| `packages/shared/src/v12/world-state.ts` | Types: `V12EntityType`, `V12EntityId`, `V12IntentType`, `V12IntentContext`. | Used across `@aevora/web` 3D viewport, reducer, and `@aevora/api` spatial services. | **MEDIUM** | Introduce canonical type aliases: `SpatialEntityType`, `SpatialEntityId`, `SpatialIntentType`. Update consumers to canonical types. | Full monorepo Turbo build. |
| `apps/web/src/components/executive/V15SpatialContextBadge.tsx` | Component filename and internal text: `"V15 3D DIGITAL-TWIN"`. | Imported by `ExecutiveConsole.tsx`. Rendered on executive dashboard. | **LOW** | Rename file to `SpatialContextBadge.tsx`. Change badge label to `"3D DIGITAL TWIN"`. | Vitest suite `slice6-executive-console.test.tsx`. |
| `apps/web/src/components/executive/ExternalActionGatewayConsole.tsx` | UI text: `"V24 OFFER ENGINE"`, provider string: `"AEVORA_V24_OFFER_MARKET_ADAPTER"`. | Rendered in External Action Gateway audit view. | **LOW** | Update label to `"OFFER ENGINE"`, provider identifier to `"AEVORA_OFFER_MARKET_ADAPTER"`. | Web test suite and visual check. |
| `apps/web/src/app/api/bff/executive/[...slug]/route.ts` | BFF endpoints: `path === 'v15-context'`, `path === 'v24-context'`. | Called by Executive Console React queries. | **LOW** | Rename paths to `spatial-context` and `offer-context`. Add fallback handler for legacy paths during migration. | Vitest BFF test suite. |
| `apps/web/src/lib/executive-types.ts` | Types: `V15SpatialContext`, `V24OfferContext`, `v24GatewayProvider`. | Consumed by Executive Console and BFF route. | **LOW** | Rename to `SpatialContext`, `OfferContext`, `gatewayProvider`. Keep type aliases for compatibility. | `npm run typecheck` in `apps/web`. |
| `.env.example` & `.env` | Variables: `V12_SPATIAL_HISTORY_RETENTION_DAYS`, `V12_HISTORY_PERSIST_MAX_ATTEMPTS`, etc. | Read by `v12-spatial.service.ts`. | **LOW** | Update service to check `SPATIAL_HISTORY_RETENTION_DAYS ?? V12_SPATIAL_HISTORY_RETENTION_DAYS`. Document canonical keys. | Unit tests in spatial service. |

---

## 4. Test Suite Filename Normalization Catalog

Test files in `apps/api` and `apps/web` currently bear milestone labels. Their test assertions are valuable and must be preserved, but their filenames should be normalized to reflect the functional capability under test.

| Current Test File Path | Capability / Domain Under Test | Proposed Normalized Test Path | Preservation Status |
| :--- | :--- | :--- | :--- |
| `apps/api/src/offer-market/v24-offer-market.spec.ts` | Offer Market unit & governance rules | `apps/api/src/offer-market/offer-market.spec.ts` | **PRESERVE ALL 26 TESTS** |
| `apps/api/src/offer-market/v24-offer-market-postgres.integration.spec.ts` | PostgreSQL persistence & ACID locks | `apps/api/src/offer-market/offer-market-postgres.integration.spec.ts` | **PRESERVE ALL 8 TESTS** |
| `apps/api/src/continuous-improvement/v23-governance-self-improvement.spec.ts` | Self-improvement cycle governance | `apps/api/src/continuous-improvement/governance-self-improvement.spec.ts` | **PRESERVE ALL 12 TESTS** |
| `apps/api/src/enterprise-intelligence/v21-digital-twin-simulation.spec.ts` | Digital twin scenario simulation | `apps/api/src/enterprise-intelligence/digital-twin-simulation.spec.ts` | **PRESERVE ALL 21 TESTS** |
| `apps/api/src/marketing/v20-marketing-factory.spec.ts` | Marketing content generation & gateway | `apps/api/src/marketing/marketing-factory.spec.ts` | **PRESERVE ALL 23 TESTS** |
| `apps/api/src/project-delivery/v19-delivery-factory.spec.ts` | Project build & delivery pipeline | `apps/api/src/project-delivery/delivery-factory.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/reliability/v18-phase1-telemetry-probing.spec.ts` | Health probing and metrics telemetry | `apps/api/src/reliability/telemetry-probing.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/reliability/v18-phase2-incident-triage.spec.ts` | Incident detection & classification | `apps/api/src/reliability/incident-triage.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/reliability/v18-phase3-diagnostic-rca.spec.ts` | Root cause analysis engine | `apps/api/src/reliability/diagnostic-rca.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/reliability/v18-phase4-runbook-remediation.spec.ts` | Automated remediation runbooks | `apps/api/src/reliability/runbook-remediation.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/task/v17-phase1-execution-foundation.spec.ts` | Task creation & execution engine | `apps/api/src/task/task-execution.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/task/v17-phase3-reliable-execution.spec.ts` | Task idempotency & retry policies | `apps/api/src/task/task-retry-reliability.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/task/v17-phase4-evidence-outcomes.spec.ts` | Cryptographic evidence & outcomes | `apps/api/src/task/task-evidence-outcomes.spec.ts` | **PRESERVE ALL 26 TESTS** |
| `apps/api/src/governance/v17-phase5-authority-governance.spec.ts` | Authority tiers & Chairman gating | `apps/api/src/governance/authority-governance.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/enterprise-intelligence/v17-phase6-enterprise-intelligence.spec.ts` | Strategic alignment & conflicts | `apps/api/src/enterprise-intelligence/enterprise-intelligence.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/continuous-improvement/v17-phase7-continuous-evolution.spec.ts` | Strategic evolution loop | `apps/api/src/continuous-improvement/continuous-evolution.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/automation-orchestration/v17-phase8-release-gate.spec.ts` | Quality gate & production release | `apps/api/src/automation-orchestration/release-gate.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/ceo/ceo-consequence-v16.spec.ts` | Multi-dimensional consequence analysis | `apps/api/src/ceo/ceo-consequence.spec.ts` | **PRESERVE ALL 14 TESTS** |
| `apps/api/src/ceo/ceo-autonomous-v16.spec.ts` | Autonomous CEO loop execution | `apps/api/src/ceo/ceo-autonomous.spec.ts` | **PRESERVE ALL TESTS** |
| `apps/api/src/automation-orchestration/v11-*.spec.ts` (10 files) | Automation orchestration suite | `apps/api/src/automation-orchestration/*.spec.ts` (remove `v11-` prefix) | **PRESERVE ALL TESTS** |
| `apps/web/src/test/v22-living-world.test.ts` | Living world avatar & room reduction | `apps/web/src/test/living-world.test.ts` | **PRESERVE ALL 14 TESTS** |
| `apps/web/src/test/v15-spatial.test.ts` | Spatial viewport & controls | `apps/web/src/test/spatial-viewport.test.ts` | **PRESERVE ALL 7 TESTS** |
| `apps/web/src/test/v15-f-web.test.ts` | World state streaming & consumer | `apps/web/src/test/world-state-streaming.test.ts` | **PRESERVE ALL 6 TESTS** |
| `apps/web/src/test/slice*.test.tsx` (9 files) | Slice-based UI component tests | `apps/web/src/test/ui-*.test.tsx` | **PRESERVE ALL 300+ TESTS** |

---

## 5. Historical Documentation & Acceptance Reports

The repository root currently contains milestone reports generated across past development cycles.

### Working Copy Deletions (`D` in Git Status):
- `AEVORA_V12_*.md` (3 files)
- `AEVORA_V13_*.md` (5 files)
- `AEVORA_V14_*.md` (13 files)
- `AEVORA_V15_*.md` (3 files)
- `AEVORA_V17_*.md` (12 files)
- `AEVORA_V18_*.md` (12 files)
- `AEVORA_COMMIT_*.md`, `AEVORA_PRECOMMIT_*.md`, `AEVORA_FINAL_*.md` (5 files)

### Untracked Milestone Reports (`??` in Git Status):
- `AEVORA_V23_ACCEPTANCE_REPORT.md`
- `AEVORA_V23_ARCHITECTURE_AUDIT.md`
- `AEVORA_V23_HANDOVER.md`
- `AEVORA_V23_IMPLEMENTATION_REPORT.md`
- `AEVORA_V23_OPERATIONS_RUNBOOK.md`
- `AEVORA_V24_ACCEPTANCE_REPORT.md`
- `AEVORA_V24_FINAL_INDEPENDENT_VERIFICATION_REPORT.md`
- `AEVORA_V24_FINAL_VERIFICATION_REPORT.md`
- `AEVORA_V24_IMPLEMENTATION_REPORT.md`
- `AEVORA_V24_OPERATIONS_RUNBOOK.md`
- `AEVORA_V24_PERSISTENCE_FINALIZATION_REPORT.md`

### Proposed Action for Milestone Reports:
1. Do not litter the repository root with fragmented per-milestone markdown files.
2. In accordance with the prompt's instruction: *"Classify each version-related artifact as historical, required compatibility, diagnostic metadata, user-facing clutter, runtime coupling, or a verified obsolete artifact."*
3. The historical milestone reports belong in a designated historical archive directory (e.g. `docs/historical/`) or can be committed as historical documentation if preserved, but the root of the repository must be kept clean, hosting only canonical, unversioned operational documentation (`README.md`, `ROADMAP.md`, `SETUP.md`, `AEVORA_PRODUCTION_READINESS_AUDIT.md`, `AEVORA_IMPLEMENTATION_PLAN.md`).

---

## 6. Cleanup Safety Checklist Before Any Execution
- [ ] Verify that Git working tree state is clean or committed before starting removals.
- [ ] Confirm `hostel-postgres` on port `5432` is running and unaffected.
- [ ] Ensure all 68 Prisma migration files in `packages/database/prisma/migrations/` remain untouched.
- [ ] Run full monorepo build and test suites after every directory rename.
- [ ] Validate that no export or import paths remain broken.

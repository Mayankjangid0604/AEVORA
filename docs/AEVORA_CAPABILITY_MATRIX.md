# AEVORA Capability Matrix

Last updated: 2026-10-13. Statuses: VERIFIED (test/real run shown) · IMPLEMENTED BUT UNVERIFIED · PARTIAL · MOCKED · MISSING · BLOCKED.
Test levels: **unit** (mocked deps) · **DB** (real disposable Postgres :5444) · **HTTP** (built API on :4011 against :5444) · **real-model** (local Ollama).

| Capability | Status | Evidence | Gap / next action |
|---|---|---|---|
| Startup, config validation, auth (Journey A) | VERIFIED (HTTP) | Built API booted with `scripts/e2e-local.env`, `/health` ok, chairman login → JWT, `/auth/me` resolves tenant from DB | Web UI not exercised this session |
| Operator lead import (CSV/JSON parsed) | VERIFIED (DB + HTTP) | `POST /lead-gen/import`; `revenue-loop.e2e.spec.ts` B | Cross-source dedup (OSM vs import) not done |
| Lead dedup | VERIFIED (DB) | Deterministic key on website host → email → name+location; re-import = 0 created; per-tenant | — |
| Lead scoring + explanation | VERIFIED (DB + HTTP) | `scoreFactors` persisted in `SalesLead.metadata.scoreFactors`; missing evidence scores 0 | Score-vs-conversion feedback loop |
| Lead discovery (OpenStreetMap / Google Places) | IMPLEMENTED BUT UNVERIFIED | Parser/scoring unit tests pass | No live fetch run (safe mode blocks it); Google needs key + billing |
| Outreach draft → approval → send (Journey D) | VERIFIED (DB + HTTP, **sandbox transport**) | Unit 6/6, DB journey D, HTTP: concurrent approvals → 1 sent, 1 × 409 | Real provider BLOCKED |
| Outreach environment | VERIFIED | `OUTREACH_ENVIRONMENT` (default SANDBOX); was hardcoded PRODUCTION | — |
| Outbound approval gate (all email paths) | VERIFIED (unit + DB journey before Docker outage) | `IntegrationService.sendEmail`; `outbound-gate.spec.ts` 15/15, `autonomous-outreach.e2e.spec.ts` 5/5 | Unsubscribe link and opt-out endpoint missing |
| Suppression / unsubscribe | IMPLEMENTED; unit-verified, DB not verified (migration unapplied, Docker down) | UNSUBSCRIBED response or DISQUALIFIED lead blocks send, case-insensitive | Signed `/unsubscribe` link and one-click headers on every email; `EmailSuppression` list; inbound opt-out persisted; import blocked (`gate3-safety.spec.ts` 21/21) | Apply the migration and run DB journeys |
| Tenant isolation (Journey F) | VERIFIED (DB + existing 62 HTTP tests re-run) | Tenant B can't approve/list A's drafts or leads; funnel per tenant | — |
| Revenue funnel report (Journey H) | VERIFIED (DB + HTTP) | `GET /lead-gen/funnel` reconciles with persisted rows | No UI panel yet; synthetic data only |
| Background jobs (Journey E) | VERIFIED (DB); tenant-scoped keys and execution (Gate 2) | `job-worker.e2e.spec.ts`: retry+backoff, exact maxAttempts, unknown type fails, idempotent enqueue, single execution under 2 workers | No pause/resume/replay controls; no per-job timeout (stale lock 5 min) |
| AI reply classification (Journey C) | VERIFIED (real-model, qwen2.5:7b) | 11/12 = 92% on 12-case eval, p50 3.9 s, max 7.6 s; injection case blocked; unreachable provider → UNKNOWN | Eval set is small; persistence via `ingest` not DB-tested |
| AI runtime / gateway | VERIFIED (real-model) | Ollama call now honors `OLLAMA_BASE_URL` and `OLLAMA_TIMEOUT_MS` (previously unbounded) | Only qwen2.5:7b installed; other tiers default to models not pulled (gemma3:12b, qwen3:14b, phi4) |
| Emergency stop + send limits | VERIFIED (unit) | `AEVORA_EMERGENCY_STOP`, kill switches, 24 h recipient/tenant/global limits; fail closed | — |
| External publishing (Vercel demos) | VERIFIED (unit): off unless `DEMO_PUBLISHING_ENABLED=true` | `gate3-safety.spec.ts`, conformance test | No live Vercel test (not authorized) |
| Customer request intake (public `/request`) | IMPLEMENTED; unit and BFF tests (mocked) | `inquiry/gate4a.spec.ts` 39/39, `web/src/test/gate4a-intake.test.ts` 9/9 | DB journey `intake.e2e.spec.ts` written, not run (Docker down; migration unapplied) |
| Operator request queue | IMPLEMENTED; unit-tested | Tenant-scoped reads, compare-and-set transitions, atomic notes, audit | Same DB journey pending |
| Job pause / resume / replay | IMPLEMENTED; unit-tested | `JobStatus.PAUSED`, management-only, replay limited to `TASK_EXECUTION` ×3 | DB journey pending; per-job timeout missing |
| Real email transport | BLOCKED | Needs provider creds, sender identity, approved pilot audience | User decision |
| Staging / production | BLOCKED | No host, DNS or secrets | External |

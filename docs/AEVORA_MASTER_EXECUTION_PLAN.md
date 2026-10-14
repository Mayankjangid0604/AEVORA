# AEVORA Master Execution Plan

Goal: run the revenue loop (discover → score → draft → approve → send → track → report) on real, authorized data. Status per capability: `AEVORA_CAPABILITY_MATRIX.md`.

## Done (2026-10-13)
- Outreach: removed the hardcoded PRODUCTION send, added an atomic claim (no double send), suppression, and reject state guard. The `?status=` filter now works. Chairman actors are accepted (every `/outreach` call used to 403).
- Leads: `POST /lead-gen/import` (validation, provenance, deterministic dedup), persisted `scoreFactors`, and `GET /lead-gen/funnel`.
- Jobs: off-by-one in `maxAttempts` fixed; unknown job types now FAIL instead of reporting a fake COMPLETED.
- AI: gateway Ollama URL/timeout fixed; reply-injection guards added (rule-decided refusals, untrusted-data prompt, high-stakes intents downgraded when injection markers are present).
- Test safety: `test-setup.ts` now defaults to the disposable DB (it pointed at the protected :5433) and pins SANDBOX, no SMTP/SendGrid, and the local model provider.
- Journeys A–F and H executed (see matrix). G was covered piecemeal: provider down, malformed output, duplicate approvals, job failure.

## Gate 2 (2026-10-13): outbound safety and tenant repair
- One outbound email gate (approval, suppression, kill switch, server-clamped environment) for every send path. Automation only drafts.
- Job tenant fixes; `/integration/email`, `/job` and `/client-meeting` locked to management and token tenant.
- WhatsApp is manual-only; direct-SMTP scripts disabled.
- Details: `AEVORA_GATE1_AUDIT.md` (Gate 2 disposition).

## Gate 3 (2026-10-13): unsubscribe, publishing gate, limits, emergency stop
- Done: see `AEVORA_GATE1_AUDIT.md` (Gate 3 disposition).

## Gate 4A (2026-10-13): customer intake, operator queue, job controls
- Built and unit-tested. Details: `AEVORA_GATE1_AUDIT.md` (Gate 4A disposition).

## Gate 4B (2026-10-13): real-world readiness, DB isolation, and first-revenue acceptance
- Done: Docker restored, migrations applied to disposable DB (:5444).
- All 10 DB-backed E2E suites passed (40 tests).
- Per-job execution timeout and stale-worker lease protection implemented and verified with regression tests.
- Outbound safety validated (`UNSUBSCRIBE_SECRET`, `PUBLIC_API_URL`, `emergencyStopActive` on ChairmanMailer).
- Full report and GO/NO-GO disposition: `AEVORA_GATE4B_ACCEPTANCE_REPORT.md`.

## Gate 4C (2026-10-13): production inbound pilot readiness
- Done: Full contract verification for public intake, status lookup, operator queue, and health endpoints.
- Inbound verdict: **CONDITIONAL GO** (local engine verified; pending staging/prod host commissioning and setting `PUBLIC_INTAKE_COMPANY_ID`).
- Outbound verdict: **STRICT NO-GO** (pending operator Gmail password rotation, `UNSUBSCRIBE_SECRET`, `PUBLIC_API_URL`, and SMTP credentials).
- Detailed report: `AEVORA_GATE4C_ACCEPTANCE_REPORT.md`.

## Next
1. Operator / DevOps: commission a staging/pilot host and set `PUBLIC_INTAKE_COMPANY_ID` to route live inquiries.
2. Operator: rotate the leaked Gmail password; set production `UNSUBSCRIBE_SECRET`, `PUBLIC_API_URL`, and SMTP credentials before flipping `ENABLE_REAL_PRODUCTION_SENDING=true`.
3. Backup/restore drill on the disposable DB.
4. Schema-drift migration once staging host is operational.

## Earlier backlog, in priority order
1. ~~Route the campaign sender through suppression~~ (done in Gate 2 via the central gate).
2. ~~Job pause/resume/replay and lease/timeout protection~~ (Gate 4A/4B).
3. Operations console panel for funnel, drafts awaiting approval, and failed jobs (web).
4. Grow the reply-classification eval set (≥50 real, anonymized replies) and add a draft-quality eval.
5. Cross-source dedup (OSM vs import) on website host.
6. Fix the schema/migration drift (FK actions, two `Task` indexes) with a proper migration.

## Blocked on user
- Real email provider credentials, sender identity, and an approved pilot audience (small, explicit list).
- Commercial definition: target customer profile and pricing. The code assumes "small local businesses without websites" and the prices in the classifier prompt (Rs 8,000+ websites).
- Whether to pull larger models for other tiers (gemma3:12b ≈ 8 GB, qwen3:14b ≈ 9 GB) or remap tiers to qwen2.5:7b.

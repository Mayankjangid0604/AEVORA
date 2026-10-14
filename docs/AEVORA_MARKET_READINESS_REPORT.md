# AEVORA Market Readiness Report

Date: 2026-10-13. **Decision: locally operational for the lead → approval → sandbox-send → report loop. NOT ready for real outreach, staging or production.**

## End-to-end results (this session)
| Journey | Level | Result |
|---|---|---|
| A Startup + auth | HTTP, disposable DB | PASS |
| B Lead import/dedup/score/persist/retrieve | DB + HTTP | PASS |
| C AI classification | Real local model (qwen2.5:7b) | PASS: 92% on 12 cases, injection blocked, fail-safe |
| D Draft → approval → send | DB + HTTP, **sandbox transport** | PASS |
| E Background jobs | DB, real worker loop | PASS |
| F Tenant isolation | DB + 62 existing HTTP tests | PASS |
| G Failure handling | Unit/DB/real-model pieces | PASS for covered cases (provider down, malformed output, duplicate approval, job failure) |
| H Funnel reconciliation | DB + HTTP, synthetic data | PASS |

No real customers, replies, meetings or revenue exist. All lead/funnel numbers above are synthetic test fixtures.

## Incident disclosed
During the first DB journey run, the developer `.env` (auto-loaded by Prisma) put outreach in PRODUCTION mode with real SMTP. Up to two test emails were probably submitted through the configured SMTP account. The test-mode guard redirected them to `sink@example.test`, a reserved, undeliverable domain, so no prospect was contacted; bounce notices may appear in that mailbox. Fixed: test setup pins SANDBOX, and DB specs refuse to run if any real transport is configured.

## Launch blockers
1. Real email provider, sender identity, and an approved pilot audience with contact permission.
2. Approved target customer profile and pricing.
3. ~~Campaign path not yet routed through the suppression check~~ (fixed in Gate 2).
4. Staging host, DNS, secrets; production authorization.
5. Larger eval sets before trusting AI-drafted replies without per-message review.

## Update: Gates 2–3 (2026-10-13)
- **Decision unchanged: NOT ready for a pilot or production.**
- **Now in place:**
  - One approval gate for every outbound email.
  - Automation can only draft.
  - Tenant-safe jobs and meetings.
  - Signed unsubscribe link and one-click headers, with a persistent suppression list.
  - Emergency stop and send limits.
  - Publishing off by default.
- **Verified by:** unit and conformance tests with all network transports trapped, plus DB journeys run before the Docker outage.
- **Blockers:**
  1. Docker is unhealthy, so DB re-verification and the `EmailSuppression` migration are pending.
  2. The leaked Gmail credential needs rotation.
  3. There is no customer intake.
  4. Real provider credentials and a verified sender domain are missing.
  5. There is no approved pilot audience.
  6. There is no staging host.

## Update: Gate 4A (2026-10-13)
- **Decision unchanged: NOT ready.**
- **Built and unit/BFF-tested, not yet DB-verified:**
  - The customer journey: public request form, reference, status lookup.
  - The operator queue with validated, conflict-safe transitions.
  - Job pause/resume/replay.
- **Blockers:**
  1. Docker engine unresponsive, so two migrations are unapplied and every DB journey is unverified.
  2. Gmail credential rotation.
  3. Provider credentials, sender domain and pilot audience.
  4. Staging host.
  5. Backup/restore drill.

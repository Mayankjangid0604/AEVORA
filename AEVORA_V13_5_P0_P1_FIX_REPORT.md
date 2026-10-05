# AEVORA V13.5 — P0/P1 SAFETY & ACCEPTANCE FIX REPORT

## Executive Summary
This report documents the implementation and verification of all P0 and P1 safety and acceptance blockers identified during the V13.5 initial backend audit. 

All implementations have been verified through automated critical-path tests, TypeScript typechecks, and a full monorepo build. Under no circumstances was live email sent or live Google Places discovery invoked during this phase.

---

## 1. P0 Blocker 1 — Persistent 30-Minute Outreach Rate Limit

### Original Problem
The pre-V13.5 implementation relied on an in-memory batch interval (`setInterval(..., 30 * 60 * 1000)`). This was vulnerable to:
- Process restarts resetting the 30-minute timer.
- Concurrent workers or requests sending multiple emails simultaneously.
- Direct service invocation (`EmailOutreachService.sendOutreachEmail` or API routes) bypassing the interval.
- Premature queue dequeueing in `SalesAgentWorker`, causing leads to be marked as contacted even if outreach failed or was blocked.

### Implementation
1. **Persistent Authoritative State**:
   - `EmailOutreachService.checkRateLimit(companyId)` queries the authoritative database record (`OutreachCampaign`) for client outreach emails (`channel: 'EMAIL'`, `status: 'SENT'`) with `sentAt` greater than the configured window (`OUTREACH_RATE_LIMIT_MINUTES`, default: 30 minutes).
   - In-flight client outreach dispatches are claimed atomically with status `SCHEDULED`. If an in-flight campaign exists within a 5-minute safety threshold, concurrent requests are safely rejected.
2. **Atomic Transaction & Concurrency Resistance**:
   - `sendOutreachEmail` and `sendFollowUp` execute within a Prisma `$transaction` with row-level locking (`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`) and fallback transaction isolation.
   - Throws `OutreachRateLimitException` (HTTP 429) if a send occurred within the last 30 minutes or an in-flight campaign is detected.
3. **Queue Dequeue Safety**:
   - `SalesAgentWorker.processQueue` calls `checkRateLimit(companyId)` before dequeueing leads. If active, it defers immediately without modifying lead states.
   - If an outreach attempt throws `OutreachRateLimitException`, the lead status is reverted from `CONTACTED` back to `NEW` with timestamps cleared.
   - After a client outreach email is sent, the worker batch terminates immediately (`contacted++; break;`) since the 30-minute window is now active.
4. **Rate Limit Scope**:
   - Strictly applies to client outreach emails (`channel: 'EMAIL'` in `OutreachCampaign`). Unrelated system emails (invoices, receipts, system alerts, inbound client replies) bypass this limiter and remain unthrottled.

### Tests
Covered in `apps/api/src/sales-outreach/email-outreach.service.spec.ts`:
- **Scenario 10**: First client outreach is permitted.
- **Scenario 11**: Immediate second client outreach is rejected/deferred with `OutreachRateLimitException`.
- **Scenario 12**: Concurrent outreach attempts cannot both succeed (atomicity and in-flight detection).
- **Scenario 13**: Persisted limiter state survives simulated service restart (independent memory instance queries DB cutoff).
- **Scenario 14**: Direct service invocation cannot bypass the persistent limiter.
- **Scenario 15**: Unrelated system email behavior is not accidentally rate-limited.

---

## 2. P0 Blocker 2 — Disable Silent Synthetic Mock Fallback

### Original Problem
`LeadSearchService.searchRaw()` previously checked `this.source`. When `LEAD_GEN_PROVIDER_ENABLED !== 'true'` or `GOOGLE_PLACES_API_KEY` was missing, it automatically returned `'mock'` and silently generated synthetic mock businesses via `this.mock()`. Similarly, `DiscoveryService.enrichFromGoogleProfile()` generated fake opening hours and fake customer reviews. In real-world discovery, this disguised provider failures as successful leads.

### Implementation
1. **Fail-Closed Provider Execution**:
   - `LeadSearchService.source` now defaults strictly to `'google'` unless explicitly configured as `'osm'` or `'mock'`.
   - In `searchRaw()`, if `source === 'google'`:
     - If `LEAD_GEN_PROVIDER_ENABLED !== 'true'`, throws: `Error('Lead discovery failed: Google Places provider is disabled (LEAD_GEN_PROVIDER_ENABLED must be "true")')`.
     - If `!GOOGLE_PLACES_API_KEY`, throws: `Error('Lead discovery failed: Google Places API key is missing (GOOGLE_PLACES_API_KEY is not set)')`.
     - If the Google Places API returns an error or invalid response, the error propagates and execution fails closed. Under no circumstance is `this.mock()` invoked.
2. **Preserved Test Fixtures**:
   - `this.mock()` remains intact as an isolated fixture, accessible strictly when `LEAD_GEN_SOURCE=mock` is explicitly declared in automated test environments. It is strictly prohibited when `NODE_ENV === 'production'`.
3. **Clean Profile Enrichment**:
   - `DiscoveryService.enrichFromGoogleProfile()` now returns a clean empty profile (`hours: [], rating: null, reviewCount: 0, reviews: []`) if Google Places is disabled or unavailable for real places, preventing synthetic profile injection into outreach drafts.

### Tests
Covered in `apps/api/src/lead-gen/lead-search.service.spec.ts`:
- **Scenario 1**: Google provider succeeds → real provider data flows through.
- **Scenario 2**: Google provider fails → no synthetic business is generated (fails closed).
- **Scenario 3**: Missing provider configuration → fails safely.
- **Scenario 4**: Invalid provider response → fails safely.
- **Scenario 5**: Provider provenance remains intact (`googlePlaceId` matches Google Places format).

---

## 3. P1 Blocker 1 — Email Audit Recipient Parity

### Original Problem
`IntegrationAuditLog.requestPayload` recorded the original recipient passed by the caller, while test-mode redirection to `mayankjangid598@gmail.com` was only visible in stdout logs. The persisted audit trail lacked structured proof of the actual delivery address.

### Implementation
1. **Audit Structure Enhancement in `IntegrationService`**:
   - `requestPayload` and `responsePayload` now explicitly record structured audit metadata:
     - `originalIntendedRecipient`: Original business email address.
     - `actualDeliveredRecipient`: Exact recipient address delivered to (`mayankjangid598@gmail.com` in test mode).
     - `redirected`: Boolean flag indicating redirection.
     - `deliveryStatus`: Delivery status (`SUCCESS` or `FAILED`).
     - `providerStatus`: Provider confirmation status (`DELIVERED`).
     - `selectedBusiness`: Business name.
     - `leadId`: Associated lead identifier.
     - `providerSource`: Source (`google`, `osm`, etc.).
     - `correlationId`: Correlation identifier matching `OutreachCampaign.id`.
     - `timestamp`: ISO timestamp.
2. **Zero Credential Exposure**:
   - Neither `requestPayload` nor `responsePayload` stores SMTP passwords, tokens, API keys, or secrets.
3. **Bypass Immunity**:
   - In production test mode (`ENABLE_REAL_PRODUCTION_SENDING !== 'true'`), `actualRecipient` is unconditionally forced to `TEST_EMAIL_RECIPIENT` (`mayankjangid598@gmail.com`). Direct attempts to pass arbitrary recipient addresses cannot bypass test-mode redirection.

### Tests
Covered in `apps/api/src/integration/integration.service.spec.ts`:
- **Scenario 6**: Test mode redirects intended business recipient to `mayankjangid598@gmail.com`.
- **Scenario 7**: Direct attempts to specify another recipient cannot bypass test-mode protection.
- **Scenario 8**: Actual recipient is recorded in structured audit records (both request and response).
- **Scenario 9**: Email credentials and secrets are never stored in the audit record.

---

## 4. P1 Blocker 2 — Automated V13.5 Critical-Path Tests

Three focused test suites were created covering all 15 required critical-path scenarios:

| Test Suite | Scenarios Covered | Status |
| :--- | :--- | :--- |
| `apps/api/src/lead-gen/lead-search.service.spec.ts` | 1–5: Real discovery, fail-closed on error, missing config, invalid response, provenance | **PASS** (5/5) |
| `apps/api/src/integration/integration.service.spec.ts` | 6–9: Test mode redirection, bypass resistance, audit parity, credential protection | **PASS** (4/4) |
| `apps/api/src/sales-outreach/email-outreach.service.spec.ts` | 10–15: First send allowed, 30-min rejection, concurrency resistance, restart survival, direct invocation guard, system email exemption | **PASS** (6/6) |

**Total Tests**: 15 passed, 0 failed.

---

## 5. Database Changes
- **Existing Schema Reused**: Verified against `packages/database/prisma/schema.prisma`.
  - The `OutreachCampaign` model already provides `channel`, `status`, `sentAt`, `idempotencyKey`, and `notes`.
  - The `IntegrationAuditLog` model already provides `requestPayload: Json?`, `responsePayload: Json?`, and `idempotencyKey`.
  - The `SalesLead` model already provides `status`, `qualityScore`, `googlePlaceId`, and `lastContactedAt`.
- **Destructive Changes**: None. Zero migrations required, zero data deleted.

---

## 6. Files Changed
1. `apps/api/src/sales-outreach/email-outreach.service.ts` — Added persistent rate limit check, transaction concurrency lock, in-flight claiming, and structured campaign notes.
2. `apps/api/src/sales-outreach/sales-agent.worker.ts` — Added pre-dequeue rate limit check, lead status rollback on rate limit, and 1-send batch exit.
3. `apps/api/src/lead-gen/lead-search.service.ts` — Disabled silent mock fallback; enforced fail-closed logic on missing configuration or provider error.
4. `apps/api/src/sales-outreach/discovery.service.ts` — Removed synthetic profile generation for real places when provider is disabled.
5. `apps/api/src/integration/integration.service.ts` — Implemented structured audit recipient parity recording `originalIntendedRecipient` and `actualDeliveredRecipient`.
6. `apps/api/src/lead-gen/lead-search.service.spec.ts` — Created automated critical-path tests for discovery fail-closed behavior.
7. `apps/api/src/integration/integration.service.spec.ts` — Created automated critical-path tests for email safety and audit recipient parity.
8. `apps/api/src/sales-outreach/email-outreach.service.spec.ts` — Created automated critical-path tests for rate limiting, concurrency, and restart survival.

---

## 7. Verification & Build Results
- **Critical-Path Unit Tests**:
  - `npx jest --testPathPattern="lead-search.service.spec|integration.service.spec|email-outreach.service.spec" --runInBand`
  - Result: **3 test suites passed, 15 tests passed** (0 failures).
- **TypeScript Typecheck**:
  - `npx tsc --noEmit` in `apps/api`
  - Result: **0 errors, clean exit (code 0)**.
- **Monorepo Build**:
  - `npm run build` (`turbo run build`) across all 4 workspace packages (`@aevora/api`, `@aevora/database`, `@aevora/model-gateway`, `@aevora/shared`)
  - Result: **4/4 packages built successfully (code 0)**.

---

## 8. Security Scan Result
- Verified zero hard-coded API keys, passwords, SMTP credentials, or private tokens in modified files.
- Verified `IntegrationAuditLog` sanitization strips credentials before persisting JSON payloads.
- Verified test mode strictly prevents production sends to real business recipients.
- Verified zero live emails were dispatched during this prompt.
- Verified zero external Google Places API requests were made during this prompt.

---

## 9. Remaining Blockers
- **Zero code blockers remain.**
- All P0 and P1 blockers identified in `AEVORA_V13_5_INITIAL_BACKEND_AUDIT.md` are resolved and automated tests have validated the fixes.

---

## 10. Live-Test Readiness
The backend safety guardrails, persistent 30-minute rate limiter, fail-closed discovery mechanisms, and audit recipient parity are fully operational and verified. The system is structurally prepared for the live acceptance run upon user instruction.

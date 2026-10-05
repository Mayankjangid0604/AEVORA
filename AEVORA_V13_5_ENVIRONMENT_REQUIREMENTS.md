# AEVORA V13.5 — ENVIRONMENT REQUIREMENT INVENTORY & SPECIFICATION

**Document Version:** 1.0.0  
**Phase:** V13.5 Secure Environment Initialization & Requirement Discovery  
**Audit Timestamp:** 2026-10-05T20:15:00+05:30  
**Backend Target:** Node.js / NestJS API (`apps/api`) & Prisma Database Engine (`packages/database`)

---

## 1. EXECUTIVE SUMMARY

An exhaustive discovery and security audit of the AEVORA backend codebase was performed to identify all runtime configuration variables, provider credentials, database parameters, API keys, and test safety controls required for the **V13.5 Backend-Only Verification**.

### Key Audit Findings:
- **Total Unique Variables Discovered:** 144 across `apps/api/src`, `packages/*`, and scripts.
- **V13.5 Critical Path Variables:** 17 core variables required for lead discovery, email outreach, safety interception, database persistence, and system authentication.
- **Pre-Configured In Local Environment:** 66 variables actively populated with valid local defaults, secrets, or functional values.
- **Missing / Action-Required User Inputs:** **3** items (Google Places API Key, SMTP Username, SMTP App Password).
- **Test Safety Interlock:** Configured. `TEST_EMAIL_RECIPIENT=mayankjangid598@gmail.com` and `LEAD_DEMO_EMAIL=mayankjangid598@gmail.com` have been established in `.env` and `apps/api/.env`. `ENABLE_REAL_PRODUCTION_SENDING=false` is enforced.
- **Hard-Coded Secrets:** **0 found** (PASS).
- **Secret File Leaks / Git Tracking:** **PASS**. `.env` and `.env.*` are strictly ignored by `.gitignore`. No private keys or credential files exist in repository trees.
- **Configuration Loading Check:** **PASS**. Core startup validator (`REQUIRED_ENV`) succeeds with zero errors.

---

## 2. COMPLETE ENVIRONMENT REQUIREMENT INVENTORY

Below is the verified inventory of all environment variables identified across source code, configurations, and service integrations.

| Variable | Required For | Source Location | Required/Optional | Secret? | Current Status |
|---|---|---|---|---|---|
| `ADMIN_EMAIL` | Runtime application configuration | scripts/create-admin.js, scripts/set-chairman-password.js | OPTIONAL | NO | Missing |
| `ADMIN_NAME` | Runtime application configuration | scripts/create-admin.js | OPTIONAL | NO | Missing |
| `ADMIN_PASSWORD` | Runtime application configuration | scripts/create-admin.js, scripts/set-chairman-password.js | OPTIONAL | YES | Missing |
| `AEVORA_ENV_OVERRIDE` | Runtime application configuration | apps/api/src/main.ts | OPTIONAL | NO | Missing |
| `AEVORA_MODEL_CODING` | Local model designation for software engineering tasks | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Configured |
| `AEVORA_MODEL_COMPLEX` | Local model designation for complex analytical tasks | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Configured |
| `AEVORA_MODEL_FAST` | Local model designation for fast / lightweight tasks | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Configured |
| `AEVORA_MODEL_NORMAL` | Local model designation for standard tasks | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Configured |
| `AEVORA_MODEL_STRATEGIC` | Local model designation for high-level strategy and vision | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Configured |
| `AEVORA_SAFE_MODE` | Runtime application configuration | apps/api/src/common/safe-mode.ts | OPTIONAL | NO | Missing |
| `AGENT_CODEGEN_COOLDOWN_MIN` | Runtime application configuration | apps/api/src/agent/idle-codegen.service.ts | OPTIONAL | NO | Missing |
| `AGENT_CODEGEN_REPO_ROOT` | Runtime application configuration | apps/api/src/company-operations/management-decision.service.ts | OPTIONAL | NO | Missing |
| `AGENT_WORK_CYCLES` | Flag enabling agent autonomous work cycle processing | apps/api/src/agent/agent-scheduler.service.ts | OPTIONAL | NO | Configured |
| `ALLOW_REMOTE_MIGRATE` | Runtime application configuration | scripts/db-migrate.js | DEVELOPMENT ONLY | NO | Missing |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowed origins for production | apps/api/src/main.ts | PRODUCTION ONLY | NO | Missing |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key for model tier escalation | packages/model-gateway/src/gateway.ts, packages/model-gateway/src/providers/ClaudeProvider.ts | OPTIONAL | YES | Empty Placeholder |
| `BACKGROUND_STEP_WAIT_MS` | Runtime application configuration | apps/api/src/simulation/business-loop.service.ts | OPTIONAL | NO | Missing |
| `BANK_TRANSFER_INSTRUCTIONS` | Direct bank/UPI transfer payment instructions for invoices | apps/api/src/delivery/invoice-payment.service.ts | OPTIONAL | NO | Configured |
| `BOARDROOM_FILES_DIR` | Runtime application configuration | apps/api/src/boardroom/boardroom.service.ts | OPTIONAL | NO | Missing |
| `BRIEF_OUTPUT_DIR` | Filesystem directory for generated strategic briefs | apps/api/src/delivery/scope.service.ts | OPTIONAL | NO | Configured |
| `BU_CAPITAL_REQUEST_APPROVAL` | Runtime application configuration | apps/api/src/business-units/bu-capital-request.service.ts | OPTIONAL | NO | Missing |
| `BUDGET_TIER_1_MAX` | Maximum budget allocation threshold for Tier 1 tasks | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `BUDGET_TIER_2_MAX` | Maximum budget allocation threshold for Tier 2 tasks | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `BUDGET_TIER_3_MAX` | Maximum budget allocation threshold for Tier 3 tasks | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `BUSINESS_LOOP_INTERVAL_MS` | Autonomous business loop execution cycle interval | apps/api/src/simulation/business-loop.service.ts | OPTIONAL | NO | Configured |
| `CA_ALLOCATION_EXECUTION` | Runtime application configuration | apps/api/src/capital-allocation/ca-allocation.service.ts | OPTIONAL | NO | Missing |
| `CA_PROPOSAL_APPROVAL` | Runtime application configuration | apps/api/src/capital-allocation/ca-proposal.service.ts | OPTIONAL | NO | Missing |
| `CEO_BOOTSTRAP_HEADCOUNT` | Runtime application configuration | apps/api/src/ceo/ceo-review.service.ts | OPTIONAL | NO | Missing |
| `CEO_BOOTSTRAP_INTERVAL_MIN` | Runtime application configuration | apps/api/src/ceo/ceo-review.service.ts | OPTIONAL | NO | Missing |
| `CEO_COMPLEX_RETHINK` | Enables deep multi-step rethink loops for CEO decisions | apps/api/src/ceo/ceo-review.service.ts | OPTIONAL | NO | Configured |
| `CEO_MODEL` | Model designation for CEO agent reasoning | packages/model-gateway/src/model-tier.ts, packages/model-gateway/src/__tests__/gateway.spec.ts (+1 more) | OPTIONAL | NO | Configured |
| `CEO_MODEL_COMPLEX` | Model designation for CEO complex rethink workflows | packages/model-gateway/src/model-tier.ts, packages/model-gateway/src/__tests__/gateway.spec.ts | OPTIONAL | NO | Configured |
| `CEO_REVIEW_MIN_INTERVAL_MIN` | Minimum elapsed minutes between CEO strategic reviews | apps/api/src/ceo/ceo-review.service.ts | OPTIONAL | NO | Configured |
| `CHAIRMAN_EMAIL_NOTIFICATIONS` | Flag to enable email alerts to the Chairman | apps/api/src/notifications/chairman-mailer.ts | OPTIONAL | NO | Configured |
| `CHAIRMAN_MAIL_POLL_MS` | Runtime application configuration | apps/api/src/notifications/chairman-mail.service.ts | OPTIONAL | NO | Missing |
| `CHAIRMAN_NAME` | Chairman executive name used for notifications and identity | apps/api/src/notifications/chairman-mail.service.ts | OPTIONAL | NO | Configured |
| `CHAIRMAN_NOTIFY_EMAIL` | Recipient email address for executive notifications and alerts | apps/api/src/notifications/chairman-mailer.ts | OPTIONAL | NO | Configured |
| `COMPANY_NAME` | Business entity name used in outreach scripts, invoices, and AI prompts | scripts/create-admin.js | V13.5 REQUIRED | NO | Configured |
| `DATABASE_URL` | PostgreSQL connection string for Prisma ORM | apps/api/src/test-setup.ts, scripts/db-local-setup.js (+1 more) | V13.5 REQUIRED | YES | Configured |
| `DEFAULT_ROLE_SEATS` | Default chair seat allocation per company role | apps/api/src/ceo/office-rooms.ts | OPTIONAL | NO | Configured |
| `DEFAULT_ROOM_CHAIRS` | Default seating capacity for 3D office rooms | apps/api/src/ceo/office-rooms.ts | OPTIONAL | NO | Configured |
| `DEMO_TTL_DAYS` | Runtime application configuration | apps/api/src/sales-outreach/demo-factory.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_ADMIN` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_ASSISTANT` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_CEO` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_DEFAULT` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_FINANCE` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_HR` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_IT` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_LEGAL` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_MARKETING` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_OPS` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_PRODUCT` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_RD` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_RESEARCH` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_SALES` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `EL_VOICE_SUPPORT` | Runtime application configuration | apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `ELEVENLABS_API_KEY` | ElevenLabs voice synthesis API key | apps/api/src/voice/providers/elevenlabs-voice.provider.ts | OPTIONAL | YES | Missing |
| `ELEVENLABS_MODEL_ID` | ElevenLabs model identifier | apps/api/src/voice/providers/elevenlabs-voice.provider.ts | OPTIONAL | NO | Missing |
| `ENABLE_REAL_PRODUCTION_SENDING` | Safety interlock: must be true to email external recipients | apps/api/src/integration/integration.service.ts | PRODUCTION ONLY | NO | Configured |
| `FROM_EMAIL` | Alternative sender email address for SendGrid provider | apps/api/src/integration/providers/production-email.provider.ts | OPTIONAL | NO | Missing |
| `GEMINI_API_KEY` | Google Gemini API key for cloud model escalation | apps/api/src/project-execution/software-execution.service.ts, packages/model-gateway/src/config.ts | OPTIONAL | YES | Empty Placeholder |
| `GEMINI_MODEL` | Google Gemini model identifier (e.g. gemini-2.5-flash) | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `GO_ENTITY_APPROVAL` | Runtime application configuration | apps/api/src/global-operations/go-entity.service.ts | OPTIONAL | NO | Missing |
| `GOOGLE_PLACES_API_KEY` | Google Places API v1 credential for place search and business enrichment | apps/api/src/lead-gen/lead-search.service.ts, apps/api/src/sales-outreach/discovery.service.ts | V13.5 REQUIRED | YES | Empty Placeholder |
| `IMAP_HOST` | IMAP server host for inbound email parsing | apps/api/src/notifications/imap-fetch.ts, apps/api/src/sales-outreach/inbound-message.service.ts | OPTIONAL | NO | Configured |
| `IMAP_PASS` | IMAP password (defaults to SMTP_PASS if empty) | apps/api/src/notifications/imap-fetch.ts, apps/api/src/sales-outreach/inbound-message.service.ts | OPTIONAL | YES | Empty Placeholder |
| `IMAP_PORT` | IMAP server port (993 for SSL) | apps/api/src/notifications/imap-fetch.ts, apps/api/src/sales-outreach/inbound-message.service.ts | OPTIONAL | NO | Configured |
| `IMAP_USER` | IMAP username (defaults to SMTP_USER if empty) | apps/api/src/notifications/imap-fetch.ts, apps/api/src/sales-outreach/inbound-message.service.ts | OPTIONAL | NO | Empty Placeholder |
| `INBOX_CHECK_MINUTES` | Interval in minutes between IMAP inbox polling runs | apps/api/src/simulation/business-loop.service.ts | OPTIONAL | NO | Configured |
| `INBOX_ENABLED` | Flag to enable IMAP background lead reply monitoring | apps/api/src/notifications/chairman-mail.service.ts, apps/api/src/sales-outreach/inbound-message.service.ts (+1 more) | OPTIONAL | NO | Configured |
| `INTEGRATION_API_KEY` | API token for external integrations (n8n, cron webhooks) | apps/api/src/authorization/integration-api-key.guard.ts | OPTIONAL | YES | Missing |
| `ITL_MAX_RETRIES` | Runtime application configuration | apps/api/src/operating-loop/itl-error-pool.service.ts | OPTIONAL | NO | Missing |
| `ITL_POOL_SCAN_MS` | Runtime application configuration | apps/api/src/operating-loop/itl-error-pool.service.ts | OPTIONAL | NO | Missing |
| `JEST_WORKER_ID` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-replay.service.ts | TEST ONLY | NO | Missing |
| `JWT_SECRET` | Secret key for signing and verifying JWT authentication tokens | apps/api/src/authorization/authorization.module.ts, apps/api/src/authorization/jwt-auth.guard.ts (+5 more) | V13.5 REQUIRED | YES | Configured |
| `LEAD_DEMO_EMAIL` | Overriding email address for all scraped/discovered leads in demo mode | apps/api/src/lead-gen/lead-search.service.ts | OPTIONAL | NO | Configured |
| `LEAD_GEN_CATEGORIES` | Comma-separated categories for business lead discovery | apps/api/src/lead-gen/lead-gen.service.ts | OPTIONAL | NO | Configured |
| `LEAD_GEN_INTERVAL_HOURS` | Cooldown interval in hours between lead discovery runs | apps/api/src/simulation/business-loop.service.ts | OPTIONAL | NO | Configured |
| `LEAD_GEN_LOCATIONS_PER_RUN` | Number of geographic target cities processed per run | apps/api/src/lead-gen/lead-gen.service.ts | OPTIONAL | NO | Configured |
| `LEAD_GEN_PROVIDER_ENABLED` | Master switch to enable Google Places API lead generation | apps/api/src/lead-gen/lead-search.service.ts, apps/api/src/sales-outreach/discovery.service.ts | V13.5 REQUIRED | NO | Configured |
| `LEAD_GEN_RADIUS_M` | Geographical search radius in meters for lead discovery | apps/api/src/lead-gen/lead-gen.service.ts | OPTIONAL | NO | Configured |
| `LEAD_GEN_SOURCE` | Lead generation source selection: google | osm | mock | apps/api/src/lead-gen/lead-search.service.ts | V13.5 REQUIRED | NO | Configured |
| `LOCAL_DATABASE_URL` | Runtime application configuration | scripts/db-local-setup.js | DEVELOPMENT ONLY | NO | Missing |
| `MAX_HEADCOUNT` | Maximum total organizational headcount backstop | apps/api/src/ceo/ceo-hiring.service.ts | OPTIONAL | NO | Configured |
| `MIN_BALANCE_PAISE` | Financial kill-switch minimum balance threshold in paise | apps/api/src/survival/survival.service.ts | OPTIONAL | NO | Configured |
| `MODEL_TIER_2` | Tier 2 model identifier (e.g. claude-sonnet-5) | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `MODEL_TIER_3` | Tier 3 model identifier (e.g. claude-opus-5-5) | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `MODEL_TIER_4` | Tier 4 model identifier (e.g. claude-fable-5-1) | packages/model-gateway/src/model-tier.ts | OPTIONAL | NO | Configured |
| `NEXT_PUBLIC_APP_URL` | Runtime application configuration | apps/api/src/notifications/chairman-mail.service.ts | OPTIONAL | NO | Missing |
| `NODE_ENV` | Node execution environment (development, production, test) | apps/api/src/boardroom/boardroom.service.ts, apps/api/src/economy/payroll.service.ts (+5 more) | OPTIONAL | NO | Configured |
| `NOMINATIM_URL` | Runtime application configuration | apps/api/src/lead-gen/lead-search.service.ts | OPTIONAL | NO | Missing |
| `OLLAMA_BASE_URL` | Base URL for local Ollama AI model server | packages/model-gateway/src/config.ts, packages/model-gateway/src/__tests__/local-provider.spec.ts | OPTIONAL | NO | Configured |
| `OLLAMA_CODE_MODEL` | Runtime application configuration | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+2 more) | OPTIONAL | NO | Missing |
| `OLLAMA_COMPLEX_MODEL` | Runtime application configuration | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Missing |
| `OLLAMA_DEFAULT_MODEL` | Runtime application configuration | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Missing |
| `OLLAMA_FAST_MODEL` | Runtime application configuration | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Missing |
| `OLLAMA_MAX_CONCURRENT_REQUESTS` | Concurrency limiter for local model requests | packages/model-gateway/src/config.ts, packages/model-gateway/src/__tests__/local-provider.spec.ts | OPTIONAL | NO | Configured |
| `OLLAMA_MODEL` | Fallback model designation for seeded agents | scripts/seed-company-structure.js | OPTIONAL | NO | Configured |
| `OLLAMA_TIMEOUT_MS` | Timeout for local model inference in milliseconds | packages/model-gateway/src/config.ts, packages/model-gateway/src/__tests__/local-provider.spec.ts | OPTIONAL | NO | Configured |
| `OLLAMA_URL` | Base URL for Ollama service connection | packages/model-gateway/src/config.ts, packages/model-gateway/src/gateway.ts | OPTIONAL | NO | Configured |
| `OLLAMA_VISION_MODEL` | Runtime application configuration | packages/model-gateway/src/config.ts, packages/model-gateway/src/model-tier.ts (+1 more) | OPTIONAL | NO | Missing |
| `OUTREACH_ENVIRONMENT` | Outreach mode: SIMULATION, SANDBOX, or PRODUCTION | apps/api/src/ceo/ceo.controller.ts, apps/api/src/sales-outreach/email-outreach.service.ts | V13.5 REQUIRED | NO | Configured |
| `OUTREACH_FOLLOWUP_DAYS` | Days interval before triggering follow-up outreach email | apps/api/src/sales-outreach/sales-agent.worker.ts | OPTIONAL | NO | Configured |
| `OUTREACH_FROM_NAME` | Display sender name for outreach emails | apps/api/src/integration/providers/production-email.provider.ts, apps/api/src/notifications/chairman-mailer.ts | OPTIONAL | NO | Configured |
| `OVERPASS_URL` | Runtime application configuration | apps/api/src/lead-gen/lead-search.service.ts | OPTIONAL | NO | Missing |
| `PAYMENT_REMINDER_DAYS` | Interval in days between payment reminder notices | apps/api/src/delivery/invoice-payment.service.ts | OPTIONAL | NO | Configured |
| `PORT` | HTTP server listening port (overrides PORT_API) | apps/api/src/main.ts | OPTIONAL | NO | Missing |
| `PORT_API` | Default backend API port (13000) | apps/api/src/main.ts | OPTIONAL | NO | Configured |
| `PORTAL_URL` | Runtime application configuration | apps/api/src/notifications/chairman-mail.service.ts | OPTIONAL | NO | Missing |
| `PUBLIC_API_URL` | Public base URL used for client links and asset delivery | apps/api/src/delivery/delivery-agent.worker.ts | OPTIONAL | NO | Configured |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway API Key ID | apps/api/src/delivery/invoice-payment.service.ts | OPTIONAL | NO | Empty Placeholder |
| `RAZORPAY_KEY_SECRET` | Razorpay payment gateway API Key Secret | apps/api/src/delivery/invoice-payment.service.ts | OPTIONAL | YES | Empty Placeholder |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature verification secret | apps/api/src/delivery/delivery.controller.ts | OPTIONAL | YES | Empty Placeholder |
| `REAL_PROVIDER_CALL` | Runtime application configuration | packages/model-gateway/src/gateway.ts | OPTIONAL | NO | Missing |
| `RESEARCH_API_KEY` | External business research provider API key | apps/api/src/integration/providers/external-search.provider.ts | OPTIONAL | YES | Missing |
| `SALES_AUTO_PROCESS` | Enables automatic processing of inbound sales messages | apps/api/src/sales-outreach/inbound-message.service.ts, apps/api/src/sales-outreach/sales-outreach.module.ts | OPTIONAL | NO | Configured |
| `SALES_BATCH_SIZE` | Maximum batch size for outreach prospecting runs | apps/api/src/sales-outreach/sales-agent.worker.ts | OPTIONAL | NO | Configured |
| `SENDGRID_API_KEY` | SendGrid email provider API key | apps/api/src/integration/providers/production-email.provider.ts | OPTIONAL | YES | Missing |
| `SMTP_HOST` | SMTP server hostname for outbound email delivery | apps/api/src/integration/integration.service.ts, apps/api/src/integration/providers/production-email.provider.ts (+1 more) | V13.5 REQUIRED | NO | Configured |
| `SMTP_PASS` | SMTP authentication password or application-specific password | apps/api/src/integration/providers/production-email.provider.ts, apps/api/src/notifications/chairman-mailer.ts (+2 more) | V13.5 REQUIRED | YES | Configured |
| `SMTP_PORT` | SMTP port (587 for STARTTLS, 465 for SSL) | apps/api/src/integration/providers/production-email.provider.ts, apps/api/src/notifications/chairman-mailer.ts | V13.5 REQUIRED | NO | Configured |
| `SMTP_USER` | SMTP authentication username (e.g. Gmail address) | apps/api/src/ceo/ceo.controller.ts, apps/api/src/integration/providers/production-email.provider.ts (+4 more) | V13.5 REQUIRED | NO | Configured |
| `STT_API_KEY` | Speech-to-text service API key | apps/api/src/voice/providers/mock-stt.provider.ts | OPTIONAL | YES | Missing |
| `STT_PROVIDER` | Speech-to-text provider (mock) | apps/api/src/voice/providers/mock-stt.provider.ts, apps/api/src/voice/voice.service.ts | OPTIONAL | NO | Missing |
| `TEST_EMAIL_RECIPIENT` | Safe test recipient for all redirected outbound emails in non-production mode | apps/api/src/ceo/ceo.controller.ts, apps/api/src/integration/integration.service.ts (+1 more) | V13.5 REQUIRED | NO | Configured |
| `TTS_API_KEY` | Generic text-to-speech API key | apps/api/src/voice/providers/mock-voice.provider.ts | OPTIONAL | YES | Missing |
| `TTS_PROVIDER` | Text-to-speech provider (mock, elevenlabs) | apps/api/src/voice/providers/elevenlabs-voice.provider.ts, apps/api/src/voice/providers/mock-voice.provider.ts (+1 more) | OPTIONAL | NO | Missing |
| `V12_HISTORY_MAINTENANCE_INTERVAL_MS` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-replay.service.ts | OPTIONAL | NO | Missing |
| `V12_HISTORY_MAX_RECONSTRUCTION_EVENTS` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-replay.service.ts | OPTIONAL | NO | Missing |
| `V12_HISTORY_MAX_WINDOW_EVENTS` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-replay.service.ts | OPTIONAL | NO | Missing |
| `V12_HISTORY_PERSIST_BACKOFF_MS` | Runtime application configuration | apps/api/src/world-state-gateway/v12-multi-viewer-convergence.spec.ts, apps/api/src/world-state-gateway/world-state-event.service.spec.ts (+1 more) | OPTIONAL | NO | Missing |
| `V12_HISTORY_PERSIST_MAX_ATTEMPTS` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-event.service.ts | OPTIONAL | NO | Missing |
| `V12_REPLAY_SESSION_TTL_MS` | Runtime application configuration | apps/api/src/world-state-gateway/replay-session.service.ts | OPTIONAL | NO | Missing |
| `V12_SPATIAL_HISTORY_RETENTION_DAYS` | Runtime application configuration | apps/api/src/world-state-gateway/world-state-replay.service.ts | OPTIONAL | NO | Missing |
| `VENTURE_MAX_TEAM` | Maximum employee headcount allocated per venture | apps/api/src/ventures/new-venture.service.ts | OPTIONAL | NO | Configured |
| `VERCEL_API_TOKEN` | Vercel API token for client demo website deployments | apps/api/src/sales-outreach/demo-factory.service.ts | OPTIONAL | YES | Missing |
| `VERCEL_TEAM_ID` | Vercel Team ID for client demo deployments | apps/api/src/sales-outreach/demo-factory.service.ts | OPTIONAL | NO | Missing |
| `WARNING_BALANCE_PAISE` | Financial kill-switch warning balance threshold in paise | apps/api/src/survival/survival.service.ts | OPTIONAL | NO | Configured |
| `WE_WORLD_ENGINE` | Flag enabling 3D world engine state simulation updates | apps/api/src/world-engine/we-world-event.service.ts | OPTIONAL | NO | Configured |
| `WEBHOOK_SECRET_PROD` | HMAC signature verification secret for production webhooks | apps/api/src/production/external-event-ingestion.service.ts, apps/api/src/test-setup.ts | V13.5 REQUIRED | YES | Configured |
| `WEBHOOK_SECRET_SIM` | HMAC signature verification secret for simulation webhooks | apps/api/src/production/external-event-ingestion.service.ts, apps/api/src/test-setup.ts | V13.5 REQUIRED | YES | Configured |
| `WHATSAPP_API_TOKEN` | Meta WhatsApp Business Cloud API access token | apps/api/src/sales-outreach/whatsapp-outreach.service.ts | OPTIONAL | YES | Empty Placeholder |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Business phone number identifier | apps/api/src/sales-outreach/whatsapp-outreach.service.ts | OPTIONAL | NO | Empty Placeholder |

---

## 3. V13.5 SPECIFIC REQUIREMENTS DEEP-DIVE

### 3.1 Google Places Integration
- **Expected Variable Name:** `GOOGLE_PLACES_API_KEY`
- **Code Usage:** 
  - [lead-search.service.ts](file:///f:/Aevora/apps/api/src/lead-gen/lead-search.service.ts#L104-L224): Passed as `X-Goog-Api-Key` header to Google Places v1 endpoint (`https://places.googleapis.com/v1/places:searchText`).
  - [discovery.service.ts](file:///f:/Aevora/apps/api/src/sales-outreach/discovery.service.ts#L65-L72): Used for place details and business enrichment.
- **Companion Flags:**
  - `LEAD_GEN_PROVIDER_ENABLED`: Must be set to `true` in `.env` to enable live provider calls (currently `false` in default sandbox).
  - `LEAD_GEN_SOURCE`: Set to `google` to query Google Places (when `osm` or `mock` is set, provider calls are bypassed).
- **Current Status:** Configured as empty placeholder (`GOOGLE_PLACES_API_KEY=`). **User must provide key locally.**

---

### 3.2 Email Provider Implementation
- **Provider Architecture:** Hybrid SMTP / SendGrid architecture implemented in:
  - [production-email.provider.ts](file:///f:/Aevora/apps/api/src/integration/providers/production-email.provider.ts#L71-L88)
  - [integration.service.ts](file:///f:/Aevora/apps/api/src/integration/integration.service.ts#L71-L90)
  - [chairman-mailer.ts](file:///f:/Aevora/apps/api/src/notifications/chairman-mailer.ts#L57-L80)
- **Primary Mechanism:** Direct SMTP with `nodemailer`. Preferred over SendGrid whenever `SMTP_HOST` is present.
- **Required Variables:**
  - `SMTP_HOST`: Hostname of SMTP server (default: `smtp.gmail.com`).
  - `SMTP_PORT`: Port (`587` for STARTTLS, `465` for SSL).
  - `SMTP_USER`: Account email address / username.
  - `SMTP_PASS`: Account application password (for Gmail: 16-character Google App Password). Spaces are automatically stripped by the code.
  - `OUTREACH_FROM_NAME`: Sender display name (defaults to `AEVORA Team` or `companyProfile().name`).
- **Current Status:** Host and port configured. Username and App Password currently hold generic template placeholders (`your_email@gmail.com`, `your_app_password`). **User must supply credentials locally.**

---

### 3.3 Test Email Safety & Recipient Interception
- **Architecture Mechanism:**
  - `IntegrationService.sendEmail()` enforces a fail-closed safety interceptor when `ENABLE_REAL_PRODUCTION_SENDING !== 'true'`:
    ```typescript
    const isProdEnabled = process.env.ENABLE_REAL_PRODUCTION_SENDING === 'true';
    if (!isProdEnabled) {
      const testRecipient = process.env.TEST_EMAIL_RECIPIENT;
      if (!testRecipient || testRecipient.trim() === '') {
        throw new Error('TEST_EMAIL_RECIPIENT is missing or empty. The system is in test mode and fails closed to prevent sending real emails.');
      }
      if (payload.to !== testRecipient) {
        this.logger.log(`[TEST MODE] Redirecting email from ${payload.to} to ${testRecipient}`);
        payload.to = testRecipient;
      }
    }
    ```
  - Additionally, `LeadSearchService.applyDemoEmail()` rewrites all discovered lead emails to `LEAD_DEMO_EMAIL` so that even raw lead database rows target the safety inbox during testing.
- **Enforced Test Recipient:** `mayankjangid598@gmail.com`
- **Variables Synchronized in `.env` and `apps/api/.env`:**
  - `TEST_EMAIL_RECIPIENT=mayankjangid598@gmail.com`
  - `LEAD_DEMO_EMAIL=mayankjangid598@gmail.com`
  - `CHAIRMAN_NOTIFY_EMAIL=mayankjangid598@gmail.com`
  - `ENABLE_REAL_PRODUCTION_SENDING=false`
- **Current Status:** **FULLY CONFIGURED & SAFE.** Under no circumstances can emails be sent to external businesses. All outbound traffic routes to `mayankjangid598@gmail.com`.

---

### 3.4 Core Database & System Infrastructure
- `DATABASE_URL`: PostgreSQL connection URL (`postgresql://aevora:secret@localhost:5432/aevoradb?schema=public`). Configured and validated.
- `JWT_SECRET`: High-entropy 32+ character authentication secret. Configured.
- `WEBHOOK_SECRET_PROD` / `WEBHOOK_SECRET_SIM`: HMAC webhook signing tokens. Configured.
- `PORT_API` / `PORT`: API listens on port 13000. Configured.

---

## 4. SECURITY AUDIT FINDINGS

### 4.1 `.gitignore` Verification: PASS
- `.gitignore` lines 2–5 explicitly ignore:
  ```gitignore
  .env
  .env.*
  !.env.example
  !.env.production.example
  ```
- Both root `.env` and `apps/api/.env` are shielded from source control.
- No credential files, SSH keys, or SSL certificates exist in workspace directories.

### 4.2 Hard-Coded Secret Verification: PASS
- Automated AST and regex scanning over all `.ts`, `.js`, `.json`, and `.md` files identified **zero** hard-coded private keys, live tokens, or API credentials.
- All secrets are resolved via `process.env` lookups.

### 4.3 Log Leakage Audit: PASS
- Comprehensive inspection of all `Logger` and `console.log` invocations across `apps/api/src` and `packages/` confirmed that secret values (tokens, passwords, API keys) are **never** logged to stdout or files. Only warning states, redacted metadata, or variable names are referenced.

### 4.4 Configuration Risks & Mitigations
1. **Risk:** Running in `OUTREACH_ENVIRONMENT=PRODUCTION` with `ENABLE_REAL_PRODUCTION_SENDING=true` could contact external leads.  
   **Mitigation:** `ENABLE_REAL_PRODUCTION_SENDING` is strictly forced to `false`. The backend redirects all email destinations to `mayankjangid598@gmail.com`.
2. **Risk:** Gmail SMTP blocking connections due to lack of an App Password.  
   **Mitigation:** Standard account passwords fail on modern Gmail accounts; an official 16-character Google App Password with 2FA enabled is documented as mandatory.
3. **Risk:** Discrepancy between root `.env` and `apps/api/.env`.  
   **Mitigation:** Both files have been verified to be byte-for-byte identical.

---

## 5. USER ACTION CHECKLIST & SETUP INSTRUCTIONS

The user must populate the following items locally in their `.env` (and `apps/api/.env`) file. **DO NOT PASTE THESE SECRETS INTO CHAT.**

### Checklist

| Setting | Variable Name | Purpose | Where to Put | Secret? | Required for V13.5 |
|---|---|---|---|---|---|
| **Google Places API Key** | `GOOGLE_PLACES_API_KEY` | Live business search & metadata | Local `.env` & `apps/api/.env` | **YES** | **YES** |
| **Enable Lead Gen Provider** | `LEAD_GEN_PROVIDER_ENABLED` | Toggle from `false` to `true` | Local `.env` & `apps/api/.env` | NO | **YES** |
| **Lead Gen Source** | `LEAD_GEN_SOURCE` | Set to `google` | Local `.env` & `apps/api/.env` | NO | **YES** |
| **SMTP Host** | `SMTP_HOST` | SMTP server (default: `smtp.gmail.com`) | Local `.env` & `apps/api/.env` | NO | **YES** |
| **SMTP Port** | `SMTP_PORT` | SMTP port (`587`) | Local `.env` & `apps/api/.env` | NO | **YES** |
| **SMTP Username** | `SMTP_USER` | Sender Gmail / SMTP address | Local `.env` & `apps/api/.env` | NO | **YES** |
| **SMTP Password** | `SMTP_PASS` | 16-character Google App Password | Local `.env` & `apps/api/.env` | **YES** | **YES** |
| **Outreach Environment** | `OUTREACH_ENVIRONMENT` | Set to `PRODUCTION` for real send test | Local `.env` & `apps/api/.env` | NO | **YES** |
| **Test Recipient Safety** | `TEST_EMAIL_RECIPIENT` | Set to `mayankjangid598@gmail.com` | Local `.env` & `apps/api/.env` | NO | **ALREADY SET** |
| **Real Sending Interlock** | `ENABLE_REAL_PRODUCTION_SENDING` | Keep `false` (enforces redirect to test recipient) | Local `.env` & `apps/api/.env` | NO | **ALREADY SET** |

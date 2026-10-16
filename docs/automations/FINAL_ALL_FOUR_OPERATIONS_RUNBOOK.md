# AEVORA — Complete Four-Automation Operations Runbook

**Version:** 1.0.0 (Production-Ready)  
**Applicable Workspace:** `E:\Aevora`  
**Target Architecture:** AEVORA Four-Stage Customer Acquisition Pipeline  
**Runtime Services:** PostgreSQL (`:5432`), NestJS API (`:13000`), n8n Engine (`:5678`), Ollama Inference (`:11434`)  
**Strict Safety Policy:** Zero Unattended Outreach | Delivery Interception Enabled by Default

---

## 1. System Architecture & Pipeline Overview

The AEVORA Customer Acquisition System orchestrates four discrete, decoupled automation stages:

```
[ Stage 1: Lead Finding ]
  Google Places API v1 searchText
           │
           ▼
[ Stage 2: Enrichment & Verification ]
  Safe Web Crawl (SSRF Protected) + DNS/MX Check + Local Ollama Fact Extraction
           │
           ▼
[ Stage 3: Opportunity Scoring & Research ]
  Deterministic 5-Factor Score Math (0-100) + Ollama Research Brief
           │
           ▼
[ Stage 4: Outreach Drafting & Delivery Safeguard ]
  AI Value Pitch + Human Review Gate (ApprovalRequest) + Blocked External Dispatch
```

| Automation | Core Service | n8n Workflow ID | Production Active State | Primary Responsibility |
|---|---|---|:---:|---|
| **#1 Google Maps Lead Finding** | `LeadNormalizerService` | `Q9N7ZD67zRlwdUNl` | **Active (`true`)** | Ingests Google Places v1 data, normalizes fields, deduplicates by Place ID & domain, persists to `SalesLead`. |
| **#2 Lead Enrichment & Verification** | `LeadEnrichmentService` | `ald9mQlsl4vfvSts` | **Active (`true`)** | Scrapes website (under scoped allowlist), extracts facts with Ollama, validates MX records, stores provenance. |
| **#3 AI Sales Research & Scoring** | `SalesResearchService` | `ZvRwotA7iTKBQNAp` | **Inactive (`false`)** | Generates executive summary, pain points, and deterministic opportunity score (0-100). |
| **#4 AI Sales Outreach & Follow-up** | `SalesOutreachService` | `BX5Vds0k1bBi9fuB` | **Inactive (`false`)** | Generates evidence-based draft, requires human approval, strictly blocks external transmission by default. |

---

## 2. Security & Safeguard Architecture

### 2.1 The Four-Layer Outbound Protection Model
To ensure that no prospect is ever contacted without explicit authorization, AEVORA enforces four defense-in-depth barriers:

1. **Server-Side Dispatch Interception (`SalesOutreachService.sendOutreach`):**
   - Even if invoked via direct HTTP POST or internal function call, dispatch evaluates `process.env.ENABLE_REAL_PRODUCTION_SENDING === 'true'` and `process.env.OUTREACH_ENVIRONMENT === 'PRODUCTION'`.
   - When false/sandbox, dispatch returns `status: BLOCKED_BY_SAFEGUARD`, sets `deliveryStatus: DISABLED`, logs an audit record, and executes **ZERO** external network calls.
2. **Safe Mode Network Guard (`safeMode()`):**
   - Controlled by `AEVORA_SAFE_MODE=true`.
   - Outbound HTTP/HTTPS requests from Node.js runtime are blocked except for `localhost` (Ollama/Postgres) and explicitly allowlisted hosts specified in `SAFE_MODE_ALLOWED_HOSTS`.
3. **Workflow Orchestration State:**
   - Automations #3 and #4 are configured as `active: false` in the n8n workflow engine. No cron triggers, polling loops, or unattended triggers exist.
4. **Persistent Email Suppression (`EmailSuppression` Table):**
   - Recipients with active opt-out, hard bounce, or manual suppression cannot have drafts generated or dispatched regardless of approval status.

### 2.2 Standard Environment Configuration (`.env`)
```ini
# Core Environment
PORT=13000
NODE_ENV=production
AEVORA_SAFE_MODE=true

# Outbound Transmission Safeguards (STRICTLY REQUIRED FOR SAFE OPERATION)
ENABLE_REAL_PRODUCTION_SENDING=false
OUTREACH_ENVIRONMENT=SANDBOX
ALLOW_EXTERNAL_OUTREACH=

# Local Ollama Inference
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_TIMEOUT_MS=90000

# Scoped Live Crawling Allowlist (Comma-separated hostnames for Stage 2 live enrichment)
SAFE_MODE_ALLOWED_HOSTS=
```

---

## 3. Automation-by-Automation Operator Guide

### Automation #1: Google Maps Lead Finding
- **Endpoint:** `POST /automation/leads/ingest`
- **Controller/Service:** `LeadNormalizerService`
- **Upstream API:** Google Places API v1 (`places.googleapis.com/v1/places:searchText`)
- **Key Behavior:**
  - Field normalization converts raw Google Places JSON into standard CRM fields (`name`, `website`, `contactPhone`, `geography`, `googlePlaceId`, `qualityScore`).
  - Deduplication prevents duplicate leads for the same business: checks both `googlePlaceId` and normalized domain. Repeat ingestion returns `created: 0, duplicates: 1`.
  - Tenant isolation: every lead is strictly bound to `companyId`.

#### Operator Procedure:
1. Ensure `GOOGLE_PLACES_API_KEY` is present in `.env`.
2. To trigger ingestion for a target category and geography:
   ```bash
   curl -X POST http://127.0.0.1:13000/automation/leads/ingest \
     -H "Content-Type: application/json" \
     -d '{"companyId":"<TENANT_ID>","category":"dentist","location":"Austin, TX","limit":5}'
   ```
3. Monitor deduplication in API logs:
   `[LeadNormalizerService] Ingestion completed for company <TENANT_ID>: X created, Y duplicates, 0 invalid`

---

### Automation #2: Live Lead Enrichment & Verification
- **Endpoint:** `POST /automation/leads/:id/enrich`
- **Controller/Service:** `LeadEnrichmentService`
- **Key Services:** `WebsiteExtractorService`, `EmailVerifierService`, `OllamaClientService`
- **Key Behavior:**
  - **SSRF Defenses:** Validates protocols (`http:`, `https:`), blocks internal hosts (`localhost`, `.local`, `.internal`), blocks IPv4/IPv6 private ranges (RFC 1918, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local and cloud metadata (`169.254.169.254`), and enforces DNS rebinding socket checks via custom lookup.
  - **Redirect Handling:** Safely follows up to 3 redirects, re-validating each intermediate target against SSRF and safe-mode rules.
  - **Data Limits:** Truncates responses exceeding 512 KB and clean text exceeding 10,000 characters.
  - **Ollama Fact Extraction:** Prompt instructions treat scraped text as untrusted data, extracting description, services list, phone numbers, and social links.
  - **DNS/MX Check:** Performs DNS MX lookup. Note: An active MX record confirms domain mail exchange capability, NOT individual mailbox existence.

#### Operator Procedure for Live Enrichment:
1. To permit crawling a specific public business domain in safe mode, add its host to `SAFE_MODE_ALLOWED_HOSTS`:
   ```bash
   export SAFE_MODE_ALLOWED_HOSTS="www.targetdomain.com,targetdomain.com"
   ```
2. Trigger lead enrichment:
   ```bash
   curl -X POST http://127.0.0.1:13000/automation/leads/<LEAD_ID>/enrich \
     -H "Content-Type: application/json" \
     -d '{"companyId":"<TENANT_ID>"}'
   ```
3. Verify enrichment score (0-100) and metadata stored on the lead:
   - Reachability (`statusCode: 200`, `reachable: true`)
   - Extracted business facts
   - Email verification result

---

### Automation #3: AI Sales Research & Opportunity Scoring
- **Endpoint:** `POST /automation/research/leads/:id`
- **Controller/Service:** `SalesResearchService`
- **Key Services:** `OpportunityScoringEngine`, `OllamaClientService`
- **Key Behavior:**
  - **Deterministic Opportunity Score:** Calculated strictly by code math across 5 transparent components:
    1. *Commercial Fit* (25% weight): Industry ICP alignment, business size, ratings volume.
    2. *Digital Modernization* (25% weight): Online booking presence, website modernization, social channels.
    3. *Operational Maturity* (20% weight): Multi-location or professional infrastructure indicators.
    4. *Contactability* (15% weight): Direct contact email, verified MX records, phone number.
    5. *Service Expansion* (15% weight): High-margin service offerings and diversification.
  - **Ollama Research Brief:** Produces structured executive summary, pain points, opportunities, and recommended value proposition using local `qwen2.5:7b`.
  - **Idempotency:** If a lead has already been researched and `forceRefresh` is false, returns `status: SKIPPED` with cached brief.
  - **No Hallucinations:** Engine marks unknown decision-makers as `Unknown` rather than fabricating names or emails.

#### Operator Procedure:
1. Verify Ollama is running and responding:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```
2. Execute opportunity research on an enriched lead:
   ```bash
   curl -X POST http://127.0.0.1:13000/automation/research/leads/<LEAD_ID> \
     -H "Content-Type: application/json" \
     -d '{"companyId":"<TENANT_ID>"}'
   ```
3. Review returned `opportunityScore`, `priority` (`HIGH` / `MEDIUM` / `LOW`), and recommendation (`QUALIFIED` / `NEEDS_MORE_INFO` / `DISQUALIFIED`).

---

### Automation #4: AI Sales Outreach & Delivery Safeguards
- **Endpoints:**
  - `POST /automation/outreach/leads/:id/draft` (Generate or regenerate draft)
  - `POST /automation/outreach/leads/:id/approve` (Human review & approval)
  - `POST /automation/outreach/leads/:id/send` (Attempted dispatch)
- **Controller/Service:** `SalesOutreachService`
- **Key Behavior:**
  - **AI Drafting:** Drafts customized, factual email copy based strictly on verified research brief data.
  - **Human Approval Gate:** Creates an `ApprovalRequest` record. Draft status is set to `APPROVAL_PENDING`.
  - **Stale Approval Invalidation:** If a draft is edited or regenerated, all prior `PENDING` or `APPROVED` requests are automatically cancelled (`CANCELLED`).
  - **Delivery Safeguard:** When `ENABLE_REAL_PRODUCTION_SENDING=false`, calling `/send` returns:
    `status: BLOCKED_BY_SAFEGUARD`, `deliveryStatus: DISABLED`.

#### Operator Procedure:
1. Generate draft:
   ```bash
   curl -X POST http://127.0.0.1:13000/automation/outreach/leads/<LEAD_ID>/draft \
     -H "Content-Type: application/json" \
     -d '{"companyId":"<TENANT_ID>"}'
   ```
2. Operator inspects subject, body, and personalization facts.
3. If approved by human reviewer:
   ```bash
   curl -X POST http://127.0.0.1:13000/automation/outreach/leads/<LEAD_ID>/approve \
     -H "Content-Type: application/json" \
     -d '{"companyId":"<TENANT_ID>","actorId":"human-operator","reason":"Verified factual accuracy"}'
   ```
4. Sending is blocked by default until explicit authorization protocol is completed.

---

## 4. Protocol for Authorizing Real External Email Delivery

> [!CAUTION]
> Real email transmission must NEVER be activated without satisfying all five prerequisites below. Violating this protocol risks domain reputation damage, spam complaints, and unauthorized customer contact.

### 5 Mandatory Prerequisites Before Live Transmission:
1. **Explicit Written Owner Authorization:** Written confirmation from the platform owner specifically designating the tenant ID and maximum number of allowed recipients.
2. **Domain Authentication Records Active:**
   - SPF record configured (`v=spf1 include:... ~all`)
   - DKIM signing keys verified and aligned with sending domain
   - DMARC policy record published (`v=DMARC1; p=quarantine; ...`)
3. **Production SMTP/SES Provider Configured:**
   - Verified sending address matching the authenticated domain
   - TLS encryption enforced on port 587 / 465
   - Bounce and complaint webhook handling configured
4. **Suppression Database Synchronization:**
   - Global unsubscribe and suppression list loaded into `EmailSuppression` table
   - Competitor and existing client exclusion rules active
5. **Dry-Run Confirmation:**
   - Single test message sent to an internal control mailbox (`chairman@aevora.com` or operator email) verifying layout, links, and unsubscribe footer before any prospect contact.

### Safe Activation Procedure (Once Prerequisites Are Satisfied):
1. In `.env`, set:
   ```ini
   ENABLE_REAL_PRODUCTION_SENDING=true
   OUTREACH_ENVIRONMENT=PRODUCTION
   ALLOW_EXTERNAL_OUTREACH=true
   ```
2. Restart the NestJS API.
3. Transmit only approved drafts for explicitly authorized leads.

---

## 5. Health Check & Diagnostic Verification Commands

Operators should use these exact commands to verify system health and test regression status:

### Quick Health Check Command
```bash
curl -s http://127.0.0.1:13000/health
# Expected: {"status":"ok","info":{"database":{"status":"up"}}}
```

### Full System Diagnostic Check
```powershell
# 1. API Health
curl.exe -s http://127.0.0.1:13000/health

# 2. n8n Engine Health
curl.exe -s http://127.0.0.1:5678/healthz

# 3. Ollama Engine Health & Model Verification
curl.exe -s http://127.0.0.1:11434/api/tags

# 4. Database Lead Count Invariant Check (Must equal 11 for production tenant)
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.salesLead.count({where:{companyId:'9d98b53b-3b79-45b8-9bb9-6cbac171bc3c'}}).then(c=>{console.log('Production Tenant Lead Count:', c);p.\$disconnect();});"
```

### Full Four-Automation Acceptance Regression Command
```powershell
node C:\Users\mayan\.gemini\antigravity-ide\brain\2d5bdaa3-41b7-4564-8fc1-b396c960cebe\scratch\test-complete-four-automations.js
```

---

## 6. Emergency Shutdown & Incident Response

If unexpected network activity, unintentional draft dispatch, or error cascades occur:

1. **Immediate Outbound Kill Switch:**
   In `E:\Aevora\.env`, ensure:
   ```ini
   ENABLE_REAL_PRODUCTION_SENDING=false
   AEVORA_SAFE_MODE=true
   ALLOW_EXTERNAL_OUTREACH=
   OUTREACH_ENVIRONMENT=SANDBOX
   ```
2. **Restart API Service:**
   ```powershell
   Get-Process -Name node | Stop-Process -Force
   node E:\Aevora\scripts\start-api.js
   ```
3. **Deactivate All n8n Workflows:**
   Ensure Workflows `ZvRwotA7iTKBQNAp` (#3) and `BX5Vds0k1bBi9fuB` (#4) are set to `active: false` in n8n.
4. **Audit Log Inspection:**
   Query the `SalesAuditEvent` and `LeadGenAudit` tables in PostgreSQL to identify any actions performed during the incident window.

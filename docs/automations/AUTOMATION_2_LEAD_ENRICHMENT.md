# AEVORA Automation #2: Lead Enrichment & Verification Integration Guide

**Automation ID:** `automation-2-lead-enrichment`  
**Internal Name:** Lead Enrichment & Multi-Source Verification  
**Workflow Definition File:** `n8n/2.lead-enrichment.json`  
**Integration Status:** Complete (Production-Engineered & Live-Verified)  
**Target Architecture:** Zero-Mandatory-Cost Local Pipeline (AEVORA Core API + Local Ollama + Node.js Native DNS/MX + Local n8n Daemon + SSRF-Safe Multi-Page Extractor)

---

## 1. Overview and Architecture

AEVORA Automation #2 provides automated lead enrichment, website verification, domain/MX record verification, structured LLM extraction, and evidence-grounded lead qualification for leads discovered via Automation #1 or imported from other company channels.

The architecture is built from the ground up for **zero mandatory cost**, running entirely on self-hosted, local infrastructure without requiring paid API subscriptions:

- **Local LLM Extraction:** Self-hosted Ollama running `qwen2.5:7b` (or other local models) for structured JSON extraction and business summarization.
- **Native DNS & MX Verification:** Node.js native `dns.promises.resolveMx` and `resolve4` capabilities without external verification API costs.
- **SSRF-Safe Crawler:** Built-in multi-page HTML extractor with strict SSRF defense (blocking private ranges, AWS/GCP/Azure metadata, DNS rebinding, redirect re-validation), priority business page crawling, size caps, and timeouts.
- **n8n Orchestration:** Version-controlled workflow (`n8n/2.lead-enrichment.json`) executing on the local n8n instance (`http://localhost:5678`).
- **Audit & CRM Persistence:** Enriched facts, conflict provenance, quality scores, and verification evidence stored in Prisma `SalesLead.metadata.enrichment` and `LeadGenAudit`.

### Architecture Flow Diagram

```
[ AEVORA UI / Admin / Cron / n8n Trigger ]
                     │
                     │ (Authorized Request: JWT or x-integration-key + x-company-id)
                     ▼
         [ POST /automation/webhook/enrichment ]
         [ POST /automation/enrichment/start   ]
                     │
                     ▼
        [ LeadEnrichmentService ]
                     │
     ┌───────────────┴──────────────────────────┐
     ▼                                          ▼
[ Tenant Isolation Guard ]            [ Candidate Lead Selection ]
- Validates companyId                 - Prioritizes pending/unenriched leads
- Never mixes tenant leads             - Idempotent: skips already ENRICHED leads
                                      - Bounded concurrency (concurrency = 2)
                     │
                     ▼
        [ Website Reachability & Extraction ]
        (WebsiteExtractorService)
        - SSRF Protection: Rejects 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
          192.168.0.0/16, 169.254.169.254 (cloud metadata), 0.0.0.0, localhost
        - Re-validates redirects at each hop (max 3 redirects)
        - Timeout: 10s per page | Response size cap: 512KB
        - Priority crawl: Homepage -> /about -> /contact -> /services
        - Extracts raw text, tel links, mailto links, social links
                     │
                     ▼
        [ Ollama LLM Structured Extraction ]
        (OllamaClientService)
        - Base URL: http://localhost:11434 (model: qwen2.5:7b)
        - Strict System Prompt Shielding: Webpage text treated as untrusted data
        - Enforces strict JSON output schema (description, services, emails, phones)
        - Fallback heuristic parser if LLM offline or non-compliant
                     │
                     ▼
        [ Native DNS / MX Record Verification ]
        (EmailVerifierService)
        - RFC 5322 syntax validation
        - Native Node.js dns.promises.resolveMx lookup
        - Classifications: SYNTAX_INVALID, DOMAIN_NOT_FOUND, NO_MX_RECORDS, VALID_SYNTAX_MX
        - Rule: MX records confirm email-receiving capability; inbox deliverability is never claimed
                     │
                     ▼
        [ Quality Scoring & Conflict Recording ]
        - Score: 0 - 100 points based on 5 weighted factors
        - Preserves source provenance; logs differences as conflicts
        - Auto-promotes SalesLead.qualityScore and status (NEW -> QUALIFIED if score >= 60)
                     │
                     ▼
        [ CRM Persistence & Audit Trail ]
        - Updates SalesLead.metadata.enrichment
        - Creates LeadGenAudit record (ENRICHMENT_COMPLETED or ENRICHMENT_FAILED)
```

---

## 2. Zero-Mandatory-Cost Architecture & Providers

AEVORA strictly enforces a zero-mandatory-cost model for Automation #2. No paid subscriptions (OpenAI, Anthropic, Hunter.io, Firecrawl, Brave Search) are required for complete operational functionality:

| Component | Default Free Provider | Cost | Fallback / Alternative |
|---|---|---|---|
| **LLM Classification & Extraction** | Local Ollama (`qwen2.5:7b`) | $0.00 | Heuristic Regex & DOM extraction |
| **Email MX Verification** | Native Node.js `dns.promises` | $0.00 | Syntax-only verification |
| **Website Crawling** | Built-in SSRF-safe HTTP extractor | $0.00 | Self-hosted Crawl4AI (`CRAWL4AI_URL`) |
| **Workflow Automation** | Local self-hosted n8n (`localhost:5678`) | $0.00 | Direct API execution (`LeadEnrichmentService`) |
| **Database & Persistence** | PostgreSQL (Docker/local) | $0.00 | Existing AEVORA database |

### Optional Providers (Disabled by Default)
If configured in `.env`, optional external services can be enabled:
- `CRAWL4AI_URL`: If a dedicated Crawl4AI service container is running, the crawler automatically delegates extraction to it.

---

## 3. Environment Variables & Configuration

All settings are configured via `.env` and validated through AEVORA's environment system:

| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `OLLAMA_BASE_URL` | Local Ollama HTTP API endpoint | `http://localhost:11434` | Yes (for LLM extraction) |
| `OLLAMA_MODEL` | Ollama model name | `qwen2.5:7b` | Yes (for LLM extraction) |
| `OLLAMA_TIMEOUT_MS` | Maximum inference timeout in milliseconds | `90000` | No |
| `N8N_API_URL` | Local n8n instance API base URL | `http://localhost:5678` | Yes (for n8n triggering) |
| `N8N_API_KEY` | n8n REST API key | Configured in n8n | Yes (for n8n triggering) |
| `INTEGRATION_API_KEY` | Service-to-service key for webhooks | Configured in `.env` | Yes (for webhooks) |
| `CRAWL4AI_URL` | Optional external Crawl4AI service URL | `""` (empty = use native) | No |

---

## 4. SSRF & Crawler Security Controls

Website scraping involves fetching third-party URLs, which introduces SSRF (Server-Side Request Forgery) risks. `WebsiteExtractorService` implements defense-in-depth protections:

1. **Protocol Restriction:** Only `http:` and `https:` schemes are permitted. `file:`, `ftp:`, `gopher:`, etc., are immediately rejected.
2. **Private & Loopback IP Blocking:**
   - `127.0.0.0/8` (Loopback)
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (Private RFC 1918)
   - `169.254.169.254` (Cloud Metadata / Link-local)
   - `0.0.0.0`, `localhost`, `::1`
3. **Pre-flight DNS Resolution:** Hostnames are resolved to IP addresses via `dns.promises.lookup` before any HTTP connection is established. If the resolved IP is private or loopback, the request is aborted.
4. **Redirect Re-validation:** Redirects (HTTP 301, 302, 307, 308) are followed manually up to a maximum of 3 hops. **At each redirect hop, the target URL is fully re-validated against the SSRF rules and resolved via DNS** to prevent open-redirect SSRF bypasses.
5. **Resource Bounding:**
   - Maximum 4 pages per site (`/`, `/about`, `/contact`, `/services`).
   - Response size cap: 512 KB per page (stream terminated if exceeded).
   - HTTP Timeout: 10,000 ms per request via `AbortSignal.timeout`.
6. **Prompt Injection Shielding:** Extracted webpage text is treated strictly as untrusted data. The Ollama prompt surrounds webpage text with triple quotes, explicit system guardrails, and instructs the model to ignore any instructions or code found within the webpage content.

---

## 5. Email Verification Standard

AEVORA strictly distinguishes between syntactic validity, domain MX support, and inbox deliverability:

| Status | Meaning | Score Contribution |
|---|---|---|
| `VALID_SYNTAX_MX` | RFC 5322 syntax valid AND domain has active MX records | +25 pts |
| `NO_MX_RECORDS` | Syntax valid, but domain has no mail exchange records | +0 pts |
| `DOMAIN_NOT_FOUND` | Domain does not exist in DNS (NXDOMAIN) | +0 pts |
| `SYNTAX_INVALID` | Malformed email string | +0 pts |

> [!IMPORTANT]
> **No Inbox Deliverability Claims:** An email with `VALID_SYNTAX_MX` proves only that the recipient domain is configured to receive email. AEVORA explicitly sets `isDeliverableInbox: false` and `verificationMethod: 'DNS_MX'` to ensure marketing and sales teams understand that inbox-level deliverability has not been tested via SMTP handshake (which risks IP reputation).

---

## 6. Scoring Engine & Evidence Breakdown

Leads are scored on a 0–100 scale using five explainable factors:

| Factor | Maximum Points | Criteria |
|---|---|---|
| **Website Reachability** | 20 pts | Live, responsive website confirmed (HTTP 200) |
| **Business Facts** | 25 pts | Structured business description and services extracted |
| **Email Verification** | 25 pts | Domain MX verified (25 pts) or syntax valid (10 pts) |
| **Phone Presence** | 15 pts | Direct business phone number present |
| **Social Presence** | 15 pts | Multiple social profiles (15 pts) or single profile (10 pts) |

Each factor records an explicit reason string and evidence in `score.explanation` (e.g., `"Live responsive website confirmed (+20). Structured business description & services extracted (+25). Business email syntax and domain MX verified (+25). Direct business contact phone present (+15). Single social profile found (+10)"`).

---

## 7. API Endpoints Reference

All endpoints enforce tenant isolation via `req.user.companyId`.

### 1. Check System Readiness
```http
GET /automation/readiness
```
**Access:** Public  
**Response:**
```json
{
  "ollama": {
    "ready": true,
    "url": "http://localhost:11434",
    "model": "qwen2.5:7b",
    "version": "0.35.0"
  },
  "crawler": {
    "ready": true,
    "provider": "native"
  },
  "n8n": {
    "configured": true,
    "reachable": true,
    "url": "http://localhost:5678"
  },
  "dns": { "ready": true },
  "database": { "ready": true }
}
```

### 2. View Company Enrichment Status
```http
GET /automation/enrichment/status
Headers:
  x-integration-key: <INTEGRATION_API_KEY>
  x-company-id: <COMPANY_ID>
```
**Response:**
```json
{
  "companyId": "9d98b53b-3b79-45b8-9bb9-6cbac171bc3c",
  "totalLeads": 7,
  "counts": {
    "enriched": 1,
    "pending": 3,
    "unreachable": 2,
    "noWebsite": 0,
    "failed": 1
  },
  "coveragePercent": 14
}
```

### 3. Trigger Enrichment Webhook (n8n or Service-to-Service)
```http
POST /automation/webhook/enrichment
Headers:
  Content-Type: application/json
  x-integration-key: <INTEGRATION_API_KEY>
  x-company-id: <COMPANY_ID>
Body:
{
  "limit": 10,
  "forceRefresh": false
}
```

### 4. Trigger via Live n8n Webhook
```http
POST http://localhost:5678/webhook/aevora-enrichment-trigger
Headers:
  Content-Type: application/json
Body:
{
  "companyId": "9d98b53b-3b79-45b8-9bb9-6cbac171bc3c",
  "limit": 5,
  "forceRefresh": false
}
```

---

## 8. Verification Results

Live verification was performed on real Dallas dental leads discovered via Automation #1:

1. **Reachable Site Test (`Dallas Esthetics`, `https://www.dallasesthetics.com/`):**
   - Crawled in 1049 ms.
   - Extracted 16 dental services, business description, direct phone numbers, Facebook link.
   - Ollama `qwen2.5:7b` structured extraction succeeded.
   - Quality score computed: **75/100**.
   - Lead status promoted: `QUALIFIED`.
   - Persisted in CRM `SalesLead.metadata.enrichment` with audit log `ENRICHMENT_COMPLETED`.
2. **Unreachable Site Test (`Dallas Laser Dentistry`, `http://www.dallascosmeticdentist.us/`):**
   - Correctly flagged `UNREACHABLE` within timeout.
   - Scored: **15/100** (phone only).
   - Provenance preserved; audit log recorded as `ENRICHMENT_FAILED`.
3. **n8n Live Webhook E2E Execution:**
   - Webhook trigger `POST http://localhost:5678/webhook/aevora-enrichment-trigger` executed.
   - Execution ID 10 in n8n completed with `status: success`.
   - Full integration loop confirmed.

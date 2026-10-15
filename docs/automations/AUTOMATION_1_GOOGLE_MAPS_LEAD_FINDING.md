# AEVORA Automation #1: Google Maps Lead Finding Integration Guide

**Automation ID:** `automation-001`  
**Internal Name:** Google Maps Business Lead Finding  
**Workflow Definition File:** `n8n/1.google-lead-finding.json`  
**Integration Status:** Complete (Engineered & Verified)  
**Target Architecture:** AEVORA Core API + n8n Workflow Automation Engine + Google Places API (New)

---

## 1. Overview and Architecture

AEVORA integrates n8n workflow definitions as version-controlled operational blueprints. Automation #1 (`1.google-lead-finding.json`) enables automated discovery of local businesses through Google Maps / Google Places API v1 (`https://places.googleapis.com/v1/places:searchText`), normalization of business contact information, automated deduplication, quality scoring, and ingestion into AEVORA's CRM (`SalesLead`).

### Architecture Diagram

```
[ AEVORA UI / Admin ]
       │
       │ (REST / BFF)
       ▼
[ AEVORA API: AutomationModule ]
       │
       ├── AutomationRegistryService: Validates & loads n8n/1.google-lead-finding.json
       ├── N8nClientService: Connects to n8n REST API (Deploy / Inspect / Trigger)
       │
       ▼ (Workflow Dispatch via n8n REST API or Webhook)
[ n8n Automation Engine ]
       │
       ├── Trigger: Manual / Schedule / Sub-workflow / HTTP
       ├── Google Places API v1 (Search Text)
       ├── Result Pagination & Field Extraction
       │
       ▼ (HTTP Callback: POST /api/automation/webhook/leads)
[ AEVORA API: LeadNormalizerService ]
       │
       ├── Header Auth: x-integration-key + x-company-id
       ├── Schema Normalization: Places API v1 format -> NormalizedLead
       ├── Deduplication:
       │     1. googlePlaceId (Primary: @@unique([companyId, googlePlaceId]))
       │     2. Website domain match (Secondary fallback)
       ├── Quality Scoring: 0-100 algorithm (phone, email, reviews, rating, missing website)
       └── Database Ingestion: Prisma SalesLead + LeadGenAudit event log
```

---

## 2. Environment Variables & Secret Configuration

To preserve security and prevent hardcoded secrets, all credentials use environment variables managed via AEVORA's `validateEnv` configuration.

### Required Environment Variables

| Variable | Description | Example / Default | Mandatory For |
|---|---|---|---|
| `N8N_API_URL` | Base URL of the n8n instance | `http://localhost:5678` | n8n Deployment / Triggering |
| `N8N_API_KEY` | n8n API Key (Generated in n8n Settings -> API) | `n8n_api_...` | n8n Deployment / Triggering |
| `GOOGLE_PLACES_API_KEY` | Google Maps Platform API Key with Places API enabled | `AIzaSy...` | Live Google Places lookups |
| `INTEGRATION_API_KEY` | Shared secret for n8n-to-AEVORA webhook ingestion | Set in `.env` | Secure lead ingestion callback |

### Google Maps Platform Terms & Quotas
- **API Enabled:** Places API (New) (`places.googleapis.com`).
- **Data Compliance:** Places API data caching must follow Google Maps Platform Terms of Service (specifically Section 3.2.3: do not cache Places Content except Place IDs for more than 30 days without refresh).
- **Required Scopes/Fields:** The workflow uses field masks (`places.id`, `places.displayName`, `places.formattedAddress`, `places.nationalPhoneNumber`, `places.websiteUri`, `places.rating`, `places.userRatingCount`) to minimize billing costs.

---

## 3. Workflow Specification (`n8n/1.google-lead-finding.json`)

- **Node Count:** 42 nodes.
- **Workflow Version:** 1.0 (AEVORA Lead Generation Series).
- **Core Nodes:**
  - `Schedule Trigger` & `When clicking "Test workflow"`: Entry triggers.
  - `Set Search Parameters`: Configures query, location, radius, and limit.
  - `GMaps API`: HTTP Request node querying `https://places.googleapis.com/v1/places:searchText`.
  - `Filter Non-Duplicates`: Deduplication step before storage.
  - `Google Sheets` / `AEVORA Ingestion`: Delivery targets.

---

## 4. API Endpoints Registered in AEVORA

The following endpoints are exposed via `AutomationController` (`/api/automation`):

### 1. Workflow Registry
- **`GET /api/automation/workflows`**
  - **Auth:** Bearer JWT (`ADMIN`, `OPERATOR`, `FOUNDER`)
  - **Description:** Lists all registered automations, their version, validation status, node count, and deployment state.
- **`GET /api/automation/workflows/:id`**
  - **Auth:** Bearer JWT
  - **Description:** Returns detailed metadata, configuration schema, and file status for Automation #1.

### 2. n8n Engine Status & Deployment
- **`GET /api/automation/n8n/status`**
  - **Auth:** Bearer JWT
  - **Description:** Checks connectivity to the n8n API, reporting whether n8n is configured and reachable.
- **`POST /api/automation/workflows/:id/deploy`**
  - **Auth:** Bearer JWT (`ADMIN`, `FOUNDER`)
  - **Description:** Imports or updates `1.google-lead-finding.json` in the configured n8n instance via n8n's REST API.

### 3. Execution Dispatch
- **`POST /api/automation/workflows/:id/execute`**
  - **Auth:** Bearer JWT (`ADMIN`, `OPERATOR`, `FOUNDER`)
  - **Body:**
    ```json
    {
      "category": "dentists",
      "location": "Dallas, TX",
      "radiusMeters": 10000,
      "maxResults": 20
    }
    ```
  - **Description:** Dispatches a validated execution to the n8n workflow.

### 4. Authenticated Lead Ingestion Webhook
- **`POST /api/automation/webhook/leads`**
  - **Auth:** `x-integration-key: <INTEGRATION_API_KEY>` and `x-company-id: <COMPANY_ID>`
  - **Body:** Array of raw or normalized business leads.
  - **Description:** Normalizes Google Places records, scores lead quality, prevents duplicates, and saves to `SalesLead`.

---

## 5. Normalization, Deduplication & Quality Scoring

### Deduplication Engine
1. **Google Place ID:** Each business returned by Google Places v1 has a unique ID (e.g. `ChIJ...`). AEVORA's `SalesLead` table enforces a per-tenant compound unique constraint:
   ```prisma
   @@unique([companyId, googlePlaceId])
   ```
   If a lead with the same `googlePlaceId` already exists for that company, ingestion is safely skipped and logged as duplicate.
2. **Domain Matching:** If `googlePlaceId` is absent, the normalizer falls back to matching normalized root website domains (e.g. `example.com` from `https://www.example.com/contact`).

### Quality Scoring Algorithm (0 - 100)
- **Base Score:** 20 points for name and address presence.
- **Direct Phone:** +25 points (immediate outreach channel).
- **Email Available:** +25 points.
- **No Existing Website:** +20 points (high-value prospect for agency web development services).
- **Established Business:** +10 points if Google review count > 10.
- **Rating Bonus:** Up to +10 points for ratings >= 4.0.

---

## 6. Real-Business Operations Runbook

### Step 1: Configure Credentials in `.env`
```bash
# In e:\Aevora\.env
N8N_API_URL="http://localhost:5678"
N8N_API_KEY="your-n8n-api-key"
GOOGLE_PLACES_API_KEY="AIzaSy..."
INTEGRATION_API_KEY="your-generated-random-32-char-key"
```

### Step 2: Deploy Workflow to n8n
Via AEVORA REST API:
```bash
curl -X POST http://localhost:4000/api/automation/workflows/automation-001/deploy \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```
Or manually via n8n Web UI:
1. Open n8n (`http://localhost:5678`).
2. Navigate to **Workflows -> Import from File**.
3. Select `e:\Aevora\n8n\1.google-lead-finding.json`.
4. Configure n8n credentials for Google Maps API.
5. In the HTTP Request node for callback, configure:
   - URL: `http://api:4000/api/automation/webhook/leads`
   - Method: `POST`
   - Headers: `x-integration-key: <INTEGRATION_API_KEY>`, `x-company-id: <COMPANY_ID>`

### Step 3: Trigger Lead Generation
```bash
curl -X POST http://localhost:4000/api/automation/workflows/automation-001/execute \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "boutique hotel",
    "location": "Austin, TX",
    "maxResults": 25
  }'
```

### Step 4: Verify Ingestion in CRM
Navigate to AEVORA CRM -> Pipeline / Leads (`http://localhost:3000/company/<companyId>/pipeline`). Confirmed leads appear in the `NEW` column with assigned quality scores and origin `GOOGLE_MAPS_N8N`.

---

## 7. Troubleshooting & Failure Handling

| Issue | Root Cause | Solution |
|---|---|---|
| `N8N_CLIENT_UNCONFIGURED` | Missing `N8N_API_URL` or `N8N_API_KEY` | Set variables in `.env` and restart API service. |
| `n8n connection timeout` | n8n instance not running or port blocked | Verify n8n container/service is running on specified port. |
| `HTTP 403 Forbidden on Webhook` | Invalid `x-integration-key` or missing `x-company-id` | Verify `INTEGRATION_API_KEY` matches between n8n node and `.env`. |
| `PLACES_API_DENIED` | Google API key lacks Places API (New) scope or billing disabled | Enable Places API in Google Cloud Console; verify billing account is active. |
| `All leads skipped as duplicates` | Leads for the query were previously ingested | Search with new location/category, or check `SalesLead` records in company pipeline. |

---

## 8. Verification & Test Evidence

- **Automation Unit & Integration Tests (34/34 Passing across 5 suites):**
  - `src/automation/automation-registry.service.spec.ts` (6 tests): Workflow JSON loading, structural integrity, node counts (42 nodes), required triggers, and credential verification.
  - `src/automation/n8n-client.service.spec.ts` (4 tests): REST API client timeouts, idempotent deployment, workflow activation, and safe unconfigured state handling.
  - `src/automation/lead-normalizer.service.spec.ts` (10 tests): Places API v1 normalization, contact sanitization, quality scoring, duplicate prevention (`googlePlaceId` & domain).
  - `src/automation/automation.controller.spec.ts` (6 tests): REST endpoints, input parameter validation, execution rejection on missing credentials, and webhook routing.
  - `src/automation/automation-crm-ingestion.spec.ts` (8 tests): Security verification of `IntegrationApiKeyGuard`, rejection of unauthorized/cross-company requests, retry idempotency (zero duplicates on re-ingestion), audit record creation, and strict tenant isolation.
- **Frontend BFF Verification:** `apps/web/src/app/api/bff/[...path]/route.ts` updated with automation routing; 439 web tests passing.
- **API Production Build:** `npm run build` completed cleanly with exit code 0.

---

## 9. Live Verification and Primary Lead-Source Migration Results

| Verification Check | Status | Verification Evidence / Details |
|---|---|---|
| **API key configuration** | **PASS** | Valid `GOOGLE_PLACES_API_KEY` (39 chars, `AIza...`), `N8N_API_URL` (`http://localhost:5678`), `N8N_API_KEY`, and `INTEGRATION_API_KEY` present and loaded by runtime. |
| **Direct Google Places live search** | **PASS** | `POST https://places.googleapis.com/v1/places:searchText` returned HTTP 200 OK with 3 real businesses (`Midtown Family Dentistry`, `North Dallas Dental Group`, `North Dallas Smiles`) with place IDs, names, addresses, phones, and websites. Initial probe not stored in CRM. |
| **n8n connectivity** | **PASS** | n8n instance running on port 5678 (Task Broker 5679). REST API authenticated via API key with `global:owner` scopes. |
| **Workflow deployment** | **PASS** | `n8n/1.google-lead-finding.json` deployed via n8n REST API (Workflow ID `JG8kXW5Cab4N8eyx`). Live Automation #1 pipeline deployed idempotently. |
| **Workflow activation** | **PASS** | Workflow activated via `POST /api/v1/workflows/:id/activate`, receiving trigger webhooks on `/webhook/aevora-leads-trigger`. |
| **Live n8n execution** | **PASS** | Real execution triggered for tenant `AEVORA Technologies` (`9d98b53b-3b79-45b8-9bb9-6cbac171bc3c`). Execution completed in ~1.0s, returning real records. |
| **Webhook delivery** | **PASS** | Delivered to `POST http://127.0.0.1:13000/automation/webhook/leads` with `x-integration-key` and `x-company-id`. Unauthorized and bad tenant calls rejected with 401/400. |
| **CRM persistence** | **PASS** | 3 real leads saved to Prisma `SalesLead` with `source: AUTOMATION_1_GOOGLE_MAPS` and `LeadGenAudit` records (`AUTOMATION_DISCOVERED`). |
| **Duplicate handling** | **PASS** | Exact batch replayed; 0 duplicate leads created (`created: 0, duplicates: 3`). Per-tenant `@@unique([companyId, googlePlaceId])` compound constraint verified. |
| **Tenant isolation** | **PASS** | Cross-tenant webhook submission strictly blocked with 400 Bad Request; unauthenticated requests blocked with 401 Unauthorized. |
| **Legacy lead-finding removal** | **PASS** | Direct scraping code (`places()`, `PLACES_URL`, `FIELD_MASK`, `scrapeEmail()`) removed from `LeadSearchService`. Shared scoring, queues, imports, funnel, and non-Google providers preserved. |
| **Regression tests & production builds** | **PASS** | API test suite: 100% passing across automation and lead-gen modules. Web test suite: 439 passing tests (18 test files). Web `npm run build` and API `npm run build` completed with 0 errors. |

---

## 10. Operational Status: Automation #1 is Verified Primary Lead Source

Automation #1 (`n8n/1.google-lead-finding.json`, ID `automation-001`) is now the active, primary lead discovery engine for AEVORA:
1. `LeadGenService.runForCompany`: Routes Google Maps lead finding directly to Automation #1 (`N8nClientService.executeWorkflow`).
2. `AutomationController`: Exposes live dispatch via `POST /api/automation/workflows/:id/execute` and secure ingestion via `POST /api/automation/webhook/leads`.
3. Legacy direct scraping in `LeadSearchService` is retired and removed, while shared CRM, queues (`listQueue`, `dequeue`), imports (`importLeads`), funnel analytics, and alternative providers (OSM, mock) remain fully operational.

---

## 11. Next Step: Adding Automation #2

When ready to implement **Automation #2** (e.g. Lead Enrichment / Email Discovery):
1. Place the version-controlled workflow definition in `n8n/2.<automation-name>.json`.
2. Register the workflow in `AutomationRegistryService` with ID `automation-002`.
3. Define the input parameters and response data contracts in `automation.types.ts`.
4. Implement dedicated normalization/enrichment logic if different from Automation #1.
5. Add unit and integration test suites covering schema validation, error paths, and CRM updates.


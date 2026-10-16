# AEVORA — CONTROLLED REAL-BUSINESS PILOT REPORT

**Execution Timestamp:** 2026-10-15T15:20:30.473Z  
**Pilot Run ID:** `real-pilot-plano-1792077630471`  
**Configured Sender:** `saahvik2026@gmail.com`  
**Safe Delivery Mode:** STRICT ENFORCEMENT (`ENABLE_REAL_PRODUCTION_SENDING=false`, `OUTREACH_ENVIRONMENT=SANDBOX`, `ALLOW_EXTERNAL_OUTREACH=false`)  
**Target Scope:** Isolated Authorized Pilot Tenant (`607da85a-7ad3-43b6-bf88-eace1125984d`)  
**Production Tenant Scope:** Unchanged & Preserved (`9d98b53b-3b79-45b8-9bb9-6cbac171bc3c`)  
**Industry & Location:** Pediatric Dentists in Plano, TX  
**Sample Bounds:** Bounded 3 Genuine Public Businesses (Live Google Places API v1 searchText)  

---

## 1. Executive Summary & Verification Metrics

| Pipeline Stage | Automation Name | Ingested / Queried | Processed | Success / Qualified | Ineligible / Blocked |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Stage 1** | Automation #1: Google Maps Lead Finding | 3 genuine places | 3 | 3 created (0 dupes) | 0 invalid (dedupe verified: 3/3 skipped on repeat) |
| **Stage 2** | Automation #2: Lead Enrichment & Verification | 3 leads | 3 | 2 enriched (75 & 100/100) | 1 unreachable (HTTP 418 Bot Block, 15/100) |
| **Stage 3** | Automation #3: AI Research & Opportunity Scoring | 3 leads | 3 | 2 researched (82 & 78/100 HIGH) | 1 ineligible (status `NEW`, score < 60) |
| **Stage 4** | Automation #4: AI Sales Outreach & Follow-up | 3 leads | 3 | 2 drafted (`APPROVAL_PENDING`) | 1 ineligible (bypassed drafting) |
| **Safeguards** | Human Review Gate & Server-Side Block | 3 leads | 3 | **100% BLOCKED / DISABLED** | 0 external emails sent |

---

## 2. Deployed n8n Workflows State & Health

| Automation | Workflow ID | Deployed Trigger | Schedules | Active | Auth Method | Local Sync |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **#1 Lead Finding** | `Q9N7ZD67zRlwdUNl` | Webhook (`POST /webhook/google-lead-finding`) | 0 (None) | `true` | `x-integration-key` / `x-company-id` | Matches local |
| **#2 Lead Enrichment** | `ald9mQlsl4vfvSts` | Webhook (`POST /webhook/lead-enrichment`) | 0 (None) | `true` | `x-integration-key` / `x-company-id` | Matches local |
| **#3 Sales Research** | `ZvRwotA7iTKBQNAp` | Webhook (`POST /webhook/sales-research`) | 0 (None) | `true` | `x-integration-key` / `x-company-id` | Matches local |
| **#4 Sales Outreach** | `BX5Vds0k1bBi9fuB` | Webhook (`POST /webhook/sales-outreach`) | 0 (None) | `true` | `x-integration-key` / `x-company-id` | Matches local |

- **Recurring Schedules:** All recurring cron/interval schedules remain disabled across all workflows.
- **Unrelated Features Freeze:** Core platform background workers (`sales-agent.worker.ts`, recurring pollers, external notification daemons) remain stopped and disabled.

---

## 3. Discovered Genuine Businesses & Grounded Evidence

### [Lead 1] Lucky Kids Pediatric Dentistry & Orthodontics
- **Lead ID:** `094ffa86-d14f-4d98-a687-ccaa0aa75521`
- **Google Place ID:** `ChIJt4ycq4oiTIYRTyLZ7niKn4I`
- **Address:** 2301 Coit Rd, Plano, TX 75075, USA
- **Phone:** `(972) 758-8777`
- **Website URL:** `https://luckykidsdental.com/`
- **Extracted Contact Email:** `info@luckykidsdental.com` (Verified from live homepage crawl)
- **Enrichment Results:**
  - Status: `ENRICHED`
  - Enrichment Score: `100/100`
  - Reachability: HTTP 200 OK (5,631ms response time)
  - Discovered Features: General pediatric dentistry, laser dentistry, orthodontics, positive kid experience focus.
- **Opportunity Research & Scoring:**
  - Status: `RESEARCHED`
  - Opportunity Score: `82/100` (Heuristic score based on multi-specialty practice and absence of online self-service booking portal)
  - Priority: `HIGH`
  - Recommendation: `QUALIFIED`
- **Drafting & Approval Gate:**
  - Status: `APPROVAL_PENDING` $\to$ Approved in audit (`ApprovalRequest` `dc4d5cce-994b-45ba-8e3f-fc831c4c05b3`)
  - Subject: `"Enhance Patient Experience with Online Booking and Contact Forms"`
  - Body Excerpt: *"I noticed that Lucky Kids Pediatric Dentistry & Orthodontics offers a wide range of services, including general and laser dentistry... AEVORA can help you integrate an automated online booking system and a contact form..."*
- **Safeguard Verification:**
  - Unapproved Dispatch Attempt: Rejection HTTP 403 Forbidden (`Explicit human approval is required before outreach can be sent`).
  - Approved Dispatch Attempt: Server-side dispatch policy returned `status: BLOCKED_BY_SAFEGUARD`, `deliveryStatus: DISABLED`. Zero network transmissions.

---

### [Lead 2] North Texas Pediatric Dentistry
- **Lead ID:** `f21fc501-5572-425b-ae1d-04c013835473`
- **Google Place ID:** `ChIJP91U578iTIYREQGlnO4VYP8`
- **Address:** 5800 Coit Rd #600, Plano, TX 75023, USA
- **Phone:** `(972) 491-3916`
- **Website URL:** `https://www.northtexaspediatricdentists.com/plano-office-location`
- **Extracted Contact Email:** `NONE` (Phone & location extracted; no public `mailto:` link found on crawled location subpage)
- **Enrichment Results:**
  - Status: `ENRICHED`
  - Enrichment Score: `75/100`
  - Reachability: HTTP 200 OK (3,564ms response time)
  - Discovered Features: Comprehensive pediatric dental care, fillings, extractions, Frisco/Plano/Allen/McKinney locations.
- **Opportunity Research & Scoring:**
  - Status: `RESEARCHED`
  - Opportunity Score: `78/100`
  - Priority: `HIGH`
  - Recommendation: `QUALIFIED`
- **Drafting & Approval Gate:**
  - Status: `APPROVAL_PENDING` $\to$ Approved in audit (`ApprovalRequest` `3ceddf09-1c41-4d55-9c76-595e1fddda7c`)
  - Subject: `"Enhance Patient Experience with Online Booking and Forms"`
  - Recipient Email: `null` (Truthful evidence reporting; no email invented)
- **Safeguard Verification:**
  - Recipient Validation: Server-side check rejected dispatch with HTTP 400 Bad Request (`Lead does not have a valid contact email address for email outreach`).
  - Delivery Status: `DISABLED`. Zero network transmissions.

---

### [Lead 3] Sweet Smiles Pediatric Dentistry
- **Lead ID:** `5d7f98dd-55b3-4400-9df7-dec2bf240b55`
- **Google Place ID:** `ChIJLylbh_EXTIYR4h7EoZwbBgA`
- **Address:** 2100 Hedgcoxe Rd #150, Plano, TX 75025, USA
- **Phone:** `(972) 517-8300`
- **Website URL:** `https://sweetsmiles4kids.com/`
- **Extracted Contact Email:** `NONE`
- **Enrichment Results:**
  - Status: `UNREACHABLE`
  - Enrichment Score: `15/100`
  - Reachability: HTTP 418 (Server bot-protection / anti-scrape block)
  - Error: *"Website unreachable or returned HTTP error status."*
- **Opportunity Research & Scoring:**
  - Status: `INELIGIBLE`
  - Quality Score: `45/100` (< 60 qualification threshold)
  - Lead Status: Remained `NEW`
  - Pipeline Action: Pipeline correctly halted further processing.
- **Drafting & Safeguard Verification:**
  - Outreach Draft: `NONE` (Bypassed; ineligible lead)
  - Approval Request: `NONE`
  - Send Attempt on Undrafted Lead: Server returned HTTP 400 Bad Request (`No draft exists for lead`). Zero network transmissions.

---

## 4. Production Tenant Safety & Invariance Audit

The production tenant records were snapshotted before execution and verified immediately following pilot completion:

| Entity | Pre-Pilot Baseline | Post-Pilot Count | Delta | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Production Leads (`9d98b53b-...`)** | 11 | 11 | **0** | **100% INVARIANT** |
| **Production Audit Events (`9d98b53b-...`)** | 36 | 36 | **0** | **100% INVARIANT** |
| **Production Approvals (`9d98b53b-...`)** | 6 | 6 | **0** | **100% INVARIANT** |
| **Production Activities (`9d98b53b-...`)** | 6 | 6 | **0** | **100% INVARIANT** |
| **Pilot Tenant Leads (`607da85a-...`)** | 0 (cleaned) | 3 | +3 | Isolated pilot data |
| **Pilot Tenant Approvals (`607da85a-...`)** | 0 (cleaned) | 2 | +2 | Isolated pilot data |

---

## 5. Security & Deliverability Safeguards Summary

1. **Human Approval Enforcement:**
   - Automation #4 generated drafts in `APPROVAL_PENDING` state with corresponding `ApprovalRequest` records in PostgreSQL.
   - Any attempt to trigger `/automation/outreach/send` without prior approval returned HTTP 403 Forbidden.
2. **Missing Contact Safeguard:**
   - Leads lacking a verified contact email (e.g., North Texas Pediatric Dentistry) were strictly blocked from dispatch with HTTP 400 Bad Request. Contact details were never fabricated.
3. **Hard Server-Side Dispatch Lock:**
   - Both in-code and environment safeguards (`ENABLE_REAL_PRODUCTION_SENDING=false`, `OUTREACH_ENVIRONMENT=SANDBOX`, `deliveryStatus='DISABLED'`) intercepted all approved send requests at the API boundary, returning `BLOCKED_BY_SAFEGUARD`. Zero external network calls were made.
4. **Sender Identity & Deliverability Readiness:**
   - Sender configured: `saahvik2026@gmail.com`.
   - Consumer Gmail account verified via SMTP on port 587. Google handles its own SPF/DKIM authentication.
   - Live production sending remains locked until the owner provides formal sign-off and configures `UNSUBSCRIBE_SECRET` and `PUBLIC_API_URL`.

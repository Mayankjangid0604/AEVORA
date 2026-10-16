# AEVORA — Production Email Outreach Readiness Plan

**Document:** `docs/automations/PRODUCTION_EMAIL_READINESS_PLAN.md`  
**Date:** October 16, 2026  
**Status:** PROPOSED IMPLEMENTATION PLAN (Read-Only Inspection Phase)  
**Author:** Antigravity Autonomous Agent (Google DeepMind Advanced Agentic Coding)  
**Target Repository:** `E:\Aevora`  
**Governing Standard:** Core Platform Freeze, CAN-SPAM / GDPR / RFC 8058 Compliance  

---

## Executive Summary

The AEVORA Customer Acquisition System (Automations #1 through #4) has achieved full technical acceptance in staging and local environments with non-sending safeguards active. Real external cold email outreach to genuine commercial businesses remains strictly disabled (`ENABLE_REAL_PRODUCTION_SENDING=false`, `OUTREACH_ENVIRONMENT=SANDBOX`, `ALLOW_EXTERNAL_OUTREACH=false`, `AEVORA_SAFE_MODE=true`).

This document details the concrete, implementation-ready plan to resolve the **five blockers** identified in the Final Four-Automation Acceptance Audit, providing architectural specifications, security mechanisms, verification protocols, legal considerations, and a staged rollout strategy.

> [!IMPORTANT]
> **Zero Implementation During Planning:** This is a read-only architecture plan. No application code, databases, environment variables, credentials, workflows, or DNS configurations were modified during this inspection.

---

## 1. Blocker 1: Cryptographic Unsubscribe Secret (`UNSUBSCRIBE_SECRET`)

### 1.1 Existing Implementation Inspection
The AEVORA platform already contains an HMAC-SHA256 token signing and verification engine located in [`apps/api/src/common/outbound-policy.ts`](file:///E:/Aevora/apps/api/src/common/outbound-policy.ts) and unit-tested in [`apps/api/src/integration/gate3-safety.spec.ts`](file:///E:/Aevora/apps/api/src/integration/gate3-safety.spec.ts).

* **Secret Retrieval:** `unsubscribeSecret()` reads `process.env.UNSUBSCRIBE_SECRET?.trim()`.
* **Minimum Length Requirement:** If `s.length < 32`, the system fails closed and throws `ForbiddenException('Outbound blocked: UNSUBSCRIBE_SECRET is missing or shorter than 32 characters')`.
* **Token Structure:**
  1. **Data Payload:** `Buffer.from(JSON.stringify([companyId, normalizeEmail(email)])).toString('base64url')`.
  2. **HMAC Signature:** `createHmac('sha256', secret).update(data).digest('base64url')`.
  3. **Composed Token:** `<data>.<signature>`.
* **Verification Logic:**
  * Uses `crypto.timingSafeEqual` over expected vs. provided signatures to eliminate side-channel timing attacks.
  * Rejects null, undefined, malformed, extra segments, or length mismatches.
  * Secret rotation behavior: Changing `UNSUBSCRIBE_SECRET` immediately invalidates previously issued tokens without altering persistent suppression rows in the database.

### 1.2 Proposed Secure Generation & Storage Method
* **Generation Specification:** Generate a cryptographically strong, 256-bit (32-byte) pseudo-random secret encoded as a 64-character hexadecimal string using a secure CSPRNG:
  ```bash
  # Node.js CSPRNG generation command (to be run during setup phase)
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  *Alternative (OpenSSL):* `openssl rand -hex 32`
* **Storage Protocol:**
  * Store strictly in `.env` and `apps/api/.env` as:
    ```ini
    UNSUBSCRIBE_SECRET=<64-character-hex-string>
    ```
  * In production deployments, inject via cloud secret managers (e.g., AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault).
  * **Strict Prohibition:** Never commit `UNSUBSCRIBE_SECRET` to Git or expose it in client-side bundles, API responses, or log files.

---

## 2. Blocker 2: Publicly Accessible Base URL (`PUBLIC_API_URL`)

### 2.1 Existing Route Implementation
The platform already implements public unsubscribe endpoints in [`apps/api/src/integration/unsubscribe.controller.ts`](file:///E:/Aevora/apps/api/src/integration/unsubscribe.controller.ts):

* **Controller Route:** `@Controller('unsubscribe')`
* **Guard:** `@Public()` (bypasses JWT/API-key authentication so email recipients can opt out without logging in).
* **Rate Limiting:** `@Throttle({ default: { limit: 20, ttl: 60000 } })` (prevents brute-force signature probing).
* **`GET /unsubscribe?t=<token>` (Confirmation Form):**
  * Verifies HMAC signature.
  * Displays an HTML page asking: *"Stop all emails to [email]?"* with a POST confirmation button.
  * **Critical Defense:** `GET` is strictly non-mutating (safe and idempotent). Automated enterprise email scanners (Barracuda, Mimecast, Microsoft Defender) pre-fetching links will not trigger an accidental opt-out.
* **`POST /unsubscribe?t=<token>` (Execution & RFC 8058 One-Click):**
  * Verifies token and unpacks `{ companyId, email }`.
  * Invokes `recordSuppression(prisma, companyId, email, 'UNSUBSCRIBE_LINK', 'email-link')`.
  * Returns HTTP 200 with confirmation HTML.
  * Complies with **RFC 8058 One-Click Unsubscribe** specifications (e.g. Gmail/Yahoo requirement) when invoked with header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

### 2.2 Deployment & HTTPS Ingress Requirements
* **Public Domain Requirement:** `PUBLIC_API_URL` cannot remain `http://localhost:13000`. External recipients and mail user agents cannot resolve localhost.
* **Configuration:**
  ```ini
  PUBLIC_API_URL=https://api.aevora.com
  ```
* **TLS / Infrastructure Requirements:**
  1. Public DNS A/AAAA record mapping `api.aevora.com` to the production ingress or load balancer.
  2. TLS Termination using an accredited certificate authority (e.g., Let's Encrypt or AWS ACM) enforcing TLS 1.2 / TLS 1.3 with HSTS.
  3. Reverse proxy (Nginx, Traefik, or AWS ALB) properly passing headers:
     * `X-Forwarded-For`
     * `X-Forwarded-Proto: https`
     * `Host: api.aevora.com`
  4. Global availability: Unsubscribe endpoints must have 99.9%+ availability with low latency (<500ms).

---

## 3. Blocker 3: Business Email Infrastructure & Sending Domain

### 3.1 Sending Domain Strategy
* **Current State:** System is configured with personal Gmail App Password (`saahvik2026@gmail.com`).
* **Requirement:** Cease sending cold commercial email from free `@gmail.com` addresses. Commercial mail from free webmail fails DMARC domain alignment, triggers spam filters, and violates Gmail/Yahoo 2024 Bulk Sender rules.
* **Dedicated Domain / Subdomain:**
  * Recommend using a dedicated subdomain for outbound acquisition (e.g., `mail.aevora.com` or `contact.aevora.com`) to isolate outreach reputation from primary corporate communications (`aevora.com`).

### 3.2 DNS Authentication Matrix (SPF, DKIM, DMARC)

| Record Type | Hostname / Subdomain | Example Value / Target | Purpose |
|---|---|---|---|
| **MX** | `mail.aevora.com` | `10 inbound-smtp.us-east-1.amazonaws.com` (or provider MX) | Handles bounce returns and inbound replies. |
| **SPF (TXT)** | `mail.aevora.com` | `v=spf1 include:amazonses.com -all` | Authorizes only the designated provider relay to send mail for this domain. |
| **DKIM (CNAME)** | `aevora._domainkey.mail.aevora.com` | `aevora.dkim.amazonses.com` (or 2048-bit RSA key) | Cryptographically signs message headers and body, verifying origin authenticity. |
| **DMARC (TXT)** | `_dmarc.mail.aevora.com` | `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@aevora.com; aspf=r; adkim=r;` | Enforces alignment; instructs receiving servers to quarantine unauthenticated messages. |
| **Custom Mail-From** | `bounces.mail.aevora.com` | `feedback-smtp.us-east-1.amazonses.com` | Aligns the Return-Path header with the From domain for strict SPF alignment. |

### 3.3 Email Provider Evaluation & Selection
1. **Amazon Simple Email Service (SES) [Recommended for Scale]:**
   * *Pros:* Low cost ($0.10 / 1,000 emails), high throughput, dedicated IP warm-up support, native SNS integration for bounce/complaint webhooks.
   * *Cons:* Requires AWS account and initial sandbox exit request.
2. **Postmark [Recommended for Simplicity & Transactional Deliverability]:**
   * *Pros:* Unmatched inbox placement, automatic bounce categorization, built-in webhook signing.
   * *Cons:* Higher cost per message; strict pre-approval of outreach content.
3. **Resend:**
   * *Pros:* Modern API, excellent developer experience, native Svix webhook security.
   * *Cons:* Newer provider; custom IP management requires higher tier.

---

## 4. Blocker 4: Bounce & Complaint Handling Architecture

### 4.1 Existing `EmailSuppression` Schema
Prisma model in [`packages/database/prisma/schema.prisma`](file:///E:/Aevora/packages/database/prisma/schema.prisma) line 8256:
```prisma
model EmailSuppression {
  id        String   @id @default(uuid())
  companyId String
  email     String   // normalized: trimmed, lower-case
  reason    String   // UNSUBSCRIBE_LINK | ONE_CLICK | INBOUND_REPLY | OPERATOR | BOUNCE | SPAM_COMPLAINT
  source    String?
  createdAt DateTime @default(now())

  @@unique([companyId, email])
}
```

### 4.2 Required Inbound Webhook Service Architecture
To automatically process delivery events, a new webhook ingestion module must be added to the API.

```
[ISP / Recipient Server]
          │
          ▼ (550 User Unknown / Spam Report)
[Email Relay: Amazon SES / Postmark]
          │
          ▼ (Signed Webhook Payload over HTTPS)
[AEVORA Ingress: POST /api/webhooks/email-events]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ 1. Verify Cryptographic Webhook Signature               │
│ 2. Check Event Type (Bounce, Complaint, Delivery)       │
│ 3. Extract Recipient Email & Company ID / Metadata     │
└────────────────────────────────────────────────────────┘
          │
    ┌─────┴───────────────────────────────────┐
    ▼                                         ▼
[Hard Bounce / Spam Complaint]           [Soft Bounce / Transient]
    │                                         │
    ├─► Upsert EmailSuppression               ├─► Increment retry counter
    ├─► Set Lead status: DISQUALIFIED         └─► Fail after 3 attempts
    ├─► Log LeadGenAudit event
    └─► Invalidate pending drafts
```

#### Proposed Webhook Controller Specifications:
* **Endpoint:** `POST /api/webhooks/email-events`
* **Signature Verification:**
  * For AWS SES: Verify Amazon SNS signing certificate URL (`https://sns.*.amazonaws.com`), extract public key, verify SHA1/SHA256 signature against canonical string.
  * For Postmark / Resend: Verify shared secret in header (`X-Webhook-Secret`) or Svix timestamp + signature token.
* **Event Handlers:**
  1. **Permanent Hard Bounce (`BounceType: Permanent`):**
     * Normalize recipient email.
     * Record in `EmailSuppression` with `reason: 'BOUNCE'`, `source: 'provider-webhook'`.
     * Update `SalesLead` metadata: `deliveryStatus: 'BOUNCED'`.
     * Write `LeadGenAudit` event: `OUTREACH_EMAIL_BOUNCED`.
  2. **Spam Complaint (`FeedbackType: abuse`):**
     * Normalize recipient email.
     * Record in `EmailSuppression` with `reason: 'SPAM_COMPLAINT'`, `source: 'provider-webhook'`.
     * Update `SalesLead`: `status = 'DISQUALIFIED'`, `metadata.optOut = true`.
     * Write `LeadGenAudit` event: `OUTREACH_SPAM_COMPLAINT`.
  3. **Transient / Soft Bounce (`BounceType: Transient`):**
     * Log temporary failure; do not permanently suppress on first occurrence.
     * Suppress only if soft bounces exceed 3 attempts within 7 days.
* **Return Code:** Return HTTP 200 within 2 seconds to acknowledge receipt and prevent provider retries.

---

## 5. Blocker 5: Recipient Consent, Provenance & Legal Pre-Send Validation

### 5.1 Lead Provenance & Contactability Requirements
* **Audit Trail:** Every lead ingested must store verifiable provenance metadata in `SalesLead.metadata.provenance`:
  ```json
  {
    "source": "GOOGLE_PLACES_API",
    "googlePlaceId": "ChIJ...",
    "scrapedWebsite": "https://www.example.com",
    "discoveredAt": "2026-10-16T09:00:00.000Z",
    "emailDiscoveryMethod": "WEBSITE_CONTACT_PAGE",
    "emailVerification": {
      "syntaxValid": true,
      "mxFound": true,
      "domain": "example.com"
    }
  }
  ```
* **No Fabricated Data:** Model prompt explicitly forbids guessing or generating non-existent email addresses or decision-maker names.

### 5.2 Pre-Send Verification Checklist (Enforced by Software Gate)
Before any message can leave the platform, all 8 validation checks must pass:
1. `contactEmail` exists, is trimmed, and passes RFC 5322 syntax validation.
2. `SalesLead.status` is not `DISQUALIFIED`, `DO_NOT_CONTACT`, or `UNSUBSCRIBED`.
3. `metadata.optOut !== true` and `metadata.unsubscribed !== true`.
4. Recipient does not exist in `EmailSuppression` table for the target `companyId`.
5. Draft `approvalStatus === 'APPROVED'` with an associated `ApprovalRequest` record in `APPROVED` status.
6. Draft version strictly matches `ApprovalRequest.proposedParams.version`.
7. Daily send limits are not exceeded ([`assertWithinSendLimits`](file:///E:/Aevora/apps/api/src/common/outbound-policy.ts)):
   * Max 1 send per recipient per 24 hours.
   * Max 20 sends per company per 24 hours.
   * Max 50 sends globally per 24 hours (pilot rate cap).
8. `ENABLE_REAL_PRODUCTION_SENDING === 'true'`, `OUTREACH_ENVIRONMENT === 'PRODUCTION'`, and emergency stop is inactive.

### 5.3 Legal & Compliance Review Questions for Platform Owner

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MANDATORY COMPLIANCE QUESTIONS REQUIRING OWNER & LEGAL SIGN-OFF:                                │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Physical Address Requirement (CAN-SPAM Act):                                               │
│    What is the verified physical postal address of AEVORA Technologies to be rendered in the  │
│    email footer beside the unsubscribe link?                                                   │
│                                                                                                │
│ 2. Geographic Target Restrictions (GDPR vs. CAN-SPAM):                                         │
│    Is cold B2B outreach strictly restricted to US entities, or will EU/UK/Canadian businesses  │
│    be included? (Note: EU GDPR/ePrivacy and Canadian CASL impose stricter consent standards). │
│                                                                                                │
│ 3. Sender Identity & Transparency:                                                             │
│    What exact display name and title should be represented? (e.g. "Mayank Jangid, Founder at   │
│    AEVORA" vs. "AEVORA Partnerships Team").                                                    │
│                                                                                                │
│ 4. Unsubscribe Honor Period:                                                                   │
│    While the system honors opt-outs instantaneously in real-time, CAN-SPAM mandates compliance │
│    within 10 business days. Confirm real-time suppression meets or exceeds legal policy.       │
│                                                                                                │
│ 5. B2B Legitimate Interest Assessment:                                                         │
│    Has the platform owner documented a Legitimate Interest Assessment (LIA) for the dental    │
│    and commercial vertical outreach campaigns?                                                 │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Order & Staged Rollout Plan

### 6.1 Proposed Phase-by-Phase Implementation Order

```
[Phase A: Cryptographic & Core Configuration]
  Step 1: Generate & configure UNSUBSCRIBE_SECRET (32+ chars) in .env
  Step 2: Connect PUBLIC_API_URL to valid public HTTPS domain

[Phase B: Email Infrastructure & DNS Setup]
  Step 3: Provision dedicated sending domain / subdomain
  Step 4: Publish SPF, DKIM (2048-bit), and DMARC DNS records
  Step 5: Configure production transactional relay (SES / Postmark)

[Phase C: Webhook & Inbound Feedback Ingestion]
  Step 6: Implement /api/webhooks/email-events controller with signature verification
  Step 7: Connect bounce & complaint events to EmailSuppression table

[Phase D: Gate Integration & Isolated Testing]
  Step 8: Connect SalesOutreachService.sendOutreach() to IntegrationService.sendEmail()
  Step 9: Run isolated test suite (token signing, unsubscribe flow, bounce ingestion)

[Phase E: Controlled Production Pilot & Rollback Protocol]
  Step 10: Owner authorization to unlock production switches
  Step 11: Execute Canary pilot (max 5 internal/consenting leads)
  Step 12: Monitor deliverability & bounce telemetry for 48 hours
```

### 6.2 Testing Plan Matrix

| Test ID | Test Scope | Execution Method | Expected Result |
|---|---|---|---|
| **T-1** | Unsubscribe Token Signing | Jest unit test (`outbound-policy.spec.ts`) | Generates valid HMAC token; tampering signature returns null. |
| **T-2** | Secret Rotation Defense | Unit test | Changing secret invalidates previous tokens. |
| **T-3** | Timing Attack Resistance | Unit test | `timingSafeEqual` verified with mismatched lengths and payloads. |
| **T-4** | Public `GET /unsubscribe` | HTTP test | Returns 200 HTML form; does **not** create suppression row. |
| **T-5** | Public `POST /unsubscribe` | HTTP test | Returns 200 HTML; creates persistent `EmailSuppression` row. |
| **T-6** | RFC 8058 One-Click Header | HTTP test | `List-Unsubscribe-Post: List-Unsubscribe=One-Click` handled cleanly. |
| **T-7** | Bounce Webhook Signature | Unit/Integration test | Validates provider signature; rejects unsigned payloads (HTTP 401). |
| **T-8** | Hard Bounce Suppression | Integration test | Hard bounce webhook creates `EmailSuppression` record (`reason: BOUNCE`). |
| **T-9** | Spam Complaint Suppression | Integration test | Complaint webhook disqualifies lead and suppresses address. |
| **T-10**| Cross-Tenant Isolation | Integration test | Tenant A suppression does not block Tenant B unless globally flagged. |
| **T-11**| Emergency Stop Engagement | Live script | Setting `AEVORA_EMERGENCY_STOP=true` halts all outbound dispatch immediately. |

### 6.3 Emergency Rollback & Kill Switch Protocol
If unexpected deliverability issues, spam complaints (>0.1%), or bounce spikes (>2%) occur:
1. **Immediate API Kill Switch:** Set `ENABLE_REAL_PRODUCTION_SENDING=false` in `.env` and restart the API (`pm2 restart aevora-api` or Docker container).
2. **Global Emergency Stop:** Set `AEVORA_EMERGENCY_STOP=true` in `.env` (propagates to all outbound gates within milliseconds).
3. **Database Feature Flag:** Insert/update `KillSwitchConfig`:
   ```sql
   INSERT INTO "KillSwitchConfig" ("id", "feature", "isDisabled", "updatedAt")
   VALUES (gen_random_uuid(), 'OUTBOUND_EMAIL', true, NOW())
   ON CONFLICT ("feature") DO UPDATE SET "isDisabled" = true;
   ```
4. **n8n Workflow Deactivation:** Deactivate workflow `BX5Vds0k1bBi9fuB` via n8n UI or API.

---

## 7. Files Slated for Eventual Implementation (Future Phase)

When authorization is granted to implement this plan, the following files will be created or modified:

1. **New Files to Create:**
   * `apps/api/src/integration/email-webhook.controller.ts` (Bounce & complaint receiver)
   * `apps/api/src/integration/email-webhook.controller.spec.ts` (Webhook signature & event tests)
   * `scripts/test-production-email-readiness.js` (End-to-end verification script)
2. **Existing Files to Update:**
   * `apps/api/src/automation/sales-outreach.service.ts` (Delegate approved send to `IntegrationService` when production enabled)
   * `apps/api/src/integration/integration.module.ts` (Register `EmailWebhookController`)
   * `.env` and `apps/api/.env` (Set `UNSUBSCRIBE_SECRET`, `PUBLIC_API_URL`, and SMTP/SES credentials)

---

## 8. Verification & Read-Only Compliance Statement

* **Zero Application Code Changed:** No NestJS controllers, services, modules, or tests were edited.
* **Zero Database Records Mutated:** No Prisma migrations, inserts, updates, or deletes were performed. Production tenant records remain 100% intact (11 leads, 8 approvals, 41 audits).
* **Zero Emails Transmitted:** No network packets were dispatched to SMTP relays or external leads.
* **Safeguards Preserved:** Safe mode and non-production sandbox flags remain fully enforced.

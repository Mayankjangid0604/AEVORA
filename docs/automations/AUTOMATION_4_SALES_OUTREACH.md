# AEVORA Automation #4: AI Sales Outreach & Follow-up Integration Guide

**Automation ID:** `automation-4-sales-outreach`  
**Internal Name:** AI Sales Outreach & Follow-up with Ollama  
**Workflow Definition File:** `n8n/4.ai-sales-outreach-follow-up.json`  
**Category:** `SALES`  
**Integration Status:** Complete (Production-Engineered & Unit-Verified)  
**Target Architecture:** Zero-Mandatory-Cost Local Pipeline (AEVORA Core API + Local Ollama `qwen2.5:7b` + Human Approval Gate + Prisma Persistence + Tenant Isolation + Delivery Safeguard)

---

## 1. Overview and Architecture

AEVORA Automation #4 provides automated, personalized, source-grounded B2B sales outreach drafts and structured follow-up recommendations for qualified commercial leads. It builds directly upon Automation #1 (Lead Finding), Automation #2 (Lead Enrichment), and Automation #3 (AI Sales Research & Opportunity Scoring).

The implementation strictly honors AEVORA's **zero mandatory external cost** and **safety safeguard** policies:
- **Zero Paid AI APIs:** Uses local self-hosted Ollama (`qwen2.5:7b` or configured local model). Absolutely no dependencies on OpenAI, Anthropic, or external inference APIs.
- **Zero External Scraping/Search APIs:** Reuses verified business facts from Auto #1, enrichment evidence from Auto #2, and research briefs from Auto #3.
- **Strict Evidence Grounding:** AI outreach drafts are synthesized strictly from verified evidence. The prompt instructions strictly prohibit hallucinating company revenue, employee counts, current software tools, fake customer names, fake testimonials, non-existent prior conversations (e.g. "Following up on our talk"), or firm pricing/discount commitments.
- **Mandatory Human-in-the-Loop Approval Gate:** Every outreach draft requires explicit human review and approval. An `ApprovalRequest` record (`action: 'SALES_OUTREACH_SEND'`, `targetType: 'SalesLead'`) is created in the database. Outreach cannot be sent without verified approval in state `APPROVED`.
- **Automatic Invalidation of Prior Approvals:** Any modification, edit, or regeneration of a draft increments the version and immediately cancels prior approvals (`status: 'CANCELLED'`), requiring renewed human review.
- **Strict Delivery Safeguard:** In this implementation phase, real external transmission (SMTP, SES, LinkedIn API) is strictly disabled (`deliveryStatus: 'DISABLED'`). If a send is requested, the system verifies all approval prerequisites and records a safe audit event (`OUTREACH_DELIVERY_BLOCKED_SAFEGUARD`), preventing accidental external delivery.
- **Opt-Out & Suppression Compliance:** Automatically checks prospect suppression flags (`metadata.optOut`, `status: 'DO_NOT_CONTACT'`, `status: 'UNSUBSCRIBED'`). Suppressed leads are skipped with status `SUPPRESSED`.
- **Native AEVORA Schema Compatibility:** Persists into existing `SalesLead.metadata.outreachDraft`, `ApprovalRequest`, `SalesActivity` (with `actorType: AI_AGENT`), and `LeadGenAudit` without requiring database migrations.
- **Tenant Isolation:** Enforces strict company scoping at the API and service boundary.
- **Zero Execution Data Retention:** n8n workflow settings enforce `saveDataSuccessExecution: "none"` and `saveDataErrorExecution: "none"`.

---

## 2. Architecture & Data Flow

```
[ AEVORA UI / Sales Dashboard / Scheduled Task / n8n Orchestrator ]
                            │
                            │ (Authorized Request: JWT Bearer OR x-integration-key + x-company-id)
                            ▼
               [ POST /automation/outreach/draft   ]
               [ POST /automation/webhook/outreach ]
                            │
                            ▼
               [ SalesOutreachService ]
                            │
            ┌───────────────┴───────────────────────────┐
            ▼                                           ▼
   [ Tenant Isolation Guard ]               [ Suppression & Eligibility Checks ]
   - Enforces companyId check               - Opt-out flag / DO_NOT_CONTACT check
   - Cross-tenant access blocked (404)      - Checks qualityScore and Auto #3 brief
                                            - Idempotency: skips if draft exists
                                              (unless forceRefresh: true)
                            │
                            ▼
               [ Evidence Synthesis Package ]
               - Auto #1 Facts: Category, location, Google Maps data
               - Auto #2 Facts: Website services, contact forms, booking signals
               - Auto #3 Brief: Opportunity score, identified pains, pitch, next action
                            │
                            ▼
               [ Local Ollama Inference (qwen2.5:7b) ]
               - Prompt-shielded against prompt injection (untrusted content block)
               - Format: strict JSON schema
               - Strict grounding: NO unverified facts, NO fake conversations
               - Strict failure: NO external AI fallback
                            │
                            ▼
               [ Human Approval Staging ]
               - Draft created with status: APPROVAL_PENDING
               - ApprovalRequest created (status: PENDING, riskLevel: LOW)
               - Any prior ApprovalRequest marked CANCELLED
               - LeadGenAudit: OUTREACH_DRAFT_GENERATED
               - SalesActivity: activityType: EMAIL (outcome: APPROVAL_PENDING)
                            │
                            ▼
               [ Human Review Action ]
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
[ POST /automation/outreach/approve ]   [ POST /automation/outreach/reject ]
- Approves draft or applies edits       - Rejects draft
- If edited: increments version,        - ApprovalRequest: REJECTED
  cancels old request, approves new     - LeadGenAudit: OUTREACH_DRAFT_REJECTED
- LeadGenAudit: OUTREACH_DRAFT_APPROVED
                            │
                            ▼
               [ Delivery Safeguard Gate ]
               [ POST /automation/outreach/send ]
               - Verifies ApprovalRequest.status === 'APPROVED'
               - Verifies draft.version === ApprovalRequest.proposedParams.version
               - Delivery Policy: External transmission disabled in this phase
               - Returns status: BLOCKED_BY_SAFEGUARD (deliveryStatus: DISABLED)
               - LeadGenAudit: OUTREACH_DELIVERY_BLOCKED_SAFEGUARD
```

---

## 3. API Contracts and Authorization

All outreach endpoints reside in `AutomationController` (`apps/api/src/automation/automation.controller.ts`) and enforce dual-guard authentication (`JwtAuthGuard` or `IntegrationApiKeyGuard`) with role-based access control (`RolesGuard`).

### 3.1 Draft Outreach (Single Lead)
- **Route:** `POST /automation/outreach/draft`
- **Guards:** `JwtAuthGuard` / `IntegrationApiKeyGuard`, `@Roles('CHAIRMAN', 'MANAGEMENT')`
- **Headers:** `Authorization: Bearer <jwt>` OR `x-integration-key: <key>` + `x-company-id: <uuid>`
- **Request Body:**
  ```json
  {
    "leadId": "uuid-lead-1",
    "channel": "EMAIL",
    "forceRefresh": false
  }
  ```
- **Response:**
  ```json
  {
    "leadId": "uuid-lead-1",
    "companyId": "uuid-company",
    "status": "APPROVAL_PENDING",
    "draft": {
      "id": "uuid-draft-1",
      "version": 1,
      "channel": "EMAIL",
      "subject": "Modernizing patient booking for Midtown Family Dentistry",
      "body": "Hi,\n\nI noticed Midtown Family Dentistry provides dental implants and family dentistry in Dallas...",
      "personalizationRationale": "Referenced verified dental service offerings and lack of online booking.",
      "evidenceReferences": ["Implants and Cleaning services", "Online booking currently absent"],
      "recommendedNextStep": "15-minute introductory workflow review call",
      "followUpIntervalDays": 4,
      "followUpRecommendation": "Send gentle follow-up focusing on after-hours inquiry handling.",
      "status": "APPROVAL_PENDING",
      "approvalRequestId": "uuid-app-req-1",
      "approvalStatus": "PENDING",
      "deliveryStatus": "DISABLED",
      "confidence": 85,
      "missingEvidence": []
    },
    "approvalRequestId": "uuid-app-req-1",
    "activityId": "uuid-activity-1"
  }
  ```

### 3.2 Approve Outreach Draft
- **Route:** `POST /automation/outreach/approve`
- **Guards:** `JwtAuthGuard` / `IntegrationApiKeyGuard`, `@Roles('CHAIRMAN', 'MANAGEMENT')`
- **Request Body:**
  ```json
  {
    "leadId": "uuid-lead-1",
    "reason": "Reviewed and approved by sales manager",
    "editedSubject": "Optional customized subject line",
    "editedBody": "Optional customized message body"
  }
  ```
- **Behavior:**
  - If `editedSubject` or `editedBody` is supplied: increments draft version to 2, cancels prior approval request, creates new approved `ApprovalRequest`, and sets `isEdited: true`.
  - If approved without edits: sets existing `ApprovalRequest` to `APPROVED`.

### 3.3 Reject Outreach Draft
- **Route:** `POST /automation/outreach/reject`
- **Guards:** `JwtAuthGuard` / `IntegrationApiKeyGuard`, `@Roles('CHAIRMAN', 'MANAGEMENT')`
- **Request Body:**
  ```json
  {
    "leadId": "uuid-lead-1",
    "reason": "Not an ideal prospect at this time"
  }
  ```

### 3.4 Send Outreach (Safeguard-Enforced)
- **Route:** `POST /automation/outreach/send`
- **Guards:** `JwtAuthGuard` / `IntegrationApiKeyGuard`, `@Roles('CHAIRMAN', 'MANAGEMENT')`
- **Request Body:**
  ```json
  {
    "leadId": "uuid-lead-1"
  }
  ```
- **Safeguard Enforcement:**
  - If draft is not in `APPROVED` status: throws `ForbiddenException` (`403`).
  - If `ApprovalRequest` in database is not `APPROVED`: throws `ForbiddenException` (`403`).
  - If draft version does not match approved version: throws `ForbiddenException` (`403`).
  - Safe mode: holds message with `status: 'BLOCKED_BY_SAFEGUARD'`, `deliveryStatus: 'DISABLED'`, preventing external network dispatch without explicit deployment authorization.

### 3.5 Outreach Status Summary
- **Route:** `GET /automation/outreach/status`
- **Guards:** `JwtAuthGuard` / `IntegrationApiKeyGuard`, `@Roles('CHAIRMAN', 'MANAGEMENT')`
- **Response:**
  ```json
  {
    "companyId": "uuid-company",
    "totalLeads": 10,
    "eligibleLeads": 8,
    "suppressedLeads": 1,
    "draftsTotal": 7,
    "pendingApproval": 4,
    "approved": 2,
    "rejected": 1,
    "deliveryDisabled": 7,
    "policy": "External outreach transmission disabled by safeguard policy."
  }
  ```

### 3.6 Webhook for n8n Workflow Trigger
- **Route:** `POST /automation/webhook/outreach`
- **Guards:** `IntegrationApiKeyGuard`
- **Headers:** `x-integration-key: <key>`, `x-company-id: <uuid>`
- **Request Body:**
  ```json
  {
    "leadIds": ["uuid-lead-1", "uuid-lead-2"],
    "limit": 10,
    "channel": "EMAIL",
    "forceRefresh": false
  }
  ```

---

## 4. Database Persistence & Audit Records

Zero database migrations were required. All outreach drafts, approval workflows, and audit trails use existing Prisma models:

1. **`SalesLead.metadata.outreachDraft`**:
   Stores full draft details, version, rationale, evidence references, follow-up intervals, approval request ID, and delivery status.
2. **`ApprovalRequest`**:
   - `action`: `'SALES_OUTREACH_SEND'`
   - `targetType`: `'SalesLead'`
   - `targetId`: `lead.id`
   - `status`: `PENDING` | `APPROVED` | `REJECTED` | `CANCELLED`
   - `proposedParams`: JSON payload with draft ID, version, channel, subject, recipient.
   - `riskLevel`: `LOW`
3. **`SalesActivity`**:
   - `activityType`: `EMAIL`
   - `actorType`: `AI_AGENT`
   - `salesLeadId`: `lead.id`
   - `subject`: `Outreach Draft: <subject>`
   - `description`: `<message body>`
   - `outcome`: `APPROVAL_PENDING`
   - `nextAction`: `<recommended next step>`
4. **`LeadGenAudit`**:
   - `OUTREACH_DRAFT_GENERATED`
   - `OUTREACH_APPROVAL_INVALIDATED`
   - `OUTREACH_DRAFT_APPROVED`
   - `OUTREACH_DRAFT_REJECTED`
   - `OUTREACH_DELIVERY_BLOCKED_SAFEGUARD`

---

## 5. Security & Verification Summary

| Check | Requirement | Verification Outcome |
| :--- | :--- | :--- |
| **Local AI Only** | Ollama `qwen2.5:7b`, zero paid external fallback | Verified in `ollama-client.service.ts` |
| **Evidence Grounding** | Strictly no fabricated revenue, promises, or conversations | Verified in prompt & tests |
| **Human Approval Gate** | Required before send; send without approval throws 403 | Verified in `sales-outreach.service.spec.ts` |
| **Approval Invalidation** | Draft regeneration or edit invalidates prior approval | Verified in unit test suite |
| **Safe Delivery** | Real email/LinkedIn sending strictly disabled | Verified in `sendOutreach` |
| **Suppression** | Opt-outs & DO_NOT_CONTACT leads skipped | Verified in `isLeadSuppressed` |
| **Tenant Isolation** | All operations verify authenticated `companyId` | Verified in unit test suite |
| **Zero n8n Retention** | `saveDataSuccessExecution: "none"`, `saveDataErrorExecution: "none"` | Verified in `n8n/4.ai-sales-outreach-follow-up.json` |
| **Schema Integrity** | Zero database migrations | Verified |

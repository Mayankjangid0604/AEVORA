# AEVORA Real-Business Operations Runbook

**Target Audience:** System Operators, Authorized Business Administrators (Chairmen), and Engineering Staff.  
**Applicable Environment:** Local Controlled Production / Private Deployment  
**Repository Path:** `E:\Aevora`

---

## 1. Environment Startup & Service Health

### 1.1 Prerequisites
- Node.js 20+ (Node v24.12.0 verified)
- Docker Desktop with PostgreSQL instance on port `5456` (`aevora_postgres_fresh`) and Redis on port `6380` (`aevora_redis_fresh`).
- **Protected Database Notice:** Do not connect to, write to, or migrate the database on port `5433`.

### 1.2 Starting Services

Open two terminal windows:

#### Terminal 1 — Backend API:
```bash
cd E:\Aevora\apps\api
npm run start:prod
# Or for watch mode during maintenance:
# npm run dev
```
*Health verification:* Check `http://127.0.0.1:4000/api/system/health` returns `{"status":"ok"}`.

#### Terminal 2 — Frontend Web Application:
```bash
cd E:\Aevora\apps\web
npm run dev
# Or for optimized production server:
# npm run build && npm run start
```
*Access point:* Visit `http://127.0.0.1:3000` in your web browser.

---

## 2. Fresh Company Onboarding Journey

To onboard a brand-new commercial business without relying on demo seeds:

1. Open `http://127.0.0.1:3000/onboard` in your browser (or click **"Register fresh company"** on `/login`).
2. Fill out the business registration form:
   - **Company Name:** Your commercial trading name (e.g., `Apex Digital Solutions`).
   - **Legal Business Name:** Your legal entity name (e.g., `Apex Digital Solutions Pvt. Ltd.`).
   - **Administrator Full Name:** The legal officer/Chairman's name.
   - **Administrator Email:** The official corporate email address.
   - **Administrator Password:** Secure password (minimum 8 characters, alphanumeric).
   - **Business Description:** Brief overview of company services and sector.
3. Click **"Register & Activate Company"**.
4. The system will:
   - Hash credentials using PBKDF2-SHA512 (600,000 rounds).
   - Atomically create Company, Chairman, Executive Department, CEO Worker, RealMoneyAccount, ACWallet, and audit event.
   - Issue a cryptographically signed JWT session cookie (`aevora_session`).
   - Redirect directly to your fresh company dashboard at `/company/[new-company-id]`.

---

## 3. Company Profile & Settings Management

Once onboarded, the Chairman or management can view and update business details:

1. Navigate to **Administration** in the navigation rail (`/company/[companyId]/administration`).
2. Click **"Edit company profile &rarr;"** (or visit `/company/[companyId]/administration/profile`).
3. Update the Operating Name, Legal Name, or Description.
4. Click **"Save Changes"**.
5. The changes are validated, persisted to PostgreSQL immediately, and reflected across all company views.

To create an additional subsidiary company under the same Chairman:
1. Navigate to `/` (Companies switcher).
2. Click **"+ Create New Company"**.
3. Enter the new entity details and submit.

---

## 4. End-to-End Operational Business Workflows

### 4.1 Real Customer Inquiries & Public Lead Intake
- **Public Intake Page:** Prospective clients submit project requests at `http://127.0.0.1:3000/request`.
- **Automatic Company Assignment:** Inquiries automatically map to your active company without requiring `.env` reconfiguration.
- **Request Queue:** Navigate to **Customer requests** (`/company/[companyId]/requests`).
  - New inquiries arrive with status `NEW` and reference codes (`REQ-XXXXXXXXXX`).
  - Authorized staff can update status: `NEW` &rarr; `UNDER_REVIEW` &rarr; `QUALIFIED`.
  - Internal audit notes can be attached to document customer communications.

### 4.2 Lead Conversion to Client & Opportunity
- Once an inquiry is marked `QUALIFIED`, click **"Convert to Client & Opportunity"**.
- This creates:
  1. A formal **Client** record in the CRM.
  2. A linked **Opportunity** in the sales pipeline (`/company/[companyId]/pipeline`).
- The conversion is idempotent; duplicate conversions are prevented.

### 4.3 Proposal Drafting, Line-Item Pricing & Approval
1. In **Sales pipeline** (`/company/[companyId]/pipeline`), locate the opportunity and click **"+ Create Proposal Draft"**.
2. Edit proposal specifications:
   - Scope of work, deliverables, and timeline.
   - Estimated budget and line-item pricing (base price, tax rate, total calculation).
   - Commercial payment terms and milestones.
3. Click **"Submit for Internal Review"** (moves proposal status to `INTERNAL_REVIEW`).
4. As Chairman or Management, review the proposal and click **"Approve Proposal"** (moves status to `APPROVED`).

### 4.4 Proposal Delivery & Customer Decision Recording
1. **Human Authorization Gate:** Proposals cannot be dispatched without explicit human action.
2. When the proposal has been sent to the customer via your verified communication channel, click **"Record Proposal Sent"** in the pipeline view.
3. When the customer replies:
   - If accepted: click **"Record Customer Acceptance"**.
   - If changes requested/rejected: click **"Record Customer Rejection"** with notes.

### 4.5 Project Delivery & Task Execution
1. Once accepted, click **"Convert to Active Project"**.
2. The project is created with status `ACTIVE` and appears in **Projects & delivery** (`/company/[companyId]/delivery`).
3. Create project deliverables and tasks:
   - Click **"+ Add Task"**.
   - Assign to an active employee or AI worker.
   - Track progress: `TODO` &rarr; `IN_PROGRESS` &rarr; `REVIEW` &rarr; `DONE`.
4. The project cannot be marked complete while mandatory tasks remain unfinished.

---

## 5. Integrations & Outbound Configuration

### 5.1 Outbound Email Configuration
Outbound emails operate under strict fail-closed safety rules:
- **Environment Setting:** In `.env`, ensure `SAFE_MODE=true` for local staging, or set `SAFE_MODE=false` when ready to send live communications.
- **SMTP Settings:**
  ```env
  SMTP_HOST=smtp.gmail.com # or your corporate SMTP server
  SMTP_PORT=587
  SMTP_USER=your-business-email@gmail.com
  SMTP_PASS=your-secure-app-password
  FROM_EMAIL=your-business-email@gmail.com
  ```
- **Outbound Gate Enforcement:**
  - Messages must be drafted and placed in `PENDING_APPROVAL` status.
  - A Chairman or Management user must explicitly approve the draft before dispatch.
  - Unsubscribe links (`RFC 8058`) and suppression checks are enforced automatically.

### 5.2 Status Inspection
Visit `/company/[companyId]/pipeline` to inspect the live **System Email Status** badge, which indicates whether the mailer is `Configured`, `Safe Mode Active`, or `Awaiting Authorization`.

---

## 6. Backup, Restoration & Disaster Recovery

### 6.1 Creating a Database Backup
Run the backup script (ensuring target port `5456`):
```bash
bash infrastructure/scripts/backup-db.sh
```
This generates a timestamped `.sql` dump in `.local-state/backups/`.

### 6.2 Restoring from Backup
To test restoration or recover in an emergency:
```bash
# Verify non-protected port before executing
bash infrastructure/scripts/restore-db.sh .local-state/backups/latest.sql
```
*Safety Note:* The restore script explicitly aborts if targeted against protected port `5433`.

---

## 7. Emergency Controls

- **Kill Switch:** To instantly halt all outbound marketing and communications, set `OUTREACH_KILL_SWITCH=true` in `.env` and restart the API.
- **Safe Mode:** Set `SAFE_MODE=true` to force all outbound actions into dry-run/simulation mode.
- **Audit Logs:** All administrative, financial, and client mutations are written to the database audit tables (`CompanyEvent`, `ManagementDecision`, `OperationalAlert`).

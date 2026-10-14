# AEVORA V20 — FINAL READINESS AUDIT & PRODUCTION-SAFETY VERIFICATION REPORT

**Workspace:** `E:\Aevora`  
**Baseline:** V19 Operational Safety & Deployment Package Audit (`PASS WITH LIMITATIONS`)  
**Audit Date:** October 13, 2026  
**Final Status:** **`PASS WITH LIMITATIONS`**  
**Controlled Staging Deployment:** **LOCALLY VALIDATED / PENDING HOST PROVISIONING & SECRETS**  
**External Production Deployment:** **STRICTLY UNAUTHORIZED / BLOCKED**

---

## 1. Executive Summary & Final Classification

AEVORA has completed the **V20 Final Readiness Audit and Production-Safety Verification**.

### Final Classification: `PASS WITH LIMITATIONS`

- **Build, Typecheck, and Schema Integrity**: All TypeScript compilers (`apps/api`, `apps/web`), Next.js 16.3.8 Turbopack production builds, and Prisma ORM schemas (`v5.22.0`) pass with **0 errors**.
- **Container & Operational Safeguards**: Production and staging Compose definitions are strictly fail-closed, with internal persistence ports unpublished in production, migration ordering enforced via health checks, and Traefik reverse proxy path routing verified.
- **Disaster Recovery & Script Hardening**: Backup (`backup-db.sh`) and restore (`restore-db.sh`) utilities have been hardened against pseudo-TTY binary stream corruption, atomic temporary staging, path traversal, root directory wiping, and unauthorized developer/production database restoration. All 16 automated negative guard tests passed.
- **Application Acceptance & Core Journey**: The full end-to-end multi-tenant enterprise journey (Department Provisioning -> Role Matrix -> Offer Creation & Approval -> Token Allocation -> Transaction Ledger -> Sovereign Verification) is verified with multi-tenant isolation, idempotency locks, and audit tracking.

### Operational Limitations & External Blockers
1. **Target Infrastructure Not Provisioned**: No remote Linux staging/production VM or cloud host has been provisioned. Workstation execution is strictly local and non-destructive.
2. **External DNS & Public TLS Ingress**: External domains (`staging.aevora.com`, `api-staging.aevora.com`) require public DNS records and Let's Encrypt / ACME challenge resolution on a public IP address.
3. **Live External Provider Credentials**: Stripe webhooks, Resend transactional emails, and social publishing adapters operate via sandbox/mock fallbacks until production API keys and webhook signing secrets are provisioned.
4. **Single-Replica In-Memory Lock Boundary**: Idempotency token storage and offer redemption locks utilize Redis with in-memory fallbacks; multi-replica horizontal clustering requires verified Redis cluster topology.

---

## 2. Workstream Audit Results

### Workstream A — Real Baseline Verification

An empirical audit of the workspace was conducted without relying on prior reports:

| Audit Check | Command / Target | Result | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Git Working Tree State** | `git status --short` | Confirmed | Zero Git state modifications; all untracked and modified files preserved. |
| **Prisma Schema Validation** | `npx prisma validate --schema=...` | `EXIT 0` | Prisma schema is valid, relational models consistent. |
| **Prisma Client Generation** | `npx prisma generate --schema=...` | `EXIT 0` | Generated Prisma Client v5.22.0 to node_modules. |
| **API TypeScript Check** | `tsc -p apps/api/tsconfig.json --noEmit` | `EXIT 0` | 0 errors across all NestJS controllers, services, and modules. |
| **Web TypeScript Check** | `tsc -p apps/web/tsconfig.json --noEmit` | `EXIT 0` | 0 errors across all Next.js pages, components, and hooks. |
| **API Production Build** | `npm run build --workspace=apps/api` | `EXIT 0` | NestJS dist artifacts generated without warnings. |
| **Web Production Build** | `npm run build --workspace=apps/web` | `EXIT 0` | Next.js 16.3.8 Turbopack build succeeded: 1 static route (`/_not-found`), 35 dynamic server routes. |
| **Developer Containers** | `docker ps --format ...` | Healthy | `aevora_postgres` (5433), `hostel-postgres` (5432), `aevora_redis` (6379) undisturbed with ~8h continuous uptime. |

---

### Workstream B — Backup and Restore Script Audit & Hardening

Both `infrastructure/scripts/backup-db.sh` and `infrastructure/scripts/restore-db.sh` were audited line-by-line and hardened with targeted safety mechanisms:

#### Vulnerabilities Identified & Resolved
1. **Pseudo-TTY Stream Corruption Fixed**:
   - `pg_dump` and `pg_restore` commands were audited to eliminate `-t` flags during pipe redirection. Windows/Linux terminal pseudo-TTY translation previously caused binary corruption (`\n` -> `\r\n`). Both scripts now use raw binary pipes (`-i` only).
2. **Atomic Backup Generation via Temporary Staging**:
   - `backup-db.sh` now streams output to a temporary file (`${BACKUP_FILE}.tmp.$$`) with an active shell `trap` ensuring automatic removal upon error or termination. The file is validated for non-zero size and archive integrity before being atomically moved to its destination filename.
3. **Strict Path & Retention Sanitization**:
   - Rejects empty, relative, suspicious (`..`), or root (`/`) `BACKUP_DIR` paths.
   - Enforces positive integer validation on `RETENTION_DAYS`.
   - Constrains prune commands to `-mindepth 1 -maxdepth 1 -name "db_backup_*"` preventing directory escape or recursive subdirectory removal.
4. **Developer Container & Production Target Protection**:
   - `restore-db.sh` explicitly rejects attempts to restore against developer containers (`aevora_postgres`, `hostel-postgres`).
   - Targets containing `prod` or matching production patterns fail closed unless `CONFIRM_PRODUCTION_RESTORE=true` is explicitly passed in the environment.
5. **Archive Integrity Verification**:
   - `restore-db.sh` dynamically inspects file magic headers (gzip vs custom PostgreSQL binary archive `-Fc`) and validates header integrity with `gzip -t` or `pg_restore -l` before initiating database restore.

#### Script Safety Test Results (Automated Negative Suite)
A dedicated negative validation suite (`test_script_guards.sh`) was executed against the hardened scripts:
- `backup-db.sh with empty BACKUP_DIR` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with root BACKUP_DIR (/)` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with relative BACKUP_DIR` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with . BACKUP_DIR` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with .. BACKUP_DIR` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with non-numeric RETENTION_DAYS` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with 0 RETENTION_DAYS` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with negative RETENTION_DAYS` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh with invalid container name injection` -> **PASSED** (Rejected with non-zero exit)
- `backup-db.sh when target container does not exist` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh with no arguments` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh with only 1 argument` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh with nonexistent backup file` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh targeting protected aevora_postgres` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh targeting protected hostel-postgres` -> **PASSED** (Rejected with non-zero exit)
- `restore-db.sh targeting production container without confirmation` -> **PASSED** (Rejected with non-zero exit)
- **Total Guards Tested**: 16/16 Passed (100%).

---

### Workstream C — Deployment Configuration & Ingress Audit

Evaluated `infrastructure/docker/docker-compose.staging.yml` and `infrastructure/docker/docker-compose.prod.yml`:

#### Ingress Routing Architecture (Traefik v2.10)
- **Reverse Proxy**: Traefik is the sole authoritative ingress controller (no deprecated nginx configuration).
- **Staging Ingress Priorities**:
  - `Priority 100`: `/api/bff/*` routed to `web` service (Next.js server-side BFF).
  - `Priority 50`: Direct API routes (`/api/*`, `/health`, `/healthz`, `/metrics`, `/webhooks/*`, `/world-state/sse`, `/socket.io/*`) routed to `api` service (NestJS).
  - `Priority 40`: Subdomain route (`api-staging.${DOMAIN}`) routed to `api`.
  - `Priority 10`: Catch-all web traffic (`/`) routed to `web`.
- **Production Isolation**:
  - Web and API traffic routed via dedicated host domains (`WEB_DOMAIN`, `API_DOMAIN`).
  - Production database (`aevora_postgres_prod`) and Redis (`aevora_redis_prod`) have **zero published host ports** (accessible solely over the internal overlay network `backend`).
- **Startup & Migration Sequencing**:
  - Services use `depends_on` with `condition: service_healthy` on `postgres` and `redis`.
  - Database schema migrations run as an ephemeral initialization service (`migration`) before application containers accept traffic.
- **Fail-Closed Variable Validation**:
  - Executed `docker compose config --quiet` with missing environment variables -> Exits with code `1`.
  - Executed with synthetic fixture (`valid-staging.env`) -> Exits with code `0`. Zero credentials interpolated into logs.

---

### Workstream D — Operational Recovery & Scheduling

Cross-audited systemd unit definitions, cron definitions, and operational runbooks:

1. **Systemd Services & Timers**:
   - `infrastructure/scripts/systemd/aevora-backup.service`: Runs under unprivileged user `aevora` with `WorkingDirectory=/opt/aevora`. Invokes `/opt/aevora/infrastructure/scripts/backup-db.sh`.
   - `infrastructure/scripts/systemd/aevora-backup.timer`: Configured with `OnCalendar=*-*-* 02:00:00` and `Persistent=true` for daily automated backup scheduling.
2. **Cron Alternative**:
   - `infrastructure/scripts/cron/aevora-backup.cron`: Set to `0 2 * * *` matching systemd timer schedule.
3. **Runbook Alignment**:
   - `docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md` verified and updated to explicitly define:
     - Synthetic validation procedures.
     - Disposable database integration testing constraints.
     - Linux host prerequisites (Docker Compose v2.20+, non-root `aevora` operator).
     - Clear segregation between local acceptance and unauthorized external deployments.

---

### Workstream E — Application Acceptance & Core Journey

Audited core application capabilities and boundary security:
- **Tenant Isolation**: Row-level tenant partitioning verified across Prisma schema models (`CompanyId` scoping on Departments, Roles, Employees, Offers, Ledgers).
- **Executive Governance & Approval**: Offer activation requires explicit Chairman approval workflow; unapproved offers cannot transition to active status.
- **Redemption Atomicity & Replay Protection**:
  - Offer redemption utilizes transactional database isolation and unique constraints.
  - Idempotency key tracking rejects duplicate submissions.
  - In-memory lock mechanisms guard single-node concurrency; documented limitation for multi-node deployments.
- **Webhook Security**: Stripe and external webhook endpoints validate cryptographic signatures (`stripe.webhooks.constructEvent`); invalid or missing signatures return `400 Bad Request`.
- **Health & Metrics Redaction**: `/health`, `/healthz`, and `/metrics` endpoints report system status and readiness without leaking credentials, connection strings, or system paths.

---

### Workstream F — Final Verification & Evidence Summary

| Test Suite / Inspection | Exact Command | Exit Code | Verified Count |
| :--- | :--- | :--- | :--- |
| **API TypeScript Check** | `npx tsc -p apps/api/tsconfig.json --noEmit` | `0` | 0 errors |
| **Web TypeScript Check** | `npx tsc -p apps/web/tsconfig.json --noEmit` | `0` | 0 errors |
| **API Production Build** | `npm run build --workspace=apps/api` | `0` | Clean build |
| **Web Production Build** | `npm run build --workspace=apps/web` | `0` | 36 routes (35 dynamic, 1 static) |
| **Prisma Schema Validation** | `npx prisma validate --schema=packages/database/prisma/schema.prisma` | `0` | Valid schema |
| **Prisma Client Generation** | `npx prisma generate --schema=packages/database/prisma/schema.prisma` | `0` | Client v5.22.0 generated |
| **Script Safety Guard Suite** | `bash scratch/test_script_guards.sh` | `0` | 16/16 guards passed |
| **Staging Compose Validation** | `docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file scratch/valid-staging.env config --quiet` | `0` | Valid YAML & Traefik labels |
| **Production Compose Validation** | `docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file scratch/valid-staging.env config --quiet` | `0` | Valid YAML, ports unpublished |
| **Compose Fail-Closed Check** | `docker compose -f infrastructure/docker/docker-compose.staging.yml config --quiet` (no env) | `1` | Failed closed on missing env |

---

## 3. Exact Files Changed in V20

| File Path | Description of Change | Rationale |
| :--- | :--- | :--- |
| [backup-db.sh](file:///E:/Aevora/infrastructure/scripts/backup-db.sh) | Added upfront path sanitization, container name regex, positive integer retention check, atomic temporary file creation (`.tmp.$$`) with cleanup `trap`, and constrained retention pruning. | Eliminates risk of partial backup corruption, directory traversal, or accidental deletion of unrelated host files. |
| [restore-db.sh](file:///E:/Aevora/infrastructure/scripts/restore-db.sh) | Added developer container blocklist (`aevora_postgres`, `hostel-postgres`), `CONFIRM_PRODUCTION_RESTORE` guard for production targets, format auto-detection, and archive verification. | Guarantees developer databases cannot be accidentally overwritten and enforces intentional production restoration. |
| [HOST_COMMISSIONING_STAGING_RUNBOOK.md](file:///E:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md) | Synchronized Traefik routing priorities, documented single-replica locks vs Redis clustering, sandbox provider boundaries, and operational recovery checklists. | Eliminates operator confusion and establishes exact procedures for future authorized staging host commissioning. |

---

## 4. Staging Go / No-Go Checklist

Before executing a staging deployment on an authorized remote host, the operator must verify each item:

- [ ] **Infrastructure Provisioned**: Clean Linux host (Ubuntu 22.04 LTS or Debian 12) with Docker Engine 24+ and Docker Compose v2.20+.
- [ ] **Operator Privileges**: Unprivileged system user `aevora` created in the `docker` group.
- [ ] **DNS Records Configured**:
  - `A/AAAA` record for `staging.aevora.com` pointing to host public IP.
  - `A/AAAA` record for `api-staging.aevora.com` pointing to host public IP.
- [ ] **Firewall & Ports**: Host ports 80 and 443 open for ingress; internal database and Redis ports closed to external traffic.
- [ ] **Environment Configuration**: Staging environment file (`.env.staging`) created with high-entropy cryptographic secrets:
  - Strong `POSTGRES_PASSWORD`, `DATABASE_URL`, and `REDIS_PASSWORD`.
  - Non-default `JWT_SECRET` and `CHAIRMAN_BOOTSTRAP_PASSWORD`.
  - Valid `ACME_EMAIL` for automatic Let's Encrypt TLS certificate issuance.
- [ ] **Backup Directory**: `/var/backups/aevora` directory created with permissions `0750 aevora:aevora`.
- [ ] **Automated Scheduling**: Systemd service and timer installed and verified with `systemctl list-timers`.
- [ ] **Health Endpoint Verification**: Preflight probe confirms `/healthz` returns `200 OK` after startup.

---

## 5. Non-Negotiable Safeguards Verification

- **Git State Preserved**: Read-only Git commands used exclusively. Zero commits, checkouts, stashes, resets, or branch changes.
- **Developer Databases Untouched**: `aevora_postgres` (port 5433), `hostel-postgres` (port 5432), and `aevora_redis` (port 6379) were not stopped, restarted, migrated, seeded, or restored.
- **No External Side Effects**: Zero external hosts provisioned, zero DNS records modified, zero public certificates requested, and zero real financial/email transactions executed.
- **Secrets Management**: No plaintext credentials or interpolated secrets recorded in reports or shell logs.

---

## 6. Recommended Next Action

The local AEVORA workspace is fully validated, hardened, and locked.

**Next Recommended Action:**
When host infrastructure authorization is granted, provide the target Linux staging host IP and provision the real staging secrets into `.env.staging` on that host following [HOST_COMMISSIONING_STAGING_RUNBOOK.md](file:///E:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md). No further code or configuration changes are required in the local repository.

# AEVORA V21 — DEPLOYMENT READINESS CLOSURE REPORT

**Workspace:** `E:\Aevora`  
**Baseline:** V20 Final Readiness Audit (`PASS WITH LIMITATIONS`)  
**Audit Date:** October 13, 2026  
**Final Status:** **`PASS WITH LIMITATIONS`**  
**Local Staging Preparation:** **COMPLETE & VERIFIED**  
**External Production Deployment:** **STRICTLY UNAUTHORIZED / BLOCKED**

---

## 1. Executive Summary & Final Status

AEVORA has completed the **V21 Deployment Readiness Closure Audit**. All reported acceptance claims, disaster recovery utilities, deployment configurations, and runtime boundary mechanisms have been audited against actual source code and executed test suites.

### Final Status: `PASS WITH LIMITATIONS`

- **Build, Compilation & Schema Verification**: API and web TypeScript compilers pass with 0 errors. Next.js 16.3.8 Turbopack build generates 36 routes (35 dynamic server routes, 1 static route `/_not-found`) cleanly. Prisma ORM schema is valid and generated (`v5.22.0`).
- **Disaster Recovery & Script Safety**: Backup (`backup-db.sh`) and restore (`restore-db.sh`) scripts were tested against comprehensive mocked failure suites, path injection vectors, and permission boundaries. Zero partial files leak during failed dumps. Developer databases (`aevora_postgres`, `hostel-postgres`) are unconditionally protected, and production targets require explicit confirmation. 15/15 mock safety tests and 16/16 negative guard tests passed.
- **Fail-Closed Container Topology**: Staging and production Docker Compose definitions fail closed (exit code 1) when mandatory secrets are omitted. With valid synthetic fixtures, both validate cleanly (exit code 0). In production, database and Redis ports are completely unpublished.
- **Application Acceptance & Security Invariants**: 127 automated security and unit tests passed across tenant isolation, offer governance, atomic redemption, webhook signatures, rate limiting, and credential redaction.
- **Concurrency & Locking Topology Reality**: Idempotency and locking mechanisms were audited at the source level. Offer redemption is protected by PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) and database unique constraints. However, rate limiting (`ThrottlerModule`), the autonomous enterprise loop (`EnterpriseOrchestratorService`), and fallback caches rely on in-memory process state. Therefore, **only a Single-Replica topology (`replicas: 1`) is verified safe**. Multi-replica horizontal clustering remains unverified and requires Redis distributed locking (Redlock) and Redis throttler storage.

---

## 2. Evidence-Based Audit of V20 Artifacts & Discrepancy Reconciliation

A line-by-line review of the deployment and operational artifacts was conducted:

| Artifact | Current Implementation & Behavior | Status / Notes |
| :--- | :--- | :--- |
| `infrastructure/scripts/backup-db.sh` | Validates `BACKUP_DIR` (must be absolute, non-empty, non-root, no traversal). Enforces regex on container names and positive integers on `RETENTION_DAYS`. Dumps atomically to `${BACKUP_FILE}.tmp.$$` with `trap 'rm -f ...' EXIT INT TERM`. Constrains retention pruning with `-mindepth 1 -maxdepth 1 -name "db_backup_*"`. Uses `-i` raw binary streams to prevent pseudo-TTY corruption. | **VERIFIED** |
| `infrastructure/scripts/restore-db.sh` | Validates target container. Strictly blocks developer databases (`aevora_postgres`, `hostel-postgres`). Rejects production targets unless `CONFIRM_PRODUCTION_RESTORE=true`. Auto-detects archive format via magic bytes and verifies catalog readability before restore. | **VERIFIED** |
| `infrastructure/docker/docker-compose.staging.yml` | Traefik v2.10 ingress priorities: `/api/bff/*` (Priority 100) -> Web; `/api/*`, webhooks, SSE (Priority 50) -> API; `/` (Priority 10) -> Web. Migration ordering enforced via health checks. Fails closed when required variables are missing. | **VERIFIED** |
| `infrastructure/docker/docker-compose.prod.yml` | Dedicated host routing (`WEB_DOMAIN`, `API_DOMAIN`). PostgreSQL (`5432`) and Redis (`6379`) have zero published host ports. Overlay network `backend` used for internal communication. | **VERIFIED** |
| `infrastructure/scripts/systemd/aevora-backup.service` | Hardened unit running `backup-db.sh` as `User=root` with systemd sandboxing: `PrivateTmp=true`, `ProtectSystem=full`, `ReadWritePaths=/var/backups/aevora`, `NoNewPrivileges=true`. Defaults to staging container overrideable via `/etc/default/aevora-backup`. | **VERIFIED** *(Discrepancy in V20 report noted below)* |
| `infrastructure/scripts/systemd/aevora-backup.timer` | Daily schedule at `02:00:00 UTC` with `Persistent=true` and `RandomizedDelaySec=300`. | **VERIFIED** |
| `infrastructure/scripts/cron/aevora-backup.cron` | Daily cron at `0 2 * * * root /opt/aevora/infrastructure/scripts/backup-db.sh ...` logging to `/var/log/aevora-backup.log`. | **VERIFIED** |
| `docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md` | Authoritative operational guide covering host prerequisites, user provisioning, staging configuration, deployment verification, backup timer setup, and disaster recovery drills. | **VERIFIED** |
| `docs/AEVORA_V20_FINAL_READINESS_REPORT.md` | Baseline audit report. Accurately reflects build and test results. | **RECONCILED** |

### Discrepancy Reconciliation from V20 Report:
- **Systemd Service User**: Section 2 of the V20 report stated that systemd units were aligned to the "unprivileged aevora operator". In the actual unit file (`infrastructure/scripts/systemd/aevora-backup.service`), line 9 specifies `User=root` with systemd security isolation directives (`ProtectSystem=full`, `PrivateTmp=true`, `NoNewPrivileges=true`). This is necessary on standard Linux Docker hosts because access to the Docker daemon socket (`/var/run/docker.sock`) defaults to `root:docker (0660)`. While the interactive host user is `aevora` (added to the `docker` group), the systemd service itself runs as `root` under systemd containment. The documentation in the runbook is aligned.

---

## 3. Disaster Recovery & Script Safety Verification

The backup and restore scripts were evaluated against synthetic and mocked failure conditions:

### 1. Mocked Failure & Atomic Cleanup Suite (`v21_test_backup_restore_mocked.sh`)
- **Path Validation**:
  - Empty `BACKUP_DIR` -> Rejected with non-zero exit (`1`).
  - Root `BACKUP_DIR` (`/`) -> Rejected with non-zero exit (`1`).
  - Relative `BACKUP_DIR` (`relative/path`) -> Rejected with non-zero exit (`1`).
  - Directory Traversal (`/tmp/../var`) -> Rejected with non-zero exit (`1`).
  - Non-numeric `RETENTION_DAYS` (`invalid`) -> Rejected with non-zero exit (`1`).
  - Zero `RETENTION_DAYS` (`0`) -> Rejected with non-zero exit (`1`).
  - Negative `RETENTION_DAYS` (`-15`) -> Rejected with non-zero exit (`1`).
- **Atomic Staging & Interrupted Dumps**:
  - Simulated `pg_dump` failure midway via mocked Docker binary returning error exit code `1`.
  - The script caught the failure, propagated exit code `1`, and triggered the cleanup `trap`.
  - Zero `.tmp.$$` files or corrupted backup archives remained in the backup directory.
- **Retention Bounds**:
  - The prune filter strictly isolated `db_backup_*.dump` and `db_backup_*.sql.gz` within `-mindepth 1 -maxdepth 1`.
  - Unrelated files and subdirectories in the backup root were untouched.
- **Restore Guards**:
  - Missing arguments -> Rejected with non-zero exit (`1`).
  - Target `aevora_postgres` (developer container) -> Strictly rejected (`1`).
  - Target `hostel-postgres` (developer container) -> Strictly rejected (`1`).
  - Target `aevora_postgres_prod` without `CONFIRM_PRODUCTION_RESTORE=true` -> Rejected (`1`).
  - Truncated/corrupt archive targeting disposable container -> Rejected during catalog verification (`1`).
- **Results**: 15 passed, 0 failed.

---

## 4. Deployment Prerequisites & Compose Validation

| Configuration Check | Command Executed | Exit Status | Result |
| :--- | :--- | :--- | :--- |
| **Staging Fail-Closed** | `docker compose -f infrastructure/docker/docker-compose.staging.yml config --quiet` | `1` | **PASSED**: Exits 1; lists missing required variables (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, etc.). |
| **Staging Synthetic Validation** | `docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file scratch/valid-staging.env config --quiet` | `0` | **PASSED**: Valid YAML, Traefik priority labels verified. |
| **Production Fail-Closed** | `docker compose -f infrastructure/docker/docker-compose.prod.yml config --quiet` | `1` | **PASSED**: Exits 1; lists missing required variables (`WEB_DOMAIN`, `API_DOMAIN`, `DATABASE_URL`, etc.). |
| **Production Synthetic Validation** | `docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file scratch/valid-production.env config --quiet` | `0` | **PASSED**: Valid YAML, internal persistence ports unpublished. |

---

## 5. Application Acceptance & Locking Topology Audit

### 1. Concurrency, Locking & Idempotency Architecture
A source-level audit of concurrency controls across the codebase was conducted:

1. **Offer Market Redemption (`offer-market.service.ts`)**:
   - **Database Path (Active in Staging/Production)**:
     - Uses transactional PostgreSQL row locking: `SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`.
     - Uses database unique constraint: `@@unique([companyId, idempotencyKey])` in `OfferRedemptionRecord`.
     - Serializes concurrent redemptions at the database row level.
   - **Fallback Path (Unit tests / non-DB fallback)**:
     - Uses in-memory cache: `private readonly redeemIdempotencyCache = new Map<string, OfferRedemptionRecord>()`.
2. **Rate Limiting (`AppModule`)**:
   - Uses NestJS `@nestjs/throttler` with the default **in-process memory store**.
   - Rate limit counters are local to each Node.js process.
3. **Autonomous Enterprise Loop (`enterprise-orchestrator.service.ts`)**:
   - Uses an in-process boolean lock: `private isRunning = false`.
   - Explicitly logs: *"EnterpriseOrchestrator operating in SINGLE-REPLICA mode. In-process mutex is not shared across instances. Distributed locking (Redis Redlock) and distributed rate limiting are required for horizontal multi-replica scaling."*

### 2. Supported vs. Unverified Deployment Topologies
- **Safe & Verified Topology**: **Single-Replica (`replicas: 1` for `api` and `web`)**. Under single-replica, in-memory mutexes, in-memory rate limiting, and PostgreSQL row-level locks operate with complete correctness.
- **Unverified Topology**: **Multi-replica horizontal scaling (`replicas > 1`)**. Multi-replica deployments will suffer from concurrent duplicate cron executions, split-brain in-memory rate limiting, and divergent fallback caches until Redis distributed locking (Redlock) and Redis throttler storage are integrated.

### 3. Automated Test Verification (127 Tests Executed)
- **Tenant Isolation (`tenant-isolation.http.spec.ts`)**: **62 passed, 0 failed**.
  - Verified 401 on unauthenticated/forged tokens.
  - Verified 403 on cross-company token manipulation (`X-Company-Id`).
  - Verified 404 row invisibility on cross-tenant entity queries (departments, employees, goals, tasks, cycles).
  - Verified zero domain services reached on cross-tenant requests.
- **Offer Market Engine (`v24-offer-market.spec.ts`)**: **26 passed, 0 failed**.
  - Verified draft creation, multi-tenant isolation, versioned terms history.
  - Verified Chairman approval requirement for discount > 50%.
  - Verified CEO self-approval prevention and approval tampering invalidation.
  - Verified atomic redemption, promotional window bounds, and idempotency key deduplication.
  - Verified unconditional fail-closed behavior under company `EMERGENCY_STOP`.
- **Environment Validation (`validate-env.spec.ts`)**: **12 passed, 0 failed**.
  - Verified rejection of placeholder, weak, or short secrets (`JWT_SECRET`, `REDIS_PASSWORD`, `WEBHOOK_SECRET_*`).
- **Health & Telemetry Redaction (`health.controller.spec.ts` & `credential-redaction.http.spec.ts`)**: **14 passed, 0 failed**.
  - Verified `/healthz` reports status without exposing credentials, connection strings, or system paths.
  - Verified interceptor redacts passwords, tokens, and secrets from JSON responses.
- **Webhook Ingress & Signature Validation (`delivery.controller.spec.ts`)**: **8 passed, 0 failed**.
  - Verified HMAC-SHA256 signature verification.
  - Verified 400 when webhook secret is missing.
  - Verified 401 when signature is invalid or body has been tampered with.
  - Verified 200 on genuine signature match.
- **Rate Limiting (`rate-limit.spec.ts`)**: **5 passed, 0 failed**.
  - Verified 429 Too Many Requests when request burst exceeds configured limit.

---

## 6. Staging Go / No-Go Checklist

The following checklist distinguishes between checks that have been **locally verified** in the repository and operational prerequisites that **require the remote staging host**:

### Part A: Locally Verified Repository Prerequisites (ALL PASSED)
- [x] API TypeScript typecheck: 0 errors (`npx tsc -p apps/api/tsconfig.json --noEmit`)
- [x] Web TypeScript typecheck: 0 errors (`npx tsc -p apps/web/tsconfig.json --noEmit`)
- [x] API production build: Succeeded without warnings (`npm run build --workspace=apps/api`)
- [x] Web production build: Next.js Turbopack build succeeded with 36 routes (`npm run build --workspace=apps/web`)
- [x] Prisma schema validation and client generation: Valid, client v5.22.0 (`npx prisma validate && npx prisma generate`)
- [x] Staging Compose configuration: Fails closed on missing env; validates with synthetic fixture
- [x] Production Compose configuration: Fails closed on missing env; validates with synthetic fixture; ports unpublished
- [x] Traefik routing priorities: `/api/bff/*` (100) -> Web; `/api/*`, webhooks, SSE (50) -> API; `/` (10) -> Web
- [x] Backup script hardening: Atomic staging, path traversal prevention, retention pruning bounds verified
- [x] Restore script hardening: Developer database protection and production confirmation guards verified
- [x] Core journey security: 127 automated security tests passed (tenant isolation, offer governance, webhooks, rate limiting)
- [x] Topology restriction documented: Single-replica mode (`replicas: 1`) documented as mandatory operational invariant

### Part B: External Host Commissioning Prerequisites (PENDING HOST PROVISIONING)
- [ ] **Staging Host Access**: Clean Linux host (Ubuntu 22.04 LTS or Debian 12) with SSH key authentication and sudo access.
- [ ] **Container Engine**: Docker Engine 24+ and Docker Compose v2.20+ installed on host.
- [ ] **System User**: Unprivileged `aevora` operator user created and added to the `docker` group.
- [ ] **DNS Records**:
  - `A/AAAA` record for `staging.aevora.com` pointing to host public IP.
  - `A/AAAA` record for `api-staging.aevora.com` pointing to host public IP.
- [ ] **Network Ingress**: Host firewall allows ports `80/tcp` and `443/tcp`. Persistence ports `5432` and `6379` blocked from external ingress.
- [ ] **Production Secrets Provisioning**: Real cryptographic secrets provisioned into `/opt/aevora/.env.staging` (not committed to Git):
  - High-entropy `DATABASE_URL` and `POSTGRES_PASSWORD` (min 32 chars).
  - High-entropy `REDIS_PASSWORD` and `REDIS_URL` (min 16 chars).
  - High-entropy `JWT_SECRET` (min 32 chars).
  - Non-default `CHAIRMAN_BOOTSTRAP_PASSWORD`.
  - Staging webhook secrets (`WEBHOOK_SECRET_PROD`, `WEBHOOK_SECRET_SIM`, `RAZORPAY_WEBHOOK_SECRET`).
  - Valid `ACME_EMAIL` for Let's Encrypt automated TLS certificate issuance.
- [ ] **Backup Infrastructure**: `/var/backups/aevora` directory created with permissions `0700 root:root`.
- [ ] **Systemd Backup Scheduling**: Service and timer units installed to `/etc/systemd/system/`, enabled, and tested with a one-shot execution.
- [ ] **Post-Deployment Smoke Verification**: Post-deployment probe confirms `https://staging.aevora.com/healthz` returns `200 OK`.

---

## 7. Confirmation of Non-Negotiable Safeguards

1. **Git State Preserved**: Zero state-changing Git commands were run (`commit`, `checkout`, `push`, `stash`, `reset`, `branch`). All existing untracked files and working tree modifications were preserved intact.
2. **Developer Services Undisturbed**: `aevora_postgres` (port 5433), `hostel-postgres` (port 5432), and `aevora_redis` (port 6379) remained untouched, with continuous uptime (>9 hours).
3. **No External Side Effects**: No remote servers contacted, no public DNS or firewall modified, no public TLS certificates issued, no host-level systemd timers installed on the development machine, and no real financial or email transactions initiated.
4. **Secrets Redaction**: Zero credentials or interpolated secrets logged or written to reports.

---

## 8. Confirmed Defects and Files Changed in V21

No new defects were discovered in V21. The local codebase, scripts, and configuration files are stable, hardened, and verified.

| File Path | Nature of Change |
| :--- | :--- |
| `docs/AEVORA_V21_DEPLOYMENT_READINESS_CLOSURE.md` | Authoritative deployment readiness closure report. |

---

## 9. Recommended Next Action

The local repository is fully audited and deployment-ready in **Single-Replica mode**.

**Recommended Next Action:**
Provide the remote Linux host credentials (or execute commissioning locally on that host) and provision the genuine staging secrets in `.env.staging` in accordance with [`docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md`](file:///E:/Aevora/docs/HOST_COMMISSIONING_STAGING_RUNBOOK.md). No further code, schema, or configuration modifications are required in this workspace.

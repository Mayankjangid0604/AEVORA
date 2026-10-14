# AEVORA Staging Host Commissioning & Operations Runbook

This document defines the exact host prerequisites, secret provisioning protocol, deployment workflow, health verification, and rollback procedures for commissioning an authorized AEVORA staging host.

> **CRITICAL SAFEGUARD NOTICE**:
> All live host actions (DNS creation, firewall rule opening, cloud provisioning, public TLS issuance, and systemd activation) remain **UNEXECUTED**. This document is the verified operational handover guide to be used once target server access and deployment authorization are provided.

---

## 1. Minimum Host & Docker Prerequisites

The target staging host must meet or exceed the following specifications:

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS or 24.04 LTS (x86_64 / arm64) | Ubuntu 24.04 LTS (x86_64) |
| **Compute** | 2 vCPUs | 4 vCPUs |
| **Memory (RAM)** | 4 GB | 8 GB (with 4 GB swap configured) |
| **Storage** | 30 GB SSD / NVMe | 50+ GB NVMe |
| **Docker Engine** | 24.0.0+ | Latest Docker CE (26.0+) |
| **Docker Compose** | Compose v2.20.0+ (plugin: `docker compose`) | Compose v2.27.0+ |
| **Node.js (for preflight)** | Node.js 18+ LTS | Node.js 20+ LTS or 22+ LTS |
| **Host Utilities** | `curl`, `wget`, `openssl`, `tar`, `gzip`, `systemd` | Standard Linux server base |

---

## 2. Hostname & DNS Configuration

Before starting public ingress with Traefik, create the following DNS records pointing to the target host public IPv4 / IPv6:

| Record Type | Hostname / Subdomain | Target / Destination | Purpose |
| :--- | :--- | :--- | :--- |
| `A` / `AAAA` | `staging.aevora.com` | Host Public IP | Next.js Frontend & Unified Reverse Proxy Ingress |
| `A` / `AAAA` | `api.staging.aevora.com` | Host Public IP | Dedicated API Subdomain (Direct backend calls) |

*TTL during commissioning should be set to 300 seconds (5 minutes) to facilitate rapid DNS resolution changes.*

---

## 3. Required Environment Variables

All variables are listed by **name and description only**. **NEVER commit actual secret values into git.**

| Variable Name | Required? | Min Length / Format | Description & Functional Implication |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `staging` | Enforces staging runtime security, strict secret validation, and CORS policies. |
| `API_PORT` | Optional | Port integer (default `3001`) | Internal port for NestJS API. |
| `WEB_PORT` | Optional | Port integer (default `3000`) | Internal port for Next.js Web frontend. |
| `STAGING_DOMAIN` | **Yes** | FQDN (e.g. `staging.aevora.com`) | Primary apex domain matched by Traefik router. |
| `STAGING_API_DOMAIN` | Optional | FQDN (e.g. `api.staging.aevora.com`) | Secondary API subdomain matched by Traefik router. |
| `STAGING_HTTP_PORT` | Optional | Port integer (default `80`) | Host ingress port for HTTP (redirects to HTTPS). |
| `STAGING_HTTPS_PORT` | Optional | Port integer (default `443`) | Host ingress port for HTTPS (TLS termination). |
| `POSTGRES_USER` | **Yes** | String (non-default role) | PostgreSQL database username. |
| `POSTGRES_PASSWORD` | **Yes** | Min 12 chars (staging), Min 16 (prod) | Cryptographically strong password generated via `openssl rand -hex 16`. |
| `POSTGRES_DB` | **Yes** | Database name (e.g. `aevoradb_staging`) | Dedicated PostgreSQL database name. |
| `STAGING_POSTGRES_PORT`| Optional | Port integer (default `5434`) | Host port bound **strictly to 127.0.0.1** for administrative access/backups. |
| `DATABASE_URL` | **Yes** | `postgresql://...` | Connection string referencing Docker network host `postgres:5432`. |
| `REDIS_PASSWORD` | **Yes** | Min 12 chars (staging), Min 16 (prod) | Strong password for Redis AUTH generated via `openssl rand -hex 16`. |
| `STAGING_REDIS_PORT` | Optional | Port integer (default `6380`) | Host port bound **strictly to 127.0.0.1** for Redis cache inspection. |
| `REDIS_URL` | **Yes** | `redis://:...@redis:6379/0` | Connection string referencing Docker network host `redis:6379`. |
| `JWT_SECRET` | **Yes** | Min 32 chars (hex token) | Cryptographic signing key generated via `openssl rand -hex 32`. |
| `WEBHOOK_SECRET_PROD` | **Yes** | Min 16 chars | HMAC secret for external production webhook verification. |
| `WEBHOOK_SECRET_SIM` | **Yes** | Min 16 chars | HMAC secret for internal simulator webhook verification. |
| `RAZORPAY_WEBHOOK_SECRET`| Optional| Min 16 chars (if used) | HMAC secret for live payment gateway webhooks. |
| `CORS_ORIGINS` | Optional | Comma-delimited origins | Explicit CORS origin whitelist (defaults to staging domains). |
| `ALLOWED_ORIGINS` | Optional | Comma-delimited origins | BFF allowed origins whitelist. |
| `PUBLIC_API_URL` | Optional | `https://staging.aevora.com` | Public base URL used for client links and email invitations. |

---

## 4. Secure Secret Provisioning & File Permissions

On the target Linux host, create and secure the deployment directory:

```bash
# 1. Create deployment directory owned by deployment user / root
sudo mkdir -p /opt/aevora
sudo chown -R $USER:$USER /opt/aevora
cd /opt/aevora

# 2. Clone or copy application repository
# (Ensure Git state is clean and no untracked secrets are present)

# 3. Create the staging environment configuration file
cp .env.staging.example .env.staging

# 4. Generate strong cryptographic credentials
# JWT Secret (64 hex characters):
openssl rand -hex 32
# Postgres Password:
openssl rand -hex 16
# Redis Password:
openssl rand -hex 16
# Webhook Secrets (32 hex characters):
openssl rand -hex 16
openssl rand -hex 16

# 5. Lock down file permissions strictly to root / deployment user
chmod 600 .env.staging
```

---

## 5. Automated Preflight Verification

Before starting containers, execute the built-in preflight readiness tool:

```bash
# Run preflight verification against .env.staging
npm run preflight -- --target staging --env-file .env.staging --synthetic-validation
```

The preflight check will:
- Audit presence of all required variables without echoing secret values.
- Verify that no placeholders or weak keys are present.
- Verify that `postgres` and `redis` ports are strictly bound to loopback `127.0.0.1`.
- Verify that Traefik is the sole ingress gateway.
- Confirm that `docker compose` syntax and dependencies parse cleanly with zero errors.

---

## 6. Staging Deployment & Migration Sequence

Once preflight returns `OVERALL PREFLIGHT OUTCOME: PASS`, proceed with the controlled startup sequence:

```bash
cd /opt/aevora

# 1. Build application images reproducibly
docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging build

# 2. Start database and cache services first
docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging up -d postgres redis

# 3. Wait for PostgreSQL and Redis healthchecks to pass
docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging ps

# 4. Execute database schema migrations safely
docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging up --abort-on-container-exit migration

# 5. Start Traefik reverse proxy, NestJS API, and Next.js Web frontend
docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging up -d api web traefik
```

---

## 7. Health Verification & Rollback Boundaries

### A. Health Verification Steps

Execute the following checks directly on the host:

```bash
# 1. API Liveness Probe (direct container port on loopback)
curl -fsS http://127.0.0.1:3001/health
# Expected: {"status":"ok","timestamp":"..."}

# 2. Deep Reliability Probes (memory, event-loop lag)
curl -fsS http://127.0.0.1:3001/health/probes
# Expected: {"status":"ok","probes":[...]}

# 3. Web Frontend Liveness Probe
curl -fsS http://127.0.0.1:3000/login -o /dev/null -w "%{http_code}\n"
# Expected: 200

# 4. Ingress Routing Verification via Traefik
curl -k -H "Host: staging.aevora.com" https://127.0.0.1/health
curl -k -H "Host: staging.aevora.com" https://127.0.0.1/api/bff/auth/session
```

### B. Rollback Boundaries

If any health check fails or migrations abort:
1. **Stop Application Containers**:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.staging.yml --env-file .env.staging stop api web traefik
   ```
2. **Examine Container Logs**:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.staging.yml logs --tail 100 api
   docker compose -f infrastructure/docker/docker-compose.staging.yml logs --tail 100 migration
   ```
3. **Database Rollback**:
   If migrations altered schemas inappropriately, restore from the pre-deployment backup:
   ```bash
   /opt/aevora/infrastructure/scripts/restore-db.sh /var/backups/aevora/pre_deploy_backup.dump aevora_postgres_staging
   ```

---

## 8. Backup Timer Activation & Verification

On the authorized Linux host, activate automated nightly backups using systemd:

```bash
# 1. Ensure backup directory exists with restricted permissions
sudo mkdir -p /var/backups/aevora
sudo chmod 700 /var/backups/aevora

# 2. Copy systemd service and timer files
sudo cp /opt/aevora/infrastructure/scripts/systemd/aevora-backup.service /etc/systemd/system/
sudo cp /opt/aevora/infrastructure/scripts/systemd/aevora-backup.timer /etc/systemd/system/

# 3. Configure environment defaults if targeting staging
sudo tee /etc/default/aevora-backup << 'EOF'
POSTGRES_CONTAINER=aevora_postgres_staging
BACKUP_DIR=/var/backups/aevora
BACKUP_FORMAT=custom
RETENTION_DAYS=14
CLEANUP_OLD_BACKUPS=true
EOF

# 4. Reload systemd daemon
sudo systemctl daemon-reload

# 5. Enable and start the backup timer
sudo systemctl enable --now aevora-backup.timer

# 6. Verify timer status and next trigger time
systemctl list-timers aevora-backup.timer

# 7. Execute a one-shot verification run
sudo systemctl start aevora-backup.service
journalctl -u aevora-backup.service -n 50 --no-pager
```

---

## 9. Restore Drill & Disaster Recovery

Restoration requires both the backup file and the explicit container target:

```bash
# Syntax: restore-db.sh <backup-archive-path> <target-container-name>
sudo /opt/aevora/infrastructure/scripts/restore-db.sh \
  /var/backups/aevora/db_backup_2026-10-13_12-00-00.dump \
  aevora_postgres_staging
```

### Safety Invariants & Built-In Guards
1. **Developer Database Protection**: `restore-db.sh` strictly refuses to restore into known local development databases (`aevora_postgres` or `hostel-postgres`), preventing accidental overwrite of developer data.
2. **Production Confirmation Guard**: If `<target-container-name>` contains `prod`, `restore-db.sh` requires `CONFIRM_PRODUCTION_RESTORE=true` in the environment to prevent unintentional execution against production databases:
   ```bash
   CONFIRM_PRODUCTION_RESTORE=true sudo /opt/aevora/infrastructure/scripts/restore-db.sh \
     /var/backups/aevora/db_backup_2026-10-13_02-00-00.dump aevora_postgres_prod
   ```
3. **Format Auto-Detection**: Magic bytes are verified (`PGDMP` for custom archive, `1f8b` for gzip, or SQL text).
4. **Post-Restoration Verification**:
   ```bash
   docker exec -i aevora_postgres_staging psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
     "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
   ```

---

## 10. Firewall & Network Security Perimeter

Configure the host firewall (UFW) to enforce strict isolation:

```bash
# 1. Allow standard SSH management port
sudo ufw allow 22/tcp

# 2. Allow public HTTP and HTTPS ingress through Traefik
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 3. Default deny incoming traffic
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 4. Enable UFW
sudo ufw enable
```

**Verification of Port Isolation**:
Verify with `netstat -tuln` or `ss -tuln`:
- `5434/tcp` must ONLY listen on `127.0.0.1` (never `0.0.0.0`).
- `6380/tcp` must ONLY listen on `127.0.0.1` (never `0.0.0.0`).
- `80/tcp` and `443/tcp` listen on `0.0.0.0` (Traefik ingress only).

---

## 11. Authoritative Reverse Proxy Architecture & Routing Matrix

Traefik v2.10 is the **sole and authoritative reverse proxy** for both staging and production environments. Nginx is not used in AEVORA; any previous references to `nginx.conf` are legacy design notes.

### Staging Traefik Routing Rules (`docker-compose.staging.yml`)

Traefik evaluates rules using explicit priorities on the shared domain:

| Priority | Router Name | Host / Path Rule | Upstream Service | Port | Purpose |
|---|---|---|---|---|---|
| **100** | `web-bff` | `Host(STAGING_DOMAIN) && PathPrefix("/api/bff")` | `web` (Next.js) | 3000 | Routes all BFF API calls directly to Next.js BFF handlers. |
| **50** | `api` | `Host(STAGING_DOMAIN) && (PathPrefix("/health") \|\| PathPrefix("/delivery/webhooks") \|\| PathPrefix("/world-state") \|\| PathPrefix("/socket.io"))` | `api` (NestJS) | 3001 | Routes health probes, webhooks, SSE streams, and WebSockets directly to backend. |
| **40** | `api-subdomain`| `Host(STAGING_API_DOMAIN)` | `api` (NestJS) | 3001 | Optional dedicated subdomain routing directly to NestJS API. |
| **10** | `web` | `Host(STAGING_DOMAIN)` | `web` (Next.js) | 3000 | Catch-all router for UI pages and static Next.js assets. |

### Security Headers & Protocols
- Global middleware `secHeaders` enforces HSTS (`max-age=86400` staging, `31536000` prod), X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy (`same-origin`), and XSS filter.
- WebSockets (`/socket.io`) and Server-Sent Events (`/world-state`) are natively supported by Traefik without special plugin configuration.

---

## 12. Separation Between Sandbox Integrations and Live External Providers

AEVORA strictly isolates sandbox simulation adapters from external live systems:

1. **Safe Mode Network Guard (`safe-mode.ts`)**:
   - When running in local or staging environments without live authorization, outbound network calls to external payment or marketing providers are intercepted and fail closed.
2. **Payment Gateway (`Razorpay`)**:
   - Staging operates with mock payment links and simulator webhooks (`WEBHOOK_SECRET_SIM`).
   - If `RAZORPAY_WEBHOOK_SECRET` is unset, incoming payment webhooks fail closed immediately (HTTP 400).
   - Live payment processing requires explicit Chairman authorization and dedicated live keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
3. **Outreach & Transactional Email (`Resend`)**:
   - By default, email delivery uses an in-memory/console mock adapter. No real customer emails are sent.
4. **Social Publishing Gateway**:
   - Marketing campaigns generate copy and attribution tracking links in `DRAFT` / `SIMULATED` status. Live social dispatch is disabled until production credentials are confirmed.

---

## 13. Multi-Replica Limitations & Scaling Conditions

Before scaling the NestJS API or Next.js Web containers horizontally (`--scale api=N`), the following prerequisites must be met:

1. **Singleton Migration Gate**:
   - Schema migrations (`aevora_migration_staging`) MUST execute as a single run-to-completion container (`restart: "no"`). Never run migrations concurrently across multiple instances.
2. **Distributed Idempotency & Session Storage**:
   - In-memory idempotency caches (`createIdempotencyCache`, `activateIdempotencyCache`) must be backed by Redis clusters. Multi-instance API nodes with in-memory caches cannot guarantee idempotency if requests hit different replicas.
3. **Sticky Sessions for WebSockets / SSE**:
   - If scaling `api` beyond 1 replica, Traefik must be configured with sticky cookies (`traefik.http.services.api.loadbalancer.sticky.cookie=true`) to ensure persistent WebSocket and SSE connections stay with the same backend node.
4. **Staging Recommendation**:
   - Maintain **1 API replica** and **1 Web replica** on staging to eliminate distributed state concurrency anomalies.

---

## 14. Incident Response & Emergency Recovery Boundaries

### A. Container Crash Loop
1. Check container health status: `docker compose ps`
2. View recent panic / exception logs: `docker compose logs --tail 200 api`
3. Restart failed container: `docker compose restart api`

### B. Disk Space Exhaustion on Backup Volume
1. Check disk utilization: `df -h /var/backups`
2. Manually trigger retention pruning (older than 14 days):
   ```bash
   find /var/backups/aevora -mindepth 1 -maxdepth 1 -type f -name "db_backup_*" -mtime +14 -delete
   ```
3. Verify disk recovery: `df -h /var/backups`

### C. Sovereign Chairman Emergency Stop
1. If rogue autonomous agent actions or data anomalies occur, invoke the Sovereign Emergency Stop:
   ```bash
   curl -X POST http://127.0.0.1:3001/governance/emergency-stop \
     -H "Authorization: Bearer <CHAIRMAN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"reason":"Operator emergency freeze triggered via runbook"}'
   ```
2. The emergency freeze halts all Offer activations, workforce assignments, and outbound actions immediately.

---

## 15. Unexecuted Actions Register

| Category | Item | Execution Status | Reason / Authorization Boundary |
| :--- | :--- | :--- | :--- |
| **DNS** | Public DNS A/AAAA Records | **NOT EXECUTED** | Requires user-provided target domain and host IP. |
| **Cloud** | VM / Server Provisioning | **NOT EXECUTED** | Requires explicit cloud provider and budget authorization. |
| **Certificates** | Let's Encrypt Public TLS | **NOT EXECUTED** | Requires public DNS resolution pointing to the live server. |
| **Firewall** | Live Host Port Opening | **NOT EXECUTED** | Requires target server access. |
| **Systemd** | Systemd Timer Activation | **NOT EXECUTED** | Must only be activated on Linux host, not developer workstation. |
| **Database** | Production/Staging Migration | **NOT EXECUTED** | Awaiting deployment window and server commissioning. |

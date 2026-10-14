# AEVORA Operations Runbook

## Protected developer services — never touch
`aevora_postgres` :5433, `hostel-postgres` :5432, `aevora_redis` :6379. Do not stop, migrate, seed or write to them.

## Disposable test stack
```bash
docker run -d --name aevora_e2e_pg -p 5444:5432 -e POSTGRES_PASSWORD=e2e_local_only -e POSTGRES_DB=aevora_e2e -v aevora_e2e_pgdata:/var/lib/postgresql/data postgres:16-alpine
docker run -d --name aevora_e2e_redis -p 127.0.0.1:6380:6379 redis:7-alpine
DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npm run db:seed
```
Teardown: `docker rm -f aevora_e2e_pg aevora_e2e_redis && docker volume rm aevora_e2e_pgdata`.

## Running the API safely
`main.ts` loads the root `.env` and lets it **override** the process environment. Use `AEVORA_ENV_OVERRIDE` for anything that must win.
`apps/api/scripts/e2e-local.env` points the API at the disposable stack and sets safe mode, SANDBOX outreach, and no SMTP/IMAP/hosted AI.
Launch config `aevora-api-e2e` (port 4011) runs the built API with it.

## Tests
- Unit/HTTP: `cd apps/api && npx jest`. `test-setup.ts` pins SANDBOX, empties SMTP/SendGrid and forces the local model.
- DB journeys: `E2E_DB=1 DATABASE_URL=postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e npx jest e2e.spec`. Specs refuse to run unless the URL is on :5444.
- Real-model eval: `AI_EVAL=1 AEVORA_MODEL_NORMAL=qwen2.5:7b npx jest reply-classification.eval`.

## Outreach safety layers (in order)
1. Draft needs approval from the Chairman or a CHAIRMAN/MANAGEMENT employee.
2. Suppression check.
3. Atomic claim to SENDING.
4. `OUTREACH_ENVIRONMENT` (default SANDBOX = log only).
5. PRODUCTION still redirects to `TEST_EMAIL_RECIPIENT` unless `ENABLE_REAL_PRODUCTION_SENDING=true`.
6. `AEVORA_SAFE_MODE` blocks non-local network.

**Warning:** the developer `.env` sets `OUTREACH_ENVIRONMENT=PRODUCTION` with a real `SMTP_HOST`. Any process that loads it without an override can send real (redirected) SMTP mail.

## AI
Ollama on :11434 with `qwen2.5:7b`. The gateway honors `OLLAMA_BASE_URL` (then `OLLAMA_URL`) and `OLLAMA_TIMEOUT_MS` (default 120 s). Health: `LocalProvider.checkHealth()` lists missing models per tier.

## Outbound controls (Gate 3)
- **Emergency stop:** set `AEVORA_EMERGENCY_STOP=true` and restart the API. All email, WhatsApp pushes and Vercel calls are refused; any malformed value also stops.
  - Per tenant/feature without a restart: a `KillSwitchConfig` row with `isDisabled=true` and feature `OUTBOUND_ALL`, `OUTBOUND_EMAIL`, `OUTBOUND_WHATSAPP` or `EXTERNAL_PUBLISH` (companyId null = all tenants).
- **Send limits:** `PILOT_MAX_SENDS_PER_RECIPIENT_PER_DAY` (1), `…_PER_TENANT_PER_DAY` (20), `…_GLOBAL_PER_DAY` (50).
- **Unsubscribe:** needs `UNSUBSCRIBE_SECRET` (≥ 32 chars) and `PUBLIC_API_URL`, or every send fails closed. Opt-outs are rows in `EmailSuppression`; never delete them.
- **Publishing:** `DEMO_PUBLISHING_ENABLED=false` by default.

## Re-running DB tests after a Docker outage
Do not restart Docker from automation. Once the operator has restored it: `cd apps/api && bash scripts/verify-disposable-db.sh`. The script stops unless `aevora_e2e_pg` is running on :5444 with database `aevora_e2e`.

## Test suite
Jest runs with `maxWorkers: 2` and `workerIdleMemoryLimit: 1GB`; higher parallelism exhausted worker heap and caused intermittent suite failures.

## Customer intake and operator queue (Gate 4A)
- **Intake:** public form at `/request` (web) → `POST /public/requests` (API). Set `PUBLIC_INTAKE_COMPANY_ID` to the receiving company; while it is unset or the company isn't ACTIVE, the form returns 503.
  - Submitting sends no email and publishes nothing; replies go out through the normal approval gate.
- **Operator queue:** `/company/:id/requests`. Allowed transitions:
  - NEW → UNDER_REVIEW or REJECTED
  - UNDER_REVIEW → QUALIFIED or REJECTED
  - QUALIFIED → CONVERTED or REJECTED
  - REJECTED → UNDER_REVIEW
  - CONVERTED is final.

  A 409 means someone else changed the request first; reload.
- **Jobs:** `/company/:id/jobs`. Pause (QUEUED), resume (PAUSED), replay (FAILED/CANCELLED; `TASK_EXECUTION` only, at most 3 times). Audit lives in `ManagementAuditEvent` (`JOB_PAUSE`/`JOB_RESUME`/`JOB_REPLAY`).
- **Verification script:** `scripts/verify-disposable-db.sh` now also proves `localhost:5444` is the `aevora_e2e_pg` cluster (matching `system_identifier`) and checks `aevora_e2e_redis` → 127.0.0.1:6380.

# AEVORA — Local Use Runbook (Windows, single owner)

Everything here runs on your own computer. Nothing is deployed, and no email, payment, social-publishing or WhatsApp action is enabled.
Run commands from `E:\Aevora` in PowerShell unless noted. Use **Git Bash** for `.sh` scripts: `& "C:\Program Files\Git\bin\bash.exe" <script>` (plain `bash` on this PC is a WSL stub with no Linux installed).

## Which database is "yours"

| Container | Port | Purpose | May I change it? |
|---|---|---|---|
| `aevora_postgres_fresh` | 127.0.0.1:5456, db `aevora` | **Your live local AEVORA data** | Only via the app, backups, and a confirmed restore |
| `aevora_e2e_pg` / `aevora_e2e_redis` | 5444 / 6380 | Disposable test stack | Yes, tests only |
| `aevora_postgres` | 5433 | Protected old dev DB | **Never** |
| `hostel-postgres` | 5432 | Another project | **Never** |
| `aevora_deploy_rehearsal_20261014`, `aevora_migration_rehearsal_v25` | 5455, 5457 | Rehearsal copies | Leave alone |

`DATABASE_URL` lives in the root `.env` (git-ignored). Never paste it or any secret into chat, docs or commits.

## Start

```powershell
docker start aevora_postgres_fresh            # only if it is not already running (docker ps)
npm run build -w @aevora/api                  # after pulling code changes
cd apps\api;  node dist/main.js               # API  -> http://127.0.0.1:13000   (leave this window open)
cd apps\web;  npm run dev                     # Web  -> http://localhost:3000  (second window)
```

Both bind to `127.0.0.1` only, so other devices on your network cannot reach them. (`API_HOST` overrides the API bind address.)
**Open the app as `http://localhost:3000`, not `http://127.0.0.1:3000`** — the login form's same-origin check only accepts `localhost` and returns 403 for the `127.0.0.1` address.

## Check health

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:13000/health | Select-Object -Expand Content   # {"status":"ok",...}
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/login).StatusCode                        # 200
docker ps --format "{{.Names}}  {{.Status}}  {{.Ports}}"
```

Pages: `/login`, `/request` (public form), then after login `/company/<companyId>/requests`, `/sales`, `/offers`, `/jobs`, `/projects`, `/tasks`.

## Stop

Press `Ctrl+C` in the API and web windows. Leave the Docker containers running (stopping `aevora_postgres_fresh` is safe but not needed).

## Back up your data (read-only on the database)

```powershell
$env:POSTGRES_USER='aevora'; $env:POSTGRES_DB='aevora'
$env:BACKUP_DIR='/e/Aevora_local_backups'     # outside the repo; Git Bash path for E:\Aevora_local_backups
$env:CLEANUP_OLD_BACKUPS='false'              # never auto-delete older backups
& "C:\Program Files\Git\bin\bash.exe" infrastructure/scripts/backup-db.sh aevora_postgres_fresh
```

Creates `E:\Aevora_local_backups\db_backup_<timestamp>.dump` and checks it is readable. Copy it to another drive or cloud storage occasionally — a backup on the same disk does not survive a disk failure.

## Test a restore safely (does not touch your data)

Restore into a throwaway database inside the disposable cluster, compare, then drop it:

```powershell
docker exec aevora_e2e_pg psql -U postgres -d postgres -c "CREATE DATABASE aevora_restore_verify"
$env:POSTGRES_USER='postgres'; $env:POSTGRES_DB='aevora_restore_verify'
& "C:\Program Files\Git\bin\bash.exe" infrastructure/scripts/restore-db.sh /e/Aevora_local_backups/<file>.dump aevora_e2e_pg
# compare table/row counts, then:
docker exec aevora_e2e_pg psql -U postgres -d postgres -c "DROP DATABASE aevora_restore_verify"
```

## Restore into your real local database (disaster recovery only)

This **overwrites** current data. Take a fresh backup first. The script refuses unless you confirm:

```powershell
$env:POSTGRES_USER='aevora'; $env:POSTGRES_DB='aevora'; $env:CONFIRM_LOCAL_RESTORE='true'
& "C:\Program Files\Git\bin\bash.exe" infrastructure/scripts/restore-db.sh /e/Aevora_local_backups/<file>.dump aevora_postgres_fresh
```

## Tests

```powershell
cd apps\api;  npx jest                                                         # unit + HTTP specs (DB specs self-skip)
cd apps\api;  & "C:\Program Files\Git\bin\bash.exe" scripts/verify-disposable-db.sh   # DB journeys, disposable :5444 only (~2 min)
cd apps\web;  npm run typecheck; npx vitest run
cd apps\api;  npx eslint src --quiet
```

`verify-disposable-db.sh` proves the target is `aevora_e2e_pg` before it does anything and cannot reach 5433/5456. It now also runs the 15-scenario customer simulation (`apps/api/src/inquiry/customer-simulation.e2e.spec.ts`, 54 tests across 11 suites in total).

Live synthetic leads (already submitted 2026-10-14; safe to re-run, duplicates are ignored): `node apps\api\scripts\customer-simulation-live.js <out.json>` posts the 15 `AEVORA-LOCAL-TEST-20261014` scenarios through `localhost:3000`. The public form allows 5 submissions a minute per client, so it takes about 4 minutes. See `docs/audits/AEVORA_CUSTOMER_SIMULATION_REPORT_2026-10-14.md`.

## Do NOT run against your real database

`npm run db:seed`, `npm run db:migrate`, `prisma migrate dev`, `db push`, `set-chairman-password` — these change data or schema. Use them only after confirming `DATABASE_URL` points where you intend.

## Safety switches (root `.env`, current values)

`OUTREACH_ENVIRONMENT=SANDBOX`, `ENABLE_REAL_PRODUCTION_SENDING=false`, `DEMO_PUBLISHING_ENABLED=false`, `LEAD_GEN_PROVIDER_ENABLED=false`, `INBOX_ENABLED=false`, `CHAIRMAN_EMAIL_NOTIFICATIONS=false`, `AEVORA_SAFE_MODE=true`.
Instant stop of all outbound actions: set `AEVORA_EMERGENCY_STOP=true` in `.env` and restart the API.

## Turning an integration on later (your decision, not required for local use)

- **Email**: needs `SMTP_*` (or `SENDGRID_API_KEY`), `UNSUBSCRIBE_SECRET` (≥32 chars), `PUBLIC_API_URL`, SPF/DKIM/DMARC on your domain, then `OUTREACH_ENVIRONMENT=PRODUCTION` **and** `ENABLE_REAL_PRODUCTION_SENDING=true`. Do this only after rotating the old credentials.
- **Payments (Razorpay)**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Unset = bank-transfer instructions and webhooks fail closed.
- **Lead discovery**: `LEAD_GEN_PROVIDER_ENABLED=true` plus a new `GOOGLE_PLACES_API_KEY`.

## Credentials you must revoke yourself

An older Gmail app password (in git history) and a Google Places API key (in the legacy, git-ignored `apps/api/.env`) were exposed. Revoke both in Google Account security and Google Cloud Console. They are not used by the running app, but they are still valid until revoked. Do not reuse them.

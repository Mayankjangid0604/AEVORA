# AEVORA V25 — Step 1 Baseline Audit

Date: 2026-10-14 · Mode: read-only · Auditor: Claude Code

## 1. Workspace & repository identity — PASS
- `E:\Aevora` exists; it is the git root. Branch `master`, HEAD `19123e4` ("chore: remove example environment configuration files"). The default/PR branch is `main`.
- Other copy: `E:\Aevora_backup_v22_20261012_132800`. It is **not** a git repo and looks like a V22 snapshot. It was not compared in depth and is **not** authoritative.
- npm workspaces + Turbo. `packageManager: npm@9.5.1`, but the installed versions are Node v24.12.0 and npm 11.6.2 (mismatch). Lockfile: `package-lock.json`.

## 2. Git & working tree — PASS
- `git status --short`: clean (0 entries). Stash: empty. No untracked files.
- `apps/api/.env` is git-ignored and not tracked.
- Build artifacts on disk (ignored): `.turbo`, `apps/web/.next` (including standalone), `apps/api/dist`, and `apps/api/lint-results.json`.

## 3. Application & package structure
| Package | Role | Scripts |
|---|---|---|
| `apps/api` (`@aevora/api`) | NestJS API, `src/main.ts`, port `PORT`→`PORT_API`→3001 | build, dev, start, lint, test (jest) |
| `apps/web` (`@aevora/web`) | Next.js, port 3000 | dev, build, lint, typecheck, test (vitest), test:e2e (vitest live + playwright) |
| `packages/database` | Prisma schema `packages/database/prisma/schema.prisma` (postgresql, `env("DATABASE_URL")`), migrations in `prisma/migrations` (latest `20261013200000_gate4a_intake_job_pause`) | build, generate, migrate:dev, seed |
| `packages/model-gateway` | AI/model gateway | build, test |
| `packages/shared` | shared lib | build, test |

- Health: `GET /health` (`apps/api/src/health.controller.ts`), `management/health/latest|history`, and `enterprise-intelligence/.../health`.
- Auth: `authorization/jwt-auth.guard.ts`, `roles.guard.ts`, `integration-api-key.guard.ts`, registered globally in `app.module.ts`. The specs cover tenant isolation (`tenant-isolation.http.spec.ts`), credential redaction, CEO-execute isolation and rate limits.
- Outbound policy: `apps/api/src/common/outbound-policy.ts` (emergency stop, demo publishing, HMAC unsubscribe tokens). Env validation: `apps/api/src/config/validate-env.ts`.
- Infra: `infrastructure/docker/docker-compose{,.staging,.prod}.yml`, `infrastructure/scripts` (preflight, backup/restore, cron, systemd), `.github/workflows/ci.yml`, and `n8n/`.

## 4. Configuration inventory (values redacted)
Env files: `apps/api/.env` (the only real env file) and `apps/web/.env.example` (`AEVORA_API_URL`). There is no root `.env`. The root example env files were deleted in HEAD.

`apps/api/.env`: 83 variables. Status:
- **EMPTY:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `IMAP_USER`, `IMAP_PASS`
- **PLACEHOLDER-like:** `BANK_TRANSFER_INSTRUCTIONS`
- **SET:** all others, including `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (~42 chars), `SMTP_*`, `GOOGLE_PLACES_API_KEY`, `OLLAMA_*`, `PUBLIC_API_URL`, `COMPANY_NAME/PHONE/ADDRESS/EMAIL`, `WEBHOOK_SECRET_PROD/SIM`

Endpoint metadata (host/port only):
| Var | Target | Note |
|---|---|---|
| `DATABASE_URL` | localhost:**5432**, db `aevoradb` | ⚠ Port 5432 belongs to `hostel-postgres` (currently exited). The AEVORA dev DB is on **5433**. |
| `REDIS_URL` | localhost:6379 | matches `aevora_redis` |
| `OLLAMA_BASE_URL` / `OLLAMA_URL` | localhost:11434 | Ollama is running (v0.35.0) |
| `PUBLIC_API_URL` | localhost:13000 | ⚠ Nothing listens on 13000, and the API defaults to `PORT_API`. |

Safety switches: `ENABLE_REAL_PRODUCTION_SENDING=false`, `OUTREACH_ENVIRONMENT=PRODUCTION` (⚠ combined with SMTP being set), `LEAD_GEN_PROVIDER_ENABLED=true` (calls Google Places when the API runs), `INBOX_ENABLED=false`, `CHAIRMAN_EMAIL_NOTIFICATIONS=true`, `SALES_AUTO_PROCESS=false`, `NODE_ENV=development`. `DEMO_PUBLISHING_ENABLED` and `AEVORA_EMERGENCY_STOP` are unset, which means publishing is off and the system is running.

## 5. Required / missing variables (referenced in code, absent from `.env`)
| Variable | Consequence |
|---|---|
| `PUBLIC_INTAKE_COMPANY_ID` | Public intake `/request` fails closed (503) |
| `UNSUBSCRIBE_SECRET` | All outbound email is blocked (needs ≥32 chars). Startup is rejected if real sending is enabled. |
| `DEMO_PUBLISHING_ENABLED` | External (Vercel) publishing is disabled (safe default) |
| `INTEGRATION_API_KEY` | n8n / service-to-service auth disabled |
| `ALLOWED_ORIGINS` | Only the default CORS origins apply |
| `AEVORA_EMERGENCY_STOP` | Unset = running |
| Others (optional): `SENDGRID_API_KEY`, `FROM_EMAIL`, `ELEVENLABS_*`/`EL_VOICE_*`, `TTS_*`/`STT_*`, `VERCEL_*`, `WORDPRESS_*`, `ATTRIBUTION_HASH_SALT`, `TRUST_PROXY`, `PORTAL_URL`, `PILOT_MAX_SENDS_PER_TENANT_PER_DAY`, `OUTREACH_RATE_LIMIT_MINUTES`, `V12_*`, `OLLAMA_*_MODEL` | Features are disabled or use defaults |

Logging/telemetry: V18 telemetry and health-probe migrations exist, and Prometheus is in the prod compose file. Backup: `infrastructure/scripts/backup-db.sh` and `restore-db.sh` plus a runbook. None of these were exercised.

## 6. Local service inventory
| Container | Image | Status | Host port |
|---|---|---|---|
| `aevora_postgres` | postgres:15-alpine | Up 12h (healthy) | 0.0.0.0:5433 |
| `aevora_redis` | redis:7-alpine | Up 12h | 0.0.0.0:6379 |
| `hostel-postgres` | postgres:16-alpine | **Exited (255)** | 5432 (not listening) |
| `aevora_e2e_pg` | postgres:16-alpine | Up 12h | 0.0.0.0:5444 |
| `aevora_e2e_redis` | redis:7-alpine | Up 12h | 127.0.0.1:6380 |

- Ollama: PID 6192 on 127.0.0.1:11434, responding.
- No AEVORA API or web process is listening on 3000, 3001 or 13000.
- Port notes:
  - The compose file binds `127.0.0.1:5433`/`6379`, but the running containers are on `0.0.0.0`. They were likely created from a different or older compose file and are exposed on all interfaces.
  - The E2E pg image (16) differs from the dev image (15).
  - The E2E containers are defined only in `docker-compose.staging.yml`, or were created ad hoc.

## 7. Protected-service safety — PASS
`aevora_postgres`, `hostel-postgres` and `aevora_redis` were only listed (`docker ps -a`). They were not connected to, started, stopped or modified.

## 8. DB / Redis identity & health
| Check | Status |
|---|---|
| `aevora_postgres` healthy (Docker healthcheck) | PASS (per Docker status; not independently queried) |
| `aevora_redis` reachable | NOT VERIFIED (no connection made by design) |
| E2E pg/redis identity is disposable | NOT VERIFIED (inferred from name/port and `test-setup.ts` only) |
| API `.env` points at the AEVORA dev DB | **FAIL**: it points at port 5432 (hostel-postgres) |
| Schema migration state on any DB | NOT VERIFIED |

## 9. Test/build commands & safety
| Command | Safety |
|---|---|
| `npm run test:preflight` (node --test) | Likely safe; not run |
| `npm test -w @aevora/api` (jest) | `test-setup.ts` defaults `DATABASE_URL` to the disposable `localhost:5444/aevora_e2e`, **but only when `DATABASE_URL` is unset** (`||`). If `.env` gets loaded, tests could target 5432. Must confirm before running. |
| `npm test -w @aevora/web` (vitest) | Unknown; not run |
| `npm run typecheck -w @aevora/web` | Safe (no emit); not run |
| `npm run build` / `turbo` | Writes `dist`/`.next`/`.turbo`; not run |
| `test:e2e`, `db:migrate`, `db:seed`, `db:local:setup`, `set-chairman-password` | Mutating; **do not run** without an explicit target |
| `scripts/verify-disposable-db.sh` (cited in the V25 report) | **Missing** from the repo |

## 10. Previously reported vs newly verified
- Previously reported (`docs/AEVORA_V25_FINAL_READINESS_REPORT.md`):
  - 40 disposable-DB E2E tests PASS and 117 targeted safety specs PASS.
  - Inbound pilot rated "CONDITIONAL GO" pending `PUBLIC_INTAKE_COMPANY_ID`.
  - None of this was reproduced in this audit.
- Newly verified in this audit: git state, file inventory, env names and status, Docker container list, listening ports, Ollama version endpoint. **No tests or builds were executed.**

## 11. Critical risks & blockers
1. **`DATABASE_URL` targets port 5432 (`hostel-postgres`, another project's DB), not `aevora_postgres` on 5433.** The API currently cannot start against its DB. If hostel-postgres comes back up, AEVORA would hit the wrong database (potential migrations or writes into it).
2. `UNSUBSCRIBE_SECRET` is missing, so all outbound email is blocked. `PUBLIC_INTAKE_COMPANY_ID` is missing, so public intake returns 503.
3. The test DB fallback relies on `DATABASE_URL` being unset. There is a risk that tests run against a non-disposable DB.
4. `OUTREACH_ENVIRONMENT=PRODUCTION` with SMTP credentials set. Only `ENABLE_REAL_PRODUCTION_SENDING=false` and the missing unsubscribe secret stop real sends. `LEAD_GEN_PROVIDER_ENABLED=true` would make external Google Places calls on API start.
5. Protected DB/Redis containers are bound on `0.0.0.0` rather than `127.0.0.1`.
6. The verification script cited by the V25 report is missing, so prior E2E evidence is not reproducible from the repo.
7. `DATABASE_URL` contains a weak/default-looking DB password (value not reproduced here).
8. Version drift: npm 11 vs the declared npm@9.5.1; E2E pg16 vs dev pg15.

## 12. Status summary
| Check | Status |
|---|---|
| Workspace identified | PASS |
| Working tree clean | PASS |
| Config inventory | PASS |
| Required env complete | FAIL |
| DB config correct | FAIL |
| Protected services untouched | PASS |
| Service health | PARTIAL (Docker status only); NOT VERIFIED for connectivity |
| Tests/build | NOT VERIFIED |
| Prior V25 results reproducible | NOT VERIFIED (script missing) |

## 13. Recommended next step
Before any implementation, do a controlled configuration fix:
1. Point `DATABASE_URL` to 5433, after confirming the `aevoradb` identity read-only.
2. Add `UNSUBSCRIBE_SECRET` (≥32 chars) and `PUBLIC_INTAKE_COMPANY_ID`.
3. Make the test setup force the 5444/6380 targets rather than fall back to them.
4. Restore or recreate the disposable-DB verification script.
5. Only then run the test suites, against the E2E containers only.

The DB pointer fix comes first because every later validation depends on the API and its tests targeting the right database.

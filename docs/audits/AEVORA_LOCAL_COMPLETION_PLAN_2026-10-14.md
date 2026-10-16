# AEVORA Local Completion — Work Plan (2026-10-14)

Branch: `local-completion/v25-local-use` (from `release/v25.0.0` @ `1ea0d82`). Uncommitted until the owner approves.
Scope: reliable use on the owner's own computer. Out of scope: hosting, DNS, TLS, cloud monitoring, live integrations.

## Baseline (evidence-based, before any change)

| Area | State | Evidence |
|---|---|---|
| Git | clean at `1ea0d82` on `release/v25.0.0` | `git status --short` empty |
| Local DB | `aevora` on `127.0.0.1:5456` (container `aevora_postgres_fresh`), 71 migrations, none unfinished/rolled back | read-only query |
| V25 catch-up migration | **applied**; stored checksum equals SHA-256 of the committed file | read-only checksum compare |
| API / web | running, `/health` ok, web `/` 200 | HTTP probe |
| Safety switches (root `.env`) | SANDBOX, real sending off, lead-gen off, inbox off, safe mode on, publishing off | key/value check (secrets redacted) |
| Legacy `apps/api/.env` | holds old credentials but is **not loaded** by the API or Prisma | empirical probe (booleans only) |

## Remaining gaps and acceptance criteria

| # | Gap | Acceptance criteria | Status |
|---|---|---|---|
| 1 | `QUALIFIED → CONVERTED` only flipped a status; no client or opportunity was created (V25 report §7.1; `docs/BUSINESS_OPERATIONS.md` says inquiry → opportunity) | Conversion atomically creates/reuses one Client and one linked Opportunity; rolled back on any failure; tenant-scoped; audited once; unit + disposable-DB tests | see report |
| 2 | `restore-db.sh` did not guard `aevora_postgres_fresh` (the live local DB) | Restore needs explicit `CONFIRM_LOCAL_RESTORE=true`; guard fires before any Docker call | see report |
| 3 | API and Next dev server listened on all interfaces | Dev API binds loopback when `NODE_ENV=development`; containers unchanged; dev web bound to 127.0.0.1 | see report |
| 4 | No practical local backup/restore evidence for the real local DB | Backup of the live DB (read-only), restored into a scratch DB in the disposable cluster, counts match, scratch DB dropped | see report |
| 5 | No single local start/stop/health/backup runbook | `docs/LOCAL_USE_RUNBOOK.md` with verified commands | see report |
| 6 | Running API used ~3.4 CPU cores, 2.8 GB RAM and wrote ~96k spatial events: the spatial subscriber re-reconciled on the reconciler's own PERSON events (feedback loop) | Reconciler events tagged; subscriber ignores them; regression test; live API idle after restart | see report |

## Explicitly not done (needs the owner)

- Authenticated browser journey in the *live* app needs the Chairman password, which only the owner holds. Not reset or bypassed.
- Provider-side revocation of previously exposed Gmail / Google Places credentials.
- Payments, email, social publishing, WhatsApp: remain disabled and untested by design.

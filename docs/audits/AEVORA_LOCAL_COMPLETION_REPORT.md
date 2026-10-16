# AEVORA — Local Completion Report (2026-10-14)

Scope: reliable use on the owner's own computer. No public deployment, hosting, DNS/TLS, or live integrations.

**Status: READY WITH LIMITATIONS**

## Git

- Branch: `local-completion/v25-local-use` (created from `release/v25.0.0`, which is untouched).
- Starting commit: `1ea0d82`. Ending commit: `1ea0d82` (nothing committed; awaiting owner approval).
- Final `git status --short`: 9 modified/new tracked-path changes listed under "Fixed", plus untracked `docs/LOCAL_USE_RUNBOOK.md`, `docs/audits/AEVORA_LOCAL_COMPLETION_PLAN_2026-10-14.md`, `docs/audits/AEVORA_LOCAL_COMPLETION_REPORT.md`, `apps/api/src/spatial/spatial-reconcile-loop.spec.ts`.
- `apps/web/next-env.d.ts` also shows as modified: `next dev` regenerates it automatically (`.next/dev/types` paths). It is not a code change; do not commit it (`git checkout -- apps/web/next-env.d.ts` while the dev server is stopped). A diff scan found no credentials, and `git diff --check` reported no whitespace errors.

## Already complete before this run (pre-existing evidence, not re-run as a baseline)

- V25 release branch with three commits (`62bd549`, `0be4d8c`, `1ea0d82`), baseline audit, schema catch-up migration.
- Local DB (`aevora` on `aevora_postgres_fresh`, 127.0.0.1:5456): 71 migrations, none unfinished/rolled back. Read-only check this run: the V25 catch-up migration `20261014120000_v25_schema_catchup` **is already applied** and its stored checksum equals the SHA-256 of the committed file. No migration was run.
- Root `.env` safety switches (values checked, secrets not read out): sandbox outreach, real sending off, publishing off, lead-gen off, inbox off, safe mode on.

## Fixed (all uncommitted)

| # | Defect | Files |
|---|---|---|
| 1 | **Runaway CPU/DB loop.** The live API used ~3.4 CPU cores and 2.8 GB RAM and wrote ~96,000 spatial events: the spatial subscriber re-ran whole-company reconciliation on the reconciler's own PERSON events. Events are now tagged and ignored by the subscriber. | `apps/api/src/spatial/hq-capacity.service.ts`, `apps/api/src/spatial/spatial.service.ts`, new `apps/api/src/spatial/spatial-reconcile-loop.spec.ts` |
| 2 | Inquiry `CONVERTED` only flipped a status. It now atomically finds/creates the Client (+contact) and one linked Opportunity (idempotent, tenant-scoped, audited once). | `apps/api/src/inquiry/inquiry.service.ts`, `gate4a.spec.ts`, `intake.e2e.spec.ts` |
| 3 | Button label matches behaviour ("Convert to client + opportunity"). | `apps/web/src/components/request-queue-views.tsx` |
| 4 | `restore-db.sh` did not guard the live local DB; now needs `CONFIRM_LOCAL_RESTORE=true`. | `infrastructure/scripts/restore-db.sh` |
| 5 | Dev API and Next dev server listened on all interfaces; now `127.0.0.1` (API: `API_HOST` overrides; non-development containers unchanged). | `apps/api/src/main.ts`, `apps/web/package.json` |
| 6 | No local runbook. | `docs/LOCAL_USE_RUNBOOK.md` |

## Tested this run (all commands completed with exit 0)

| Command (from) | Result |
|---|---|
| `npx tsc --noEmit` (apps/api) | 0 errors |
| `npx eslint src --quiet` (apps/api) | clean (run twice, incl. after final change) |
| `npm run build` (apps/api) | success |
| `npm run typecheck` (apps/web) | 0 errors |
| `npx vitest run` (apps/web) | 439 passed, 7 skipped (live-server specs), 0 failed |
| `npx jest` (apps/api, DB pinned to disposable :5444; run before fix #1) | 98 suites passed, 5 skipped; 1259 tests passed, 23 skipped |
| `npx jest spatial-reconcile-loop v12-spatial.service hq-capacity.service` (after fix #1) | 3 suites, 27 tests passed |
| `scripts/verify-disposable-db.sh` (apps/api, after all changes) | 10 suites, 40 tests passed, includes tenant isolation, auth, intake→conversion journey |
| `npx jest --runInBand workforce-provisioning v15-f-final-integration` (after fix #1, disposable DB) | 2 suites, 40 tests passed |

The 5 skipped suites / 23 skipped tests are existing conditional skips; none were added or weakened by me.

## Live-app verification (read-only, no data written)

- API rebuilt and restarted with the fix: `/health` 200; listening on `127.0.0.1:13000` only; CPU use ~0.06 s over 20 s idle (was ~3.4 cores) and no event flood in the log.
- Web (`npm run dev`, 127.0.0.1:3000): `/login` 200, `/request` 200; bad login through the web returns **401** (web → API path works); API protected route without token returns **401**; API invalid login returns **401**.
- Open the app as **`http://localhost:3000`**: the login's same-origin check returns 403 for `http://127.0.0.1:3000` (pre-existing behaviour, documented in the runbook).

## Backup and restore (real data, live DB read-only)

- `backup-db.sh` on `aevora_postgres_fresh` → `E:\Aevora_local_backups\db_backup_2026-10-14_14-24-40.dump` (6,986,228 bytes, catalog check passed). Auto-cleanup disabled; no existing backup overwritten.
- Restored into scratch DB `aevora_restore_verify` in the disposable `aevora_e2e_pg`: source vs restored identical (380 tables, 71 migrations, catch-up applied, 1 company, 4 employees, 1 inquiry, 1 chairman). Scratch DB dropped afterwards. Protected DBs (5433, 5432, 5455/5457) were not touched.

## Not verified / limitations

- **Authenticated journey in the live app** (login as Chairman, create/convert records in the browser) was not run: it needs the owner's password, which was not reset or bypassed. Authenticated, role and tenant-isolation behaviour is covered by the disposable-DB HTTP/E2E specs above, not by a live click-through.
- The runaway loop is fixed in code and confirmed idle in the live API. The ~96,000 extra spatial event rows already written to the live DB were not deleted (no destructive cleanup); they are harmless but occupy space.
- "Generate Proposal" button: not implemented (product decision needed). Conversion now yields an Opportunity that the existing sales stages can use.
- Marketing/outreach trigger UIs and single-replica workers are intentionally outside local scope (per V25 report).
- Email, payments (Razorpay), social publishing, WhatsApp, lead discovery: disabled by design and **not tested**.
- Worker/job execution was verified only through the passing job specs (`job-security`, job bridge) in the jest run, not as a separate live job.

## Manual steps for the owner

1. Revoke the exposed Gmail app password and Google Places API key (provider consoles). They are not loaded by the app but remain valid until revoked.
2. Review and, if happy, commit the changes on `local-completion/v25-local-use` (not done automatically).
3. Optionally copy `E:\Aevora_local_backups\*.dump` to another drive.
4. To enable any integration later, see `docs/LOCAL_USE_RUNBOOK.md` (variable names only).

## Commands

```powershell
# Start (from E:\Aevora)
docker start aevora_postgres_fresh                 # if not running
npm run build -w @aevora/api
cd apps\api; node dist/main.js                     # http://127.0.0.1:13000
cd apps\web; npm run dev                           # open http://localhost:3000
# Health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:13000/health
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/login).StatusCode
# Stop: Ctrl+C in each window
# Tests
cd apps\api; npx jest; npx eslint src --quiet
cd apps\api; & "C:\Program Files\Git\bin\bash.exe" scripts/verify-disposable-db.sh
cd apps\web; npm run typecheck; npx vitest run
```

Backup and restore commands are in `docs/LOCAL_USE_RUNBOOK.md`.

## Conclusion

**READY WITH LIMITATIONS** — the build, typecheck, lint and all unit/DB-backed suites pass; the local database and V25 migration are verified consistent; backup/restore is proven on real data; a serious runaway-CPU defect was found and fixed. The remaining limits are the unverified authenticated live click-through (needs owner password), untested external integrations, and credential revocation. This is not a production-readiness claim.

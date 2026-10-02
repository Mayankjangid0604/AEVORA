# AEVORA

**AEVORA** is a persistent autonomous AI-company platform. A Chairman (human owner) funds a company with real capital; AI executives and employees then run it — finding leads, doing outreach, delivering client projects and taking payments — under the Chairman's control.

- **Economy:** internal currency AC (1,000 AC = ₹1). Real money is tracked in integer paise and kept separate from AC.
- **Survival:** below `MIN_BALANCE_PAISE` a funded company shuts its agents down until the Chairman deposits more. A company that was never funded stays at WARNING.
- **Model-agnostic:** `packages/model-gateway` routes work to a local Ollama model or to hosted models by tier.
- **Safety defaults:** outreach runs with `OUTREACH_ENVIRONMENT=SANDBOX` (no real emails) until you change it.

## Stack
- **Web:** Next.js (`apps/web`) — Chairman dashboard, 3D office (iframe in `public/office`), Pixi world.
- **API:** NestJS (`apps/api`) — REST + Socket.IO, background workers (business loop, sales, CEO review, lead gen).
- **Desktop:** Tauri shell (`apps/desktop`). **Mobile:** Expo app (`apps/mobile`, not an npm workspace).
- **Database:** PostgreSQL via Prisma (`packages/database`).
- **Local AI:** Ollama (`OLLAMA_URL`, default `http://localhost:11434`).

## Structure
```text
aevora/
├── apps/
│   ├── web/              # Next.js dashboard (port 3001)
│   ├── api/              # NestJS API + workers (port 13000)
│   ├── desktop/          # Tauri desktop shell
│   └── mobile/           # Expo Android app (pairing, notifications)
├── packages/
│   ├── database/         # Prisma schema + migrations
│   ├── model-gateway/    # AI model abstraction (tiers, Ollama, hosted)
│   ├── shared/           # Shared types + currency helpers (paise/AC)
│   └── client-shared/    # Shared client code (web/desktop/mobile)
├── infrastructure/docker # docker-compose (local Postgres 5432 + Redis 6379)
├── scripts/              # One-off admin scripts (see below)
└── docs/
```

## Setup
1. `npm install` (root).
2. Copy `.env.example` to `.env` and fill in at least `DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET_PROD`, `WEBHOOK_SECRET_SIM`. The API refuses to start without these and prints a warning for missing optional ones (SMTP, Razorpay, …).
3. Local database (recommended): start Docker, copy the DB lines from `.env.local.example` into `.env` (`DATABASE_URL=postgresql://aevora:secret@localhost:5432/aevoradb?schema=public`), then `npm run db:local:setup`. It starts the docker Postgres, migrates it, and seeds demo data only if the DB has no Chairman yet. It refuses non-local databases.
4. Apply migrations: `npm run db:migrate`. It prints the DB host and refuses anything that isn't localhost/127.0.0.1/postgres unless `ALLOW_REMOTE_MIGRATE=true` is set.
5. Start everything: `start.bat` (Windows) or `npm run dev`. `start.bat` never migrates; it runs `prisma migrate status` and warns if migrations are pending.

| Service | URL |
|---------|-----|
| API     | http://localhost:13000 (`PORT_API`, health at `/health`) |
| Web     | http://localhost:3001 |

## Login
Web, desktop and mobile sign in with `POST /auth/login` (Chairman email + password). Set or reset the Chairman password (same PBKDF2-SHA512 hashing as the API):

```bash
ADMIN_EMAIL=you@example.com node scripts/set-chairman-password.js
```

The script prompts for the password (or reads `ADMIN_PASSWORD`). First-time setup with no Chairman yet: `scripts/create-admin.js` (same env vars).

## Checks
```bash
cd apps/api && npx tsc --noEmit -p . && npm test
cd apps/web && npx tsc --noEmit && npx next build
```

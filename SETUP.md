# AEVORA — Local Setup Guide

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| Docker Desktop | latest | `docker --version` |
| Ollama | latest | `ollama --version` |
| Git | any | `git --version` |

## 1. Clone & Install

```bash
git clone <your-repo-url> aevora
cd aevora
npm install
```

## 2. Environment Setup

Copy the example env and fill in your values:

```bash
cp .env.example .env
```

### Required variables (edit in `.env`)

| Variable | What to put | Notes |
|----------|-------------|-------|
| `DATABASE_URL` | `postgresql://aevora:secret@localhost:5432/aevoradb?schema=public` | Default works with Docker |
| `REDIS_URL` | `redis://localhost:6379` | Default works with Docker |
| `JWT_SECRET` | Any random 32+ char string | `openssl rand -hex 32` |
| `WEBHOOK_SECRET_PROD` | Any random string | `openssl rand -hex 32` |
| `WEBHOOK_SECRET_SIM` | Any random string | `openssl rand -hex 32` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Must have Ollama running |
| `OLLAMA_DEFAULT_MODEL` | `qwen3:14b` | Chairman, Assistant, general AI |
| `OLLAMA_COMPLEX_MODEL` | `qwen3:14b` | CEO decisions |
| `OLLAMA_CODE_MODEL` | `qwen3-coder:30b` | CTO, engineering, code generation |
| `OLLAMA_VISION_MODEL` | `gemma3:12b` | Vision and research |
| `OLLAMA_FAST_MODEL` | `gemma3:4b` | Fast background tasks |

### Optional variables (features disabled without them)

| Variable | Feature it enables |
|----------|-------------------|
| `GOOGLE_PLACES_API_KEY` + `LEAD_GEN_PROVIDER_ENABLED=true` | Real Google Places lead search (mock leads without it) |
| `SMTP_HOST/USER/PASS` | Email sending (sandbox mode without it) |
| `GEMINI_API_KEY` | Gemini for important escalation tasks |
| `ANTHROPIC_API_KEY` | Claude model tiers (local Ollama only without it) |
| `RAZORPAY_KEY_ID/SECRET` | Payment links |
| `WHATSAPP_API_TOKEN` | WhatsApp Business messages |
| `VERCEL_API_TOKEN` | Demo site deploys |

### Safe mode (recommended for first run)

To run with all external services disabled (no emails, no API calls, no lead gen):

```bash
# Add to .env or set before starting:
AEVORA_ENV_OVERRIDE=../../scripts/safe-local.env
```

## 3. Start Infrastructure (Docker)

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 15** on port 5432
- **Redis 7** on port 6379

Verify they're running:

```bash
docker ps
```

## 4. Pull Ollama Models

```bash
ollama pull qwen3:14b
ollama pull qwen3-coder:30b
ollama pull gemma3:12b
ollama pull gemma3:4b
```

| Model | Size | Role |
|-------|------|------|
| `qwen3:14b` | ~9 GB | Chairman, Assistant, CEO, general AI |
| `qwen3-coder:30b` | ~18 GB | CTO, engineering, code generation |
| `gemma3:12b` | ~8 GB | Vision, research analysis |
| `gemma3:4b` | ~2.5 GB | Fast background tasks, classification |

Verify Ollama is serving:

```bash
ollama list
```

## 5. Database Migration

```bash
npm run db:migrate
```

This runs `prisma migrate deploy` against your local database. It refuses to run against remote databases unless `ALLOW_REMOTE_MIGRATE=true`.

### Alternative: Full local setup (Docker + migrate + seed)

```bash
npm run db:local:setup
```

This does everything: starts Docker containers, runs migrations, seeds data.

## 6. Generate Prisma Client

```bash
npx prisma generate --schema packages/database/prisma/schema.prisma
```

## 7. Build

```bash
npm run build
```

## 8. Run

### Development (with hot reload)

```bash
npm run dev
```

This starts:
- **API** at `http://localhost:13000`
- **Web** at `http://localhost:3001`

### Production-like

```bash
# API
cd apps/api && node dist/main.js

# Web (separate terminal)
cd apps/web && npm start
```

## 9. Verify

1. Open `http://localhost:3001` — the dashboard should load
2. API health: `curl http://localhost:13000`
3. WebSocket: the dashboard should show real-time updates

## 10. Run Tests

```bash
npm run test
```

Expected: 78 test suites, 499 tests, all passing.

---

## Project Structure

```
aevora/
├── apps/
│   ├── api/          # NestJS backend (port 13000)
│   └── web/          # Next.js frontend (port 3001)
├── packages/
│   └── database/     # Prisma schema, migrations, seed
├── infrastructure/
│   └── docker/       # docker-compose files
├── scripts/          # db-migrate, db-local-setup, safe-local.env
├── .env.example      # Template — copy to .env
└── SETUP.md          # This file
```

## Key URLs

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost:3001 |
| API | http://localhost:13000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Ollama | http://localhost:11434 |

## Troubleshooting

### "DATABASE_URL is missing or invalid"
→ Ensure `.env` exists in the project root with a valid `DATABASE_URL`.

### "Refusing to migrate remote database"
→ The migration script only runs on `localhost`. If you have a remote Neon URL in `DATABASE_URL`, change it to the local Docker one.

### Build fails with Prisma type errors
→ Run `npx prisma generate --schema packages/database/prisma/schema.prisma` to regenerate the client.

### "ECONNREFUSED" on port 5432 or 6379
→ Docker containers aren't running. Run `docker compose -f infrastructure/docker/docker-compose.yml up -d`.

### Ollama model not found
→ Pull the model: `ollama pull qwen2.5:7b` and `ollama pull phi4:latest`.

### Port already in use
→ Change `PORT_API` or `PORT_WEB` in `.env`, or kill the process using the port.

## Environment Variable Reference

See `.env.example` for the complete list with inline documentation. Every variable has a sensible default or is optional — only the ones in the "Required" table above need values.

## Feature Flags / Kill Switches

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `AGENT_WORK_CYCLES` | `true` | Autonomous business loop (lead gen → sales → delivery) |
| `SALES_AUTO_PROCESS` | `false` | Auto-process sales queue without manual trigger |
| `LEAD_GEN_PROVIDER_ENABLED` | `false` | Real Google Places API (mock leads when false) |
| `INBOX_ENABLED` | `false` | Gmail inbox polling for lead replies |
| `OUTREACH_ENVIRONMENT` | `SANDBOX` | `SANDBOX` = no real emails; `PRODUCTION` = sends via SMTP |
| `ENABLE_REAL_PRODUCTION_SENDING` | `false` | Final gate: even in PRODUCTION mode, emails go to `TEST_EMAIL_RECIPIENT` unless this is `true` |
| `AEVORA_SAFE_MODE` | unset | When `true`, blocks all outbound network except Ollama |

## Per-Company Configuration

These are configurable per company via the `LeadGenConfig` database table (set by the CEO agent or API):

| Field | Env fallback | Default | Range |
|-------|-------------|---------|-------|
| `categories` | `LEAD_GEN_CATEGORIES` | `restaurant` | Any comma-separated list |
| `radiusM` | `LEAD_GEN_RADIUS_M` | `50000` (50 km) | 100–500,000 metres |
| `intervalHours` | `LEAD_GEN_INTERVAL_HOURS` | `6` hours | 0.1–168 hours |

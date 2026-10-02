// Local dev DB in one step: start docker Postgres, migrate it, seed it. Never touches a remote DB.
// Usage: npm run db:local:setup
// URL: LOCAL_DATABASE_URL, else DATABASE_URL from .env if it is local, else the docker-compose default.
const path = require('path');
const { execSync } = require('child_process');
const { dbHost, isLocal } = require('./db-migrate');
const root = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch {}

const COMPOSE_DEFAULT = 'postgresql://aevora:secret@localhost:5432/aevoradb?schema=public';
const envUrl = isLocal(dbHost(process.env.DATABASE_URL)) ? process.env.DATABASE_URL : null;
const url = process.env.LOCAL_DATABASE_URL || envUrl || COMPOSE_DEFAULT;
const host = dbHost(url);
console.log(`Database host: ${host}`);
if (!isLocal(host)) { console.error('Refusing: db:local:setup only works on a local database.'); process.exit(1); }

const env = { ...process.env, DATABASE_URL: url, ALLOW_REMOTE_MIGRATE: '' };
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env });

try {
  run('docker compose -f infrastructure/docker/docker-compose.yml up -d --wait postgres');
  run('node scripts/db-migrate.js');
  run('npx ts-node prisma/seed.ts', path.join(root, 'packages', 'database'));
  console.log('Local database ready.');
} catch (e) {
  process.exit(e.status || 1);
}

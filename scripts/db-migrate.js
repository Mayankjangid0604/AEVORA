// Apply Prisma migrations, refusing remote databases unless ALLOW_REMOTE_MIGRATE=true.
// Usage: npm run db:migrate   (DATABASE_URL from the environment, else the root .env)
const path = require('path');
const { execSync } = require('child_process');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {} // never overrides an explicit env var

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres'];

function dbHost(url) {
  try { return new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { return null; }
}

function isLocal(host) {
  return LOCAL_HOSTS.includes(host);
}

function main() {
  const url = process.env.DATABASE_URL;
  const host = dbHost(url);
  if (!host) { console.error('DATABASE_URL is missing or invalid.'); process.exit(1); }
  console.log(`Database host: ${host}`);
  if (!isLocal(host) && process.env.ALLOW_REMOTE_MIGRATE !== 'true') {
    console.error(`Refusing to migrate remote database "${host}". Set ALLOW_REMOTE_MIGRATE=true if you really mean it.`);
    process.exit(1);
  }
  try {
    execSync('npx prisma migrate deploy', { cwd: path.join(__dirname, '..', 'packages', 'database'), stdio: 'inherit', env: process.env });
  } catch (e) {
    process.exit(e.status || 1);
  }
}

if (require.main === module) main();
module.exports = { dbHost, isLocal };

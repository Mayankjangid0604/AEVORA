#!/usr/bin/env node
/**
 * AEVORA — Safe Local Database Setup
 * 
 * Orchestrates local PostgreSQL container startup, migration deployment,
 * and database seeding with strict local-host safety verification.
 * 
 * Safety Rules:
 * 1. Strictly refuses execution if the configured database host is not local.
 * 2. Never prints database passwords or raw connection strings.
 * 3. Propagates exact child-process exit codes.
 * 4. Supports --dry-run for non-destructive static verification.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Extracts host from a database connection string.
 * @param {string | undefined} url
 * @returns {string | null}
 */
function dbHost(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validates whether a host is an authorized local development target.
 * @param {string | null | undefined} host
 * @returns {boolean}
 */
function isLocal(host) {
  return host ? LOCAL_HOSTS.has(host.toLowerCase()) : false;
}

/**
 * Parses connection string into safe diagnostic components with credentials redacted.
 * @param {string | undefined} url
 * @returns {{ scheme: string, host: string, port: string, database: string, schema: string } | null}
 */
function parseSafeDbInfo(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      host: parsed.hostname.replace(/^\[|\]$/g, ''),
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, ''),
      schema: parsed.searchParams.get('schema') || 'public',
    };
  } catch {
    return null;
  }
}

/**
 * Safely loads environment variables from root .env without overriding active process.env.
 * @param {string} envPath
 */
function loadEnvSafe(envPath) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      return;
    } catch (e) {
      if (e && e.code === 'ENOENT') return;
    }
  }
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }
    } catch {
      // Fallback silently if read fails
    }
  }
}

/**
 * Executes a child process with inherited I/O and exit-code propagation.
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {import('child_process').SpawnSyncReturns<Buffer>}
 */
function runCommand(command, args, cwd) {
  const isWindows = process.platform === 'win32';
  const res = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
  });

  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const err = new Error(`Command failed with exit code ${res.status}: ${command} ${args.join(' ')}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/**
 * Main orchestration logic.
 * @param {string[]} argv
 */
function main(argv = process.argv.slice(2)) {
  // 1. Argument validation
  let isDryRun = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log('AEVORA — Local Database Setup');
      console.log('Usage: npm run db:local:setup [-- --dry-run | --help]\n');
      console.log('Options:');
      console.log('  --dry-run  Validate local configuration without starting containers or mutating data.');
      console.log('  --help     Display this help documentation.');
      process.exit(0);
    } else if (arg === '--dry-run') {
      isDryRun = true;
    } else {
      console.error(`[db:local:setup] Unknown option: ${arg}`);
      console.error('Run "npm run db:local:setup -- --help" for available options.');
      process.exit(1);
    }
  }

  // 2. Load environment configuration
  const envPath = path.join(ROOT_DIR, '.env');
  loadEnvSafe(envPath);

  // 3. Resolve target database URL (respect LOCAL_DATABASE_URL or DATABASE_URL, with local fallback)
  const defaultPort = process.env.POSTGRES_PORT || '5433';
  const composeDefault = `postgresql://aevora:secret@localhost:${defaultPort}/aevoradb?schema=public`;

  const configuredUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || composeDefault;
  const targetHost = dbHost(configuredUrl);
  const safeInfo = parseSafeDbInfo(configuredUrl);

  if (!targetHost || !safeInfo) {
    console.error('[db:local:setup] Error: Database URL is invalid or malformed.');
    process.exit(1);
  }

  // 4. Strict Local-Host Guard Verification
  if (!isLocal(targetHost)) {
    console.error(`[db:local:setup] Security Refusal: Target host "${targetHost}" is not an authorized local host.`);
    console.error('[db:local:setup] Refusing execution: db:local:setup only operates on local development databases.');
    console.error('[db:local:setup] Recognized local hosts: localhost, 127.0.0.1, ::1, postgres');
    process.exit(1);
  }

  // 5. Log validated connection metadata (credentials strictly redacted)
  console.log('----------------------------------------------------');
  console.log('AEVORA — Safe Local Database Setup');
  console.log(`Database Target : ${safeInfo.scheme}://${safeInfo.host}:${safeInfo.port}/${safeInfo.database} (schema: ${safeInfo.schema})`);
  console.log(`Local Guard     : PASSED (Target host "${safeInfo.host}" verified local)`);
  if (isDryRun) {
    console.log('Execution Mode  : DRY-RUN (Static validation only; zero mutations)');
  } else {
    console.log('Execution Mode  : LIVE EXECUTION');
  }
  console.log('----------------------------------------------------');

  const composePath = path.join(ROOT_DIR, 'infrastructure', 'docker', 'docker-compose.yml');
  const schemaPath = path.join(ROOT_DIR, 'packages', 'database', 'prisma', 'schema.prisma');
  const seedTsConfig = path.join(ROOT_DIR, 'packages', 'database', 'tsconfig.json');
  const seedScript = path.join(ROOT_DIR, 'packages', 'database', 'prisma', 'seed.ts');

  // Verify prerequisites exist on disk
  if (!fs.existsSync(composePath)) {
    console.error(`[db:local:setup] Error: Docker compose configuration missing at ${composePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(schemaPath)) {
    console.error(`[db:local:setup] Error: Prisma schema missing at ${schemaPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(seedScript)) {
    console.error(`[db:local:setup] Error: Seed script missing at ${seedScript}`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log('\n[Dry-Run Plan]');
    console.log(`1. Launch container  : docker compose -f infrastructure/docker/docker-compose.yml up -d --wait postgres`);
    console.log(`2. Deploy migrations : npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma`);
    console.log(`3. Seed database     : npx ts-node -P packages/database/tsconfig.json packages/database/prisma/seed.ts`);
    console.log('\nDry-run completed successfully. All safety checks and configuration paths verified.');
    process.exit(0);
  }

  // 6. Live Execution Sequence
  try {
    console.log('\n[1/3] Ensuring local PostgreSQL container is running and healthy...');
    runCommand('docker', ['compose', '-f', 'infrastructure/docker/docker-compose.yml', 'up', '-d', '--wait', 'postgres'], ROOT_DIR);

    console.log('\n[2/3] Deploying Prisma migrations...');
    runCommand('npx', ['prisma', 'migrate', 'deploy', `--schema=${schemaPath}`], ROOT_DIR);

    console.log('\n[3/3] Seeding initial database records...');
    runCommand('npx', ['ts-node', '-P', seedTsConfig, seedScript], ROOT_DIR);

    console.log('\n[db:local:setup] Local database setup completed successfully.');
  } catch (err) {
    console.error(`\n[db:local:setup] Failure: ${err.message || err}`);
    process.exit(err.status || 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  dbHost,
  isLocal,
  parseSafeDbInfo,
  loadEnvSafe,
  main,
  LOCAL_HOSTS,
};

#!/usr/bin/env node
/**
 * AEVORA Host Commissioning Readiness & Preflight Verification Tool
 *
 * Audits deployment configuration, environment variables, secret strength,
 * Compose file structure, and network port exposure without mutating state,
 * opening ports, calling external servers, or printing sensitive credentials.
 *
 * Usage:
 *   node infrastructure/scripts/preflight-check.js [--target staging|production] [--env-file <path>] [--strict] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  yaml = null;
}

const KNOWN_INSECURE_SECRETS = new Set([
  'change-this-to-a-random-32-char-string',
  'super_secure_jwt_secret_placeholder_replace_me',
  'super_secure_db_password_placeholder',
  'super_secure_redis_password_placeholder',
  'replace_with_at_least_32_random_hex_characters',
  'replace_with_at_least_16_random_hex_characters',
  'replace_with_strong_staging_db_password',
  'replace_with_strong_staging_redis_password',
  'secret',
  'dev-secret',
  'test-secret-key-for-jest',
  'development',
  'test',
  'password',
  '12345678',
  'admin',
  'aevora-secret',
  'default',
  'placeholder'
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: 'staging',
    envFile: null,
    composeFile: null,
    strict: false,
    json: false,
    syntheticValidation: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' && args[i + 1]) {
      options.target = args[++i].toLowerCase();
    } else if (arg === '--env-file' && args[i + 1]) {
      options.envFile = args[++i];
    } else if (arg === '--compose-file' && args[i + 1]) {
      options.composeFile = args[++i];
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--synthetic-validation') {
      options.syntheticValidation = true;
    }
  }

  const repoRoot = path.resolve(__dirname, '../..');
  if (!options.envFile) {
    const defaultEnv = options.target === 'production' ? '.env.production' : '.env.staging';
    const candidatePath = path.join(repoRoot, defaultEnv);
    if (fs.existsSync(candidatePath)) {
      options.envFile = candidatePath;
    }
  } else if (!path.isAbsolute(options.envFile)) {
    options.envFile = path.resolve(repoRoot, options.envFile);
  }

  if (!options.composeFile) {
    const defaultCompose = options.target === 'production'
      ? 'infrastructure/docker/docker-compose.prod.yml'
      : 'infrastructure/docker/docker-compose.staging.yml';
    options.composeFile = path.join(repoRoot, defaultCompose);
  } else if (!path.isAbsolute(options.composeFile)) {
    options.composeFile = path.resolve(repoRoot, options.composeFile);
  }

  return { options, repoRoot };
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, vars: {} };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  }
  return { exists: true, vars };
}

function isWeakSecret(val, minLen = 16) {
  if (!val || typeof val !== 'string') return { weak: true, reason: 'Empty or missing' };
  const trimmed = val.trim();
  if (trimmed.length < minLen) {
    return { weak: true, reason: `Length is ${trimmed.length} (minimum ${minLen} characters required)` };
  }
  const lower = trimmed.toLowerCase();
  if (KNOWN_INSECURE_SECRETS.has(lower)) {
    return { weak: true, reason: 'Matches known insecure placeholder or default secret' };
  }
  const weakSubstrings = ['replace_with', 'change-this', 'placeholder', 'secret_placeholder', 'your_password'];
  for (const sub of weakSubstrings) {
    if (lower.includes(sub)) {
      return { weak: true, reason: `Contains obvious placeholder marker ('${sub}')` };
    }
  }
  return { weak: false };
}

function auditEnvironment(envVars, target) {
  const results = [];
  const addResult = (name, status, message, isSecret = true) => {
    results.push({ name, status, message, isSecret });
  };

  const getVar = (name) => envVars[name] || process.env[name] || '';

  // 1. NODE_ENV
  const nodeEnv = getVar('NODE_ENV');
  if (!nodeEnv) {
    addResult('NODE_ENV', 'FAIL', 'Missing NODE_ENV. Must be explicitly set.', false);
  } else if (nodeEnv !== target) {
    addResult('NODE_ENV', 'FAIL', `NODE_ENV is '${nodeEnv}', but target is '${target}'.`, false);
  } else {
    addResult('NODE_ENV', 'PASS', `Configured as '${nodeEnv}'`, false);
  }

  // 2. JWT_SECRET
  const jwt = getVar('JWT_SECRET');
  if (!jwt) {
    addResult('JWT_SECRET', 'FAIL', 'Missing required JWT_SECRET.');
  } else {
    const weakCheck = isWeakSecret(jwt, 32);
    if (weakCheck.weak) {
      addResult('JWT_SECRET', 'FAIL', `Invalid secret: ${weakCheck.reason}`);
    } else {
      addResult('JWT_SECRET', 'PASS', `Strong cryptographic key verified (len=${jwt.length})`);
    }
  }

  // 3. DATABASE_URL & POSTGRES CREDENTIALS
  const dbUrl = getVar('DATABASE_URL');
  if (!dbUrl) {
    addResult('DATABASE_URL', 'FAIL', 'Missing required DATABASE_URL.');
  } else {
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      addResult('DATABASE_URL', 'FAIL', 'DATABASE_URL must start with postgresql:// or postgres://');
    } else {
      const lower = dbUrl.toLowerCase();
      if (lower.includes('placeholder') || lower.includes('replace_me') || lower.includes(':password@') || lower.includes(':secret@')) {
        addResult('DATABASE_URL', 'FAIL', 'DATABASE_URL contains weak or placeholder credentials');
      } else {
        addResult('DATABASE_URL', 'PASS', 'Valid PostgreSQL connection string format (credentials masked)');
      }
    }
  }

  const pgPass = getVar('POSTGRES_PASSWORD');
  if (!pgPass) {
    addResult('POSTGRES_PASSWORD', 'FAIL', 'Missing POSTGRES_PASSWORD.');
  } else {
    const minPassLen = target === 'production' ? 16 : 12;
    const weakCheck = isWeakSecret(pgPass, minPassLen);
    if (weakCheck.weak) {
      addResult('POSTGRES_PASSWORD', 'FAIL', `Weak password: ${weakCheck.reason}`);
    } else {
      addResult('POSTGRES_PASSWORD', 'PASS', `Strong password verified (len=${pgPass.length})`);
    }
  }

  const pgUser = getVar('POSTGRES_USER');
  if (!pgUser) {
    addResult('POSTGRES_USER', 'FAIL', 'Missing POSTGRES_USER.', false);
  } else if (pgUser === 'postgres' && target === 'production') {
    addResult('POSTGRES_USER', 'WARN', 'Using default superuser "postgres" is discouraged in production. Prefer dedicated role.', false);
  } else {
    addResult('POSTGRES_USER', 'PASS', `Defined (${pgUser})`, false);
  }

  const pgDb = getVar('POSTGRES_DB');
  if (!pgDb) {
    addResult('POSTGRES_DB', 'FAIL', 'Missing POSTGRES_DB.', false);
  } else {
    addResult('POSTGRES_DB', 'PASS', `Defined (${pgDb})`, false);
  }

  // 4. REDIS CONFIGURATION
  const redisPass = getVar('REDIS_PASSWORD');
  if (!redisPass) {
    addResult('REDIS_PASSWORD', 'FAIL', 'Missing REDIS_PASSWORD.');
  } else {
    const minRedisPass = target === 'production' ? 16 : 12;
    const weakCheck = isWeakSecret(redisPass, minRedisPass);
    if (weakCheck.weak) {
      addResult('REDIS_PASSWORD', 'FAIL', `Weak Redis password: ${weakCheck.reason}`);
    } else {
      addResult('REDIS_PASSWORD', 'PASS', `Strong Redis password verified (len=${redisPass.length})`);
    }
  }

  const redisUrl = getVar('REDIS_URL');
  if (!redisUrl) {
    addResult('REDIS_URL', 'FAIL', 'Missing required REDIS_URL.');
  } else if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    addResult('REDIS_URL', 'FAIL', 'REDIS_URL must begin with redis:// or rediss://');
  } else {
    addResult('REDIS_URL', 'PASS', 'Valid Redis URL format (credentials masked)');
  }

  // 5. WEBHOOK SECRETS
  for (const wh of ['WEBHOOK_SECRET_PROD', 'WEBHOOK_SECRET_SIM']) {
    const val = getVar(wh);
    if (!val) {
      addResult(wh, 'FAIL', `Missing required ${wh}.`);
    } else {
      const weakCheck = isWeakSecret(val, 16);
      if (weakCheck.weak) {
        addResult(wh, 'FAIL', `Weak webhook secret: ${weakCheck.reason}`);
      } else {
        addResult(wh, 'PASS', `Verified webhook secret (len=${val.length})`);
      }
    }
  }

  // 6. DOMAINS & ROUTING
  if (target === 'production') {
    const webDomain = getVar('WEB_DOMAIN');
    if (!webDomain) {
      addResult('WEB_DOMAIN', 'FAIL', 'Missing WEB_DOMAIN required by production Traefik routing.', false);
    } else if (webDomain.includes('example.com') || webDomain.includes('localhost')) {
      addResult('WEB_DOMAIN', 'FAIL', `WEB_DOMAIN contains placeholder domain '${webDomain}'.`, false);
    } else {
      addResult('WEB_DOMAIN', 'PASS', `Configured (${webDomain})`, false);
    }

    const apiDomain = getVar('API_DOMAIN');
    if (!apiDomain) {
      addResult('API_DOMAIN', 'FAIL', 'Missing API_DOMAIN required by production Traefik routing.', false);
    } else if (apiDomain.includes('example.com') || apiDomain.includes('localhost')) {
      addResult('API_DOMAIN', 'FAIL', `API_DOMAIN contains placeholder domain '${apiDomain}'.`, false);
    } else {
      addResult('API_DOMAIN', 'PASS', `Configured (${apiDomain})`, false);
    }

    const acmeEmail = getVar('ACME_EMAIL');
    if (!acmeEmail || acmeEmail.includes('example.com')) {
      addResult('ACME_EMAIL', 'WARN', 'ACME_EMAIL is unset or uses example.com; Let\'s Encrypt TLS issuance will fail.', false);
    } else {
      addResult('ACME_EMAIL', 'PASS', `Configured (${acmeEmail})`, false);
    }
  } else {
    const stagingDomain = getVar('STAGING_DOMAIN') || 'staging.aevora.local';
    addResult('STAGING_DOMAIN', 'PASS', `Configured (${stagingDomain})`, false);
  }

  // 7. OPTIONAL VARIABLES
  const rzpSecret = getVar('RAZORPAY_WEBHOOK_SECRET');
  if (rzpSecret) {
    const weakCheck = isWeakSecret(rzpSecret, 16);
    if (weakCheck.weak) {
      addResult('RAZORPAY_WEBHOOK_SECRET', 'FAIL', `Weak optional Razorpay secret: ${weakCheck.reason}`);
    } else {
      addResult('RAZORPAY_WEBHOOK_SECRET', 'PASS', 'Configured with strong secret');
    }
  } else {
    addResult('RAZORPAY_WEBHOOK_SECRET', 'INFO', 'Unset — live Razorpay webhook verification disabled', false);
  }

  return results;
}

function auditComposeFile(composePath, target) {
  const results = [];
  const addResult = (check, status, message) => {
    results.push({ check, status, message });
  };

  if (!fs.existsSync(composePath)) {
    addResult('file_exists', 'FAIL', `Compose file not found at ${composePath}`);
    return results;
  }
  addResult('file_exists', 'PASS', `Compose file found: ${path.basename(composePath)}`);

  const content = fs.readFileSync(composePath, 'utf8');
  let doc;
  if (yaml) {
    try {
      doc = yaml.load(content);
    } catch (e) {
      addResult('yaml_syntax', 'FAIL', `YAML parsing error: ${e.message}`);
      return results;
    }
  }

  const services = doc && doc.services ? doc.services : null;

  // Check required services
  const requiredServices = ['traefik', 'postgres', 'redis', 'api', 'web', 'migration'];
  for (const s of requiredServices) {
    if (services) {
      if (services[s]) {
        addResult(`service_${s}`, 'PASS', `Service '${s}' is defined`);
      } else {
        addResult(`service_${s}`, 'FAIL', `Required service '${s}' is missing`);
      }
    } else {
      const regex = new RegExp(`^\\s{2}${s}:`, 'm');
      if (regex.test(content)) {
        addResult(`service_${s}`, 'PASS', `Service '${s}' detected in compose file`);
      } else {
        addResult(`service_${s}`, 'FAIL', `Required service '${s}' not detected`);
      }
    }
  }

  // Audit port exposure
  if (services) {
    // 1. Database port exposure
    const dbPorts = services.postgres?.ports || [];
    if (target === 'production') {
      if (dbPorts.length > 0) {
        addResult('postgres_port_isolation', 'FAIL', `PostgreSQL exposes ports in production: ${JSON.stringify(dbPorts)}`);
      } else {
        addResult('postgres_port_isolation', 'PASS', 'PostgreSQL publishes no host ports in production (strictly private)');
      }
    } else {
      let isLoopbackOnly = true;
      for (const p of dbPorts) {
        const pStr = String(p);
        if (!pStr.startsWith('127.0.0.1:')) {
          isLoopbackOnly = false;
        }
      }
      if (!isLoopbackOnly) {
        addResult('postgres_port_isolation', 'FAIL', `PostgreSQL exposes non-loopback ports: ${JSON.stringify(dbPorts)}`);
      } else {
        addResult('postgres_port_isolation', 'PASS', 'PostgreSQL binds exclusively to loopback (127.0.0.1) in staging');
      }
    }

    // 2. Redis port exposure
    const redisPorts = services.redis?.ports || [];
    if (target === 'production') {
      if (redisPorts.length > 0) {
        addResult('redis_port_isolation', 'FAIL', `Redis exposes ports in production: ${JSON.stringify(redisPorts)}`);
      } else {
        addResult('redis_port_isolation', 'PASS', 'Redis publishes no host ports in production (strictly private)');
      }
    } else {
      let isLoopbackOnly = true;
      for (const p of redisPorts) {
        const pStr = String(p);
        if (!pStr.startsWith('127.0.0.1:')) {
          isLoopbackOnly = false;
        }
      }
      if (!isLoopbackOnly) {
        addResult('redis_port_isolation', 'FAIL', `Redis exposes non-loopback ports: ${JSON.stringify(redisPorts)}`);
      } else {
        addResult('redis_port_isolation', 'PASS', 'Redis binds exclusively to loopback (127.0.0.1) in staging');
      }
    }

    // 3. Reverse proxy ingress exposure
    const traefikPorts = services.traefik?.ports || [];
    if (traefikPorts.length === 0) {
      addResult('reverse_proxy_ingress', 'FAIL', 'Traefik has no published ports for web ingress');
    } else {
      addResult('reverse_proxy_ingress', 'PASS', `Traefik publishes HTTP/HTTPS ports: ${JSON.stringify(traefikPorts)}`);
    }

    // 4. Migration & API dependencies
    const apiDepends = services.api?.depends_on || {};
    const apiDependsKeys = Array.isArray(apiDepends) ? apiDepends : Object.keys(apiDepends);
    const hasDbDep = apiDependsKeys.includes('postgres');
    const hasRedisDep = apiDependsKeys.includes('redis');
    const hasMigrationDep = apiDependsKeys.includes('migration');

    if (hasDbDep && hasRedisDep && hasMigrationDep) {
      addResult('startup_order', 'PASS', 'API explicitly depends on postgres, redis, and migration completion');
    } else {
      addResult('startup_order', 'FAIL', `API missing dependencies. DB:${hasDbDep}, Redis:${hasRedisDep}, Migration:${hasMigrationDep}`);
    }

    // 5. Health checks
    for (const hService of ['postgres', 'redis', 'api', 'web']) {
      if (services[hService]?.healthcheck) {
        addResult(`healthcheck_${hService}`, 'PASS', `Healthcheck configured for '${hService}'`);
      } else {
        addResult(`healthcheck_${hService}`, 'WARN', `Healthcheck missing for '${hService}'`);
      }
    }
  }

  return results;
}

function runSyntheticComposeValidation(composePath, target) {
  try {
    // Generate synthetic disposable strong environment variables for parsing validation
    const disposableEnv = {
      ...process.env,
      NODE_ENV: target,
      POSTGRES_USER: 'disposable_user',
      POSTGRES_PASSWORD: 'disposable_strong_password_12345678',
      POSTGRES_DB: 'disposable_db',
      DATABASE_URL: 'postgresql://disposable_user:disposable_strong_password_12345678@postgres:5432/disposable_db',
      REDIS_PASSWORD: 'disposable_strong_redis_password_12345678',
      REDIS_URL: 'redis://:disposable_strong_redis_password_12345678@redis:6379/0',
      JWT_SECRET: 'd8f93a1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
      WEBHOOK_SECRET_PROD: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
      WEBHOOK_SECRET_SIM: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      WEB_DOMAIN: 'test.aevora.example',
      API_DOMAIN: 'api-test.aevora.example',
      STAGING_DOMAIN: 'staging-test.aevora.local',
      STAGING_API_DOMAIN: 'api.staging-test.aevora.local',
      ACME_EMAIL: 'admin@aevora.example',
    };

    const out = execSync(`docker compose -f "${composePath}" config`, {
      env: disposableEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return { success: true, message: 'Docker Compose configuration syntax verified successfully with synthetic values.' };
  } catch (err) {
    const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    return { success: false, message: `Docker Compose config check failed: ${errMsg}` };
  }
}

function checkHostEnvironment() {
  const hostChecks = [];
  // 1. Node version
  const nodeVer = process.version;
  const majorVer = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  if (majorVer >= 18) {
    hostChecks.push({ item: 'Node.js Version', status: 'PASS', detail: `${nodeVer} (>= 18 supported)` });
  } else {
    hostChecks.push({ item: 'Node.js Version', status: 'WARN', detail: `${nodeVer} (< 18 may lack features)` });
  }

  // 2. Docker CLI
  try {
    const dockerVer = execSync('docker --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    hostChecks.push({ item: 'Docker CLI', status: 'PASS', detail: dockerVer });
  } catch (e) {
    hostChecks.push({ item: 'Docker CLI', status: 'WARN', detail: 'Docker CLI not found or daemon not reachable.' });
  }

  // 3. Docker Compose CLI
  try {
    const composeVer = execSync('docker compose version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    hostChecks.push({ item: 'Docker Compose', status: 'PASS', detail: composeVer });
  } catch (e) {
    hostChecks.push({ item: 'Docker Compose', status: 'WARN', detail: 'Docker Compose plugin not found.' });
  }

  return hostChecks;
}

function runPreflight() {
  const { options, repoRoot } = parseArgs();

  let envVars = {};
  let envFileFound = false;

  if (options.envFile) {
    const parsed = parseEnvFile(options.envFile);
    if (parsed.exists) {
      envVars = parsed.vars;
      envFileFound = true;
    }
  }

  const envResults = auditEnvironment(envVars, options.target);
  const composeResults = auditComposeFile(options.composeFile, options.target);
  const hostResults = checkHostEnvironment();

  let syntheticResult = null;
  if (options.syntheticValidation) {
    syntheticResult = runSyntheticComposeValidation(options.composeFile, options.target);
  }

  const allChecks = [...envResults, ...composeResults];
  const failCount = allChecks.filter((c) => c.status === 'FAIL').length;
  const warnCount = allChecks.filter((c) => c.status === 'WARN').length;
  const passCount = allChecks.filter((c) => c.status === 'PASS').length;

  let overallStatus = 'PASS';
  if (failCount > 0) {
    overallStatus = 'FAIL';
  } else if (warnCount > 0 && options.strict) {
    overallStatus = 'FAIL';
  } else if (warnCount > 0) {
    overallStatus = 'PASS_WITH_WARNINGS';
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          target: options.target,
          overallStatus,
          summary: { passed: passCount, failed: failCount, warnings: warnCount },
          envFile: options.envFile ? { path: options.envFile, found: envFileFound } : null,
          composeFile: { path: options.composeFile, exists: fs.existsSync(options.composeFile) },
          environmentAudit: envResults,
          composeAudit: composeResults,
          hostAudit: hostResults,
          syntheticValidation: syntheticResult,
        },
        null,
        2
      )
    );
    process.exit(overallStatus === 'FAIL' ? 1 : 0);
  }

  console.log('========================================================================');
  console.log(` AEVORA COMMISSIONING PREFLIGHT AUDIT [Target: ${options.target.toUpperCase()}]`);
  console.log('========================================================================');
  console.log(`Timestamp:    ${new Date().toISOString()}`);
  console.log(`Repo Root:    ${repoRoot}`);
  console.log(`Env File:     ${options.envFile || 'None specified (evaluated process.env)'} ${envFileFound ? '(Loaded)' : '(Not Found)'}`);
  console.log(`Compose File: ${options.composeFile}`);
  console.log('------------------------------------------------------------------------\n');

  console.log('1. HOST PREREQUISITES & LOCAL TOOLS');
  for (const h of hostResults) {
    const badge = h.status === 'PASS' ? '[PASS]' : '[WARN]';
    console.log(`  ${badge.padEnd(7)} ${h.item.padEnd(20)} : ${h.detail}`);
  }
  console.log();

  console.log('2. CONFIGURATION & ENVIRONMENT VARIABLES (Zero secret leakage)');
  for (const r of envResults) {
    const badge = `[${r.status}]`;
    console.log(`  ${badge.padEnd(7)} ${r.name.padEnd(26)} : ${r.message}`);
  }
  console.log();

  console.log('3. COMPOSE SPECIFICATION & PORT ISOLATION AUDIT');
  for (const r of composeResults) {
    const badge = `[${r.status}]`;
    console.log(`  ${badge.padEnd(7)} ${r.check.padEnd(26)} : ${r.message}`);
  }
  console.log();

  if (syntheticResult) {
    console.log('4. SYNTHETIC PARSING VALIDATION');
    const badge = syntheticResult.success ? '[PASS]' : '[FAIL]';
    console.log(`  ${badge.padEnd(7)} ${syntheticResult.message}`);
    console.log();
  }

  console.log('------------------------------------------------------------------------');
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed, ${warnCount} Warnings`);
  console.log(`OVERALL PREFLIGHT OUTCOME: ${overallStatus}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    console.error('Preflight verification failed. Resolve the above errors before deploying.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runPreflight();
}

module.exports = {
  auditEnvironment,
  auditComposeFile,
  isWeakSecret,
  parseEnvFile,
  runSyntheticComposeValidation,
};

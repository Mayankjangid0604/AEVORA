/**
 * AEVORA — Secure Chairman Password Update
 *
 * Safely updates the Chairman password for local development.
 *
 * Safety Rules:
 * 1. Strictly refuses execution if the configured database host is not local.
 * 2. Requires password from CHAIRMAN_PASSWORD environment variable or interactive prompt.
 * 3. Never prints, logs, or persists passwords in plaintext.
 * 4. Verifies Chairman record exists before attempting update.
 * 5. Returns nonzero exit code on any validation or database error.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

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
 * Validates that the target database is explicitly local before opening any connection.
 * @param {string} scriptName
 */
function assertLocalDatabase(scriptName) {
  if (!process.env.DATABASE_URL) {
    const rootEnv = path.join(ROOT_DIR, '.env');
    loadEnvSafe(rootEnv);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || typeof dbUrl !== 'string') {
    console.error(`[${scriptName}] Security Refusal: DATABASE_URL is not configured.`);
    console.error(`[${scriptName}] Refusing execution: Cannot verify target database host.`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    console.error(`[${scriptName}] Security Refusal: Malformed DATABASE_URL connection string.`);
    console.error(`[${scriptName}] Refusing execution: Failed to parse database URL.`);
    process.exit(1);
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'postgresql' && scheme !== 'postgres') {
    console.error(`[${scriptName}] Security Refusal: Unsupported database scheme "${parsed.protocol}". Expected "postgresql:" or "postgres:".`);
    process.exit(1);
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || !LOCAL_HOSTS.has(host)) {
    console.error(`[${scriptName}] Security Refusal: Target database host "${host || 'unknown'}" is not an authorized local development host.`);
    console.error(`[${scriptName}] Refusing execution: This script only operates on local development databases.`);
    console.error(`[${scriptName}] Authorized local hosts: ${Array.from(LOCAL_HOSTS).join(', ')}`);
    process.exit(1);
  }
}

/**
 * Resolves the new password securely from environment or interactive prompt.
 * @returns {Promise<string>}
 */
async function resolvePassword() {
  const envPassword = process.env.CHAIRMAN_PASSWORD;
  if (envPassword && typeof envPassword === 'string' && envPassword.trim().length > 0) {
    return envPassword.trim();
  }

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question('Enter new Chairman password: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  console.error('[set-chairman-password] Error: Chairman password not provided.');
  console.error('[set-chairman-password] Supply the password via the CHAIRMAN_PASSWORD environment variable or run in an interactive terminal.');
  process.exit(1);
}

async function main() {
  assertLocalDatabase('set-chairman-password');

  const password = await resolvePassword();
  if (password.length < 8) {
    console.error('[set-chairman-password] Error: Chairman password must be at least 8 characters long.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const chairman = await prisma.chairman.findFirst();
    if (!chairman) {
      console.error('[set-chairman-password] Error: No Chairman record exists in the database. Run database seed first.');
      process.exit(1);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const workFactor = 600000;
    const digest = 'sha512';
    const hash = crypto.pbkdf2Sync(password, salt, workFactor, 64, digest).toString('hex');

    await prisma.chairman.update({
      where: { id: chairman.id },
      data: {
        credentialHash: hash,
        credentialSalt: salt,
        hashAlgorithm: 'PBKDF2-SHA512',
        workFactor: workFactor,
      },
    });

    console.log(`[set-chairman-password] Password successfully updated for Chairman: ${chairman.email}`);
  } catch (err) {
    console.error(`[set-chairman-password] Database error: ${err.message || 'Operation failed'}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[set-chairman-password] Unexpected error: ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = {
  assertLocalDatabase,
  resolvePassword,
  LOCAL_HOSTS,
};

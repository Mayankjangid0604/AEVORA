// Create or update the Chairman login and make sure they own a company.
// Usage (from repo root):
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' node scripts/create-admin.js
// Optional: ADMIN_NAME (default "Chairman"), COMPANY_NAME (default from .env or "AEVORA").
// Safe to re-run: updates the password, never creates a second company.
const crypto = require('crypto');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
const { PrismaClient } = require('@prisma/client');

const WORK_FACTOR = 600000; // AuthService rejects anything below 600k
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'Chairman';
const companyName = process.env.COMPANY_NAME || 'AEVORA';

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  // Same scheme AuthService.verifyPassword checks: PBKDF2-SHA512, 64-byte key, hex.
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, WORK_FACTOR, 64, 'sha512').toString('hex');
  const credentials = { credentialHash: hash, credentialSalt: salt, hashAlgorithm: 'PBKDF2-SHA512', workFactor: WORK_FACTOR };

  const chairman = await prisma.chairman.upsert({
    where: { email },
    update: credentials,
    create: { name, email, ...credentials },
    include: { companies: true },
  });

  let company = chairman.companies[0];
  if (!company) {
    company = await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { name: companyName, chairmanId: chairman.id, status: 'ACTIVE' } });
      await tx.companyEvent.create({ data: { companyId: c.id, type: 'COMPANY_CREATED', payload: { name: companyName, source: 'create-admin' } } });
      return c;
    });
    console.log(`Created company "${company.name}" (${company.id})`);
  }

  console.log(`Chairman ready: ${chairman.email} (${chairman.id}) → company "${company.name}" (${company.id})`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// Set (or reset) the Chairman's login password. Never creates a company.
// Usage (PowerShell, from F:\aevora-main):
//   $env:ADMIN_EMAIL="you@example.com"; node scripts\set-chairman-password.js   (prompts for the password)
// ADMIN_PASSWORD may be set instead of the prompt (e.g. in CI). Hashing matches AuthService (PBKDF2-SHA512, 600k).
// If no Chairman has that email but exactly one Chairman exists, that Chairman's email is changed to it.
const crypto = require('crypto');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

function prompt(question) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(s); }; // hide typed chars
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const password = process.env.ADMIN_PASSWORD || (email ? await prompt('New password: ') : '');
  const all = await prisma.chairman.findMany({ include: { companies: { select: { name: true } } } });
  console.log('Chairmen in DB:', all.map((c) => `${c.email} → ${c.companies.map((x) => x.name).join(', ') || '(no company)'}`).join(' | ') || 'none');
  if (!email || password.length < 8) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars).'); process.exitCode = 1; return; }

  let target = all.find((c) => c.email.toLowerCase() === email);
  if (!target && all.length === 1) target = all[0];
  if (!target) { console.error(`No Chairman "${email}" and ${all.length} Chairmen exist — run scripts/create-admin.js instead.`); process.exitCode = 1; return; }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 600000, 64, 'sha512').toString('hex');
  await prisma.chairman.update({
    where: { id: target.id },
    data: { email, credentialHash: hash, credentialSalt: salt, hashAlgorithm: 'PBKDF2-SHA512', workFactor: 600000 },
  });
  console.log(`Password set for ${email} (company: ${target.companies.map((x) => x.name).join(', ') || 'none'}). You can sign in now.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

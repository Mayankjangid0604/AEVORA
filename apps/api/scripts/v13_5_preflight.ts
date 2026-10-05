import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailOutreachService } from '../src/sales-outreach/email-outreach.service';
import * as fs from 'fs';
import * as path from 'path';

// Load .env files safely using fs
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));

async function preflight() {
  console.log('========================================');
  console.log('AEVORA V13.5 — PHASE 0 PRE-FLIGHT CHECK');
  console.log('========================================');

  // 1. Environment configuration loading
  console.log('[1/10] Environment Configuration:');
  const placesKeySet = !!process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.trim().length > 0;
  const leadGenEnabled = process.env.LEAD_GEN_PROVIDER_ENABLED === 'true';
  const smtpHostSet = !!process.env.SMTP_HOST && process.env.SMTP_HOST.trim().length > 0;
  const smtpPortSet = !!process.env.SMTP_PORT;
  const smtpUserSet = !!process.env.SMTP_USER && process.env.SMTP_USER.trim().length > 0;
  const smtpPassSet = !!process.env.SMTP_PASS && process.env.SMTP_PASS.trim().length > 0;
  const prodSendingEnabled = process.env.ENABLE_REAL_PRODUCTION_SENDING === 'true';
  const testRecipient = process.env.TEST_EMAIL_RECIPIENT?.trim();

  console.log('  - GOOGLE_PLACES_API_KEY present:', placesKeySet ? 'CONFIGURED' : 'MISSING');
  console.log('  - LEAD_GEN_PROVIDER_ENABLED:', leadGenEnabled ? 'true' : 'false');
  console.log('  - SMTP_HOST:', smtpHostSet ? 'CONFIGURED' : 'MISSING');
  console.log('  - SMTP_PORT:', smtpPortSet ? process.env.SMTP_PORT : 'MISSING');
  console.log('  - SMTP_USER:', smtpUserSet ? 'CONFIGURED' : 'MISSING');
  console.log('  - SMTP_PASS:', smtpPassSet ? 'CONFIGURED' : 'MISSING');
  console.log('  - ENABLE_REAL_PRODUCTION_SENDING:', prodSendingEnabled ? 'ENABLED (CRITICAL ERROR!)' : 'DISABLED (SAFE)');
  console.log('  - TEST_EMAIL_RECIPIENT:', testRecipient);

  if (!placesKeySet) throw new Error('PRE-FLIGHT FAILED: GOOGLE_PLACES_API_KEY is not configured');
  if (!leadGenEnabled) throw new Error('PRE-FLIGHT FAILED: LEAD_GEN_PROVIDER_ENABLED is not true');
  if (!smtpHostSet || !smtpUserSet || !smtpPassSet) throw new Error('PRE-FLIGHT FAILED: SMTP credentials missing');
  if (prodSendingEnabled) throw new Error('PRE-FLIGHT FAILED: ENABLE_REAL_PRODUCTION_SENDING must be false for safety');
  if (testRecipient !== 'mayankjangid598@gmail.com') throw new Error(`PRE-FLIGHT FAILED: TEST_EMAIL_RECIPIENT must be mayankjangid598@gmail.com, got: ${testRecipient}`);

  // 2. Start Nest Application Context
  console.log('[2/10] Starting Nest Application Context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  console.log('  - Application context initialized successfully.');

  // 3. Database connectivity
  console.log('[3/10] Checking Database Connectivity...');
  const prisma = app.get(PrismaService);
  await prisma.$queryRaw`SELECT 1`;
  console.log('  - Database is reachable (SELECT 1 passed).');

  // 4. Rate limiter availability
  console.log('[4/10] Checking Persistent Rate Limiter...');
  const emailOutreach = app.get(EmailOutreachService);
  const company = await prisma.company.findFirst();
  if (!company) throw new Error('PRE-FLIGHT FAILED: No company found in database');
  const rateCheck = await emailOutreach.checkRateLimit(company.id);
  console.log('  - Persistent rate limiter operational. Current allowed status:', rateCheck.allowed, 'remainingMs:', rateCheck.remainingMs);

  // 5. Audit log table check
  console.log('[5/10] Checking Audit Logging Availability...');
  const auditCount = await prisma.integrationAuditLog.count();
  console.log('  - IntegrationAuditLog table accessible, existing records:', auditCount);

  // 6. Company & Auth context
  console.log('[6/10] Checking Company and Authentication Context...');
  const employeeCount = await prisma.employee.count({ where: { companyId: company.id } });
  console.log(`  - Company "${company.name}" (ID: ${company.id}) has ${employeeCount} employees.`);

  // 7. Verify safe safety flags
  console.log('[7/10] Verifying Recipient Safety Interlock...');
  if (process.env.ENABLE_REAL_PRODUCTION_SENDING === 'true') {
    throw new Error('SAFETY VIOLATION: Production sending is enabled!');
  }
  console.log('  - Interlock verified: REAL PRODUCTION SENDING IS DISABLED.');
  console.log('  - All delivery redirects unconditionally to:', process.env.TEST_EMAIL_RECIPIENT);

  await app.close();
  console.log('========================================');
  console.log('PHASE 0 PRE-FLIGHT: PASS');
  console.log('========================================');
}

preflight().catch((err) => {
  console.error('PRE-FLIGHT ERROR:', err.message);
  process.exit(1);
});

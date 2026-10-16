const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const l = rawLine.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const eqIdx = l.indexOf('=');
    const k = l.slice(0, eqIdx).trim();
    let v = l.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROD_TENANT_ID = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';

async function main() {
  console.log('================================================================');
  console.log('  AEVORA PRO 1 — PRODUCTION PILOT PREFLIGHT AUDIT');
  console.log('================================================================');
  console.log(`Target Tenant: ${PROD_TENANT_ID}`);

  // 1. Verify Company exists and details
  const company = await prisma.company.findUnique({
    where: { id: PROD_TENANT_ID },
    select: { id: true, name: true, chairmanId: true }
  });
  console.log('Company:', company);

  if (!company) {
    throw new Error(`Production company ${PROD_TENANT_ID} not found!`);
  }

  // 2. Query baseline record counts for production tenant
  const [
    leadsCount,
    auditsCount,
    approvalsCount,
    activitiesCount,
    employeesCount,
    qualificationCount,
    scoresCount,
    suppressionCount
  ] = await Promise.all([
    prisma.salesLead.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.leadGenAudit.count({ where: { lead: { companyId: PROD_TENANT_ID } } }),
    prisma.approvalRequest.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.salesActivity.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.employee.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.qualificationRecord.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.opportunityScore.count({ where: { opportunity: { companyId: PROD_TENANT_ID } } }),
    prisma.emailSuppression.count({ where: { companyId: PROD_TENANT_ID } })
  ]);

  console.log('\n--- Production Baseline CRM Counts ---');
  console.log({
    leadsCount,
    auditsCount,
    approvalsCount,
    activitiesCount,
    employeesCount,
    qualificationCount,
    scoresCount,
    suppressionCount
  });

  // 3. Inspect existing leads
  const existingLeads = await prisma.salesLead.findMany({
    where: { companyId: PROD_TENANT_ID },
    select: {
      id: true,
      name: true,
      status: true,
      qualityScore: true,
      googlePlaceId: true,
      contactEmail: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`\nExisting Leads in Production (${existingLeads.length}):`);
  for (const l of existingLeads) {
    console.log(`  - [${l.id}] "${l.name}" | Status: ${l.status} | Quality: ${l.qualityScore} | Place: ${l.googlePlaceId} | Created: ${l.createdAt.toISOString()} | Updated: ${l.updatedAt.toISOString()}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Preflight error:', err);
  process.exit(1);
});

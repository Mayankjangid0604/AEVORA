const fs = require('fs');

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    if (!fs.existsSync(f)) continue;
    for (const rawLine of fs.readFileSync(f, 'utf8').split('\n')) {
      const l = rawLine.trim();
      if (l.startsWith(key + '=')) {
        let v = l.slice(key.length + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }
  return null;
}

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const apiUrl = 'http://127.0.0.1:13000';
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const companyAId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c'; // AEVORA Technologies
const companyBId = '607da85a-7ad3-43b6-bf88-eace1125984d'; // Audit Company B Test

async function main() {
  console.log('========================================================');
  console.log('  PHASE 4 — INTEGRITY, SECURITY & REGRESSION CHECKS');
  console.log('========================================================\n');

  // 1. Get Company B leads
  const bLeads = await prisma.salesLead.findMany({ where: { companyId: companyBId } });
  if (bLeads.length === 0) throw new Error('No Company B leads found!');
  const targetLeadId = bLeads[0].id;
  console.log(`[Check 1] Target Lead ID from Company B: ${targetLeadId} ("${bLeads[0].name}")`);

  // 2. Unauthenticated request to /automation/enrichment/retry
  const unauthRes = await fetch(`${apiUrl}/automation/enrichment/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: targetLeadId }),
  });
  console.log(`[Check 2] Missing credentials -> HTTP ${unauthRes.status} (expected: 401)`);
  if (unauthRes.status !== 401) throw new Error('Failed: Expected 401 for unauthenticated request');

  // 3. Invalid credentials
  const badKeyRes = await fetch(`${apiUrl}/automation/enrichment/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': 'invalid_secret_key_12345',
      'x-company-id': companyBId,
    },
    body: JSON.stringify({ leadId: targetLeadId }),
  });
  console.log(`[Check 3] Invalid credentials -> HTTP ${badKeyRes.status} (expected: 401)`);
  if (badKeyRes.status !== 401) throw new Error('Failed: Expected 401 for bad integration key');

  // 4. Cross-company access: Company A attempts to access Company B lead
  const crossRes = await fetch(`${apiUrl}/automation/enrichment/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyAId, // Company A trying to operate on Company B lead!
    },
    body: JSON.stringify({ leadId: targetLeadId }),
  });
  console.log(`[Check 4] Cross-company access (Company A -> Company B lead) -> HTTP ${crossRes.status} (expected: 404)`);
  const crossData = await crossRes.json();
  console.log('  Response:', crossData);
  if (crossRes.status !== 404) throw new Error('Failed: Expected 404 for cross-company lead access');

  // 5. Verify Automation #1 remains fully functional
  console.log('\n[Check 5] Verifying Automation #1 functionality after Automation #2 runs...');
  const auto1Res = await fetch(`${apiUrl}/automation/workflows/automation-1-google-lead-finding/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyBId,
    },
    body: JSON.stringify({
      category: 'dentists',
      location: 'Plano, TX',
      maxResults: 3,
    }),
  });
  console.log(`  Automation #1 execute status: ${auto1Res.status} (expected: 201)`);
  const auto1Data = await auto1Res.json();
  console.log(`  Automation #1 executed successfully: status=${auto1Data.status}, duplicates=${auto1Data.result?.duplicates}`);
  if (auto1Res.status !== 201 || auto1Data.status !== 'COMPLETED') {
    throw new Error('Failed: Automation #1 did not execute properly');
  }

  // 6. Confirm database integrity for existing Company A records
  const compALeads = await prisma.salesLead.findMany({ where: { companyId: companyAId } });
  console.log(`\n[Check 6] Company A Leads count: ${compALeads.length} (expected: 8, perfectly preserved)`);
  if (compALeads.length !== 8) throw new Error(`Company A leads count changed! Got: ${compALeads.length}`);

  console.log('\n========================================================');
  console.log('  ALL INTEGRITY & REGRESSION CHECKS PASSED');
  console.log('========================================================');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

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
const n8nUrl = 'http://localhost:5678';
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const n8nKey = loadEnvKey('N8N_API_KEY');
const testCompanyId = '607da85a-7ad3-43b6-bf88-eace1125984d'; // Audit Company B Test

async function main() {
  console.log('========================================================');
  console.log('  AEVORA V26 — AUTOMATIONS #1 + #2 END-TO-END ACCEPTANCE');
  console.log('========================================================\n');

  // Verify test company
  const company = await prisma.company.findUnique({ where: { id: testCompanyId } });
  if (!company) throw new Error(`Test company ${testCompanyId} not found`);
  console.log(`[Phase 1] Test Company: "${company.name}" (ID: ${company.id})`);

  // Count leads before Phase 2
  const initialLeads = await prisma.salesLead.findMany({ where: { companyId: testCompanyId } });
  console.log(`[Phase 1] Initial Leads for Test Company: ${initialLeads.length}`);

  // PHASE 2: Execute Automation #1 Discovery
  console.log('\n========================================================');
  console.log('  PHASE 2 — REAL GOOGLE MAPS DISCOVERY (AUTOMATION #1)');
  console.log('========================================================');
  const searchPayload = {
    category: 'dentists',
    location: 'Plano, TX',
    maxResults: 3,
  };
  console.log(`Invoking Automation #1 via POST /automation/workflows/automation-1-google-lead-finding/execute`);
  console.log(`Parameters:`, searchPayload);

  const auto1Res = await fetch(`${apiUrl}/automation/workflows/automation-1-google-lead-finding/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId,
    },
    body: JSON.stringify(searchPayload),
  });

  console.log(`Automation #1 HTTP Status: ${auto1Res.status}`);
  const auto1Data = await auto1Res.json();
  console.log('Automation #1 Response:');
  console.log(JSON.stringify(auto1Data, null, 2));

  // Verify leads in DB
  const discoveredLeads = await prisma.salesLead.findMany({
    where: { companyId: testCompanyId },
    include: { leadGenAudits: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\nDiscovered Leads in PostgreSQL (Count: ${discoveredLeads.length}):`);
  const createdLeadIds = [];
  for (const lead of discoveredLeads) {
    createdLeadIds.push(lead.id);
    console.log(`- Lead ID: ${lead.id}`);
    console.log(`  Name: ${lead.name}`);
    console.log(`  Website: ${lead.website || 'none'}`);
    console.log(`  Phone: ${lead.contactPhone || 'none'}`);
    console.log(`  Google Place ID: ${lead.googlePlaceId}`);
    console.log(`  Initial Quality Score: ${lead.qualityScore}`);
    console.log(`  Status: ${lead.status}`);
    console.log(`  Audit Records: ${lead.leadGenAudits.length} (Events: ${lead.leadGenAudits.map(a => a.event).join(', ')})`);
  }

  if (discoveredLeads.length === 0) {
    throw new Error('Phase 2 FAILED: No leads persisted in PostgreSQL!');
  }

  // PHASE 3: Pass those SAME leads into Automation #2
  console.log('\n========================================================');
  console.log('  PHASE 3 — ENRICHMENT & VERIFICATION (AUTOMATION #2)');
  console.log('========================================================');
  console.log(`Passing ${createdLeadIds.length} newly discovered lead IDs into Automation #2:`, createdLeadIds);

  const auto2Res = await fetch(`${apiUrl}/automation/workflows/automation-2-lead-enrichment/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId,
    },
    body: JSON.stringify({
      leadIds: createdLeadIds,
      limit: createdLeadIds.length,
      forceRefresh: true,
    }),
  });

  console.log(`Automation #2 HTTP Status: ${auto2Res.status}`);
  const auto2Data = await auto2Res.json();
  console.log('Automation #2 Response:');
  console.log(JSON.stringify(auto2Data, null, 2));

  // Inspect DB state after Automation #2
  const enrichedLeads = await prisma.salesLead.findMany({
    where: { id: { in: createdLeadIds } },
    include: { leadGenAudits: { orderBy: { createdAt: 'asc' } } },
  });

  console.log('\nEnriched Leads DB State After Automation #2:');
  for (const l of enrichedLeads) {
    const meta = (typeof l.metadata === 'object' && l.metadata !== null) ? l.metadata : {};
    console.log(`\n--- Lead: ${l.name} (${l.id}) ---`);
    console.log(`  Website: ${l.website}`);
    console.log(`  Contact Phone: ${l.contactPhone}`);
    console.log(`  Contact Email: ${l.contactEmail || 'none'}`);
    console.log(`  Google Place ID (preserved): ${l.googlePlaceId}`);
    console.log(`  Source (preserved): ${l.source}`);
    console.log(`  Final Quality Score: ${l.qualityScore}`);
    console.log(`  Status: ${l.status}`);
    console.log(`  Enrichment Status: ${meta.enrichmentStatus}`);
    console.log(`  Enrichment Score Breakdown:`, meta.enrichmentScore);
    console.log(`  Facts Extracted:`, meta.enrichmentData?.facts);
    console.log(`  Email Verification:`, meta.enrichmentData?.emailVerification);
    console.log(`  Audit Trail (${l.leadGenAudits.length} events):`);
    for (const a of l.leadGenAudits) {
      console.log(`    * [${a.event}] Detail: ${JSON.stringify(a.detail)} | Created: ${a.createdAt.toISOString()}`);
    }
  }

  // PHASE 5: Repeatability test
  console.log('\n========================================================');
  console.log('  PHASE 5 — REPEATABILITY & DEDUPLICATION CHECK');
  console.log('========================================================');
  console.log('Re-invoking Automation #1 with the EXACT same search parameters...');
  const repeatAuto1Res = await fetch(`${apiUrl}/automation/workflows/automation-1-google-lead-finding/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId,
    },
    body: JSON.stringify(searchPayload),
  });

  console.log(`Repeat Automation #1 Status: ${repeatAuto1Res.status}`);
  const repeatAuto1Data = await repeatAuto1Res.json();
  console.log('Repeat Automation #1 Response:');
  console.log(JSON.stringify(repeatAuto1Data, null, 2));

  const countAfterRepeat = await prisma.salesLead.count({ where: { companyId: testCompanyId } });
  console.log(`Leads count after repeat search: ${countAfterRepeat} (expected: ${createdLeadIds.length})`);

  console.log('\nRe-invoking Automation #2 without forceRefresh (idempotency test)...');
  const repeatAuto2Res = await fetch(`${apiUrl}/automation/workflows/automation-2-lead-enrichment/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId,
    },
    body: JSON.stringify({
      leadIds: createdLeadIds,
      limit: createdLeadIds.length,
      forceRefresh: false,
    }),
  });

  console.log(`Repeat Automation #2 Status: ${repeatAuto2Res.status}`);
  const repeatAuto2Data = await repeatAuto2Res.json();
  console.log('Repeat Automation #2 Response:');
  console.log(JSON.stringify(repeatAuto2Data, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});

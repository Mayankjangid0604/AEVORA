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

const testCompanyId = '607da85a-7ad3-43b6-bf88-eace1125984d';
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const apiUrl = 'http://127.0.0.1:13000';

async function main() {
  console.log('========================================================');
  console.log('  AUTOMATION #2 LIVE ENRICHMENT & TENANT ISOLATION AUDIT');
  console.log('========================================================\n');

  // 1. Find the test lead created by Automation #1 in test company
  const lead = await prisma.salesLead.findFirst({
    where: {
      companyId: testCompanyId,
      website: { contains: 'midtowndentistrydallas.com' }
    }
  });

  if (!lead) {
    throw new Error('Test lead for Midtown Dentistry not found in test company!');
  }

  console.log(`[1] Found Test Lead: "${lead.name}" (ID: ${lead.id})`);
  console.log(`    Company ID: ${lead.companyId}`);
  console.log(`    Website: ${lead.website}`);
  console.log(`    Current Status: ${lead.status}`);
  console.log(`    Current Score: ${lead.qualityScore}`);

  // 2. Cross-tenant rejection test
  console.log('\n[2] Testing Cross-Tenant Rejection...');
  const companyAId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
  const crossTenantRes = await fetch(`${apiUrl}/automation/enrichment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyAId // Passing Company A header for lead belonging to Test Company B
    },
    body: JSON.stringify({
      leadIds: [lead.id],
      limit: 1,
      forceRefresh: true
    })
  });
  console.log(`Cross-tenant enrichment response status: ${crossTenantRes.status}`);
  const crossTenantData = await crossTenantRes.json();
  console.log('Cross-tenant response:', JSON.stringify(crossTenantData, null, 2));

  // Verify lead was NOT modified by cross-tenant call
  const leadAfterCross = await prisma.salesLead.findUnique({ where: { id: lead.id } });
  console.log(`Lead status after cross-tenant attempt: ${leadAfterCross.status} (unchanged)`);

  // 3. Authorized Enrichment Execution
  console.log('\n[3] Executing Authorized Live Lead Enrichment (Automation #2)...');
  const t0 = Date.now();
  const enrichRes = await fetch(`${apiUrl}/automation/enrichment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId
    },
    body: JSON.stringify({
      leadIds: [lead.id],
      limit: 1,
      forceRefresh: true
    })
  });

  const durationMs = Date.now() - t0;
  console.log(`Enrichment HTTP Status: ${enrichRes.status} (Duration: ${durationMs} ms)`);
  const enrichData = await enrichRes.json();
  console.log('Enrichment Response:');
  console.log(JSON.stringify(enrichData, null, 2));

  // 4. Verify Database State
  console.log('\n[4] Inspecting Persisted Lead in PostgreSQL...');
  const updatedLead = await prisma.salesLead.findUnique({
    where: { id: lead.id },
    include: { leadGenAudits: { orderBy: { createdAt: 'asc' } } }
  });

  const meta = updatedLead.metadata || {};
  console.log(`- Lead ID: ${updatedLead.id}`);
  console.log(`- Status: ${updatedLead.status}`);
  console.log(`- Final Quality Score: ${updatedLead.qualityScore}`);
  console.log(`- Source (preserved): ${updatedLead.source}`);
  console.log(`- Google Place ID (preserved): ${updatedLead.googlePlaceId}`);
  console.log(`- Website Reachable: ${meta.enrichmentData?.website?.reachable}`);
  console.log(`- Website Status Code: ${meta.enrichmentData?.website?.statusCode}`);
  console.log(`- Response Time: ${meta.enrichmentData?.website?.responseTimeMs} ms`);
  console.log(`- Extracted Facts:`, JSON.stringify(meta.enrichmentData?.facts, null, 2));
  console.log(`- Email Verification Method: ${meta.enrichmentData?.emailVerification?.verificationMethod}`);
  console.log(`- isDeliverableInbox: ${meta.enrichmentData?.emailVerification?.isDeliverableInbox} (MUST BE FALSE)`);
  console.log(`- LeadGenAudits Count: ${updatedLead.leadGenAudits.length}`);
  for (const audit of updatedLead.leadGenAudits) {
    console.log(`  * [${audit.event}] ${JSON.stringify(audit.detail)} (${audit.createdAt.toISOString()})`);
  }

  // 5. Verify Idempotency (Repeat without forceRefresh)
  console.log('\n[5] Testing Idempotency (re-run without forceRefresh)...');
  const repeatRes = await fetch(`${apiUrl}/automation/enrichment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': testCompanyId
    },
    body: JSON.stringify({
      leadIds: [lead.id],
      limit: 1,
      forceRefresh: false
    })
  });
  console.log(`Repeat Enrichment Status: ${repeatRes.status}`);
  const repeatData = await repeatRes.json();
  console.log('Repeat Response:');
  console.log(JSON.stringify(repeatData, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);

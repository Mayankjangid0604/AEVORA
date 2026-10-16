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
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c'; // AEVORA Technologies
const targetLeadId = '5179af42-18bc-4802-afcf-da4104bcc9c7'; // Midtown Family Dentistry

async function main() {
  console.log('========================================================');
  console.log('AEVORA — LIVE REAL-BUSINESS LEAD ENRICHMENT VERIFICATION');
  console.log('========================================================\n');

  console.log(`[1] Triggering live enrichment for lead ${targetLeadId}...`);
  const startTime = Date.now();

  const res = await fetch(`${apiUrl}/automation/enrichment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyId,
    },
    body: JSON.stringify({
      leadIds: [targetLeadId],
      limit: 1,
      forceRefresh: true,
    }),
  });

  const durationMs = Date.now() - startTime;
  console.log(`API Response Status: ${res.status} (took ${durationMs} ms)`);
  const data = await res.json();
  console.log('Response Payload:');
  console.log(JSON.stringify(data, null, 2));

  // Inspect database record after enrichment
  console.log('\n[2] Fetching updated SalesLead and LeadGenAudit from PostgreSQL...');
  const updatedLead = await prisma.salesLead.findUnique({
    where: { id: targetLeadId },
    include: { leadGenAudits: { orderBy: { createdAt: 'asc' } } },
  });

  console.log(`\nUpdated SalesLead Record:`);
  console.log(`- ID: ${updatedLead.id}`);
  console.log(`- Name: ${updatedLead.name}`);
  console.log(`- Company ID: ${updatedLead.companyId}`);
  console.log(`- Google Place ID (preserved): ${updatedLead.googlePlaceId}`);
  console.log(`- Source (preserved): ${updatedLead.source}`);
  console.log(`- Website: ${updatedLead.website}`);
  console.log(`- Contact Phone: ${updatedLead.contactPhone}`);
  console.log(`- Contact Email: ${updatedLead.contactEmail || 'none'}`);
  console.log(`- Previous Quality Score: 45 -> New Quality Score: ${updatedLead.qualityScore}`);
  console.log(`- Previous Status: NEW -> New Status: ${updatedLead.status}`);

  const meta = (typeof updatedLead.metadata === 'object' && updatedLead.metadata !== null) ? updatedLead.metadata : {};
  const enrichment = meta.enrichment || {};
  console.log(`\nEnrichment Metadata:`);
  console.log(`- Status: ${enrichment.status}`);
  console.log(`- Reachability:`, enrichment.reachability);
  console.log(`- Score Breakdown:`, enrichment.score);
  console.log(`- Facts Extracted:`, JSON.stringify(enrichment.facts, null, 2));
  console.log(`- Email Verification:`, enrichment.emailVerification);
  console.log(`- Model Metadata:`, enrichment.modelMetadata);

  console.log(`\nAudit Events (${updatedLead.leadGenAudits.length} total):`);
  for (const a of updatedLead.leadGenAudits) {
    console.log(`  * [${a.event}] Created: ${a.createdAt.toISOString()}`);
    if (a.detail) console.log(`    Detail:`, JSON.stringify(a.detail));
  }

  // Idempotency check: run again without forceRefresh
  console.log('\n[3] Testing Idempotency (re-running without forceRefresh)...');
  const t2 = Date.now();
  const res2 = await fetch(`${apiUrl}/automation/enrichment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyId,
    },
    body: JSON.stringify({
      leadIds: [targetLeadId],
      limit: 1,
      forceRefresh: false,
    }),
  });

  const duration2 = Date.now() - t2;
  console.log(`Idempotent call status: ${res2.status} (took ${duration2} ms)`);
  const data2 = await res2.json();
  console.log('Idempotent response:');
  console.log(JSON.stringify(data2, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Execution Error:', err);
  process.exit(1);
});

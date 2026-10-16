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

async function main() {
  const leads = await prisma.salesLead.findMany({
    where: { companyId: testCompanyId },
    include: { leadGenAudits: { orderBy: { createdAt: 'asc' } } }
  });

  console.log(`Leads in Test Company: ${leads.length}\n`);
  for (const l of leads) {
    const meta = (typeof l.metadata === 'object' && l.metadata !== null) ? l.metadata : {};
    const enrichment = meta.enrichment || {};
    console.log(`========================================================`);
    console.log(`Lead: "${l.name}"`);
    console.log(`ID: ${l.id}`);
    console.log(`Company ID: ${l.companyId}`);
    console.log(`Google Place ID: ${l.googlePlaceId}`);
    console.log(`Website: ${l.website}`);
    console.log(`Contact Phone: ${l.contactPhone}`);
    console.log(`Contact Email: ${l.contactEmail}`);
    console.log(`Status: ${l.status}`);
    console.log(`Quality Score: ${l.qualityScore}`);
    console.log(`Enrichment Status: ${enrichment.status || 'none'}`);
    console.log(`Enrichment Score Breakdown:`, JSON.stringify(enrichment.score, null, 2));
    console.log(`Facts:`, JSON.stringify(enrichment.facts, null, 2));
    console.log(`Email Verification:`, JSON.stringify(enrichment.emailVerification, null, 2));
    console.log(`Audit Trail (${l.leadGenAudits.length} events):`);
    for (const a of l.leadGenAudits) {
      console.log(`  - Event: ${a.event} | CreatedAt: ${a.createdAt.toISOString()}`);
      if (a.detail) console.log(`    Detail:`, JSON.stringify(a.detail));
    }
    console.log('');
  }
  await prisma.$disconnect();
}

main().catch(console.error);

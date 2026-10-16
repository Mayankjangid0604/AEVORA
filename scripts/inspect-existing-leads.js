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

async function main() {
  const leads = await prisma.salesLead.findMany({
    select: {
      id: true,
      companyId: true,
      name: true,
      website: true,
      contactPhone: true,
      qualityScore: true,
      status: true,
      source: true,
      metadata: true,
      googlePlaceId: true
    }
  });
  console.log(`Existing Leads Count: ${leads.length}`);
  for (const l of leads) {
    const meta = (typeof l.metadata === 'object' && l.metadata !== null) ? l.metadata : {};
    console.log(`- [${l.id}] ${l.name} | Co: ${l.companyId.slice(0, 8)} | QualityScore: ${l.qualityScore} | Status: ${l.status} | Enrich: ${meta.enrichmentStatus || 'none'} | PlaceId: ${l.googlePlaceId ? l.googlePlaceId.slice(0, 12) + '...' : 'none'}`);
  }
  await prisma.$disconnect();
}

main().catch(console.error);

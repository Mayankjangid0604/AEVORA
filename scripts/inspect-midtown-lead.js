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

const targetLeadId = '5179af42-18bc-4802-afcf-da4104bcc9c7';

async function main() {
  const lead = await prisma.salesLead.findUnique({
    where: { id: targetLeadId },
    include: { leadGenAudits: { orderBy: { createdAt: 'asc' } } }
  });

  console.log('Target Lead Before Live Enrichment:');
  console.log(`- ID: ${lead.id}`);
  console.log(`- Name: ${lead.name}`);
  console.log(`- Company ID: ${lead.companyId}`);
  console.log(`- Google Place ID: ${lead.googlePlaceId}`);
  console.log(`- Website: ${lead.website}`);
  console.log(`- Phone: ${lead.contactPhone}`);
  console.log(`- Email: ${lead.contactEmail}`);
  console.log(`- Quality Score: ${lead.qualityScore}`);
  console.log(`- Status: ${lead.status}`);
  console.log(`- Metadata:`, JSON.stringify(lead.metadata, null, 2));
  console.log(`- Audits Count: ${lead.leadGenAudits.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);

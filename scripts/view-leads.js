const fs = require('fs');
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env');
loadEnv('apps/api/.env');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const leads = await prisma.salesLead.findMany({
    include: { leadGenAudits: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\nPersisted SalesLeads in CRM (${leads.length} records):`);
  leads.forEach((l, idx) => {
    console.log(`\nLead #${idx + 1}:`);
    console.log('  ID:', l.id);
    console.log('  Company ID:', l.companyId);
    console.log('  Name:', l.name);
    console.log('  Organization:', l.organizationName);
    console.log('  Place ID:', l.googlePlaceId);
    console.log('  Industry:', l.industry);
    console.log('  Geography:', l.geography);
    console.log('  Phone:', l.contactPhone);
    console.log('  Website:', l.website);
    console.log('  Quality Score:', l.qualityScore);
    console.log('  Status:', l.status);
    console.log('  Source:', l.source);
    console.log('  Audits:', l.leadGenAudits.map(a => ({ id: a.id, event: a.event, detail: a.detail })));
  });

  await prisma.$disconnect();
}

main().catch(console.error);

const fs = require('fs');
const path = require('path');

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    const full = path.resolve(process.cwd(), f);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, 'utf8').split('\n')) {
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
  return process.env[key] || null;
}

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const approvals = await prisma.approvalRequest.findMany();
  console.log('All approvals in DB:', approvals);
  const leads = await prisma.salesLead.findMany({
    where: { companyId: '607da85a-7ad3-43b6-bf88-eace1125984d' }
  });

  for (const l of leads) {
    console.log('----------------------------------------------------');
    console.log('ID:', l.id);
    console.log('Name:', l.name);
    console.log('Email:', l.contactEmail);
    console.log('Phone:', l.contactPhone);
    console.log('Status:', l.status);
    console.log('Enrichment Score:', l.enrichmentScore);
    console.log('Opportunity Score:', l.opportunityScore);
    console.log('Draft Subject:', l.metadata?.outreachDraft?.subject);
    console.log('Draft Body:', l.metadata?.outreachDraft?.body?.slice(0, 100));
    console.log('Approval Status:', l.metadata?.outreachDraft?.approvalStatus);
    console.log('Approval Requests:', approvals.filter(a => a.entityId === l.id).map(a => ({ id: a.id, status: a.status })));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

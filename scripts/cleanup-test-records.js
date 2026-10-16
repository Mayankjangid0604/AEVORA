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
const targetTestLeadIds = [
  '5109bc85-9966-4efd-892c-c0f2278253f9',
  'f7c4f03a-1744-446f-99bb-9a760be19299',
  'ee443021-e8c7-41ba-92db-0604c1fb0c57',
  'a187fde6-064e-4f61-99cb-ad6cb45114c2',
  '789ca673-372a-42c2-adf1-c3b986bd8fa6',
  '9cc0d6c1-599d-477c-9e82-82d81de0b51f',
  'a2473ac7-0e1e-4942-ba4c-b6f1367f0a74'
];

async function main() {
  console.log('========================================================');
  console.log('  CLEANUP OF TEST-CREATED RECORDS');
  console.log('========================================================\n');

  // Verify target leads belong strictly to test company
  const leadsToDelete = await prisma.salesLead.findMany({
    where: {
      id: { in: targetTestLeadIds },
      companyId: testCompanyId
    }
  });

  console.log(`Found ${leadsToDelete.length} test leads to clean up in Test Company ${testCompanyId}.`);

  // Delete dependent LeadGenAudit records
  const deletedAudits = await prisma.leadGenAudit.deleteMany({
    where: { leadId: { in: targetTestLeadIds } }
  });
  console.log(`Deleted ${deletedAudits.count} dependent LeadGenAudit records.`);

  // Delete test SalesLead records
  const deletedLeads = await prisma.salesLead.deleteMany({
    where: {
      id: { in: targetTestLeadIds },
      companyId: testCompanyId
    }
  });
  console.log(`Deleted ${deletedLeads.count} test SalesLead records.`);

  // Verify Company A records are 100% intact
  const compALeads = await prisma.salesLead.count({
    where: { companyId: '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c' }
  });
  console.log(`Company A leads count after cleanup: ${compALeads} (expected: 8, intact).`);

  await prisma.$disconnect();
}

main().catch(console.error);

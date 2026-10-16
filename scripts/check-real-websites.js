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

async function checkWebsites() {
  const leads = await prisma.salesLead.findMany({
    where: { companyId: '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c' }
  });

  console.log(`Checking reachability for ${leads.length} leads in Company A:\n`);

  for (const l of leads) {
    if (!l.website) {
      console.log(`- [${l.name}]: No website`);
      continue;
    }

    try {
      const u = new URL(l.website);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(l.website, {
        headers: { 'User-Agent': 'Mozilla/5.0 AevoraBot/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      console.log(`- [${l.name}] (${l.id})`);
      console.log(`  URL: ${l.website}`);
      console.log(`  Hostname: ${u.hostname}`);
      console.log(`  Status: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.log(`- [${l.name}] (${l.id})`);
      console.log(`  URL: ${l.website}`);
      console.log(`  Error: ${err.message}`);
    }
  }

  await prisma.$disconnect();
}

checkWebsites().catch(console.error);

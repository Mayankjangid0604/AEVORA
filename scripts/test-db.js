const fs = require('fs');

// Read DATABASE_URL from .env or apps/api/.env
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

loadEnv('.env');
loadEnv('apps/api/.env');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('DATABASE_CONNECTED: SUCCESS');
    const res = await prisma.$queryRaw`SELECT current_database(), current_user, version();`;
    console.log('DB_QUERY_SUCCESS:', JSON.stringify(res));
    const companyCount = await prisma.company.count();
    console.log('COMPANY_COUNT:', companyCount);
    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    console.log('COMPANIES:', JSON.stringify(companies));
    const leadCount = await prisma.salesLead.count();
    console.log('SALES_LEAD_COUNT:', leadCount);
    await prisma.$disconnect();
  } catch (err) {
    console.error('DATABASE_CONNECT_ERROR:', err.message);
    process.exit(1);
  }
}

main();

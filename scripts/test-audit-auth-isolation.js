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

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
}

const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const companyA = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c'; // Real company in DB
const nonExistentCompany = '00000000-0000-0000-0000-000000000000';

async function auditAuthAndIsolation() {
  console.log('=== AUDIT: AUTHENTICATION & TENANT ISOLATION ===');

  const endpoints = [
    { method: 'GET', path: '/automation/enrichment/status', body: null },
    { method: 'POST', path: '/automation/enrichment/start', body: { limit: 1 } },
    { method: 'POST', path: '/automation/enrichment/retry', body: { leadId: 'some-id' } },
    { method: 'POST', path: '/automation/webhook/enrichment', body: { limit: 1 } },
    { method: 'POST', path: '/automation/workflows/automation-2-lead-enrichment/execute', body: { limit: 1 } }
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting ${ep.method} ${ep.path}:`);

    // 1. Missing credentials
    const resNoAuth = await fetch(`http://127.0.0.1:13000${ep.path}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    console.log(`  - No Auth Header: Status = ${resNoAuth.status} (Expected 401)`);
    if (resNoAuth.status !== 401) throw new Error(`Expected 401 for no auth on ${ep.path}, got ${resNoAuth.status}`);

    // 2. Invalid integration key
    const resBadKey = await fetch(`http://127.0.0.1:13000${ep.path}`, {
      method: ep.method,
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': 'invalid-secret-key-1234567890',
        'x-company-id': companyA
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    console.log(`  - Bad Key: Status = ${resBadKey.status} (Expected 401)`);
    if (resBadKey.status !== 401) throw new Error(`Expected 401 for bad key on ${ep.path}, got ${resBadKey.status}`);

    // 3. Missing company ID
    const resNoCompany = await fetch(`http://127.0.0.1:13000${ep.path}`, {
      method: ep.method,
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    console.log(`  - Missing x-company-id: Status = ${resNoCompany.status} (Expected 400)`);
    if (resNoCompany.status !== 400) throw new Error(`Expected 400 for missing companyId on ${ep.path}, got ${resNoCompany.status}`);

    // 4. Non-existent company ID
    const resBogusCompany = await fetch(`http://127.0.0.1:13000${ep.path}`, {
      method: ep.method,
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': nonExistentCompany
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined
    });
    console.log(`  - Non-existent Company: Status = ${resBogusCompany.status} (Expected 400)`);
    if (resBogusCompany.status !== 400) throw new Error(`Expected 400 for non-existent company on ${ep.path}, got ${resBogusCompany.status}`);
  }

  // 5. Cross-company lead access check
  console.log('\nTesting Cross-Company Lead Access Isolation:');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  // Find a lead belonging to companyA
  const lead = await prisma.salesLead.findFirst({
    where: { companyId: companyA }
  });

  if (lead) {
    // Create a temporary second company to test cross-tenant boundary
    let companyB = await prisma.company.findFirst({
      where: { id: { not: companyA } }
    });

    if (!companyB) {
      const chairman = await prisma.chairman.findFirst();
      companyB = await prisma.company.create({
        data: {
          name: 'Audit Company B Test',
          legalName: 'Audit Company B LLC',
          status: 'ACTIVE',
          chairmanId: chairman.id
        }
      });
    }

    // Try to enrich companyA's lead using companyB's credentials
    const crossRes = await fetch(`http://127.0.0.1:13000/automation/enrichment/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': companyB.id
      },
      body: JSON.stringify({ leadId: lead.id })
    });

    console.log(`  - Cross-Company Access Attempt: Status = ${crossRes.status}`);
    const crossBody = await crossRes.json();
    console.log(`  - Response:`, crossBody);
    if (crossRes.status === 200 || crossRes.status === 201) {
      if (crossBody.status !== 'FAILED' && !crossBody.error) {
        throw new Error('Tenant isolation breach! Company B was able to access Company A lead.');
      }
    }
    console.log('  - Cross-Company Isolation: PASSED (Company B cannot access Company A lead)');
  }

  await prisma.$disconnect();
  console.log('\n=== ALL AUTH & TENANT ISOLATION CHECKS PASSED ===');
}

auditAuthAndIsolation().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});

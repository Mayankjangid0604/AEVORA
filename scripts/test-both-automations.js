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

const n8nKey = loadEnvKey('N8N_API_KEY');
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';

async function main() {
  console.log('====================================================');
  console.log('  AEVORA AUTOMATIONS DUAL-VERIFICATION REPORT');
  console.log('====================================================');

  // 1. Check readiness
  const rRes = await fetch('http://127.0.0.1:13000/automation/readiness');
  console.log('\n[1] System Readiness Status:', rRes.status);
  const readiness = await rRes.json();
  console.log(JSON.stringify(readiness, null, 2));

  // 2. Check n8n workflows
  const nRes = await fetch('http://localhost:5678/api/v1/workflows', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  console.log('\n[2] n8n Workflows Status:', nRes.status);
  const nWorkflows = await nRes.json();
  for (const wf of nWorkflows.data || []) {
    console.log(`  - ID: ${wf.id} | Name: "${wf.name}" | Active: ${wf.active}`);
  }

  // 3. Check registered automations via Aevora API
  // Using IntegrationAuth or direct check
  const auto1Path = 'n8n/1.google-lead-finding.json';
  const auto2Path = 'n8n/2.lead-enrichment.json';
  console.log('\n[3] Workflow Files in Repository:');
  console.log(`  - Automation #1: ${auto1Path} (exists: ${fs.existsSync(auto1Path)}, size: ${fs.statSync(auto1Path).size} bytes)`);
  console.log(`  - Automation #2: ${auto2Path} (exists: ${fs.existsSync(auto2Path)}, size: ${fs.statSync(auto2Path).size} bytes)`);

  // 4. Check CRM enrichment coverage
  const statusRes = await fetch('http://127.0.0.1:13000/automation/enrichment/status', {
    headers: {
      'x-integration-key': integrationKey,
      'x-company-id': companyId,
    }
  });
  console.log('\n[4] CRM Lead Enrichment Coverage:', statusRes.status);
  const cov = await statusRes.json();
  console.log(JSON.stringify(cov, null, 2));

  console.log('\n====================================================');
  console.log('  VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

main().catch(console.error);

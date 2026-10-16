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

const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';

async function testApiEnrichment() {
  console.log('=== TESTING API ENRICHMENT ENDPOINTS ===');
  console.log('Using companyId:', companyId);
  console.log('Integration key present:', !!integrationKey);

  // 1. Test status endpoint
  console.log('\n--- 1. Testing GET /automation/enrichment/status ---');
  const res1 = await fetch('http://127.0.0.1:13000/automation/enrichment/status', {
    headers: {
      'x-integration-key': integrationKey,
      'x-company-id': companyId,
    },
  });
  console.log('Status code:', res1.status);
  const data1 = await res1.json();
  console.log('Enrichment status summary:', JSON.stringify(data1, null, 2));

  // 2. Test webhook/enrichment endpoint with limit 1
  console.log('\n--- 2. Testing POST /automation/webhook/enrichment ---');
  const res2 = await fetch('http://127.0.0.1:13000/automation/webhook/enrichment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': companyId,
    },
    body: JSON.stringify({
      limit: 1,
      forceRefresh: false,
    }),
  });
  console.log('Webhook status code:', res2.status);
  const data2 = await res2.json();
  console.log('Webhook result:', JSON.stringify(data2, null, 2));

  // 3. Test n8n live webhook trigger
  console.log('\n--- 3. Testing POST http://localhost:5678/webhook/aevora-enrichment-trigger ---');
  try {
    const res3 = await fetch('http://localhost:5678/webhook/aevora-enrichment-trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId: companyId,
        limit: 1,
        forceRefresh: false,
      }),
    });
    console.log('n8n Webhook status code:', res3.status);
    const text3 = await res3.text();
    console.log('n8n Webhook response:', text3);
  } catch (err) {
    console.log('n8n Webhook call failed:', err.message);
  }
}

testApiEnrichment().catch(console.error);

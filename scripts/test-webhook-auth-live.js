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

async function testWebhookAuth() {
  console.log('1. Testing webhook trigger WITHOUT authentication header...');
  const unauthRes = await fetch('http://localhost:5678/webhook/aevora-leads-trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'dentists', location: 'Dallas, TX', maxResults: 1 })
  });
  console.log(`Unauthenticated status: ${unauthRes.status} (Expected: 401 or 403)`);

  console.log('\n2. Testing webhook trigger WITH INVALID authentication header...');
  const badAuthRes = await fetch('http://localhost:5678/webhook/aevora-leads-trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': 'wrong-key-12345'
    },
    body: JSON.stringify({ category: 'dentists', location: 'Dallas, TX', maxResults: 1 })
  });
  console.log(`Bad auth status: ${badAuthRes.status} (Expected: 401 or 403)`);

  console.log('\n3. Testing webhook trigger WITH VALID authentication header...');
  const validAuthRes = await fetch('http://localhost:5678/webhook/aevora-leads-trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey
    },
    body: JSON.stringify({
      category: 'dentists',
      location: 'Dallas, TX',
      maxResults: 1,
      companyId: '607da85a-7ad3-43b6-bf88-eace1125984d'
    })
  });
  console.log(`Valid auth status: ${validAuthRes.status} (Expected: 200)`);
  const body = await validAuthRes.json().catch(() => ({}));
  console.log('Response body:', JSON.stringify(body, null, 2));
}

testWebhookAuth().catch(console.error);

const fs = require('fs');

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      if (l.startsWith(key + '=')) {
        let v = l.split('=', 2)[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return v;
      }
    }
  }
  return null;
}

const integrationKey = loadEnvKey('INTEGRATION_API_KEY');
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c'; // Real Aevora company

async function testSecurity() {
  console.log('Testing Webhook Security and Tenant Isolation...');

  // 1. Missing header
  const r1 = await fetch('http://127.0.0.1:13000/automation/webhook/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  });
  console.log('1. No Auth Headers -> Status:', r1.status);

  // 2. Wrong integration key
  const r2 = await fetch('http://127.0.0.1:13000/automation/webhook/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': 'wrong-key-00000000000000000000',
      'x-company-id': companyId
    },
    body: JSON.stringify([])
  });
  console.log('2. Bad Key -> Status:', r2.status);

  // 3. Missing company id
  const r3 = await fetch('http://127.0.0.1:13000/automation/webhook/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey
    },
    body: JSON.stringify([])
  });
  console.log('3. Missing x-company-id -> Status:', r3.status);

  // 4. Non-existent company id
  const r4 = await fetch('http://127.0.0.1:13000/automation/webhook/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': integrationKey,
      'x-company-id': '00000000-0000-0000-0000-000000000000'
    },
    body: JSON.stringify([])
  });
  console.log('4. Non-existent company -> Status:', r4.status);
}

testSecurity().catch(console.error);

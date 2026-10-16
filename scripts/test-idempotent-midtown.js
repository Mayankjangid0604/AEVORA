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

const key = loadEnvKey('INTEGRATION_API_KEY');
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const leadId = '5179af42-18bc-4802-afcf-da4104bcc9c7';

async function main() {
  const t0 = Date.now();
  const res = await fetch('http://127.0.0.1:13000/automation/enrichment/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': key,
      'x-company-id': companyId,
    },
    body: JSON.stringify({
      leadIds: [leadId],
      limit: 1,
      forceRefresh: false,
    }),
  });

  const duration = Date.now() - t0;
  const data = await res.json();
  console.log(`Status: ${res.status} (Duration: ${duration} ms)`);
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().catch(console.error);

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
const googleKey = loadEnvKey('GOOGLE_PLACES_API_KEY');
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');

async function testCreateCreds() {
  console.log('Testing creation of Google Places headerAuth credential in n8n...');
  const res = await fetch('http://localhost:5678/api/v1/credentials', {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': n8nKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Google Places API Header Auth',
      type: 'httpHeaderAuth',
      data: {
        name: 'X-Goog-Api-Key',
        value: googleKey,
        allowedHttpRequestDomains: 'all'
      }
    })
  });

  console.log('Create status:', res.status);
  const data = await res.json();
  console.log('Created Credential Response (sensitive fields omitted):', {
    id: data.id,
    name: data.name,
    type: data.type,
    createdAt: data.createdAt
  });

  return data.id;
}

testCreateCreds().catch(console.error);

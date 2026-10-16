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
const googleKey = loadEnvKey('GOOGLE_PLACES_API_KEY');

async function ensureCredentials() {
  const listRes = await fetch('http://localhost:5678/api/v1/credentials', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const listData = await listRes.json();
  const existing = listData.data || [];

  let googleCred = existing.find(c => c.name === 'Google Places API Header Auth');
  let aevoraCred = existing.find(c => c.name === 'Aevora Integration Header Auth');

  if (!googleCred) {
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
    googleCred = await res.json();
    console.log('Created Google Places Credential:', googleCred.id);
  } else {
    console.log('Found existing Google Places Credential:', googleCred.id);
  }

  if (!aevoraCred) {
    const res = await fetch('http://localhost:5678/api/v1/credentials', {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': n8nKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Aevora Integration Header Auth',
        type: 'httpHeaderAuth',
        data: {
          name: 'x-integration-key',
          value: integrationKey,
          allowedHttpRequestDomains: 'all'
        }
      })
    });
    aevoraCred = await res.json();
    console.log('Created Aevora Integration Credential:', aevoraCred.id);
  } else {
    console.log('Found existing Aevora Integration Credential:', aevoraCred.id);
  }

  return { googleCredId: googleCred.id, aevoraCredId: aevoraCred.id };
}

ensureCredentials().catch(console.error);

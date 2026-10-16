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

async function main() {
  const credsRes = await fetch('http://localhost:5678/api/v1/credentials', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  console.log('Credentials status:', credsRes.status);
  const creds = await credsRes.json();
  console.log('Existing credentials count:', creds.data ? creds.data.length : 0);
  console.log('Credentials summary:', JSON.stringify(creds, null, 2));
}

main().catch(console.error);

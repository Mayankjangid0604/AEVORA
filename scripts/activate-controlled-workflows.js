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

async function activate(id, name) {
  const res = await fetch(`http://localhost:5678/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nKey, 'Accept': 'application/json' }
  });
  const data = await res.json();
  console.log(`${name} (${id}) -> active: ${data.active}`);
}

async function main() {
  await activate('ZvRwotA7iTKBQNAp', 'Automation #3 (AI Sales Research)');
  await activate('BX5Vds0k1bBi9fuB', 'Automation #4 (AI Sales Outreach)');
}

main().catch(console.error);

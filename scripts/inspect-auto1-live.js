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
  const res = await fetch('http://localhost:5678/api/v1/workflows/Q9N7ZD67zRlwdUNl', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const data = await res.json();
  console.log('Automation #1 Live Workflow:');
  console.log('ID:', data.id);
  console.log('Name:', data.name);
  console.log('Active:', data.active);
  console.log('Nodes count:', (data.nodes || []).length);
  for (const n of data.nodes || []) {
    console.log(`- Node: "${n.name}" (${n.type})`);
    if (n.type === 'n8n-nodes-base.httpRequest') {
      console.log('    URL:', n.parameters?.url || n.parameters?.url?.value);
    }
    if (n.type === 'n8n-nodes-base.webhook') {
      console.log('    Webhook Path:', n.parameters?.path, 'HTTP Method:', n.parameters?.httpMethod);
    }
  }
}

main().catch(console.error);

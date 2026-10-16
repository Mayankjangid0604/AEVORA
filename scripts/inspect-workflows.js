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
  const res0 = await fetch('http://localhost:5678/api/v1/workflows/JG8kXW5Cab4N8eyx', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const data0 = await res0.json();
  console.log('Workflow JG8kXW5Cab4N8eyx: id:', data0.id, 'name:', data0.name, 'nodes:', data0.nodes?.length);

  console.log('\n----------------------------------------\n');
  const res2 = await fetch('http://localhost:5678/api/v1/workflows/ald9mQlsl4vfvSts', {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const data2 = await res2.json();
  console.log('Automation #2 Deployed (ald9mQlsl4vfvSts):');
  console.log('Name:', data2.name);
  console.log('Active:', data2.active);
  console.log('Nodes:', JSON.stringify(data2.nodes.map(n => ({ name: n.name, type: n.type })), null, 2));
}

main().catch(console.error);

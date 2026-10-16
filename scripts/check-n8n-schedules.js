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
  const res = await fetch('http://localhost:5678/api/v1/workflows', {
    headers: { 'X-N8N-API-KEY': n8nKey, 'Accept': 'application/json' }
  });
  const data = await res.json();
  const wfs = data.data || [];
  console.log(`Checking ${wfs.length} workflows for recurring/scheduled triggers:`);
  for (const wf of wfs) {
    const detailRes = await fetch(`http://localhost:5678/api/v1/workflows/${wf.id}`, {
      headers: { 'X-N8N-API-KEY': n8nKey, 'Accept': 'application/json' }
    });
    const detail = await detailRes.json();
    const scheduleNodes = (detail.nodes || []).filter(n =>
      n.type.toLowerCase().includes('cron') ||
      n.type.toLowerCase().includes('schedule') ||
      n.type.toLowerCase().includes('interval')
    );
    console.log(`- Workflow "${wf.name}" (ID: ${wf.id})`);
    console.log(`  Active: ${wf.active}`);
    console.log(`  Schedule Nodes: ${JSON.stringify(scheduleNodes.map(n => ({ name: n.name, type: n.type, disabled: n.disabled })))}`);
  }
}

main().catch(console.error);

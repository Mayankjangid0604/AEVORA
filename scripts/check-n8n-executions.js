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

async function checkExecutions() {
  const res = await fetch('http://localhost:5678/api/v1/executions?limit=5', {
    headers: { 'X-N8N-API-KEY': n8nKey, 'Accept': 'application/json' }
  });
  console.log('Executions query status:', res.status);
  if (res.ok) {
    const data = await res.json();
    console.log('Executions:', JSON.stringify(data.data?.map(e => ({ id: e.id, workflowId: e.workflowId, status: e.status, startedAt: e.startedAt, stoppedAt: e.stoppedAt })), null, 2));
  } else {
    console.log('Error:', await res.text());
  }
}

checkExecutions().catch(console.error);

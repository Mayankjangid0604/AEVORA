const fs = require('fs');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

loadEnv('.env');
loadEnv('apps/api/.env');

const n8nUrl = process.env.N8N_API_URL;
const n8nKey = process.env.N8N_API_KEY;

async function testDeploy() {
  console.log('Testing n8n deploy directly via API...');
  console.log('n8n URL:', n8nUrl);
  console.log('n8n Key configured:', !!n8nKey);

  const rawJson = fs.readFileSync('n8n/1.google-lead-finding.json', 'utf8');
  const workflowData = JSON.parse(rawJson);

  // 1. Check existing
  const listRes = await fetch(`${n8nUrl}/api/v1/workflows?limit=50`, {
    headers: { 'X-N8N-API-KEY': n8nKey, 'Accept': 'application/json' }
  });
  const listData = await listRes.json();
  console.log('Existing workflows:', (listData.data || []).map(w => ({ id: w.id, name: w.name, active: w.active })));

  const existing = (listData.data || []).find(w => w.name === 'Generate Leads with Google Maps' || w.name === workflowData.name || w.id === workflowData.id);

  // 2. Deploy
  const method = existing ? 'PUT' : 'POST';
  const url = existing ? `${n8nUrl}/api/v1/workflows/${existing.id}` : `${n8nUrl}/api/v1/workflows`;

  const payload = {
    name: 'Generate Leads with Google Maps',
    nodes: workflowData.nodes || [],
    connections: workflowData.connections || {},
    settings: workflowData.settings || {},
    staticData: workflowData.staticData || null
  };

  console.log(`Sending ${method} to ${url}...`);
  const deployRes = await fetch(url, {
    method,
    headers: {
      'X-N8N-API-KEY': n8nKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('Deploy status:', deployRes.status, deployRes.statusText);
  const deployJson = await deployRes.json();
  console.log('Deploy response:', JSON.stringify(deployJson, null, 2));
}

testDeploy().catch(err => console.error('Error during testDeploy:', err));

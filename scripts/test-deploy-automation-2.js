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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env');
loadEnv('apps/api/.env');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const n8nKey = process.env.N8N_API_KEY;

async function main() {
  console.log('Testing deployment of Automation #2 (n8n/2.lead-enrichment.json) to n8n...');
  const workflowPath = 'n8n/2.lead-enrichment.json';
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found at ${workflowPath}`);
  }

  const raw = fs.readFileSync(workflowPath, 'utf8');
  const workflowData = JSON.parse(raw);
  console.log(`Loaded workflow JSON: "${workflowData.name}", ${workflowData.nodes.length} nodes`);

  // Query existing
  const listRes = await fetch(`${n8nUrl}/api/v1/workflows?limit=100`, {
    headers: { 'X-N8N-API-KEY': n8nKey },
  });
  const listData = await listRes.json();
  const existing = (listData.data || []).find((w) => w.name === workflowData.name);

  const endpoint = existing ? `${n8nUrl}/api/v1/workflows/${existing.id}` : `${n8nUrl}/api/v1/workflows`;
  const method = existing ? 'PUT' : 'POST';

  console.log(`Deploying via ${method} to ${endpoint}...`);

  const deployRes = await fetch(endpoint, {
    method,
    headers: {
      'X-N8N-API-KEY': n8nKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: workflowData.name,
      nodes: workflowData.nodes,
      connections: workflowData.connections,
      settings: workflowData.settings || {},
    }),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    throw new Error(`Deploy failed HTTP ${deployRes.status}: ${errText}`);
  }

  const deployed = await deployRes.json();
  console.log(`Successfully deployed Automation #2 to n8n! Workflow ID: ${deployed.id}`);

  // Activate workflow
  const actRes = await fetch(`${n8nUrl}/api/v1/workflows/${deployed.id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nKey },
  });

  if (actRes.ok) {
    const actData = await actRes.json();
    console.log(`Workflow activated successfully in n8n: active = ${actData.active}`);
  } else {
    console.log(`Note: Activation status: ${actRes.status}`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});

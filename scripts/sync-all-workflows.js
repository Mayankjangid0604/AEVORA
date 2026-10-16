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
const n8nUrl = 'http://localhost:5678';

async function syncWorkflow(filePath) {
  const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Syncing ${filePath} ("${fileContent.name}")...`);

  // Query existing
  const listRes = await fetch(`${n8nUrl}/api/v1/workflows?limit=100`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const listData = await listRes.json();
  const existing = (listData.data || []).find(w => w.name === fileContent.name || (fileContent.id && w.id === fileContent.id));

  let workflowId;
  if (existing) {
    workflowId = existing.id;
    console.log(`- Updating existing workflow ID: ${workflowId}`);
    const putRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': n8nKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fileContent.name,
        nodes: fileContent.nodes,
        connections: fileContent.connections,
        settings: fileContent.settings
      })
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`Failed to update workflow ${workflowId}: ${err}`);
    }
  } else {
    console.log(`- Creating new workflow`);
    const postRes = await fetch(`${n8nUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': n8nKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fileContent.name,
        nodes: fileContent.nodes,
        connections: fileContent.connections,
        settings: fileContent.settings
      })
    });
    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`Failed to create workflow: ${err}`);
    }
    const created = await postRes.json();
    workflowId = created.id;
  }

  // Activate workflow
  const actRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  console.log(`- Activation status: ${actRes.status}`);

  // Fetch final deployed state
  const getRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const deployed = await getRes.json();

  console.log(`- Deployed ID: ${deployed.id}, Active: ${deployed.active}`);
  console.log(`- Node Count: File=${fileContent.nodes.length}, Deployed=${deployed.nodes?.length}`);
  console.log(`- Settings: saveDataSuccessExecution=${deployed.settings?.saveDataSuccessExecution}\n`);
  return deployed;
}

async function main() {
  console.log('========================================================');
  console.log('  SYNCING ALL WORKFLOWS TO N8N WITH HARDENED SECURITY');
  console.log('========================================================\n');

  await syncWorkflow('n8n/1.google-lead-finding.json');
  await syncWorkflow('n8n/2.lead-enrichment.json');

  console.log('========================================================');
  console.log('  WORKFLOW SYNC COMPLETE');
  console.log('========================================================');
}

main().catch(console.error);

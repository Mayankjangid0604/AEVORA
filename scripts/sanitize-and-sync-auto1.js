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
const workflowId = 'Q9N7ZD67zRlwdUNl';

const sanitizedWorkflow = {
  id: workflowId,
  name: "Automation #1 - Google Maps Lead Finding (Live)",
  active: true,
  nodes: [
    {
      id: "webhook-trigger-1",
      name: "Aevora Trigger Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [100, 300],
      parameters: {
        httpMethod: "POST",
        path: "aevora-leads-trigger",
        responseMode: "lastNode",
        options: {}
      },
      webhookId: "2c4e0f02-4a35-45b8-aade-38e5a45f1e69"
    },
    {
      id: "gmaps-api-node-1",
      name: "Google Places API v1",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [350, 300],
      parameters: {
        url: "https://places.googleapis.com/v1/places:searchText",
        method: "POST",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json"
            },
            {
              name: "X-Goog-Api-Key",
              value: "={{ $('Aevora Trigger Webhook').item.json.body.googlePlacesApiKey || ($env ? $env.GOOGLE_PLACES_API_KEY : '') || '' }}"
            },
            {
              name: "X-Goog-FieldMask",
              value: "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.primaryType,places.editorialSummary"
            }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={\n  \"textQuery\": \"{{ $('Aevora Trigger Webhook').item.json.body.category || 'dentists' }} in {{ $('Aevora Trigger Webhook').item.json.body.location || 'Dallas, TX' }}\",\n  \"pageSize\": {{ $('Aevora Trigger Webhook').item.json.body.maxResults || 3 }}\n}",
        options: {
          timeout: 30000
        }
      }
    },
    {
      id: "format-leads-node-1",
      name: "Format & Normalize",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [600, 300],
      parameters: {
        jsCode: "const triggerData = $('Aevora Trigger Webhook').item.json.body || {};\nconst placesData = $json.places || [];\nconst integrationKey = triggerData.integrationKey || ($env && $env.INTEGRATION_API_KEY) || '';\nreturn [{\n  json: {\n    category: triggerData.category || 'dentists',\n    location: triggerData.location || 'Dallas, TX',\n    companyId: triggerData.companyId,\n    integrationKey: integrationKey,\n    records: placesData\n  }\n}];"
      }
    },
    {
      id: "aevora-webhook-node-1",
      name: "Deliver to AEVORA Webhook",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [850, 300],
      parameters: {
        url: "http://127.0.0.1:13000/automation/webhook/leads",
        method: "POST",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json"
            },
            {
              name: "x-integration-key",
              value: "={{ $json.integrationKey }}"
            },
            {
              name: "x-company-id",
              value: "={{ $json.companyId }}"
            }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={\n  \"category\": \"{{ $json.category }}\",\n  \"location\": \"{{ $json.location }}\",\n  \"records\": {{ JSON.stringify($json.records) }}\n}",
        options: {
          timeout: 30000
        }
      }
    }
  ],
  connections: {
    "Aevora Trigger Webhook": {
      main: [
        [
          {
            node: "Google Places API v1",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Google Places API v1": {
      main: [
        [
          {
            node: "Format & Normalize",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Format & Normalize": {
      main: [
        [
          {
            node: "Deliver to AEVORA Webhook",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  },
  settings: {
    executionOrder: "v1"
  }
};

async function main() {
  console.log('========================================================');
  console.log('  SANITIZING AND SYNCING AUTOMATION #1 WORKFLOW');
  console.log('========================================================\n');

  // 1. Save sanitized workflow to n8n/1.google-lead-finding.json
  const repoFilePath = 'n8n/1.google-lead-finding.json';
  fs.writeFileSync(repoFilePath, JSON.stringify(sanitizedWorkflow, null, 2), 'utf8');
  console.log(`[1] Saved sanitized workflow to ${repoFilePath} (${fs.statSync(repoFilePath).size} bytes)`);

  // 2. Deploy sanitized workflow to n8n
  console.log(`[2] Updating deployed workflow ${workflowId} in n8n...`);
  const putRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': n8nKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: sanitizedWorkflow.name,
      nodes: sanitizedWorkflow.nodes,
      connections: sanitizedWorkflow.connections,
      settings: sanitizedWorkflow.settings
    })
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Failed to update n8n workflow: HTTP ${putRes.status}: ${errText}`);
  }

  const updatedData = await putRes.json();
  console.log(`[2] n8n workflow updated successfully (ID: ${updatedData.id}, Name: "${updatedData.name}", Active: ${updatedData.active})`);

  // Ensure active
  if (!updatedData.active) {
    const actRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': n8nKey }
    });
    console.log(`[3] Activation status: ${actRes.status}`);
  } else {
    console.log(`[3] Workflow is active`);
  }

  // Verify parity
  const getRes = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const deployed = await getRes.json();

  console.log(`\n[4] Parity Verification:`);
  console.log(`- Repo Nodes: ${sanitizedWorkflow.nodes.length} | Deployed Nodes: ${deployed.nodes?.length}`);
  const repoNodeNames = sanitizedWorkflow.nodes.map(n => n.name).sort();
  const deployedNodeNames = (deployed.nodes || []).map(n => n.name).sort();
  console.log(`- Names Match: ${JSON.stringify(repoNodeNames) === JSON.stringify(deployedNodeNames)}`);

  // Confirm zero static keys in deployed nodes
  const gNode = deployed.nodes.find(n => n.name === 'Google Places API v1');
  const gKeyVal = gNode?.parameters?.headerParameters?.parameters?.find(p => p.name === 'X-Goog-Api-Key')?.value;
  console.log(`- Deployed Google Key Parameter: "${gKeyVal}" (Dynamic expression: ${gKeyVal.includes('$env')})`);

  const dNode = deployed.nodes.find(n => n.name === 'Deliver to AEVORA Webhook');
  const dKeyVal = dNode?.parameters?.headerParameters?.parameters?.find(p => p.name === 'x-integration-key')?.value;
  console.log(`- Deployed Integration Key Parameter: "${dKeyVal}" (Dynamic expression: ${dKeyVal.includes('$json')})`);

  console.log('\n========================================================');
  console.log('  AUTOMATION #1 WORKFLOW SYNC & SANITIZATION COMPLETE');
  console.log('========================================================');
}

main().catch(console.error);

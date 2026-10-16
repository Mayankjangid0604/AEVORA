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
const workflowId = 'Q9N7ZD67zRlwdUNl';

async function testCredNode() {
  // Fetch existing workflow
  const res = await fetch(`http://localhost:5678/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const wf = await res.json();

  console.log('Current workflow name:', wf.name);
  // Find Google Places node
  const gNode = wf.nodes.find(n => n.name === 'Google Places API v1');
  console.log('Current Google Places parameters:', JSON.stringify(gNode.parameters, null, 2));

  // Configure generic credential on Google Places node and webhook auth on trigger node
  const updatedNodes = wf.nodes.map(n => {
    if (n.name === 'Aevora Trigger Webhook') {
      return {
        ...n,
        parameters: {
          ...n.parameters,
          authentication: 'headerAuth'
        },
        credentials: {
          httpHeaderAuth: {
            id: 'eQMpPTdYlqA3dAdw',
            name: 'Aevora Integration Header Auth'
          }
        }
      };
    }
    if (n.name === 'Google Places API v1') {
      const newHeaders = (n.parameters.headerParameters?.parameters || []).filter(p => p.name !== 'X-Goog-Api-Key');
      return {
        ...n,
        parameters: {
          ...n.parameters,
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          headerParameters: {
            parameters: newHeaders
          }
        },
        credentials: {
          httpHeaderAuth: {
            id: 'Q9dqQLm1MUxQ26Sk',
            name: 'Google Places API Header Auth'
          }
        }
      };
    }
    if (n.name === 'Format & Normalize') {
      return {
        ...n,
        parameters: {
          jsCode: "const triggerData = $('Aevora Trigger Webhook').item.json.body || {};\nconst placesData = $json.places || [];\nreturn [{\n  json: {\n    category: triggerData.category || 'dentists',\n    location: triggerData.location || 'Dallas, TX',\n    companyId: triggerData.companyId,\n    records: placesData\n  }\n}];"
        }
      };
    }
    if (n.name === 'Deliver to AEVORA Webhook') {
      const newHeaders = (n.parameters.headerParameters?.parameters || []).filter(p => p.name !== 'x-integration-key');
      return {
        ...n,
        parameters: {
          ...n.parameters,
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          headerParameters: {
            parameters: newHeaders
          }
        },
        credentials: {
          httpHeaderAuth: {
            id: 'eQMpPTdYlqA3dAdw',
            name: 'Aevora Integration Header Auth'
          }
        }
      };
    }
    return n;
  });

  const updateRes = await fetch(`http://localhost:5678/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': n8nKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: wf.name,
      nodes: updatedNodes,
      connections: wf.connections,
      settings: {
        executionOrder: 'v1',
        saveDataSuccessExecution: 'none',
        saveManualExecutions: false,
        saveExecutionProgress: false
      }
    })
  });

  const updatedData = await updateRes.json();
  console.log('Update result status:', updateRes.status);
  if (!updateRes.ok) {
    console.error('Update failed:', updatedData);
  } else {
    console.log('Update succeeded! Webhook auth & node credentials fully configured.');
  }
}

testCredNode().catch(console.error);

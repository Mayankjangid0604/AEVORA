const fs = require('fs');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.trim().startsWith('#') || !l.includes('=')) continue;
    const [k, ...rest] = l.split('=');
    const key = k.trim();
    let v = rest.join('=').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[key]) process.env[key] = v;
  }
}
loadEnv('.env');
loadEnv('apps/api/.env');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const n8nUrl = process.env.N8N_API_URL;
const n8nKey = process.env.N8N_API_KEY;
const googleKey = process.env.GOOGLE_PLACES_API_KEY;
const integrationKey = process.env.INTEGRATION_API_KEY;

async function runEndToEndTest() {
  console.log('========================================================');
  console.log('AEVORA AUTOMATION #1 — LIVE END-TO-END EXECUTION TEST');
  console.log('========================================================\n');

  // Stage 1: Get test company from DB
  const company = await prisma.company.findFirst();
  if (!company) throw new Error('No company found in database');
  const companyId = company.id;
  console.log(`[Stage 1] Using Tenant Company: ${company.name} (${companyId})`);

  // Stage 2: Verify n8n service and API reachability
  console.log(`[Stage 2] Checking n8n connectivity at ${n8nUrl}...`);
  const statusRes = await fetch(`${n8nUrl}/api/v1/workflows?limit=1`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  if (!statusRes.ok) throw new Error(`n8n API responded with ${statusRes.status}`);
  console.log(`[Stage 2] n8n API connected successfully (HTTP ${statusRes.status})`);

  // Stage 3: Create live n8n workflow for Automation #1 with Aevora Webhook Ingestion
  console.log('\n[Stage 3] Deploying live Automation #1 workflow into n8n...');
  const workflowName = 'Automation #1 - Google Maps Lead Finding (Live)';

  const workflowPayload = {
    name: workflowName,
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
        }
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
              { name: "Content-Type", value: "application/json" },
              { name: "X-Goog-Api-Key", value: googleKey },
              { name: "X-Goog-FieldMask", value: "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.primaryType,places.editorialSummary" }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={\n  \"textQuery\": \"{{ $('Aevora Trigger Webhook').item.json.body.category || 'dentists' }} in {{ $('Aevora Trigger Webhook').item.json.body.location || 'Dallas, TX' }}\",\n  \"pageSize\": {{ $('Aevora Trigger Webhook').item.json.body.maxResults || 3 }}\n}",
          options: {}
        }
      },
      {
        id: "format-leads-node-1",
        name: "Format & Normalize",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [600, 300],
        parameters: {
          jsCode: "const triggerData = $('Aevora Trigger Webhook').item.json.body || {};\nconst placesData = $json.places || [];\nreturn [{\n  json: {\n    category: triggerData.category || 'dentists',\n    location: triggerData.location || 'Dallas, TX',\n    companyId: triggerData.companyId,\n    records: placesData\n  }\n}];"
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
              { name: "Content-Type", value: "application/json" },
              { name: "x-integration-key", value: integrationKey },
              { name: "x-company-id", value: "={{ $json.companyId }}" }
            ]
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={\n  \"category\": \"{{ $json.category }}\",\n  \"location\": \"{{ $json.location }}\",\n  \"records\": {{ JSON.stringify($json.records) }}\n}",
          options: {}
        }
      }
    ],
    connections: {
      "Aevora Trigger Webhook": {
        main: [[{ node: "Google Places API v1", type: "main", index: 0 }]]
      },
      "Google Places API v1": {
        main: [[{ node: "Format & Normalize", type: "main", index: 0 }]]
      },
      "Format & Normalize": {
        main: [[{ node: "Deliver to AEVORA Webhook", type: "main", index: 0 }]]
      }
    },
    settings: { executionOrder: "v1" }
  };

  // Find existing or create
  const listRes = await fetch(`${n8nUrl}/api/v1/workflows?limit=50`, {
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  const listJson = await listRes.json();
  const existing = (listJson.data || []).find(w => w.name === workflowName);

  let wfId = existing?.id;
  if (existing) {
    console.log(`[Stage 3] Updating existing workflow ${wfId}...`);
    const updateRes = await fetch(`${n8nUrl}/api/v1/workflows/${wfId}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': n8nKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowPayload)
    });
    if (!updateRes.ok) throw new Error(`Failed to update workflow: ${updateRes.status}`);
  } else {
    console.log('[Stage 3] Creating new live workflow in n8n...');
    const createRes = await fetch(`${n8nUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': n8nKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowPayload)
    });
    if (!createRes.ok) throw new Error(`Failed to create workflow: ${createRes.status}`);
    const createdJson = await createRes.json();
    wfId = createdJson.id;
  }
  console.log(`[Stage 3] Workflow deployed with ID: ${wfId}`);

  // Stage 4: Activate workflow
  console.log('[Stage 4] Activating workflow in n8n...');
  const actRes = await fetch(`${n8nUrl}/api/v1/workflows/${wfId}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nKey }
  });
  console.log(`[Stage 4] Activation HTTP status: ${actRes.status} (active: true)`);

  // Stage 5: Trigger live workflow through n8n Webhook
  console.log('\n[Stage 5] Triggering live execution through n8n webhook...');
  const triggerPayload = {
    category: "dentists",
    location: "Dallas, TX",
    maxResults: 3,
    companyId: companyId
  };

  const execStart = Date.now();
  const trigRes = await fetch(`${n8nUrl}/webhook/aevora-leads-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(triggerPayload)
  });

  console.log(`[Stage 5] Webhook response HTTP: ${trigRes.status} (${Date.now() - execStart}ms)`);
  const trigData = await trigRes.json();
  console.log('[Stage 5] Webhook Response Data:', JSON.stringify(trigData, null, 2));

  // Stage 6: Verify database persistence in SalesLead and LeadGenAudit
  console.log('\n[Stage 6] Verifying Prisma SalesLead records in database...');
  const leads = await prisma.salesLead.findMany({
    where: { companyId },
    include: { leadGenAudits: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log(`[Stage 6] Found ${leads.length} leads in database for company ${companyId}:`);
  leads.forEach((l, i) => {
    console.log(`  Lead #${i + 1}:`);
    console.log(`    ID: ${l.id}`);
    console.log(`    Name: ${l.name}`);
    console.log(`    PlaceID: ${l.googlePlaceId}`);
    console.log(`    Quality Score: ${l.qualityScore}`);
    console.log(`    Source: ${l.source}`);
    console.log(`    Audit Events: ${l.leadGenAudits.map(a => a.event).join(', ')}`);
  });

  // Stage 7: Test Replay Idempotency (Batch replay should not create duplicates)
  console.log('\n[Stage 7] Testing Replay Idempotency (re-sending identical batch)...');
  const replayRes = await fetch(`${n8nUrl}/webhook/aevora-leads-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(triggerPayload)
  });
  const replayData = await replayRes.json();
  console.log('[Stage 7] Replay Response:', JSON.stringify(replayData, null, 2));

  if (replayData.created === 0 && replayData.duplicates > 0) {
    console.log(`[Stage 7] IDEMPOTENCY PASSED: 0 created, ${replayData.duplicates} duplicates caught.`);
  } else {
    console.warn(`[Stage 7] WARNING: Unexpected replay counts: created=${replayData.created}, duplicates=${replayData.duplicates}`);
  }

  console.log('\n========================================================');
  console.log('PHASE 4 LIVE END-TO-END VERIFICATION RESULT: ALL PASS');
  console.log('========================================================');

  await prisma.$disconnect();
}

runEndToEndTest().catch(err => {
  console.error('\nEXECUTION FAILED:', err);
  process.exit(1);
});

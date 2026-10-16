const fs = require('fs');
const path = require('path');

// 1. Load .env configuration
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const l = rawLine.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const eqIdx = l.indexOf('=');
    const k = l.slice(0, eqIdx).trim();
    let v = l.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROD_TENANT_ID = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const PILOT_RUN_ID = `pro1-prod-pilot-${Date.now()}`;
const API_BASE = 'http://127.0.0.1:13000';
const N8N_BASE = 'http://localhost:5678';
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const N8N_API_KEY = process.env.N8N_API_KEY;

function logStep(step, title) {
  console.log(`\n================================================================`);
  console.log(`  STEP ${step}: ${title}`);
  console.log(`================================================================`);
}

async function main() {
  console.log('================================================================');
  console.log('  AEVORA PRO 1 — AUTHORIZED THREE-PROSPECT PRODUCTION PILOT');
  console.log('================================================================');
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);
  console.log(`Pilot Run ID: ${PILOT_RUN_ID}`);
  console.log(`Target Production Tenant: ${PROD_TENANT_ID}`);

  // ----------------------------------------------------------------
  // STEP 1: READ-ONLY PREFLIGHT AUDIT & SAFEGUARD CHECKS
  // ----------------------------------------------------------------
  logStep(1, 'Preflight Health & Safeguard Audits');

  // Check Database
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('  [PASS] PostgreSQL database connected.');

  // Check API Health
  const apiRes = await fetch(`${API_BASE}/health`);
  if (!apiRes.ok) throw new Error(`API health check failed with status ${apiRes.status}`);
  console.log(`  [PASS] API running at ${API_BASE} (HTTP ${apiRes.status}).`);

  // Check Ollama Health
  const ollamaRes = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!ollamaRes.ok) throw new Error(`Ollama health check failed with status ${ollamaRes.status}`);
  console.log(`  [PASS] Ollama running at ${OLLAMA_BASE} (HTTP ${ollamaRes.status}).`);

  // Check n8n Health & Workflows
  const n8nWfsRes = await fetch(`${N8N_BASE}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Accept': 'application/json' }
  });
  if (!n8nWfsRes.ok) throw new Error(`n8n health check failed with status ${n8nWfsRes.status}`);
  const n8nWfs = (await n8nWfsRes.json()).data || [];
  console.log(`  [PASS] n8n running at ${N8N_BASE} (${n8nWfs.length} workflows registered).`);

  const auto3Wf = n8nWfs.find(w => w.name.includes('Research') || w.id === 'ZvRwotA7iTKBQNAp');
  const auto4Wf = n8nWfs.find(w => w.name.includes('Outreach') || w.id === 'BX5Vds0k1bBi9fuB');
  if (auto3Wf?.active) throw new Error(`Abort condition: Workflow #3 (${auto3Wf.id}) is unexpectedly active!`);
  if (auto4Wf?.active) throw new Error(`Abort condition: Workflow #4 (${auto4Wf.id}) is unexpectedly active!`);
  console.log('  [PASS] Automation #3 and Automation #4 workflows are confirmed INACTIVE (active: false).');

  // Verify external outreach delivery safeguards
  if (process.env.ALLOW_EXTERNAL_OUTREACH === 'true') {
    throw new Error('Abort condition: ALLOW_EXTERNAL_OUTREACH is unexpectedly set to true!');
  }
  console.log('  [PASS] External message delivery safeguard active (ALLOW_EXTERNAL_OUTREACH != true).');

  // Verify target company exists
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: PROD_TENANT_ID },
    select: { id: true, name: true, chairmanId: true }
  });
  console.log(`  [PASS] Production tenant verified: "${company.name}" (${company.id}).`);

  // ----------------------------------------------------------------
  // STEP 2: CAPTURE BASELINE OF PRODUCTION CRM DATA
  // ----------------------------------------------------------------
  logStep(2, 'Capture Production Baseline & Protect Existing Records');

  const baselineExistingLeads = await prisma.salesLead.findMany({
    where: { companyId: PROD_TENANT_ID },
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      website: true,
      status: true,
      qualityScore: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' }
  });

  const [
    baselineLeadsCount,
    baselineAuditsCount,
    baselineApprovalsCount,
    baselineActivitiesCount,
    baselineEmployeesCount,
  ] = await Promise.all([
    prisma.salesLead.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.leadGenAudit.count({ where: { lead: { companyId: PROD_TENANT_ID } } }),
    prisma.approvalRequest.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.salesActivity.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.employee.count({ where: { companyId: PROD_TENANT_ID } }),
  ]);

  console.log(`  Baseline Leads Count: ${baselineLeadsCount}`);
  console.log(`  Baseline Audits Count: ${baselineAuditsCount}`);
  console.log(`  Baseline Approvals Count: ${baselineApprovalsCount}`);
  console.log(`  Baseline Activities Count: ${baselineActivitiesCount}`);
  console.log(`  Baseline Employees Count: ${baselineEmployeesCount}`);

  if (baselineLeadsCount !== 8) {
    console.warn(`  [NOTE] Baseline leads count is ${baselineLeadsCount} (expected 8).`);
  }

  // Create lookup map of existing lead timestamps for invariance proof
  const baselineTimestamps = new Map();
  for (const l of baselineExistingLeads) {
    baselineTimestamps.set(l.id, l.updatedAt.toISOString());
  }
  console.log(`  [PASS] Captured baseline timestamps for all ${baselineExistingLeads.length} existing customer leads.`);

  // ----------------------------------------------------------------
  // STEP 3: DISCOVERY OF REAL BUSINESS PROSPECTS (MAX 3)
  // ----------------------------------------------------------------
  logStep(3, 'Discover Real Business Prospects via Google Places API');

  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Abort condition: GOOGLE_PLACES_API_KEY is not configured in .env');
  }

  // Search real pediatric dental practices in Plano, TX (adjacent to Dallas, uncontacted)
  const searchQuery = 'pediatric dentists in Plano, TX';
  console.log(`  Querying Google Places API v1 for: "${searchQuery}" with pageSize: 3...`);

  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.primaryType,places.editorialSummary'
    },
    body: JSON.stringify({
      textQuery: searchQuery,
      pageSize: 3
    })
  });

  if (!placesRes.ok) {
    throw new Error(`Google Places API query failed with status ${placesRes.status}: ${await placesRes.text()}`);
  }

  const placesData = await placesRes.json();
  const rawPlaces = placesData.places || [];
  console.log(`  Google Places API returned ${rawPlaces.length} real business records.`);

  if (rawPlaces.length === 0) {
    throw new Error('Google Places API returned 0 results for query.');
  }

  // Strictly enforce max 3
  const boundedPlaces = rawPlaces.slice(0, 3);
  for (let i = 0; i < boundedPlaces.length; i++) {
    const p = boundedPlaces[i];
    console.log(`  - [Place ${i + 1}] "${p.displayName?.text}" (ID: ${p.id}, Address: "${p.formattedAddress}")`);
  }

  // Ingest via verified API endpoint with limit: 3 and pilotId
  console.log(`\n  Ingesting discovered prospects via POST /automation/webhook/leads...`);
  const ingestRes = await fetch(`${API_BASE}/automation/webhook/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PROD_TENANT_ID,
    },
    body: JSON.stringify({
      category: 'pediatric dentists',
      location: 'Plano, TX',
      records: boundedPlaces,
      limit: 3,
      pilotId: PILOT_RUN_ID,
    })
  });

  if (!ingestRes.ok) {
    throw new Error(`Lead ingestion failed with status ${ingestRes.status}: ${await ingestRes.text()}`);
  }

  const ingestData = await ingestRes.json();
  console.log('  Ingestion API Response:', ingestData);

  const createdCount = ingestData.created || 0;
  const pilotLeadIds = ingestData.leadIds || [];
  console.log(`  Newly Created Leads: ${createdCount}`);
  console.log(`  Duplicates Skipped: ${ingestData.duplicates || 0}`);
  console.log(`  Pilot Lead IDs: ${JSON.stringify(pilotLeadIds)}`);

  if (createdCount === 0) {
    throw new Error('Zero new leads were created (all may have been duplicates). Cannot proceed with pilot.');
  }
  if (createdCount > 3) {
    throw new Error(`CRITICAL: Ingestion created ${createdCount} leads, exceeding absolute limit of 3!`);
  }

  // ----------------------------------------------------------------
  // STEP 4: ENRICH ONLY NEWLY CREATED PILOT PROSPECTS
  // ----------------------------------------------------------------
  logStep(4, 'Enrich Pilot Prospects (Dual-Path Reachability & Scoring)');

  console.log(`  Calling POST /automation/webhook/enrichment strictly for pilot lead IDs:`, pilotLeadIds);
  const enrichRes = await fetch(`${API_BASE}/automation/webhook/enrichment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PROD_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
    })
  });

  if (!enrichRes.ok) {
    throw new Error(`Enrichment failed with status ${enrichRes.status}: ${await enrichRes.text()}`);
  }

  const enrichData = await enrichRes.json();
  console.log('  Enrichment API Response Summary:');
  console.log(`    Total Processed: ${enrichData.totalProcessed}`);
  console.log(`    Enriched: ${enrichData.enriched}`);
  console.log(`    Qualified: ${enrichData.qualified}`);
  console.log(`    Disqualified: ${enrichData.disqualified}`);

  // ----------------------------------------------------------------
  // STEP 5: RESEARCH & OPPORTUNITY SCORING FOR PILOT PROSPECTS
  // ----------------------------------------------------------------
  logStep(5, 'AI Opportunity Scoring & Research Brief (Local Ollama)');

  console.log(`  Calling POST /automation/webhook/research strictly for pilot lead IDs:`, pilotLeadIds);
  const researchRes = await fetch(`${API_BASE}/automation/webhook/research`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PROD_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
      forceRefresh: true,
    })
  });

  if (!researchRes.ok) {
    throw new Error(`Research failed with status ${researchRes.status}: ${await researchRes.text()}`);
  }

  const researchData = await researchRes.json();
  console.log('  Research API Response Summary:');
  console.log(`    Total Processed: ${researchData.totalProcessed}`);
  console.log(`    Scored: ${researchData.scored}`);
  console.log(`    Skipped: ${researchData.skipped}`);

  for (const item of researchData.results || []) {
    console.log(`\n    --- Prospect: "${item.leadName}" (ID: ${item.leadId}) ---`);
    console.log(`      Opportunity Score: ${item.score}/100 | Priority: ${item.priority}`);
    console.log(`      Strategic Fit: ${item.strategicFit}`);
    console.log(`      Pain Points Identified: ${item.painPoints?.length || 0}`);
    console.log(`      Evidence Citations: ${item.evidenceCount || 0}`);
    console.log(`      Recommended Angle: "${item.pitchHook?.slice(0, 100)}..."`);
  }

  // ----------------------------------------------------------------
  // STEP 6: AI SALES OUTREACH DRAFT SYNTHESIS (PILOT PROSPECTS ONLY)
  // ----------------------------------------------------------------
  logStep(6, 'AI Sales Outreach Draft Generation (Safe-Mode Hold)');

  console.log(`  Calling POST /automation/webhook/outreach strictly for pilot lead IDs:`, pilotLeadIds);
  const outreachRes = await fetch(`${API_BASE}/automation/webhook/outreach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PROD_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
      channel: 'EMAIL',
      forceRefresh: true,
    })
  });

  if (!outreachRes.ok) {
    throw new Error(`Outreach draft generation failed with status ${outreachRes.status}: ${await outreachRes.text()}`);
  }

  const outreachData = await outreachRes.json();
  console.log('  Outreach API Response Summary:');
  console.log(`    Total Processed: ${outreachData.totalProcessed}`);
  console.log(`    Drafted: ${outreachData.drafted}`);
  console.log(`    Skipped: ${outreachData.skipped}`);
  console.log(`    Suppressed: ${outreachData.suppressed}`);

  for (const item of outreachData.results || []) {
    const draft = item.draft;
    console.log(`\n    --- Prospect Draft: "${item.leadName}" (ID: ${item.leadId}) ---`);
    console.log(`      Draft ID: ${draft?.id}`);
    console.log(`      Subject: "${draft?.subject}"`);
    console.log(`      Draft Status: ${draft?.status} | Approval Status: ${draft?.approvalStatus}`);
    console.log(`      Delivery Status: ${draft?.deliveryStatus} (NO EXTERNAL TRANSMISSION)`);
    console.log(`      Recommended Next Step: "${draft?.recommendedNextStep}"`);
    console.log(`      Follow-Up Interval: ${draft?.followUpIntervalDays} days`);
    console.log(`      Evidence Grounding Count: ${draft?.evidenceReferences?.length || 0}`);
  }

  // ----------------------------------------------------------------
  // STEP 7: POST-EXECUTION VERIFICATION & INVARIANCE AUDIT
  // ----------------------------------------------------------------
  logStep(7, 'Post-Execution Verification & Existing Record Invariance');

  // 1. Verify pilot leads exist in database with correct tenant and pilotId
  const pilotLeadsInDb = await prisma.salesLead.findMany({
    where: { companyId: PROD_TENANT_ID, id: { in: pilotLeadIds } },
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      status: true,
      qualityScore: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  console.log(`  Pilot Leads in DB: ${pilotLeadsInDb.length} (Expected: ${pilotLeadIds.length})`);
  if (pilotLeadsInDb.length !== pilotLeadIds.length) {
    throw new Error(`Mismatch: Expected ${pilotLeadIds.length} pilot leads, found ${pilotLeadsInDb.length}`);
  }

  for (const pl of pilotLeadsInDb) {
    const meta = pl.metadata || {};
    if (meta.pilotId !== PILOT_RUN_ID) {
      throw new Error(`Pilot lead ${pl.id} missing pilotId marker!`);
    }
    console.log(`    [PASS] Lead "${pl.name}" correctly marked with pilotId: ${meta.pilotId}`);
  }

  // 2. Verify all existing customer records are 100% UNMODIFIED
  const currentExistingLeads = await prisma.salesLead.findMany({
    where: { companyId: PROD_TENANT_ID, id: { in: baselineExistingLeads.map(l => l.id) } },
    select: { id: true, name: true, updatedAt: true }
  });

  for (const el of currentExistingLeads) {
    const originalTs = baselineTimestamps.get(el.id);
    const currentTs = el.updatedAt.toISOString();
    if (originalTs !== currentTs) {
      throw new Error(`CRITICAL INVARIANCE VIOLATION: Existing lead "${el.name}" (${el.id}) was modified! Before: ${originalTs}, After: ${currentTs}`);
    }
  }
  console.log(`  [PASS] All ${baselineExistingLeads.length} existing customer records verified 100% invariant (timestamps untouched).`);

  // 3. Compare post-run counts
  const [
    finalLeadsCount,
    finalAuditsCount,
    finalApprovalsCount,
    finalActivitiesCount,
    finalEmployeesCount,
  ] = await Promise.all([
    prisma.salesLead.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.leadGenAudit.count({ where: { lead: { companyId: PROD_TENANT_ID } } }),
    prisma.approvalRequest.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.salesActivity.count({ where: { companyId: PROD_TENANT_ID } }),
    prisma.employee.count({ where: { companyId: PROD_TENANT_ID } }),
  ]);

  console.log('\n  --- Post-Run Production Record Counts ---');
  console.log({
    leads: { baseline: baselineLeadsCount, final: finalLeadsCount, delta: finalLeadsCount - baselineLeadsCount },
    audits: { baseline: baselineAuditsCount, final: finalAuditsCount, delta: finalAuditsCount - baselineAuditsCount },
    approvals: { baseline: baselineApprovalsCount, final: finalApprovalsCount, delta: finalApprovalsCount - baselineApprovalsCount },
    activities: { baseline: baselineActivitiesCount, final: finalActivitiesCount, delta: finalActivitiesCount - baselineActivitiesCount },
    employees: { baseline: baselineEmployeesCount, final: finalEmployeesCount, delta: finalEmployeesCount - baselineEmployeesCount },
  });

  if (finalLeadsCount - baselineLeadsCount > 3) {
    throw new Error(`CRITICAL: Net new leads created (${finalLeadsCount - baselineLeadsCount}) exceeded maximum limit of 3!`);
  }

  // 4. Confirm zero external transmissions and zero recurring activations
  const externalSendsAudit = await prisma.leadGenAudit.findMany({
    where: {
      leadId: { in: pilotLeadIds },
      event: { in: ['OUTREACH_SENT', 'OUTREACH_DELIVERED'] }
    }
  });
  if (externalSendsAudit.length > 0) {
    throw new Error('CRITICAL: Detected OUTREACH_SENT or OUTREACH_DELIVERED audit event!');
  }
  console.log('  [PASS] Confirmed 0 external email or message transmissions (all drafts held in safe mode).');

  // Verify n8n workflow states remain unchanged
  const postN8nWfs = (await (await fetch(`${N8N_BASE}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Accept': 'application/json' }
  })).json()).data || [];
  const postAuto3 = postN8nWfs.find(w => w.id === 'ZvRwotA7iTKBQNAp');
  const postAuto4 = postN8nWfs.find(w => w.id === 'BX5Vds0k1bBi9fuB');
  if (postAuto3?.active || postAuto4?.active) {
    throw new Error('CRITICAL: Inactive workflows were unexpectedly activated!');
  }
  console.log('  [PASS] Confirmed 0 workflow activation state changes (Automations #3 and #4 remain inactive).');

  console.log('\n================================================================');
  console.log('  AEVORA PRO 1 THREE-PROSPECT PRODUCTION PILOT COMPLETED SUCCESSFULLY');
  console.log('================================================================');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\nPILOT EXECUTION FAILED / BLOCKED:', err);
  await prisma.$disconnect();
  process.exit(1);
});

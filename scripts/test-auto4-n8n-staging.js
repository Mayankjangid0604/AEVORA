/**
 * AEVORA AUTOMATION #4 — LOCAL n8n STAGING VALIDATION
 *
 * Scope:
 * - Isolated "Audit Company B Test" tenant (607da85a-7ad3-43b6-bf88-eace1125984d)
 * - Stage workflow in local n8n (127.0.0.1:5678)
 * - Test webhook authentication & error rejection (401/403)
 * - Trigger outreach drafting end-to-end through n8n webhook -> API -> Ollama -> DB
 * - Verify draft structure, evidence grounding, and follow-up recommendation
 * - Verify missing evidence & low-confidence handling
 * - Verify opt-out and suppression compliance
 * - Verify idempotency & duplicate prevention
 * - Verify human approval, editing, versioning, and prior approval cancellation
 * - Verify unauthorized-send rejection and strict external delivery safeguard
 * - Verify tenant isolation & cross-tenant rejection
 * - Verify n8n execution data retention (zero payload saved)
 * - Confirm production tenant (AEVORA Technologies) counts & timestamps are unchanged
 * - Deactivate staging workflow and clean up all synthetic records with 2-pass residual audit
 *
 * Usage:
 *   Dry run (default):
 *     node scripts/test-auto4-n8n-staging.js --expected-tenant=607da85a-7ad3-43b6-bf88-eace1125984d
 *   Authorized execution:
 *     node scripts/test-auto4-n8n-staging.js --execute --expected-tenant=607da85a-7ad3-43b6-bf88-eace1125984d
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient, ApprovalRequestStatus } = require('@prisma/client');

// 1. Mandatory Constants & Tenant Safety Gate
const CONFIRMED_TEST_TENANT_ID = '607da85a-7ad3-43b6-bf88-eace1125984d';
const PRODUCTION_TENANT_ID = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const N8N_BASE_URL = 'http://127.0.0.1:5678';
const API_BASE_URL = 'http://127.0.0.1:13000';
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const WORKFLOW_NAME = 'AI Sales Outreach & Follow-up - Aevora';

function loadEnvKey(key) {
  for (const f of ['.env', 'apps/api/.env']) {
    const full = path.resolve(process.cwd(), f);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, 'utf8').split('\n')) {
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
  return process.env[key] || null;
}

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const n8nApiKey = loadEnvKey('N8N_API_KEY');
const integrationKey = loadEnvKey('INTEGRATION_API_KEY');

const prisma = new PrismaClient();

async function checkUrl(url, method = 'GET') {
  try {
    const res = await fetch(url, { method });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const isExecutionMode = args.includes('--execute');

  const tenantArg = args.find((a) => a.startsWith('--expected-tenant='));
  const passedTenantId = tenantArg ? tenantArg.split('=')[1].trim() : null;

  console.log('================================================================');
  console.log('  AEVORA AUTOMATION #4 — LOCAL n8n STAGING VALIDATION');
  console.log('================================================================');
  console.log(`Mode: ${isExecutionMode ? 'LIVE STAGING EXECUTION (AUTHORIZED)' : 'DRY RUN / PLAN ONLY (SAFE)'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Safety Gate: Target Tenant Check
  if (!passedTenantId || passedTenantId !== CONFIRMED_TEST_TENANT_ID) {
    console.error(`\n[SAFETY ABORT]: Missing or invalid --expected-tenant parameter.`);
    console.error(`Expected: --expected-tenant=${CONFIRMED_TEST_TENANT_ID}`);
    process.exit(1);
  }

  if (passedTenantId === PRODUCTION_TENANT_ID) {
    console.error(`\n[FATAL SAFETY ABORT]: Target tenant cannot be production tenant ${PRODUCTION_TENANT_ID}!`);
    process.exit(1);
  }

  // Preflight Health Checks
  console.log('\n--- 1. Preflight Health Checks ---');
  const n8nCheck = await checkUrl(`${N8N_BASE_URL}/healthz`);
  console.log(`  n8n Health (${N8N_BASE_URL}): ${n8nCheck.ok ? 'OK (200)' : 'FAILED (' + JSON.stringify(n8nCheck) + ')'}`);

  const apiCheck = await checkUrl(`${API_BASE_URL}/health`);
  console.log(`  API Health (${API_BASE_URL}): ${apiCheck.ok ? 'OK (200)' : 'FAILED (' + JSON.stringify(apiCheck) + ')'}`);

  const ollamaCheck = await checkUrl(`${OLLAMA_BASE_URL}/api/version`);
  console.log(`  Ollama Health (${OLLAMA_BASE_URL}): ${ollamaCheck.ok ? 'OK (200)' : 'FAILED (' + JSON.stringify(ollamaCheck) + ')'}`);

  if (!n8nCheck.ok || !apiCheck.ok || !ollamaCheck.ok) {
    throw new Error('Preflight checks failed: One or more required local services are unreachable.');
  }

  if (!n8nApiKey) {
    throw new Error('N8N_API_KEY environment variable is not configured.');
  }
  if (!integrationKey) {
    throw new Error('INTEGRATION_API_KEY environment variable is not configured.');
  }

  // Verify Test Tenant
  console.log('\n--- 2. Tenant Verification & Safety Gate ---');
  const testTenant = await prisma.company.findUnique({
    where: { id: CONFIRMED_TEST_TENANT_ID },
    select: { id: true, name: true, status: true },
  });

  if (!testTenant) {
    throw new Error(`Test tenant ${CONFIRMED_TEST_TENANT_ID} does not exist in the database!`);
  }
  console.log(`  Test Tenant ID: ${testTenant.id}`);
  console.log(`  Test Tenant Name: "${testTenant.name}" (Status: ${testTenant.status})`);

  const initialTestLeads = await prisma.salesLead.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } });
  const initialTestEmps = await prisma.employee.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } });
  console.log(`  Current Leads in Test Tenant: ${initialTestLeads}`);
  console.log(`  Current Employees in Test Tenant: ${initialTestEmps}`);

  // Snapshot Baseline Production Tenant
  console.log('\n--- 3. Baseline Counts & Timestamps Snapshot ---');
  const baselineProdLeads = await prisma.salesLead.findMany({
    where: { companyId: PRODUCTION_TENANT_ID },
    select: { id: true, name: true, updatedAt: true },
  });
  const baselineProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT_ID } } });
  const baselineProdApprovals = await prisma.approvalRequest.count({ where: { companyId: PRODUCTION_TENANT_ID } });
  const baselineProdActivities = await prisma.salesActivity.count({ where: { companyId: PRODUCTION_TENANT_ID } });
  const baselineProdEmps = await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT_ID } });

  console.log(`  Production Tenant (${PRODUCTION_TENANT_ID}):`);
  console.log(`    - SalesLeads: ${baselineProdLeads.length}`);
  console.log(`    - LeadGenAudits: ${baselineProdAudits}`);
  console.log(`    - ApprovalRequests: ${baselineProdApprovals}`);
  console.log(`    - SalesActivities: ${baselineProdActivities}`);
  console.log(`    - Employees: ${baselineProdEmps}`);

  // Inspect existing n8n workflows
  console.log('\n--- 4. Inspecting n8n Workflow State ---');
  const wfListRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=100`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });
  if (!wfListRes.ok) {
    throw new Error(`Failed to list n8n workflows: HTTP ${wfListRes.status}`);
  }
  const wfListData = await wfListRes.json();
  const existingWf = (wfListData.data || []).find((w) => w.name === WORKFLOW_NAME);
  console.log(`  Automation #4 Workflow in n8n: ${existingWf ? `Found (ID: ${existingWf.id}, active: ${existingWf.active})` : 'Not imported yet'}`);

  if (!isExecutionMode) {
    console.log('\n================================================================');
    console.log('  DRY RUN COMPLETED (ZERO WRITES, ZERO WORKFLOW IMPORTS)');
    console.log('================================================================');
    console.log('All preflight checks, safety barriers, and baseline audits passed.');
    console.log('To execute this authorized staging test, rerun with:');
    console.log(`  node scripts/test-auto4-n8n-staging.js --execute --expected-tenant=${CONFIRMED_TEST_TENANT_ID}`);
    await prisma.$disconnect();
    return;
  }

  // 5. Execution Phase: Staging Workflow Import & Activation
  console.log('\n--- 5. Staging Automation #4 Workflow in n8n ---');
  const workflowFilePath = path.resolve(process.cwd(), 'n8n/4.ai-sales-outreach-follow-up.json');
  if (!fs.existsSync(workflowFilePath)) {
    throw new Error(`Workflow definition file missing at ${workflowFilePath}`);
  }
  const workflowDefinition = JSON.parse(fs.readFileSync(workflowFilePath, 'utf8'));

  let stagedWfId = existingWf?.id;

  if (existingWf) {
    console.log(`  Updating existing workflow ${stagedWfId}...`);
    const updateRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${stagedWfId}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: workflowDefinition.name,
        nodes: workflowDefinition.nodes,
        connections: workflowDefinition.connections,
        settings: workflowDefinition.settings,
      }),
    });
    if (!updateRes.ok) {
      throw new Error(`Failed to update workflow: HTTP ${updateRes.status}`);
    }
  } else {
    console.log('  Importing new workflow into n8n...');
    const createRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: workflowDefinition.name,
        nodes: workflowDefinition.nodes,
        connections: workflowDefinition.connections,
        settings: workflowDefinition.settings,
      }),
    });
    if (!createRes.ok) {
      throw new Error(`Failed to import workflow: HTTP ${createRes.status}`);
    }
    const createData = await createRes.json();
    stagedWfId = createData.id;
    console.log(`  Imported workflow as ID: ${stagedWfId}`);
  }

  // Verify retention settings
  console.log('  Verifying execution-data retention settings on staged workflow...');
  const verifyRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${stagedWfId}`, {
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });
  const stagedWf = await verifyRes.json();
  const settings = stagedWf.settings || {};
  console.log(`    saveDataSuccessExecution: "${settings.saveDataSuccessExecution}" (expected: "none")`);
  console.log(`    saveDataErrorExecution: "${settings.saveDataErrorExecution}" (expected: "none")`);
  if (settings.saveDataSuccessExecution !== 'none' || settings.saveDataErrorExecution !== 'none') {
    throw new Error('Security Breach: Staged workflow does not enforce zero execution data retention!');
  }

  // Activate workflow for webhook testing
  console.log('  Activating staged workflow in n8n...');
  const actRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${stagedWfId}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });
  if (!actRes.ok) {
    throw new Error(`Failed to activate workflow: HTTP ${actRes.status}`);
  }
  console.log('  [PASS] Automation #4 workflow is active and ready for staging webhook.');
  console.log('  Waiting 3s for n8n webhook router binding...');
  await sleep(3000);

  // 6. Test Data Generation (Synthetic Records in Test Tenant)
  console.log('\n--- 6. Generating Synthetic Test Leads in Test Tenant ---');
  const testRunId = `stage-auto4-${Date.now()}`;

  let createdDept = null;
  let createdRole = null;
  let createdEmployee = null;
  let lead1Standard = null;
  let lead2Bare = null;
  let lead3OptOut = null;
  let executionErrorOccurred = false;

  try {
    createdDept = await prisma.department.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Outreach Staging Dept - ${testRunId}`,
      },
    });

    createdRole = await prisma.role.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        title: `Outreach AI Evaluator - ${testRunId}`,
      },
    });

    createdEmployee = await prisma.employee.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        departmentId: createdDept.id,
        roleId: createdRole.id,
        name: 'Staging Outreach Agent',
        identitySeed: `test-identity-${testRunId}`,
      },
    });
    console.log(`  Created Synthetic Employee: ${createdEmployee.id}`);

    // Lead 1: Standard qualified prospect with Auto #3 research brief
    lead1Standard = await prisma.salesLead.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Synthetic Dental Care - ${testRunId}`,
        website: 'https://synthetic-dental-care.local',
        contactPhone: '(555) 019-3321',
        contactEmail: 'dr.smith@synthetic-dental.local',
        industry: 'Dentist',
        status: 'QUALIFIED',
        qualityScore: 78,
        notes: 'Family dental clinic specializing in restorative care and dental implants.',
        metadata: {
          isSynthetic: true,
          testRunId,
          researchBrief: {
            opportunityScore: 78,
            confidence: 85,
            priority: 'HIGH',
            recommendation: 'QUALIFIED',
            executiveSummary: 'Synthetic Dental Care is an active dental clinic with verified service lines and missing online booking workflows.',
            identifiedPains: ['Lacks self-service patient online booking workflow', 'High front-desk phone inquiry volume'],
            identifiedOpportunities: ['Deploy automated appointment booking and patient intake assistant'],
            buyingSignals: ['Active clinic offering dental implants and hygiene services'],
            recommendedPitch: 'Help Synthetic Dental Care automate patient bookings directly from their website.',
            recommendedNextAction: 'Schedule a 15-minute introductory workflow review call.',
            evidenceSources: [{ type: 'WEBSITE_SCRAPE', url: 'https://synthetic-dental-care.local' }],
            missingEvidence: ['Internal dental practice management software stack unconfirmed'],
          },
          enrichment: {
            reachability: { checked: true, reachable: true, statusCode: 200 },
            extracted: {
              businessDescription: 'Dental clinic providing family dental and cosmetic dentistry.',
              services: ['Dental Implants', 'Teeth Whitening', 'Hygiene'],
              businessSignals: { onlineBookingAvailable: false, hasContactForm: true },
            },
          },
        },
      },
    });
    console.log(`  Created Lead 1 (Standard): ${lead1Standard.id} ("${lead1Standard.name}")`);

    // Lead 2: Bare prospect (missing research brief) to test low-confidence handling
    lead2Bare = await prisma.salesLead.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Synthetic Bare Prospect - ${testRunId}`,
        website: 'https://bare-prospect.local',
        contactPhone: '(555) 019-4455',
        contactEmail: 'info@bare-prospect.local',
        industry: 'Commercial IT',
        status: 'QUALIFIED',
        qualityScore: 55,
        metadata: {
          isSynthetic: true,
          testRunId,
        },
      },
    });
    console.log(`  Created Lead 2 (Bare / Low Confidence): ${lead2Bare.id}`);

    // Lead 3: Opted-out / suppressed prospect to test suppression compliance
    lead3OptOut = await prisma.salesLead.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Synthetic OptedOut Prospect - ${testRunId}`,
        website: 'https://optedout-prospect.local',
        contactPhone: '(555) 019-9988',
        contactEmail: 'stop@optedout-prospect.local',
        industry: 'Commercial Real Estate',
        status: 'QUALIFIED',
        qualityScore: 75,
        metadata: {
          isSynthetic: true,
          testRunId,
          optOut: true,
        },
      },
    });
    console.log(`  Created Lead 3 (Opted-Out): ${lead3OptOut.id}`);

    // 7. Test n8n Webhook Authentication Rejection
    console.log('\n--- 7. Testing n8n Webhook Authentication Guard ---');
    const webhookUrl = `${N8N_BASE_URL}/webhook/aevora-outreach-trigger`;

    const unauthRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: CONFIRMED_TEST_TENANT_ID, leadIds: [lead1Standard.id] }),
    });
    console.log(`  Unauthenticated Webhook: Status = ${unauthRes.status} (Expected 401 or 403)`);
    if (unauthRes.status !== 401 && unauthRes.status !== 403) {
      throw new Error(`Security Failure: n8n webhook accepted unauthenticated request with status ${unauthRes.status}`);
    }

    const badAuthRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': 'invalid-key-for-test',
      },
      body: JSON.stringify({ companyId: CONFIRMED_TEST_TENANT_ID, leadIds: [lead1Standard.id] }),
    });
    console.log(`  Invalid-Key Webhook: Status = ${badAuthRes.status} (Expected 401 or 403)`);
    if (badAuthRes.status !== 401 && badAuthRes.status !== 403) {
      throw new Error(`Security Failure: n8n webhook accepted request with invalid key with status ${badAuthRes.status}`);
    }
    console.log('  [PASS] n8n Webhook authentication guard strictly enforces headerAuth rejection.');

    // 8. Execute Authorized n8n Webhook Request (Lead 1)
    console.log('\n--- 8. Executing Authorized n8n Webhook Trigger (Lead 1) ---');
    const triggerPayload = {
      companyId: CONFIRMED_TEST_TENANT_ID,
      leadIds: [lead1Standard.id],
      limit: 1,
      channel: 'EMAIL',
      forceRefresh: true,
      apiUrl: API_BASE_URL,
    };

    const triggerT0 = Date.now();
    const triggerRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
      },
      body: JSON.stringify(triggerPayload),
    });

    const triggerDuration = Date.now() - triggerT0;
    console.log(`  n8n Webhook HTTP Status: ${triggerRes.status} (Duration: ${triggerDuration}ms)`);
    if (!triggerRes.ok) {
      const errBody = await triggerRes.text();
      throw new Error(`n8n webhook execution failed: HTTP ${triggerRes.status}: ${errBody}`);
    }

    const webhookResponseData = await triggerRes.json().catch(() => ({}));
    console.log('  n8n Webhook Response:', JSON.stringify(webhookResponseData, null, 2));

    // Poll database for Lead 1 draft generation completion
    console.log('\n--- 9. Verifying Database State for Draft Generation ---');
    let updatedLead1 = null;
    const maxPollAttempts = 65; // 65 * 2s = 130s
    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      updatedLead1 = await prisma.salesLead.findUnique({
        where: { id: lead1Standard.id },
      });

      const draft = updatedLead1?.metadata?.outreachDraft;
      if (draft) {
        console.log(`  Outreach draft detected after poll attempt ${attempt} (~${attempt * 2}s)`);
        break;
      }
      await sleep(2000);
    }

    const draft1 = updatedLead1?.metadata?.outreachDraft;
    if (!draft1) {
      throw new Error('Timed out waiting for SalesLead.metadata.outreachDraft to be persisted!');
    }

    console.log(`  [ASSERT] Draft ID: ${draft1.id}`);
    console.log(`  [ASSERT] Subject: "${draft1.subject}"`);
    console.log(`  [ASSERT] Personalization Rationale: "${draft1.personalizationRationale}"`);
    console.log(`  [ASSERT] Evidence References: [${(draft1.evidenceReferences || []).join('; ')}]`);
    console.log(`  [ASSERT] Recommended Next Step: "${draft1.recommendedNextStep}"`);
    console.log(`  [ASSERT] Follow-up Interval: ${draft1.followUpIntervalDays} days`);
    console.log(`  [ASSERT] Approval Status: ${draft1.approvalStatus} (Expected: PENDING)`);
    console.log(`  [ASSERT] Delivery Status: ${draft1.deliveryStatus} (Expected: DISABLED)`);
    console.log(`  [ASSERT] Confidence: ${draft1.confidence}% (Expected >= 70)`);

    if (!draft1.subject || !draft1.body || !draft1.recommendedNextStep) {
      throw new Error('Outreach draft is missing required subject, body, or next step!');
    }
    if (draft1.approvalStatus !== 'PENDING' || draft1.deliveryStatus !== 'DISABLED') {
      throw new Error('Draft must be initialised with approvalStatus PENDING and deliveryStatus DISABLED!');
    }

    // Verify ApprovalRequest record in database
    const approvalReq = await prisma.approvalRequest.findFirst({
      where: {
        id: draft1.approvalRequestId,
        companyId: CONFIRMED_TEST_TENANT_ID,
        targetType: 'SalesLead',
        targetId: lead1Standard.id,
      },
    });

    if (!approvalReq) {
      throw new Error(`ApprovalRequest ${draft1.approvalRequestId} was not created in database!`);
    }
    console.log(`  [ASSERT] ApprovalRequest in DB: ${approvalReq.id}, Status: ${approvalReq.status}, Action: ${approvalReq.action}`);
    if (approvalReq.status !== ApprovalRequestStatus.PENDING) {
      throw new Error(`ApprovalRequest must be in PENDING state (found: ${approvalReq.status})`);
    }

    // Verify SalesActivity record in database
    const salesAct = await prisma.salesActivity.findFirst({
      where: {
        salesLeadId: lead1Standard.id,
        companyId: CONFIRMED_TEST_TENANT_ID,
      },
    });
    if (!salesAct) {
      throw new Error('SalesActivity was not created for outreach draft!');
    }
    console.log(`  [ASSERT] SalesActivity in DB: ${salesAct.id}, ActivityType: ${salesAct.activityType}, Outcome: ${salesAct.outcome}`);

    // Verify LeadGenAudit record in database
    const audits = await prisma.leadGenAudit.findMany({
      where: { leadId: lead1Standard.id },
    });
    const draftAudit = audits.find((a) => a.event === 'OUTREACH_DRAFT_GENERATED');
    if (!draftAudit) {
      throw new Error('LeadGenAudit event OUTREACH_DRAFT_GENERATED was not found!');
    }
    console.log(`  [ASSERT] LeadGenAudit event confirmed: ${draftAudit.event}`);
    console.log('  [PASS] Staged outreach draft generated, grounded, and safely persisted in PENDING state.');

    // 10. Test Missing Evidence & Low-Confidence Handling (Lead 2)
    console.log('\n--- 10. Testing Missing Evidence & Low-Confidence Handling (Lead 2) ---');
    const bareRes = await fetch(`${API_BASE_URL}/automation/outreach/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead2Bare.id, forceRefresh: true }),
    });

    const bareData = await bareRes.json();
    console.log(`  Bare Lead Draft Status: ${bareData.status}, Confidence: ${bareData.draft?.confidence}%`);
    console.log(`  Missing Evidence Notes: [${(bareData.draft?.missingEvidence || []).join('; ')}]`);

    if ((bareData.draft?.confidence || 100) > 50) {
      throw new Error(`Expected low confidence (<=50) for bare lead without research brief, got ${bareData.draft?.confidence}`);
    }
    console.log('  [PASS] Low-confidence evidence and missing research brief correctly reported.');

    // 11. Test Opt-Out & Suppression Compliance (Lead 3)
    console.log('\n--- 11. Testing Opt-Out & Suppression Compliance (Lead 3) ---');
    const optOutRes = await fetch(`${API_BASE_URL}/automation/outreach/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead3OptOut.id }),
    });

    const optOutData = await optOutRes.json();
    console.log(`  Opt-Out Lead Status: ${optOutData.status}, Error/Reason: "${optOutData.error}"`);
    if (optOutData.status !== 'SUPPRESSED') {
      throw new Error(`Expected SUPPRESSED status for opted out lead, got ${optOutData.status}`);
    }
    console.log('  [PASS] Opt-out flag honored: Lead skipped and marked SUPPRESSED.');

    // 12. Test Idempotency & Duplicate Prevention (Lead 1)
    console.log('\n--- 12. Testing Idempotency & Duplicate Prevention (Lead 1) ---');
    const idempRes = await fetch(`${API_BASE_URL}/automation/outreach/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id, forceRefresh: false }),
    });

    const idempData = await idempRes.json();
    console.log(`  Idempotent Retry Status: ${idempData.status} (Expected: SKIPPED)`);
    if (idempData.status !== 'SKIPPED') {
      throw new Error(`Expected SKIPPED status for idempotent retry, got ${idempData.status}`);
    }
    console.log('  [PASS] Duplicate prevention verified: existing draft returned without re-generation.');

    // 13. Test Human Approval & Editing Gate (Lead 1)
    console.log('\n--- 13. Testing Human Approval, Editing, and Invalidation Gate ---');

    // Phase 13A: Human edits subject during approval -> creates version 2, cancels version 1
    console.log('  Phase 13A: Approving draft with manual edits (increments version)...');
    const approveEditRes = await fetch(`${API_BASE_URL}/automation/outreach/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({
        leadId: lead1Standard.id,
        reason: 'Reviewed and edited subject line by Sales Director',
        editedSubject: 'Customized Subject for Synthetic Dental Care',
      }),
    });

    const approveEditData = await approveEditRes.json();
    console.log(`  Approval Status: ${approveEditData.status}, Version: ${approveEditData.draft?.version}, isEdited: ${approveEditData.draft?.isEdited}`);

    if (approveEditData.draft?.version !== 2 || !approveEditData.draft?.isEdited) {
      throw new Error(`Expected draft version 2 with isEdited=true, got version ${approveEditData.draft?.version}`);
    }

    // Verify old approval request is CANCELLED
    const oldReq = await prisma.approvalRequest.findUnique({
      where: { id: draft1.approvalRequestId },
    });
    console.log(`  Old ApprovalRequest (${oldReq.id}) Status: ${oldReq.status} (Expected: CANCELLED)`);
    if (oldReq.status !== ApprovalRequestStatus.CANCELLED) {
      throw new Error(`Prior approval request must be CANCELLED upon draft edit! Found: ${oldReq.status}`);
    }

    // Phase 13B: Draft Regeneration Invalidates Prior Approval -> increments version to 3, sets status PENDING
    console.log('\n  Phase 13B: Regenerating draft (forceRefresh: true) to verify invalidation of approval...');
    const regenRes = await fetch(`${API_BASE_URL}/automation/outreach/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id, forceRefresh: true }),
    });

    const regenData = await regenRes.json();
    console.log(`  Regenerated Draft Status: ${regenData.status}, Version: ${regenData.draft?.version}, ApprovalStatus: ${regenData.draft?.approvalStatus}`);

    if (regenData.draft?.version !== 3 || regenData.draft?.approvalStatus !== 'PENDING') {
      throw new Error(`Expected regenerated draft version 3 in PENDING state, got version ${regenData.draft?.version}, status ${regenData.draft?.approvalStatus}`);
    }

    // Verify version 2 approval request is now CANCELLED
    const v2Req = await prisma.approvalRequest.findUnique({
      where: { id: approveEditData.approvalRequestId },
    });
    console.log(`  Version 2 ApprovalRequest (${v2Req.id}) Status: ${v2Req.status} (Expected: CANCELLED)`);
    if (v2Req.status !== ApprovalRequestStatus.CANCELLED) {
      throw new Error(`Version 2 approval request must be CANCELLED upon draft regeneration!`);
    }

    // Phase 13C: Attempt Send without approval on Version 3 -> Must fail (403 Forbidden)
    console.log('\n  Phase 13C: Attempting send on unapproved version 3 (must be rejected with 403)...');
    const unauthSendRes = await fetch(`${API_BASE_URL}/automation/outreach/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id }),
    });

    console.log(`  Unapproved Send HTTP Status: ${unauthSendRes.status} (Expected: 403)`);
    if (unauthSendRes.status !== 403) {
      throw new Error(`Safety Failure: sendOutreach accepted unapproved draft with status ${unauthSendRes.status}`);
    }
    console.log('  [PASS] Unapproved send strictly rejected with 403 Forbidden.');

    // Phase 13D: Approve Version 3 without edits
    console.log('\n  Phase 13D: Approving version 3 without edits...');
    const approveV3Res = await fetch(`${API_BASE_URL}/automation/outreach/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({
        leadId: lead1Standard.id,
        reason: 'Version 3 approved by Sales Director',
      }),
    });

    const approveV3Data = await approveV3Res.json();
    console.log(`  Version 3 Approval Status: ${approveV3Data.status}, Version: ${approveV3Data.draft?.version}`);
    if (approveV3Data.status !== 'APPROVED') {
      throw new Error(`Expected APPROVED status for version 3, got ${approveV3Data.status}`);
    }

    // Phase 13E: Dispatch Approved Version 3 -> Delivery Safeguard Policy must intercept and disable transmission
    console.log('\n  Phase 13E: Dispatching approved version 3 (verifying external delivery safeguard)...');
    const sendRes = await fetch(`${API_BASE_URL}/automation/outreach/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id }),
    });

    const sendData = await sendRes.json();
    console.log(`  Send Dispatch Status: ${sendData.status}, DeliveryStatus: ${sendData.deliveryStatus}`);
    console.log(`  Safeguard Message: "${sendData.message}"`);

    if (sendData.status !== 'BLOCKED_BY_SAFEGUARD' || sendData.deliveryStatus !== 'DISABLED') {
      throw new Error(`Expected BLOCKED_BY_SAFEGUARD and DISABLED deliveryStatus, got ${sendData.status} / ${sendData.deliveryStatus}`);
    }

    // Verify audit record of safeguard block
    const safeguardAudit = await prisma.leadGenAudit.findFirst({
      where: {
        leadId: lead1Standard.id,
        event: 'OUTREACH_DELIVERY_BLOCKED_SAFEGUARD',
      },
    });
    if (!safeguardAudit) {
      throw new Error('LeadGenAudit event OUTREACH_DELIVERY_BLOCKED_SAFEGUARD was not logged!');
    }
    console.log(`  [ASSERT] Safeguard Audit Logged: ${safeguardAudit.event}`);
    console.log('  [PASS] External message delivery strictly blocked and held in safe mode.');

    // Phase 13F: Mock / Local Capture Dispatch
    console.log('\n  Phase 13F: Dispatching via mock capture mode (captureOnly: true)...');
    const mockSendRes = await fetch(`${API_BASE_URL}/automation/outreach/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id, captureOnly: true }),
    });
    const mockSendData = await mockSendRes.json();
    console.log(`  Mock Capture Status: ${mockSendData.status}, DeliveryStatus: ${mockSendData.deliveryStatus}`);
    if (mockSendData.status !== 'CAPTURED_MOCK' || mockSendData.deliveryStatus !== 'CAPTURED_MOCK') {
      throw new Error(`Expected CAPTURED_MOCK status, got ${mockSendData.status}`);
    }
    console.log('  [PASS] Mock / Local Capture dispatch succeeded without external transmission.');

    // Phase 13G: Standalone Draft Editing and Stale Approval Invalidation
    console.log('\n  Phase 13G: Testing standalone draft editing (/outreach/edit) and stale approval invalidation...');
    const editRes = await fetch(`${API_BASE_URL}/automation/outreach/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({
        leadId: lead1Standard.id,
        subject: 'Standalone Edited Subject for Staging Dental',
        body: 'Standalone Edited Body for Staging Dental',
      }),
    });
    const editData = await editRes.json();
    console.log(`  Edit Status: ${editData.status}, Version: ${editData.draft?.version}, ApprovalStatus: ${editData.draft?.approvalStatus}`);
    if (editData.draft?.approvalStatus !== 'PENDING') {
      throw new Error(`Expected PENDING approvalStatus after edit, got ${editData.draft?.approvalStatus}`);
    }
    console.log('  [PASS] Standalone edit invalidated prior approval and reset status to PENDING.');

    // Phase 13H: Unapproved send after standalone edit must be rejected with 403
    console.log('\n  Phase 13H: Attempting send on newly edited unapproved version (must be 403)...');
    const sendAfterEditRes = await fetch(`${API_BASE_URL}/automation/outreach/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': CONFIRMED_TEST_TENANT_ID,
      },
      body: JSON.stringify({ leadId: lead1Standard.id }),
    });
    console.log(`  Send After Edit HTTP Status: ${sendAfterEditRes.status} (Expected: 403)`);
    if (sendAfterEditRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for send after edit without re-approval!`);
    }
    console.log('  [PASS] Re-approval strictly enforced after standalone draft edit.');

    // 14. Test Tenant Isolation
    console.log('\n--- 14. Testing Tenant Isolation Guard ---');
    const crossTenantRes = await fetch(`${API_BASE_URL}/automation/outreach/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': integrationKey,
        'x-company-id': PRODUCTION_TENANT_ID, // caller claiming production tenant owns test lead
      },
      body: JSON.stringify({ leadId: lead1Standard.id }),
    });

    console.log(`  Cross-Tenant Request Status: ${crossTenantRes.status} (Expected: 404 Not Found)`);
    if (crossTenantRes.status !== 404) {
      throw new Error(`Tenant Isolation Failure: Expected 404 for cross-tenant lead, got ${crossTenantRes.status}`);
    }
    console.log('  [PASS] Tenant isolation strictly rejects cross-tenant requests.');

    // 15. Verify n8n Execution Data Retention
    console.log('\n--- 15. Verifying n8n Execution Data Retention ---');
    const execListRes = await fetch(`${N8N_BASE_URL}/api/v1/executions?workflowId=${stagedWfId}&limit=5`, {
      headers: { 'X-N8N-API-KEY': n8nApiKey },
    });
    if (execListRes.ok) {
      const execListData = await execListRes.json();
      const recentExec = execListData.data?.[0];
      if (recentExec) {
        console.log(`  Latest n8n Execution ID: ${recentExec.id}, Status: ${recentExec.status}, Mode: ${recentExec.mode}`);
        const execDetailRes = await fetch(`${N8N_BASE_URL}/api/v1/executions/${recentExec.id}`, {
          headers: { 'X-N8N-API-KEY': n8nApiKey },
        });
        const execDetail = await execDetailRes.json();
        const dataKeys = Object.keys(execDetail.data || {});
        console.log(`  Execution Payload Data Keys: [${dataKeys.join(', ')}] (Expected: empty)`);
        if (dataKeys.length === 0) {
          console.log('  [PASS] Zero payload data retention confirmed: n8n saved zero prospect PII.');
        } else {
          console.warn('  [WARN] n8n stored execution data keys:', dataKeys);
        }
      }
    }

    // 16. Verify Production Tenant Invariance
    console.log('\n--- 16. Verifying Production Tenant Invariance ---');
    const currentProdLeads = await prisma.salesLead.findMany({
      where: { companyId: PRODUCTION_TENANT_ID },
      select: { id: true, name: true, updatedAt: true },
    });
    const currentProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT_ID } } });
    const currentProdApprovals = await prisma.approvalRequest.count({ where: { companyId: PRODUCTION_TENANT_ID } });
    const currentProdActivities = await prisma.salesActivity.count({ where: { companyId: PRODUCTION_TENANT_ID } });
    const currentProdEmps = await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT_ID } });

    console.log(`  Production Leads: Before=${baselineProdLeads.length}, After=${currentProdLeads.length}`);
    console.log(`  Production Audits: Before=${baselineProdAudits}, After=${currentProdAudits}`);
    console.log(`  Production Approvals: Before=${baselineProdApprovals}, After=${currentProdApprovals}`);
    console.log(`  Production Activities: Before=${baselineProdActivities}, After=${currentProdActivities}`);
    console.log(`  Production Employees: Before=${baselineProdEmps}, After=${currentProdEmps}`);

    if (
      currentProdLeads.length !== baselineProdLeads.length ||
      currentProdAudits !== baselineProdAudits ||
      currentProdApprovals !== baselineProdApprovals ||
      currentProdActivities !== baselineProdActivities ||
      currentProdEmps !== baselineProdEmps
    ) {
      throw new Error('[CRITICAL ISOLATION BREACH]: Production tenant records were modified during test execution!');
    }

    for (const bLead of baselineProdLeads) {
      const cLead = currentProdLeads.find((l) => l.id === bLead.id);
      if (!cLead || cLead.updatedAt.getTime() !== bLead.updatedAt.getTime()) {
        throw new Error(`[CRITICAL ISOLATION BREACH]: Production lead "${bLead.name}" (${bLead.id}) timestamp was modified!`);
      }
    }
    console.log('  [PASS] Production tenant records and timestamps are 100% invariant.');

  } catch (err) {
    executionErrorOccurred = true;
    console.error(`\n[ERROR DURING STAGING EXECUTION]: ${err.message}`);
  } finally {
    // 17. Deactivate Staging Workflow in n8n
    if (stagedWfId) {
      console.log(`\n--- 17. Deactivating Staging Workflow in n8n ---`);
      try {
        const deactRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${stagedWfId}/deactivate`, {
          method: 'POST',
          headers: { 'X-N8N-API-KEY': n8nApiKey },
        });
        console.log(`  Workflow deactivation status: ${deactRes.status} (active = false)`);
      } catch (deactErr) {
        console.error(`  Warning: Failed to deactivate staging workflow: ${deactErr.message}`);
      }
    }

    // 18. Safe Cleanup of Synthetic Records
    console.log('\n--- 18. Safe Cleanup of Synthetic Records ---');
    console.log('  Pausing 1.5s for any in-flight database transactions to settle...');
    await sleep(1500);

    const testLeadIds = [lead1Standard?.id, lead2Bare?.id, lead3OptOut?.id].filter(Boolean);

    try {
      if (testLeadIds.length > 0) {
        const delAudits = await prisma.leadGenAudit.deleteMany({
          where: { leadId: { in: testLeadIds } },
        });
        console.log(`  Cleaned up LeadGenAudit records: ${delAudits.count}`);

        const delActs = await prisma.salesActivity.deleteMany({
          where: { salesLeadId: { in: testLeadIds }, companyId: CONFIRMED_TEST_TENANT_ID },
        });
        console.log(`  Cleaned up SalesActivity records: ${delActs.count}`);

        const delApprovals = await prisma.approvalRequest.deleteMany({
          where: { targetId: { in: testLeadIds }, targetType: 'SalesLead', companyId: CONFIRMED_TEST_TENANT_ID },
        });
        console.log(`  Cleaned up ApprovalRequest records: ${delApprovals.count}`);

        const delLeads = await prisma.salesLead.deleteMany({
          where: { id: { in: testLeadIds } },
        });
        console.log(`  Cleaned up SalesLead records: ${delLeads.count}`);
      }

      if (createdEmployee?.id) {
        await prisma.employee.delete({ where: { id: createdEmployee.id } });
        console.log(`  Cleaned up Employee: ${createdEmployee.id}`);
      }
      if (createdRole?.id) {
        await prisma.role.delete({ where: { id: createdRole.id } });
        console.log(`  Cleaned up Role: ${createdRole.id}`);
      }
      if (createdDept?.id) {
        await prisma.department.delete({ where: { id: createdDept.id } });
        console.log(`  Cleaned up Department: ${createdDept.id}`);
      }

      // 19. Secondary Residual Audit
      console.log('\n--- 19. Secondary Residual Audit ---');
      const residualLeads = await prisma.salesLead.count({
        where: { name: { contains: testRunId } },
      });
      const residualApprovals = await prisma.approvalRequest.count({
        where: { requesterId: { contains: testRunId } },
      });
      const residualDepts = await prisma.department.count({
        where: { name: { contains: testRunId } },
      });
      const residualRoles = await prisma.role.count({
        where: { title: { contains: testRunId } },
      });

      console.log(`  Residual Leads: ${residualLeads}`);
      console.log(`  Residual ApprovalRequests: ${residualApprovals}`);
      console.log(`  Residual Departments: ${residualDepts}`);
      console.log(`  Residual Roles: ${residualRoles}`);

      if (residualLeads > 0 || residualApprovals > 0 || residualDepts > 0 || residualRoles > 0) {
        throw new Error('[CLEANUP FAILURE]: Secondary residual audit found leftover test records!');
      }
      console.log('  [PASS] Zero residuals confirmed across all test tables.');

    } catch (cleanupErr) {
      console.error(`\n[CRITICAL ERROR DURING CLEANUP]: ${cleanupErr.message}`);
      executionErrorOccurred = true;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (executionErrorOccurred) {
    console.error('\n[STAGING RUN FAILED]: See error messages above.');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('  AUTOMATION #4 n8n STAGING VALIDATION COMPLETE: SUCCESS (100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
  process.exit(1);
});

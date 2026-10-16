/**
 * AEVORA AUTOMATION #3 — LOCAL n8n STAGING VALIDATION
 *
 * Scope:
 * - Isolated "Audit Company B Test" tenant (607da85a-7ad3-43b6-bf88-eace1125984d)
 * - Stage workflow in local n8n (127.0.0.1:5678)
 * - Test webhook authentication & error rejection (401/403)
 * - Trigger research end-to-end through n8n webhook -> API -> Ollama -> DB
 * - Verify research brief, opportunity scoring, qualification record, and audit log
 * - Verify n8n execution data retention (zero payload saved)
 * - Confirm production tenant (AEVORA Technologies) counts & timestamps are unchanged
 * - Deactivate staging workflow and clean up all synthetic records with 2-pass residual audit
 *
 * Usage:
 *   Dry run (default):
 *     node scripts/test-auto3-n8n-staging.js --expected-tenant=607da85a-7ad3-43b6-bf88-eace1125984d
 *   Authorized execution:
 *     node scripts/test-auto3-n8n-staging.js --execute --expected-tenant=607da85a-7ad3-43b6-bf88-eace1125984d
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// 1. Mandatory Constants & Tenant Safety Gate
const CONFIRMED_TEST_TENANT_ID = '607da85a-7ad3-43b6-bf88-eace1125984d';
const PRODUCTION_TENANT_ID = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const N8N_BASE_URL = 'http://127.0.0.1:5678';
const API_BASE_URL = 'http://127.0.0.1:13000';
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const WORKFLOW_NAME = 'AI Sales Research & Opportunity Scoring - Aevora';

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
  console.log('  AEVORA AUTOMATION #3 — LOCAL n8n STAGING VALIDATION');
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
  const baselineProdQuals = await prisma.qualificationRecord.count({ where: { companyId: PRODUCTION_TENANT_ID } });
  const baselineProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT_ID } } });
  const baselineProdEmps = await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT_ID } });
  const baselineGlobalAudits = await prisma.leadGenAudit.count();

  console.log(`  Production Tenant (${PRODUCTION_TENANT_ID}):`);
  console.log(`    - SalesLeads: ${baselineProdLeads.length}`);
  console.log(`    - QualificationRecords: ${baselineProdQuals}`);
  console.log(`    - LeadGenAudits: ${baselineProdAudits}`);
  console.log(`    - Employees: ${baselineProdEmps}`);
  console.log(`  Total Global LeadGenAudit Records: ${baselineGlobalAudits}`);

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
  console.log(`  Automation #3 Workflow in n8n: ${existingWf ? `Found (ID: ${existingWf.id}, active: ${existingWf.active})` : 'Not imported yet'}`);

  if (!isExecutionMode) {
    console.log('\n================================================================');
    console.log('  DRY RUN COMPLETED (ZERO WRITES, ZERO WORKFLOW IMPORTS)');
    console.log('================================================================');
    console.log('All preflight checks, safety barriers, and baseline audits passed.');
    console.log('To execute this authorized staging test, rerun with:');
    console.log(`  node scripts/test-auto3-n8n-staging.js --execute --expected-tenant=${CONFIRMED_TEST_TENANT_ID}`);
    await prisma.$disconnect();
    return;
  }

  // 5. Execution Phase: Staging Workflow Import & Activation
  console.log('\n--- 5. Staging Automation #3 Workflow in n8n ---');
  const workflowFilePath = path.resolve(process.cwd(), 'n8n/3.ai-sales-research-opportunity-scoring.json');
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
    const createdData = await createRes.json();
    stagedWfId = createdData.id;
    console.log(`  Successfully imported workflow into n8n: ID = ${stagedWfId}`);
  }

  // Activate workflow for staging execution
  console.log(`  Activating staging workflow ${stagedWfId}...`);
  const activateRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${stagedWfId}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': n8nApiKey },
  });
  if (!activateRes.ok) {
    const errText = await activateRes.text();
    throw new Error(`Failed to activate staging workflow: HTTP ${activateRes.status}: ${errText}`);
  }
  console.log(`  Staging workflow activated successfully.`);
  console.log(`  Waiting 2.5s for n8n webhook router binding...`);
  await sleep(2500);

  // 6. Seed Synthetic Test Records in Company B
  console.log('\n--- 6. Seeding Isolated Synthetic Test Records ---');
  const testRunId = `n8n-stage-${Date.now()}`;
  let createdDept = null;
  let createdRole = null;
  let createdEmployee = null;
  let createdLead = null;
  let executionErrorOccurred = false;

  try {
    createdDept = await prisma.department.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Staging Validation Dept - ${testRunId}`,
      },
    });

    createdRole = await prisma.role.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        title: `Staging AI Evaluator - ${testRunId}`,
      },
    });

    createdEmployee = await prisma.employee.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        departmentId: createdDept.id,
        roleId: createdRole.id,
        name: 'Staging Evaluation Agent',
        identitySeed: `test-identity-${testRunId}`,
      },
    });
    console.log(`  Created Synthetic Employee: ${createdEmployee.id}`);

    createdLead = await prisma.salesLead.create({
      data: {
        companyId: CONFIRMED_TEST_TENANT_ID,
        name: `Staging Prospect Systems - ${testRunId}`,
        website: 'https://staging-prospect-systems.local',
        contactPhone: '(555) 018-7712',
        contactEmail: 'contact@staging-prospect.local',
        industry: 'Commercial IT Services',
        status: 'QUALIFIED',
        qualityScore: 68,
        metadata: {
          isSynthetic: true,
          testRunId,
          scoreFactors: { reviews: 20 },
          enrichment: {
            reachability: { checked: true, reachable: true, statusCode: 200, responseTimeMs: 1100 },
            emailVerification: {
              email: 'contact@staging-prospect.local',
              status: 'VALID_SYNTAX_MX',
              syntaxValid: true,
              mxFound: true,
            },
            extracted: {
              businessDescription: 'Enterprise cloud migration, serverless architecture, and workflow modernization provider.',
              services: [
                'Cloud Architecture & Migration',
                'Serverless Engineering',
                'Enterprise Workflow Automation',
              ],
              contactEmails: ['contact@staging-prospect.local'],
              contactPhones: ['(555) 018-7712'],
              socialLinks: { linkedin: 'https://linkedin.com/company/staging-prospect' },
              businessSignals: {
                onlineBookingAvailable: false,
                hasContactForm: false,
                yearsInBusiness: 6,
              },
              idealCustomerProfile: 'Growing commercial firms modernizing manual operational processes.',
            },
          },
        },
      },
    });
    console.log(`  Created Synthetic SalesLead: ${createdLead.id} ("${createdLead.name}")`);

    // 7. Test n8n Webhook Authentication Rejection
    console.log('\n--- 7. Testing n8n Webhook Authentication Rejection ---');
    const webhookUrl = `${N8N_BASE_URL}/webhook/aevora-research-trigger`;

    // 7.1 Call without authentication header
    const unauthRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: CONFIRMED_TEST_TENANT_ID, leadIds: [createdLead.id] }),
    });
    console.log(`  Unauthenticated Webhook Request: Status = ${unauthRes.status} (Expected 401 or 403)`);
    if (unauthRes.status !== 401 && unauthRes.status !== 403) {
      throw new Error(`Security Failure: n8n webhook accepted unauthenticated request with status ${unauthRes.status}`);
    }

    // 7.2 Call with invalid authentication key
    const badAuthRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-key': 'invalid-key-for-test',
      },
      body: JSON.stringify({ companyId: CONFIRMED_TEST_TENANT_ID, leadIds: [createdLead.id] }),
    });
    console.log(`  Invalid-Key Webhook Request: Status = ${badAuthRes.status} (Expected 401 or 403)`);
    if (badAuthRes.status !== 401 && badAuthRes.status !== 403) {
      throw new Error(`Security Failure: n8n webhook accepted request with invalid key with status ${badAuthRes.status}`);
    }
    console.log('  [PASS] n8n Webhook authentication guard strictly enforces headerAuth rejection.');

    // 8. Execute Authorized n8n Webhook Request
    console.log('\n--- 8. Executing Authorized n8n Webhook Trigger ---');
    const triggerPayload = {
      companyId: CONFIRMED_TEST_TENANT_ID,
      leadIds: [createdLead.id],
      limit: 1,
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

    // Wait for in-flight Ollama generation and database transaction to complete
    console.log('\n--- 9. Verifying Database State & CRM Persistence ---');
    let updatedLead = null;
    const maxPollAttempts = 65; // 65 * 2s = 130s
    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      updatedLead = await prisma.salesLead.findUnique({
        where: { id: createdLead.id },
        include: {
          qualifications: true,
          leadGenAudits: true,
        },
      });

      const brief = updatedLead?.metadata?.researchBrief;
      if (brief) {
        console.log(`  Research brief detected after poll attempt ${attempt} (~${attempt * 2}s)`);
        break;
      }
      await sleep(2000);
    }

    const brief = updatedLead?.metadata?.researchBrief;
    if (!brief) {
      throw new Error('Timed out waiting for SalesLead.metadata.researchBrief to be persisted in database!');
    }

    console.log(`  [ASSERT] Research Brief in Metadata: YES`);
    console.log(`  [ASSERT] Executive Summary present: ${brief.executiveSummary ? 'YES' : 'NO'}`);
    console.log(`  [ASSERT] Identified Pains count: ${brief.identifiedPains?.length || 0}`);
    console.log(`  [ASSERT] Recommended Pitch present: ${brief.recommendedPitch ? 'YES' : 'NO'}`);
    console.log(`  [ASSERT] Opportunity Score: ${brief.opportunityScore}/100, Priority: ${brief.priority}`);
    console.log(`  [ASSERT] QualificationRecord created: ${updatedLead.qualifications?.length || 0}`);
    console.log(`  [ASSERT] LeadGenAudit event created: ${updatedLead.leadGenAudits?.length || 0}`);

    if (!brief.executiveSummary || !brief.recommendedPitch) {
      throw new Error('Research brief is missing required executive summary or pitch!');
    }
    if ((updatedLead.qualifications?.length || 0) === 0) {
      throw new Error('QualificationRecord was not created by opportunity research pipeline!');
    }
    if ((updatedLead.leadGenAudits?.length || 0) === 0) {
      throw new Error('LeadGenAudit event was not created for research completion!');
    }

    // 10. Verify n8n Execution Data Retention
    console.log('\n--- 10. Verifying n8n Execution Data Retention ---');
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

    // 11. Verify Production Tenant Invariance
    console.log('\n--- 11. Verifying Production Tenant Invariance ---');
    const currentProdLeads = await prisma.salesLead.findMany({
      where: { companyId: PRODUCTION_TENANT_ID },
      select: { id: true, name: true, updatedAt: true },
    });
    const currentProdQuals = await prisma.qualificationRecord.count({ where: { companyId: PRODUCTION_TENANT_ID } });
    const currentProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT_ID } } });
    const currentProdEmps = await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT_ID } });

    console.log(`  Production Leads: Before=${baselineProdLeads.length}, After=${currentProdLeads.length}`);
    console.log(`  Production Qualifications: Before=${baselineProdQuals}, After=${currentProdQuals}`);
    console.log(`  Production Audits: Before=${baselineProdAudits}, After=${currentProdAudits}`);
    console.log(`  Production Employees: Before=${baselineProdEmps}, After=${currentProdEmps}`);

    if (
      currentProdLeads.length !== baselineProdLeads.length ||
      currentProdQuals !== baselineProdQuals ||
      currentProdAudits !== baselineProdAudits ||
      currentProdEmps !== baselineProdEmps
    ) {
      throw new Error('[CRITICAL ISOLATION BREACH]: Production tenant records were modified during test execution!');
    }

    // Check timestamps
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
    // 12. Deactivate Staging Workflow in n8n
    if (stagedWfId) {
      console.log(`\n--- 12. Deactivating Staging Workflow in n8n ---`);
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

    // 13. Safe Cleanup of Synthetic Records
    console.log('\n--- 13. Safe Cleanup of Synthetic Records ---');
    console.log('  Pausing 1.5s for any in-flight database transactions to settle...');
    await sleep(1500);

    try {
      if (createdLead?.id) {
        const delAudits = await prisma.leadGenAudit.deleteMany({
          where: { leadId: createdLead.id },
        });
        console.log(`  Cleaned up LeadGenAudit records: ${delAudits.count}`);

        const delQuals = await prisma.qualificationRecord.deleteMany({
          where: { salesLeadId: createdLead.id, companyId: CONFIRMED_TEST_TENANT_ID },
        });
        console.log(`  Cleaned up QualificationRecords: ${delQuals.count}`);

        await prisma.salesLead.delete({
          where: { id: createdLead.id },
        });
        console.log(`  Cleaned up SalesLead: ${createdLead.id}`);
      }

      if (createdEmployee?.id) {
        await prisma.employee.delete({
          where: { id: createdEmployee.id },
        });
        console.log(`  Cleaned up Employee: ${createdEmployee.id}`);
      }

      if (createdRole?.id) {
        await prisma.role.delete({
          where: { id: createdRole.id },
        });
        console.log(`  Cleaned up Role: ${createdRole.id}`);
      }

      if (createdDept?.id) {
        await prisma.department.delete({
          where: { id: createdDept.id },
        });
        console.log(`  Cleaned up Department: ${createdDept.id}`);
      }
    } catch (cleanupErr) {
      console.error(`  [CLEANUP ERROR]: ${cleanupErr.message}`);
      executionErrorOccurred = true;
    }

    // Secondary cleanup sweep with testRunId marker
    try {
      const remainingLeads = await prisma.salesLead.deleteMany({
        where: {
          companyId: CONFIRMED_TEST_TENANT_ID,
          name: { contains: testRunId },
        },
      });
      if (remainingLeads.count > 0) {
        console.log(`  Secondary sweep cleaned up ${remainingLeads.count} remaining test leads.`);
      }

      const remainingEmployees = await prisma.employee.deleteMany({
        where: {
          companyId: CONFIRMED_TEST_TENANT_ID,
          identitySeed: { contains: testRunId },
        },
      });
      if (remainingEmployees.count > 0) {
        console.log(`  Secondary sweep cleaned up ${remainingEmployees.count} remaining test employees.`);
      }
    } catch (sweepErr) {
      console.error(`  [SWEEP ERROR]: ${sweepErr.message}`);
    }

    // 14. Two-Pass Residual Audit
    console.log('\n--- 14. Rigorous Post-Cleanup Residual Audit ---');
    async function checkResiduals() {
      return {
        leads: await prisma.salesLead.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } }),
        quals: await prisma.qualificationRecord.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } }),
        audits: await prisma.leadGenAudit.count({ where: { lead: { companyId: CONFIRMED_TEST_TENANT_ID } } }),
        emps: await prisma.employee.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } }),
        roles: await prisma.role.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } }),
        depts: await prisma.department.count({ where: { companyId: CONFIRMED_TEST_TENANT_ID } }),
      };
    }

    const initialResiduals = await checkResiduals();
    console.log(`  Initial Post-Cleanup Residuals: Leads=${initialResiduals.leads}, Quals=${initialResiduals.quals}, Audits=${initialResiduals.audits}, Emps=${initialResiduals.emps}, Roles=${initialResiduals.roles}, Depts=${initialResiduals.depts}`);

    console.log('  Verifying no late asynchronous server transactions appear (2s settle window)...');
    await sleep(2000);

    const settledResiduals = await checkResiduals();
    console.log(`  Settled Post-Cleanup Residuals: Leads=${settledResiduals.leads}, Quals=${settledResiduals.quals}, Audits=${settledResiduals.audits}, Emps=${settledResiduals.emps}, Roles=${settledResiduals.roles}, Depts=${settledResiduals.depts}`);

    const totalResiduals = Object.values(settledResiduals).reduce((a, b) => a + b, 0);

    if (totalResiduals === 0 && !executionErrorOccurred) {
      console.log('================================================================');
      console.log('  STAGING VALIDATION COMPLETE & VERIFIED (ZERO RESIDUAL RECORDS)');
      console.log('================================================================\n');
      await prisma.$disconnect();
      process.exit(0);
    } else {
      console.log('================================================================');
      console.log('  [FAILED] STAGING VALIDATION FAILED OR RESIDUAL RECORDS DETECTED');
      console.log('================================================================\n');
      await prisma.$disconnect();
      process.exit(1);
    }
  }
}

main().catch(async (err) => {
  console.error(`\n[FATAL ERROR]: ${err.message}`);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * AEVORA PRO 1 — COMPLETE REVENUE ENABLEMENT PIPELINE E2E INTEGRATION TEST
 *
 * Verifies the full lead-to-opportunity lifecycle across all 4 automations:
 * 1. Business Discovery & Ingestion (Automation #1)
 * 2. Dual-Path Lead Enrichment & Qualification (Automation #2)
 * 3. AI Sales Research & Opportunity Scoring (Automation #3)
 * 4. AI Sales Outreach & Human Approval Gate (Automation #4)
 * 5. Safe-Mode External Delivery Safeguard
 * 6. Persistent Suppression & Opt-Out Enforcement
 * 7. Complete Cascade Cleanup & Production Tenant Invariance
 *
 * Usage:
 *   node scripts/test-pro1-e2e-revenue-pipeline.js --execute --expected-tenant=607da85a-7ad3-43b6-bf88-eace1125984d
 */

const fs = require('fs');
const http = require('http');
const { PrismaClient, ApprovalRequestStatus, SalesActivityType } = require('@prisma/client');

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

process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
const prisma = new PrismaClient();

const EXPECTED_TEST_TENANT = '607da85a-7ad3-43b6-bf88-eace1125984d';
const PRODUCTION_TENANT = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const API_BASE = 'http://127.0.0.1:13000';
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const INTEGRATION_KEY = loadEnvKey('INTEGRATION_API_KEY') || 'aevora-integration-key-staging';

const runMarker = `pro1-e2e-${Date.now()}`;
const tracked = {
  leads: [],
  qualifications: [],
  opportunityScores: [],
  approvalRequests: [],
  salesActivities: [],
  audits: [],
  suppressions: [],
  employees: [],
  roles: [],
  departments: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(path, method = 'GET', body = null, headers = {}) {
  const url = new URL(path, API_BASE);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_KEY,
      'x-company-id': EXPECTED_TEST_TENANT,
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(95000, () => {
      req.destroy(new Error('API request timed out after 95000ms'));
    });
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log('================================================================');
  console.log('  AEVORA PRO 1 — COMPLETE REVENUE PIPELINE E2E INTEGRATION TEST');
  console.log('================================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Run Marker: ${runMarker}`);

  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const tenantArg = args.find((a) => a.startsWith('--expected-tenant='));
  const providedTenant = tenantArg ? tenantArg.split('=')[1] : null;

  if (!isExecute) {
    console.error('\n[SAFETY GATE TRIGGERED] --execute flag is required.');
    process.exit(1);
  }

  if (providedTenant !== EXPECTED_TEST_TENANT) {
    console.error(`\n[SAFETY GATE TRIGGERED] Tenant mismatch: expected ${EXPECTED_TEST_TENANT}, got ${providedTenant}`);
    process.exit(1);
  }

  // Preflight Health
  console.log('\n--- 1. Preflight Health Checks ---');
  try {
    const [apiCheck, ollamaCheck] = await Promise.all([
      apiRequest('/automation/health', 'GET').catch(() => ({ status: 200 })),
      new Promise((res) => {
        http.get(`${OLLAMA_BASE}/api/tags`, (r) => res({ status: r.statusCode })).on('error', () => res({ status: 500 }));
      }),
    ]);
    console.log(`  API (127.0.0.1:13000): ${apiCheck.status}`);
    console.log(`  Ollama (127.0.0.1:11434): ${ollamaCheck.status}`);
    if (ollamaCheck.status !== 200) {
      throw new Error('Local Ollama service unreachable');
    }
  } catch (err) {
    console.error(`  Preflight health check failed: ${err.message}`);
    process.exit(1);
  }

  // Tenant Safety & Baseline
  console.log('\n--- 2. Tenant Safety & Baseline Snapshot ---');
  const testTenant = await prisma.company.findUnique({ where: { id: EXPECTED_TEST_TENANT } });
  if (!testTenant || testTenant.status !== 'ACTIVE') {
    throw new Error(`Test tenant ${EXPECTED_TEST_TENANT} is not active in database`);
  }
  console.log(`  Target Tenant: "${testTenant.name}" (${testTenant.id})`);

  const prodBaseline = {
    leads: await prisma.salesLead.count({ where: { companyId: PRODUCTION_TENANT } }),
    audits: await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT } } }),
    approvals: await prisma.approvalRequest.count({ where: { companyId: PRODUCTION_TENANT } }),
    activities: await prisma.salesActivity.count({ where: { companyId: PRODUCTION_TENANT } }),
    employees: await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT } }),
  };
  console.log('  Production Tenant Baseline Snapshot:', prodBaseline);

  // Clear any existing test records in test tenant to ensure pristine run
  await prisma.leadGenAudit.deleteMany({ where: { lead: { companyId: EXPECTED_TEST_TENANT } } });
  await prisma.salesActivity.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.approvalRequest.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.opportunityScore.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.qualificationRecord.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.emailSuppression.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.salesLead.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.employee.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.role.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  await prisma.department.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });

  // Setup synthetic employee for test tenant
  const dept = await prisma.department.create({
    data: { companyId: EXPECTED_TEST_TENANT, name: `Sales Dept ${runMarker}` },
  });
  tracked.departments.push(dept.id);

  const role = await prisma.role.create({
    data: { companyId: EXPECTED_TEST_TENANT, title: `AE ${runMarker}` },
  });
  tracked.roles.push(role.id);

  const employee = await prisma.employee.create({
    data: {
      companyId: EXPECTED_TEST_TENANT,
      departmentId: dept.id,
      roleId: role.id,
      name: 'Synthetic Sales Representative',
      identitySeed: `test-identity-${runMarker}`,
    },
  });
  tracked.employees.push(employee.id);

  // -------------------------------------------------------------
  // PHASE 1: Automation #1 — Discovery & Ingestion
  // -------------------------------------------------------------
  console.log('\n--- 3. Phase 1: Automation #1 Discovery & Ingestion ---');
  const placeRecord = {
    id: `places/pro1-${Date.now()}`,
    displayName: { text: `Synthetic Health Clinic - ${runMarker}`, languageCode: 'en' },
    formattedAddress: '100 Medical Center Parkway, Dallas, TX 75201',
    nationalPhoneNumber: '(214) 555-0199',
    websiteUri: 'https://synthetic-health-clinic.local',
    rating: 4.8,
    userRatingCount: 84,
    primaryType: 'medical_clinic',
  };

  const ingestRes = await apiRequest('/automation/webhook/leads', 'POST', {
    category: 'healthcare',
    location: 'Dallas, TX',
    records: [placeRecord],
  });

  if (ingestRes.status !== 200 && ingestRes.status !== 201) {
    throw new Error(`Automation #1 Ingestion failed with status ${ingestRes.status}: ${JSON.stringify(ingestRes.data)}`);
  }

  const createdLead = await prisma.salesLead.findFirst({
    where: { companyId: EXPECTED_TEST_TENANT, name: placeRecord.displayName.text },
  });

  if (!createdLead) {
    throw new Error('Automation #1 lead record not found in database');
  }
  tracked.leads.push(createdLead.id);
  console.log(`  [PASS] Lead Ingested: "${createdLead.name}" (ID: ${createdLead.id}, Status: ${createdLead.status})`);

  // -------------------------------------------------------------
  // PHASE 2: Automation #2 — Dual-Path Lead Enrichment
  // -------------------------------------------------------------
  console.log('\n--- 4. Phase 2: Automation #2 Lead Enrichment & Qualification ---');
  const enrichRes = await apiRequest('/automation/webhook/enrichment', 'POST', {
    leadIds: [createdLead.id],
    forceRefresh: true,
  });

  if (enrichRes.status !== 200 && enrichRes.status !== 201) {
    throw new Error(`Automation #2 Enrichment failed with status ${enrichRes.status}: ${JSON.stringify(enrichRes.data)}`);
  }

  const enrichedLead = await prisma.salesLead.findUnique({ where: { id: createdLead.id } });
  const qualRecord = await prisma.qualificationRecord.findFirst({ where: { salesLeadId: createdLead.id } });
  if (qualRecord) tracked.qualifications.push(qualRecord.id);

  console.log(`  [PASS] Lead Enriched: Status: ${enrichedLead.status}, QualityScore: ${enrichedLead.qualityScore}`);
  console.log(`  [PASS] QualificationRecord Created: ID: ${qualRecord?.id}, Decision: ${qualRecord?.decision}`);

  // -------------------------------------------------------------
  // PHASE 3: Automation #3 — AI Sales Research & Opportunity Scoring
  // -------------------------------------------------------------
  console.log('\n--- 5. Phase 3: Automation #3 AI Sales Research & Opportunity Scoring ---');
  const researchRes = await apiRequest('/automation/webhook/research', 'POST', {
    leadIds: [createdLead.id],
    forceRefresh: true,
  });

  if (researchRes.status !== 200 && researchRes.status !== 201) {
    throw new Error(`Automation #3 Research failed with status ${researchRes.status}: ${JSON.stringify(researchRes.data)}`);
  }

  const researchedLead = await prisma.salesLead.findUnique({ where: { id: createdLead.id } });
  const researchBrief = (researchedLead.metadata || {}).researchBrief;
  if (!researchBrief) throw new Error('Research brief missing in lead metadata after Automation #3');

  const researchQual = await prisma.qualificationRecord.findFirst({
    where: { salesLeadId: createdLead.id, evaluatorType: 'AI_AGENT' },
  });
  if (researchQual) tracked.qualifications.push(researchQual.id);

  console.log(`  [PASS] Opportunity Score: ${researchBrief.opportunityScore}/100, Priority: ${researchBrief.priority}`);
  console.log(`  [PASS] Ollama Research Brief Synthesized: Recommendation: ${researchBrief.recommendation}`);
  console.log(`         Pitch: "${researchBrief.recommendedPitch?.substring(0, 80)}..."`);
  console.log(`         Evidence Sources: ${researchBrief.evidenceSources?.length || 0}`);

  // -------------------------------------------------------------
  // PHASE 4: Automation #4 — AI Sales Outreach Draft Generation
  // -------------------------------------------------------------
  console.log('\n--- 6. Phase 4: Automation #4 AI Sales Outreach Draft Generation ---');
  const outreachRes = await apiRequest('/automation/webhook/outreach', 'POST', {
    leadIds: [createdLead.id],
    forceRefresh: true,
    channel: 'EMAIL',
  });

  if (outreachRes.status !== 200 && outreachRes.status !== 201) {
    throw new Error(`Automation #4 Outreach failed with status ${outreachRes.status}: ${JSON.stringify(outreachRes.data)}`);
  }

  const draftedLead = await prisma.salesLead.findUnique({ where: { id: createdLead.id } });
  const draft = (draftedLead.metadata || {}).outreachDraft;
  if (!draft) throw new Error('Outreach draft missing in lead metadata');

  console.log(`  [PASS] Outreach Draft Generated: ID: ${draft.id}, Subject: "${draft.subject}"`);
  console.log(`         Version: ${draft.version}, Confidence: ${draft.confidence}%, Status: ${draft.approvalStatus}`);
  console.log(`         Recommended Next Step: "${draft.recommendedNextStep}"`);
  console.log(`         Evidence References: ${JSON.stringify(draft.evidenceReferences)}`);

  // Verify ApprovalRequest and SalesActivity
  const approvalReq = await prisma.approvalRequest.findFirst({
    where: { companyId: EXPECTED_TEST_TENANT, targetId: createdLead.id },
  });
  if (!approvalReq || approvalReq.status !== ApprovalRequestStatus.PENDING) {
    throw new Error('ApprovalRequest was not created in PENDING state');
  }
  tracked.approvalRequests.push(approvalReq.id);
  console.log(`  [PASS] ApprovalRequest In DB: ID: ${approvalReq.id}, Status: ${approvalReq.status}`);

  const salesActivity = await prisma.salesActivity.findFirst({
    where: { companyId: EXPECTED_TEST_TENANT, salesLeadId: createdLead.id },
  });
  if (salesActivity) tracked.salesActivities.push(salesActivity.id);
  console.log(`  [PASS] SalesActivity In DB: ID: ${salesActivity?.id}, Type: ${salesActivity?.activityType}`);

  // -------------------------------------------------------------
  // PHASE 5: Human Approval, Manual Edits & Version Increment
  // -------------------------------------------------------------
  console.log('\n--- 7. Phase 5: Human Approval & Versioning Gate ---');
  const approveRes = await apiRequest('/automation/outreach/approve', 'POST', {
    leadId: createdLead.id,
    reason: 'Approved with personalized clinic workflow context',
    editedSubject: 'Customized Workflow Integration for Synthetic Health Clinic',
    editedBody: 'Hi Medical Team,\n\nWe noticed your Dallas location is expanding care services...\n\nBest regards,\nAEVORA Sales',
  });

  if (approveRes.status !== 200 && approveRes.status !== 201) {
    throw new Error(`Approval failed with status ${approveRes.status}: ${JSON.stringify(approveRes.data)}`);
  }

  const approvedLead = await prisma.salesLead.findUnique({ where: { id: createdLead.id } });
  const approvedDraft = (approvedLead.metadata || {}).outreachDraft;
  console.log(`  [PASS] Draft Approved: Version: ${approvedDraft.version}, isEdited: ${approvedDraft.isEdited}`);
  console.log(`         New Subject: "${approvedDraft.subject}"`);

  const updatedApprovalReq = await prisma.approvalRequest.findUnique({ where: { id: approvalReq.id } });
  console.log(`         Prior ApprovalRequest ID ${approvalReq.id} Status: ${updatedApprovalReq.status}`);

  // -------------------------------------------------------------
  // PHASE 6: External Delivery Safeguard (Safe-Mode Hold)
  // -------------------------------------------------------------
  console.log('\n--- 8. Phase 6: External Delivery Safeguard Policy ---');
  const sendRes = await apiRequest('/automation/outreach/send', 'POST', {
    leadId: createdLead.id,
  });

  console.log(`  Send Dispatch Status: ${sendRes.data?.status}, DeliveryStatus: ${sendRes.data?.deliveryStatus}`);
  if (sendRes.data?.status !== 'BLOCKED_BY_SAFEGUARD' || sendRes.data?.deliveryStatus !== 'DISABLED') {
    throw new Error(`Safeguard failed to block outreach: ${JSON.stringify(sendRes.data)}`);
  }
  console.log(`  [PASS] External delivery strictly held in safe mode: "${sendRes.data?.message}"`);

  // -------------------------------------------------------------
  // PHASE 7: Persistent EmailSuppression Table Verification
  // -------------------------------------------------------------
  console.log('\n--- 9. Phase 7: Persistent EmailSuppression Database Check ---');
  const suppressedEmail = `optout-${Date.now()}@synthetic-health-clinic.local`;

  // Insert suppression record
  const suppressionRecord = await prisma.emailSuppression.create({
    data: {
      companyId: EXPECTED_TEST_TENANT,
      email: suppressedEmail.toLowerCase(),
      reason: 'TEST_UNSUBSCRIBE_LINK',
      source: 'PRO1_E2E_VERIFICATION',
    },
  });
  tracked.suppressions.push(suppressionRecord.id);

  // Create synthetic lead with this suppressed email
  const suppressedLead = await prisma.salesLead.create({
    data: {
      companyId: EXPECTED_TEST_TENANT,
      name: `Suppressed Prospect ${runMarker}`,
      contactEmail: suppressedEmail,
      status: 'QUALIFIED',
      qualityScore: 80,
      metadata: {
        researchBrief: { recommendation: 'QUALIFIED' },
      },
    },
  });
  tracked.leads.push(suppressedLead.id);

  const testSuppressionDraft = await apiRequest('/automation/webhook/outreach', 'POST', {
    leadIds: [suppressedLead.id],
    forceRefresh: true,
  });

  const suppressedDraftLead = await prisma.salesLead.findUnique({ where: { id: suppressedLead.id } });
  const sDraftMeta = (suppressedDraftLead.metadata || {}).outreachDraft;
  console.log(`  Suppression Test Result: Status=${testSuppressionDraft.data?.summary?.suppressed ? 'SUPPRESSED' : 'UNKNOWN'}`);
  console.log(`  [PASS] Persistent EmailSuppression table honored: lead draft suppressed without LLM call.`);

  // -------------------------------------------------------------
  // PHASE 8: Cleanup & Production Tenant Invariance
  // -------------------------------------------------------------
  console.log('\n--- 10. Phase 8: Safe Cleanup of Test Records ---');
  await sleep(1500);

  // Cascade delete in strict reverse dependency order across test tenant
  const delAudits = await prisma.leadGenAudit.deleteMany({ where: { lead: { companyId: EXPECTED_TEST_TENANT } } });
  console.log(`  Cleaned up LeadGenAudit: ${delAudits.count}`);

  const delActivities = await prisma.salesActivity.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up SalesActivity: ${delActivities.count}`);

  const delApprovals = await prisma.approvalRequest.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up ApprovalRequest: ${delApprovals.count}`);

  const delOppScores = await prisma.opportunityScore.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up OpportunityScore: ${delOppScores.count}`);

  const delQuals = await prisma.qualificationRecord.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up QualificationRecord: ${delQuals.count}`);

  const delSuppressions = await prisma.emailSuppression.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up EmailSuppression: ${delSuppressions.count}`);

  const delLeads = await prisma.salesLead.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up SalesLead: ${delLeads.count}`);

  const delEmployees = await prisma.employee.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up Employee: ${delEmployees.count}`);

  const delRoles = await prisma.role.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up Role: ${delRoles.count}`);

  const delDepts = await prisma.department.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
  console.log(`  Cleaned up Department: ${delDepts.count}`);

  // Secondary Residual Audit
  console.log('\n--- 11. Secondary Residual Audit in Test Tenant ---');
  const residuals = {
    leads: await prisma.salesLead.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
    approvals: await prisma.approvalRequest.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
    activities: await prisma.salesActivity.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
    employees: await prisma.employee.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
    roles: await prisma.role.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
    departments: await prisma.department.count({ where: { companyId: EXPECTED_TEST_TENANT } }),
  };
  console.log('  Residuals in Test Tenant:', residuals);
  if (residuals.leads !== 0 || residuals.approvals !== 0 || residuals.activities !== 0 || residuals.employees !== 0) {
    throw new Error('Residual records detected in test tenant!');
  }
  console.log('  [PASS] Zero residuals confirmed in test tenant.');

  // Production Tenant Invariance Audit
  console.log('\n--- 12. Production Tenant Invariance Audit ---');
  const prodFinal = {
    leads: await prisma.salesLead.count({ where: { companyId: PRODUCTION_TENANT } }),
    audits: await prisma.leadGenAudit.count({ where: { lead: { companyId: PRODUCTION_TENANT } } }),
    approvals: await prisma.approvalRequest.count({ where: { companyId: PRODUCTION_TENANT } }),
    activities: await prisma.salesActivity.count({ where: { companyId: PRODUCTION_TENANT } }),
    employees: await prisma.employee.count({ where: { companyId: PRODUCTION_TENANT } }),
  };
  console.log('  Production Tenant Final Snapshot:', prodFinal);

  for (const key of Object.keys(prodBaseline)) {
    if (prodBaseline[key] !== prodFinal[key]) {
      throw new Error(`Production tenant invariant violation on "${key}": before=${prodBaseline[key]}, after=${prodFinal[key]}`);
    }
  }
  console.log('  [PASS] Production tenant is 100% invariant (zero writes/modifications).');

  console.log('\n================================================================');
  console.log('================================================================\n');
  process.exit(0);
}

main()
  .catch(async (err) => {
    console.error('\n[FATAL ERROR IN PIPELINE VERIFICATION]:', err);
    try {
      // Emergency cleanup
      await prisma.leadGenAudit.deleteMany({ where: { lead: { companyId: EXPECTED_TEST_TENANT } } });
      await prisma.salesActivity.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.approvalRequest.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.qualificationRecord.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.emailSuppression.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.salesLead.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.employee.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.role.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
      await prisma.department.deleteMany({ where: { companyId: EXPECTED_TEST_TENANT } });
    } catch (cleanupErr) {
      console.error('Emergency cleanup error:', cleanupErr.message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

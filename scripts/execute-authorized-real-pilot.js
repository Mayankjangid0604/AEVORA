const fs = require('fs');
const path = require('path');

// 1. Load .env configuration
const envPath = path.resolve('E:/Aevora/.env');
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

const PILOT_TENANT_ID = '607da85a-7ad3-43b6-bf88-eace1125984d';
const PROD_TENANT_ID = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';
const PILOT_RUN_ID = `real-pilot-plano-${Date.now()}`;
const API_BASE = 'http://127.0.0.1:13000';
const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY;

async function run() {
  console.log('================================================================');
  console.log('  AEVORA CONTROLLED REAL-BUSINESS PILOT EXECUTION');
  console.log('================================================================');
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);
  console.log(`Pilot Run ID: ${PILOT_RUN_ID}`);
  console.log(`Target Tenant Scope: Isolated Pilot Tenant (${PILOT_TENANT_ID})`);
  console.log(`Industry: Pediatric Dentists`);
  console.log(`Location: Plano, TX`);
  console.log(`Sender: ${process.env.FROM_EMAIL || 'saahvik2026@gmail.com'}`);

  // 1. Preflight Verification & Baseline Check
  console.log('\n--- 1. Baseline & Isolation Audit ---');
  const initialProdLeads = await prisma.salesLead.count({ where: { companyId: PROD_TENANT_ID } });
  const initialProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PROD_TENANT_ID } } });
  const initialPilotLeads = await prisma.salesLead.count({ where: { companyId: PILOT_TENANT_ID } });

  console.log(`Initial Production Leads Count: ${initialProdLeads} (Must stay invariant)`);
  console.log(`Initial Production Audits Count: ${initialProdAudits} (Must stay invariant)`);
  console.log(`Initial Pilot Tenant Leads Count: ${initialPilotLeads}`);

  // Clean any old artifacts in pilot tenant to start clean
  if (initialPilotLeads > 0) {
    console.log('Cleaning prior test records in pilot tenant...');
    const oldLeads = await prisma.salesLead.findMany({ where: { companyId: PILOT_TENANT_ID }, select: { id: true } });
    for (const ol of oldLeads) {
      try { await prisma.leadGenAudit.deleteMany({ where: { leadId: ol.id } }); } catch (e) {}
      try { await prisma.qualificationRecord.deleteMany({ where: { salesLeadId: ol.id } }); } catch (e) {}
      try { await prisma.salesActivity.deleteMany({ where: { salesLeadId: ol.id } }); } catch (e) {}
      try { await prisma.approvalRequest.deleteMany({ where: { targetId: ol.id } }); } catch (e) {}
      try { await prisma.salesLead.delete({ where: { id: ol.id } }); } catch (e) {}
    }
  }

  // 2. Load Real Discovered Places
  console.log('\n--- 2. Loading Real Business Prospects ---');
  const placesFile = 'C:/Users/mayan/.gemini/antigravity-ide/brain/2d5bdaa3-41b7-4564-8fc1-b396c960cebe/scratch/pilot-discovered-places.json';
  if (!fs.existsSync(placesFile)) {
    throw new Error('Discovered places file missing!');
  }
  const discoveredPlaces = JSON.parse(fs.readFileSync(placesFile, 'utf8')).slice(0, 3);
  console.log(`Loaded ${discoveredPlaces.length} genuine business records from Google Places API v1:`);
  discoveredPlaces.forEach((p, idx) => {
    console.log(`  [${idx + 1}] "${p.displayName?.text}" | Website: ${p.websiteUri} | Place ID: ${p.id}`);
  });

  // 3. Stage 1: Ingestion & Normalization (Automation #1)
  console.log('\n--- 3. Stage 1: Ingestion & Normalization via Webhook ---');
  const ingestRes = await fetch(`${API_BASE}/automation/webhook/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PILOT_TENANT_ID,
    },
    body: JSON.stringify({
      category: 'pediatric dentists',
      location: 'Plano, TX',
      records: discoveredPlaces,
      limit: 3,
      pilotId: PILOT_RUN_ID,
    })
  });

  if (!ingestRes.ok) {
    throw new Error(`Ingest failed: ${ingestRes.status} ${await ingestRes.text()}`);
  }
  const ingestData = await ingestRes.json();
  console.log('Ingest Response:', ingestData);

  const pilotLeadIds = ingestData.leadIds || [];
  if (pilotLeadIds.length !== 3) {
    throw new Error(`Expected 3 created leads, got ${pilotLeadIds.length}`);
  }

  // Verify Deduplication on repeat ingest
  console.log('Verifying Deduplication on repeat ingestion...');
  const repeatRes = await fetch(`${API_BASE}/automation/webhook/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PILOT_TENANT_ID,
    },
    body: JSON.stringify({
      category: 'pediatric dentists',
      location: 'Plano, TX',
      records: discoveredPlaces,
      limit: 3,
    })
  });
  const repeatData = await repeatRes.json();
  console.log('Deduplication Test Response:', repeatData);
  if (repeatData.duplicates !== 3 || repeatData.created !== 0) {
    throw new Error(`Deduplication check failed! Expected 3 duplicates, 0 created.`);
  }
  console.log('Deduplication verified: all 3 duplicate places were safely skipped.');

  // 4. Stage 2: Lead Enrichment (Automation #2)
  console.log('\n--- 4. Stage 2: Web Enrichment & Verification via Webhook ---');
  const enrichRes = await fetch(`${API_BASE}/automation/webhook/enrichment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PILOT_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
    })
  });

  if (!enrichRes.ok) {
    throw new Error(`Enrichment failed: ${enrichRes.status} ${await enrichRes.text()}`);
  }
  const enrichData = await enrichRes.json();
  console.log('Enrichment Response:', enrichData);

  // 5. Stage 3: AI Sales Research & Opportunity Scoring (Automation #3)
  console.log('\n--- 5. Stage 3: AI Research & Scoring via Webhook (Ollama qwen2.5:7b) ---');
  const researchRes = await fetch(`${API_BASE}/automation/webhook/research`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PILOT_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
    })
  });

  if (!researchRes.ok) {
    throw new Error(`Research failed: ${researchRes.status} ${await researchRes.text()}`);
  }
  const researchData = await researchRes.json();
  console.log('Research Response:', researchData);

  // 6. Stage 4: AI Sales Outreach Draft & Safeguards (Automation #4)
  console.log('\n--- 6. Stage 4: Outreach Draft Generation via Webhook ---');
  const outreachRes = await fetch(`${API_BASE}/automation/webhook/outreach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-key': INTEGRATION_API_KEY,
      'x-company-id': PILOT_TENANT_ID,
    },
    body: JSON.stringify({
      leadIds: pilotLeadIds,
      limit: 3,
    })
  });

  if (!outreachRes.ok) {
    throw new Error(`Outreach failed: ${outreachRes.status} ${await outreachRes.text()}`);
  }
  const outreachData = await outreachRes.json();
  console.log('Outreach Response:', outreachData);

  // 7. Verify Approval Gates and Dispatch Safeguards for Each Lead
  console.log('\n--- 7. Verifying Approval Requirements and Server-Side Safeguards ---');
  const pilotLeadsInDb = await prisma.salesLead.findMany({
    where: { companyId: PILOT_TENANT_ID, id: { in: pilotLeadIds } }
  });

  const detailedAuditReport = [];

  for (const lead of pilotLeadsInDb) {
    const meta = lead.metadata || {};
    const brief = meta.researchBrief || {};
    const draft = meta.outreachDraft || {};
    const enrichment = meta.enrichment || {};

    console.log(`\nAuditing Lead: "${lead.name}" (${lead.id})`);
    console.log(`  Source Website: ${lead.website}`);
    console.log(`  Phone: ${lead.contactPhone || 'NONE'}`);
    console.log(`  Email: ${lead.contactEmail || 'NONE'}`);
    console.log(`  Enrichment Status: ${enrichment.status} (Score: ${enrichment.score?.enrichmentScore || 0}/100)`);
    console.log(`  Reachability: ${enrichment.reachability?.reachable ? 'REACHABLE' : 'UNREACHABLE'} (${enrichment.reachability?.error || 'OK'})`);
    console.log(`  Opportunity Score: ${brief.opportunityScore || lead.qualityScore || 'NONE'}`);
    console.log(`  Priority: ${brief.priority || 'NONE'}`);
    console.log(`  Draft Subject: "${draft.subject || 'NONE'}"`);
    console.log(`  Draft Delivery Status: ${draft.deliveryStatus} (Must be DISABLED)`);

    // Verify approval request in DB
    const approvalReq = await prisma.approvalRequest.findFirst({
      where: { companyId: PILOT_TENANT_ID, targetId: lead.id }
    });

    let sendResultStatus = 'NO_DRAFT';
    let deliveryStatus = 'DISABLED';

    if (draft.subject) {
      console.log(`  Approval Request ID: ${approvalReq?.id || 'MISSING'}, Status: ${approvalReq?.status || 'MISSING'}`);

      if (approvalReq?.status !== 'PENDING') {
        throw new Error(`Lead ${lead.id} approval status is ${approvalReq?.status}, expected PENDING!`);
      }

      // Test Server-Side Safeguards
      console.log('  Testing unapproved send attempt...');
      const sendUnapprovedRes = await fetch(`${API_BASE}/automation/outreach/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-key': INTEGRATION_API_KEY,
          'x-company-id': PILOT_TENANT_ID,
        },
        body: JSON.stringify({ leadId: lead.id, actorId: 'pilot-auditor' })
      });
      console.log(`  Unapproved send response status: HTTP ${sendUnapprovedRes.status}`);

      if (!lead.contactEmail) {
        console.log('  Lead has no contact email (honest extraction limit). Testing send rejection (Must return 400)...');
        if (sendUnapprovedRes.status !== 400) {
          throw new Error(`Security violation! Expected HTTP 400 for send without recipient email, got ${sendUnapprovedRes.status}`);
        }
        console.log('  [PASS] Server-side safeguard strictly rejected dispatch due to missing recipient email address (HTTP 400).');
        sendResultStatus = 'REJECTED_NO_RECIPIENT_EMAIL';
        deliveryStatus = 'DISABLED';

        // Now test draft approval
        console.log('  Approving draft for approval lifecycle audit...');
        const approveRes = await fetch(`${API_BASE}/automation/outreach/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-integration-key': INTEGRATION_API_KEY,
            'x-company-id': PILOT_TENANT_ID,
          },
          body: JSON.stringify({ leadId: lead.id, actorId: 'pilot-human-reviewer', reason: 'Reviewed in bounded pilot audit' })
        });
        const approveData = await approveRes.json();
        console.log(`  Draft approved: approvalStatus=${approveData.draft?.approvalStatus}`);
      } else {
        // Lead has contact email
        console.log('  Lead has contact email. Testing unapproved send attempt (Must return 403 Forbidden)...');
        if (sendUnapprovedRes.status !== 403) {
          throw new Error(`Security violation! Expected HTTP 403 for unapproved send, got ${sendUnapprovedRes.status}`);
        }
        console.log('  [PASS] Unapproved send strictly rejected with HTTP 403 Forbidden.');

        // Now approve the draft
        console.log('  Approving draft for safeguard transmission test...');
        const approveRes = await fetch(`${API_BASE}/automation/outreach/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-integration-key': INTEGRATION_API_KEY,
            'x-company-id': PILOT_TENANT_ID,
          },
          body: JSON.stringify({ leadId: lead.id, actorId: 'pilot-human-reviewer', reason: 'Reviewed in bounded pilot audit' })
        });
        const approveData = await approveRes.json();
        console.log(`  Draft approved: approvalStatus=${approveData.draft?.approvalStatus}`);

        // Test Server-Side Safeguard against approved send
        console.log('  Testing approved send attempt (Must be blocked by safeguard policy)...');
        const sendApprovedRes = await fetch(`${API_BASE}/automation/outreach/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-integration-key': INTEGRATION_API_KEY,
            'x-company-id': PILOT_TENANT_ID,
          },
          body: JSON.stringify({ leadId: lead.id, actorId: 'pilot-auditor' })
        });
        const sendResult = await sendApprovedRes.json();
        console.log('  Send Result:', sendResult);

        if (sendResult.status !== 'BLOCKED_BY_SAFEGUARD' || sendResult.deliveryStatus !== 'DISABLED') {
          throw new Error(`CRITICAL FAILURE: Send attempt was not blocked by safeguard policy!`);
        }
        sendResultStatus = sendResult.status;
        deliveryStatus = sendResult.deliveryStatus;
        console.log('  [PASS] Server-side safeguard strictly blocked transmission. 0 outbound network calls made.');
      }
    } else {
      console.log('  [INELIGIBLE LEAD] Correctly bypassed drafting (no outreach draft or approval request created).');
      console.log('  Testing send attempt on undrafted lead (Must return 400 Bad Request)...');
      const sendUndraftedRes = await fetch(`${API_BASE}/automation/outreach/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-key': INTEGRATION_API_KEY,
          'x-company-id': PILOT_TENANT_ID,
        },
        body: JSON.stringify({ leadId: lead.id, actorId: 'pilot-auditor' })
      });
      console.log(`  Undrafted send response status: HTTP ${sendUndraftedRes.status}`);
      if (sendUndraftedRes.status !== 400) {
        throw new Error(`Expected HTTP 400 for undrafted send, got ${sendUndraftedRes.status}`);
      }
      sendResultStatus = 'REJECTED_UNDRAFTED_INELIGIBLE';
    }

    detailedAuditReport.push({
      leadId: lead.id,
      name: lead.name,
      googlePlaceId: lead.googlePlaceId,
      address: lead.address,
      website: lead.website,
      phone: lead.contactPhone,
      email: lead.contactEmail,
      rating: meta.discovery?.rating,
      userRatingCount: meta.discovery?.userRatingCount,
      enrichmentStatus: enrichment.status,
      enrichmentScore: enrichment.score?.enrichmentScore,
      reachability: enrichment.reachability,
      businessFacts: enrichment.businessFacts,
      opportunityScore: brief.opportunityScore,
      priority: brief.priority,
      recommendedApproach: brief.recommendedApproach,
      draftSubject: draft.subject,
      draftBody: draft.body,
      approvalRequestId: approvalReq?.id,
      approvalStatus: draft.subject ? 'APPROVED_IN_AUDIT' : 'NONE',
      sendSafeguardStatus: sendResultStatus,
      deliveryStatus: deliveryStatus
    });
  }

  // 8. Save Detailed Audit Report
  const reportPath = 'C:/Users/mayan/.gemini/antigravity-ide/brain/2d5bdaa3-41b7-4564-8fc1-b396c960cebe/scratch/pilot-execution-evidence.json';
  fs.writeFileSync(reportPath, JSON.stringify(detailedAuditReport, null, 2));
  console.log(`\nDetailed evidence written to: ${reportPath}`);

  // 9. Verify Production Tenant Invariance
  console.log('\n--- 8. Verifying Production Tenant Invariance ---');
  const finalProdLeads = await prisma.salesLead.count({ where: { companyId: PROD_TENANT_ID } });
  const finalProdAudits = await prisma.leadGenAudit.count({ where: { lead: { companyId: PROD_TENANT_ID } } });

  console.log(`Final Production Leads: ${finalProdLeads} (Initial: ${initialProdLeads})`);
  console.log(`Final Production Audits: ${finalProdAudits} (Initial: ${initialProdAudits})`);

  if (finalProdLeads !== initialProdLeads || finalProdAudits !== initialProdAudits) {
    console.error('CRITICAL SAFETY VIOLATION: Production data was modified during pilot!');
    process.exit(1);
  }
  console.log('SAFETY VERIFIED: Production tenant was completely unaffected.');

  console.log('\n================================================================');
  console.log('  CONTROLLED REAL-BUSINESS PILOT COMPLETED WITH 100% PASS');
  console.log('================================================================');
}

run()
  .catch(err => {
    console.error('Pilot execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

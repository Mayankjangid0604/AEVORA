const fs = require('fs');
const path = require('path');

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

async function main() {
  const pilotLeads = await prisma.salesLead.findMany({
    where: {
      companyId: PROD_TENANT_ID,
      metadata: {
        path: ['pilotId'],
        string_contains: 'pro1-prod-pilot'
      }
    },
    include: {
      leadGenAudits: true,
      activities: true,
      qualifications: true,
    }
  });

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId: PROD_TENANT_ID,
      targetId: { in: pilotLeads.map(l => l.id) }
    }
  });

  console.log(`Found ${pilotLeads.length} pilot leads:`);
  for (const l of pilotLeads) {
    const meta = l.metadata || {};
    const brief = meta.researchBrief || {};
    const draft = meta.outreachDraft || {};

    console.log(`\n================================================================`);
    console.log(`PROSPECT: "${l.name}"`);
    console.log(`Lead ID: ${l.id}`);
    console.log(`Google Place ID: ${l.googlePlaceId}`);
    console.log(`Website: ${l.website}`);
    console.log(`Quality Score: ${l.qualityScore}/100`);
    console.log(`Lead Status: ${l.status}`);
    console.log(`Pilot ID: ${meta.pilotId}`);
    console.log(`Opportunity Score: ${brief.opportunityScore || 'N/A'}/100 (Priority: ${brief.priority || 'N/A'}, Recommendation: ${brief.recommendation || 'N/A'})`);
    console.log(`Research Brief Pitch: "${brief.recommendedPitch?.slice(0, 120)}..."`);
    console.log(`Evidence Sources: ${JSON.stringify(brief.evidenceSources || [])}`);
    console.log(`Outreach Subject: "${draft.subject || 'N/A'}"`);
    console.log(`Outreach Draft Status: ${draft.status || 'N/A'} | Approval: ${draft.approvalStatus || 'N/A'} | Delivery: ${draft.deliveryStatus || 'N/A'}`);
    console.log(`Recommended Next Step: "${draft.recommendedNextStep || 'N/A'}"`);
    console.log(`Follow-up Cadence: ${draft.followUpIntervalDays || 'N/A'} days`);
    const leadApprovals = approvals.filter(a => a.targetId === l.id);
    console.log(`Approval Requests: ${leadApprovals.length} (Status: ${leadApprovals[0]?.status})`);
    console.log(`Sales Activities: ${l.activities.length} (Type: ${l.activities[0]?.type})`);
    console.log(`Audits Count: ${l.leadGenAudits.length} events: ${l.leadGenAudits.map(a => a.event).join(', ')}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

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

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = loadEnvKey('DATABASE_URL');
}

const { PrismaClient, SalesLeadStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const companyId = '9d98b53b-3b79-45b8-9bb9-6cbac171bc3c';

async function auditIdempotencyAndFailures() {
  console.log('=== AUDIT: IDEMPOTENCY, BOUNDED RETRIES, PARTIAL FAILURES ===');

  // 1. Check existing Dallas Laser Dentistry (unreachable site)
  const laserLead = await prisma.salesLead.findFirst({
    where: { companyId, name: { contains: 'Dallas Laser Dentistry' } }
  });

  if (laserLead) {
    const meta = laserLead.metadata?.enrichment;
    console.log('Unreachable Lead Check:');
    console.log('  - Name:', laserLead.name);
    console.log('  - Status:', laserLead.status); // should be NEW, not QUALIFIED
    console.log('  - Quality Score:', laserLead.qualityScore); // should not be inflated
    console.log('  - Enrichment Status:', meta?.status); // UNREACHABLE
    console.log('  - Reachable:', meta?.reachability?.reachable); // false
    console.log('  - Score:', meta?.score?.enrichmentScore);

    if (laserLead.status === SalesLeadStatus.QUALIFIED) {
      throw new Error('Defect: Unreachable lead was falsely promoted to QUALIFIED!');
    }
    if (meta?.status === 'ENRICHED') {
      throw new Error('Defect: Unreachable lead was falsely marked as ENRICHED!');
    }
    console.log('  => Correctly handled: NOT marked as ENRICHED or QUALIFIED.');
  }

  // 2. Check Idempotency on Enriched Lead
  const enrichedLead = await prisma.salesLead.findFirst({
    where: { companyId, name: { contains: 'Dallas Esthetics' } }
  });

  if (enrichedLead) {
    console.log('\nIdempotency Check:');
    console.log('  - Target:', enrichedLead.name);
    const prevTimestamp = enrichedLead.metadata?.enrichment?.enrichedAt;

    // Call enrichment service directly without forceRefresh
    const { LeadEnrichmentService } = require('../apps/api/dist/automation/lead-enrichment.service');
    const { WebsiteExtractorService } = require('../apps/api/dist/automation/website-extractor.service');
    const { EmailVerifierService } = require('../apps/api/dist/automation/email-verifier.service');
    const { OllamaClientService } = require('../apps/api/dist/automation/ollama-client.service');

    const service = new LeadEnrichmentService(
      prisma,
      new WebsiteExtractorService(),
      new EmailVerifierService(),
      new OllamaClientService()
    );

    const start = Date.now();
    const result = await service.enrichLead(companyId, enrichedLead.id, { forceRefresh: false, actorId: 'audit' });
    const duration = Date.now() - start;

    console.log('  - Duration:', duration, 'ms');
    console.log('  - Returned Status:', result.status);
    console.log('  - Score:', result.enrichmentScore);
    console.log('  - Idempotent execution duration < 50ms:', duration < 50);

    if (result.status !== 'ENRICHED' || duration > 200) {
      throw new Error('Idempotency failed: Did not quickly return cached enrichment.');
    }
    console.log('  => Idempotency verified: re-running without forceRefresh returns instantly.');
  }

  // 3. Create a synthetic lead without a website to verify partial failure handling
  console.log('\nNo-Website Lead Failure Handling:');
  const noWebLead = await prisma.salesLead.create({
    data: {
      companyId,
      name: 'Audit Temporary Dental (No Website)',
      organizationName: 'Audit Temporary Dental',
      contactPhone: '(214) 555-0199',
      status: SalesLeadStatus.NEW,
      source: 'AUDIT_TEST'
    }
  });

  try {
    const { LeadEnrichmentService } = require('../apps/api/dist/automation/lead-enrichment.service');
    const { WebsiteExtractorService } = require('../apps/api/dist/automation/website-extractor.service');
    const { EmailVerifierService } = require('../apps/api/dist/automation/email-verifier.service');
    const { OllamaClientService } = require('../apps/api/dist/automation/ollama-client.service');

    const service = new LeadEnrichmentService(
      prisma,
      new WebsiteExtractorService(),
      new EmailVerifierService(),
      new OllamaClientService()
    );

    const res = await service.enrichLead(companyId, noWebLead.id, { actorId: 'audit' });
    console.log('  - Status:', res.status);
    console.log('  - Score:', res.enrichmentScore);

    const updated = await prisma.salesLead.findUnique({
      where: { id: noWebLead.id },
      include: { leadGenAudits: true }
    });

    console.log('  - CRM Status:', updated.status);
    console.log('  - Audit Events:', updated.leadGenAudits.map(a => a.event));

    if (res.status !== 'NO_WEBSITE') {
      throw new Error(`Expected NO_WEBSITE status, got ${res.status}`);
    }
    if (updated.status === SalesLeadStatus.QUALIFIED) {
      throw new Error('Defect: Lead without website was falsely promoted to QUALIFIED!');
    }
    if (!updated.leadGenAudits.some(a => a.event === 'ENRICHMENT_FAILED')) {
      throw new Error('Defect: ENRICHMENT_FAILED audit event was not recorded for no-website lead!');
    }
    console.log('  => Verified: Lead without website is marked NO_WEBSITE, logged as ENRICHMENT_FAILED, not promoted.');
  } finally {
    // Clean up temporary lead and audits
    await prisma.leadGenAudit.deleteMany({ where: { leadId: noWebLead.id } });
    await prisma.salesLead.delete({ where: { id: noWebLead.id } });
    console.log('  => Cleaned up temporary test lead.');
  }

  await prisma.$disconnect();
  console.log('\n=== ALL IDEMPOTENCY AND FAILURE AUDITS PASSED ===');
}

auditIdempotencyAndFailures().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});

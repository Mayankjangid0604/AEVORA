import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ContinuousImprovementService } from './continuous-improvement/continuous-improvement.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  console.log('--- AEVORA V10 INTERNAL END-TO-END VERIFICATION ---');
  const app = await NestFactory.createApplicationContext(AppModule);
  const ciService = app.get(ContinuousImprovementService);
  const prisma = app.get(PrismaService);

  const company = await prisma.company.findFirst();
  if (!company) {
    throw new Error('No company found to run V10 tests.');
  }

  const companyId = company.id;
  console.log(`[+] Using company: ${companyId}`);

  console.log(`\n[1] Detecting Improvement Opportunities (Phase 5)...`);
  const detectData = await ciService.detectImprovementOpportunities(companyId);
  console.log('Detection Response:', detectData);

  console.log(`\n[2] Submitting Draft Improvement Proposal...`);
  const proposal = await ciService.createProposal({
    companyId: companyId,
    title: 'Automated V10 Verification Test',
    description: 'This is a test proposal to verify V10 capability.',
    problem: 'Missing V10 lifecycle validation.',
    observedSignal: 'Agent telemetry indicates zero self-improvement cycles.',
    hypothesis: 'Running this test will prove the engine works.',
    proposedChange: 'Execute test and record outcome.',
    expectedImpact: '100% V10 compliance',
    expectedMetric: 'Compliance Score',
    baseline: 0,
    target: 100,
    confidence: 1.0,
    risk: 'LOW',
    priority: 'HIGH',
    source: 'E2E Test'
  });
  console.log(`[+] Created Proposal: ${proposal.id} (Status: ${proposal.status})`);

  console.log(`\n[3] Chairman Approving Proposal...`);
  const approved = await ciService.approveProposal(proposal.id, 'Chairman_Auto_Script');
  console.log(`[+] Proposal Status: ${approved.status} by ${approved.approvedBy}`);

  console.log(`\n[4] Recording execution outcome...`);
  await ciService.recordOutcome(proposal.id, {
    measurementWindow: 'Immediate',
    actualResult: 100,
    comparison: 'MET',
    learnedLesson: 'Test completed perfectly.'
  });
  
  console.log(`\n[5] Waiting for execution to complete...`);
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  const finalProposal = await ciService.getProposal(proposal.id);
  console.log(`[+] Final Proposal Status: ${finalProposal.status}`);
  console.log(`[+] Recorded Outcomes:`, finalProposal.outcomes);

  if (finalProposal.status === 'COMPLETED' && finalProposal.outcomes.length > 0) {
    console.log('\n✅ V10 E2E Lifecycle Verified Successfully!');
  } else {
    console.error('\n❌ V10 E2E Lifecycle Failed.');
  }

  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});

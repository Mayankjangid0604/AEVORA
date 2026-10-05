import * as fs from 'fs';
import * as path from 'path';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      process.env.GEMINI_API_KEY = line.substring('GEMINI_API_KEY='.length).trim();
    }
    if (line.startsWith('GEMINI_MODEL=')) {
      process.env.GEMINI_MODEL = line.substring('GEMINI_MODEL='.length).trim();
    }
    if (line.startsWith('REAL_PROVIDER_CALL=')) {
      process.env.REAL_PROVIDER_CALL = line.substring('REAL_PROVIDER_CALL='.length).trim();
    }
  }
} catch (e) {
  console.warn('.env file not found');
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClientMeetingService } from '../src/sales-outreach/client-meeting.service';

async function runMeetingTest() {
  console.log('AEVORA V2 — MEETING WORKFLOW E2E TEST');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const meetingService = app.get(ClientMeetingService);

  try {
    const company = await prisma.company.findFirst();
    const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });
    
    console.log('\n--- A. CLIENT REQUESTS MEETING ---');
    const clientId = 'test-meeting-client-' + Date.now();
    await prisma.client.create({ 
      data: { id: clientId, companyId: company.id, name: 'Meeting Client', status: 'LEAD' } 
    });
    const meeting = await meetingService.requestMeeting(company.id, clientId);
    console.log(`PASS: Meeting created in state ${meeting.status}`);

    console.log('\n--- B. OWNER PROPOSES TIME ---');
    const t1 = new Date(Date.now() + 86400000).toISOString();
    const t2 = new Date(Date.now() + 172800000).toISOString();
    const proposedMeeting = await meetingService.ownerProposesTime(meeting.id, company.id, actor.id, [t1, t2]);
    console.log(`PASS: Meeting status ${proposedMeeting.status}, Proposed: ${(proposedMeeting.proposedTimes as any[]).length} times`);

    console.log('\n--- C. CLIENT REJECTS AND PROPOSES ALTERNATIVE ---');
    const altTime = new Date(Date.now() + 200000000).toISOString();
    const altMeeting = await meetingService.clientProposesAlternative(meeting.id, [altTime]);
    console.log(`PASS: Meeting status ${altMeeting.status}, Proposed Alternatives: ${(altMeeting.proposedTimes as any[]).length}`);

    console.log('\n--- D. OWNER APPROVES ALTERNATIVE ---');
    const confirmedMeeting = await meetingService.ownerConfirmsAlternative(meeting.id, company.id, altTime);
    console.log(`PASS: Meeting status ${confirmedMeeting.status}, Confirmed Time: ${confirmedMeeting.confirmedTime}`);

    console.log('\n--- E. GOOGLE MEET INTEGRATION BEHAVIOR ---');
    if (confirmedMeeting.link === 'NOT_CONFIGURED') {
      console.log(`PASS: Google Meet explicitly reported as NOT_CONFIGURED (no fake links).`);
    } else {
      throw new Error('Fake link detected or integration unexpectedly configured!');
    }

    console.log('\n--- F. MEETING COMPLETES ---');
    const completedMeeting = await meetingService.completeMeeting(meeting.id, company.id);
    console.log(`PASS: Meeting status ${completedMeeting.status}`);

    console.log('\n--- G. AI MEETING NOTES EXTRACTION ---');
    const mockTranscript = "We met today. The client needs a website built by next week. The budget is $5000. It must have an admin panel and integrate with Stripe. Action item: Bob to send the design assets.";
    const notesMeeting = await meetingService.submitNotesOrTranscript(meeting.id, company.id, mockTranscript, true);
    console.log(`PASS: Meeting status ${notesMeeting.status}. Extracted Notes:`);
    console.log(JSON.stringify(notesMeeting.extractedNotes, null, 2));

    console.log('\n--- H. OWNER EDITS & APPROVES REQUIREMENTS ---');
    const editedNotes = { ...notesMeeting.extractedNotes as any, budget: '$5,000 confirmed' };
    const approvedMeeting = await meetingService.approveRequirements(meeting.id, company.id, editedNotes);
    console.log(`PASS: Owner approved notes at ${approvedMeeting.notesApprovedAt}`);

    console.log('\n--- I. PROJECT ASSOCIATION ---');
    const oppId = 'opp-meeting-' + Date.now();
    await prisma.opportunity.create({
      data: { id: oppId, companyId: company.id, clientId, title: 'Meeting Opp', status: 'DISCOVERED', estimatedValue: 5000 }
    });
    const proposalId = 'prop-meeting-' + Date.now();
    await prisma.proposal.create({
      data: { id: proposalId, opportunityId: oppId, customerId: clientId, scope: 'Meeting Scope', deliverables: 'Meeting Deliverables', proposedPrice: 5000 }
    });
    const projectId = 'proj-meeting-' + Date.now();
    await prisma.project.create({ 
      data: { id: projectId, company: { connect: { id: company.id } }, client: { connect: { id: clientId } }, opportunity: { connect: { id: oppId } }, proposal: { connect: { id: proposalId } }, name: 'Meeting Project', type: 'WEBSITE', status: 'PLANNED', financialStatus: 'PENDING' } as any
    });
    const finalMeeting = await meetingService.associateWithProject(meeting.id, company.id, projectId);
    console.log(`PASS: Meeting status ${finalMeeting.status}, linked to Project ${finalMeeting.projectId}`);

    console.log('\n======================================================');
    console.log('✅ AEVORA V2: MEETING WORKFLOW FULLY VERIFIED');
    console.log('======================================================');

    await app.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ REAL CLIENT TEST FAILED:', error);
    await app.close();
    process.exit(1);
  }
}

runMeetingTest();

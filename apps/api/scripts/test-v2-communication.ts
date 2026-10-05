import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CustomerCommunicationService } from './src/customer-operations/customer-communication.service';
import { InquiryService } from './src/inquiry/inquiry.service';
import { SalesOpportunityService } from './src/sales/sales-opportunity.service';
import { ProductionExecutionGateService } from './src/production/production-execution-gate.service';

const prisma = new PrismaClient();

async function runTest() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const commService = app.get(CustomerCommunicationService);
  const inquiryService = app.get(InquiryService);
  const oppService = app.get(SalesOpportunityService);
  const gateService = app.get(ProductionExecutionGateService);

  const company = await prisma.company.findFirst({ where: { employees: { some: {} } } });
  const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });

  const clientId = 'test-comm-client-' + Date.now();
  await prisma.client.create({ data: { id: clientId, companyId: company.id, name: 'Comm Client', status: 'LEAD' } });
  
  // 1. Receive Inquiry
  console.log('Testing Inquiry Creation...');
  const inquiry = await inquiryService.createInquiry(company.id, clientId, {
    title: 'Need a CRM',
    description: 'We need a custom CRM to manage leads.',
    requirements: 'Must have email integration and pipelines.',
    budget: 5000,
  });
  console.log('PASS: Inquiry created', inquiry.id);

  // 2. Draft Communication Response
  console.log('Testing Communication Drafting...');
  const comm = await commService.draftCommunication(company.id, actor.id, {
    clientId,
    channel: 'EMAIL',
    subject: 'Re: Need a CRM',
    body: 'We can build this for you.',
    intent: 'DISCOVERY_RESPONSE',
  });
  console.log('PASS: Communication drafted', comm.id);

  // 3. Try sending without capability
  console.log('Testing Send Rejection (No Capability)...');
  let rejected = false;
  try { await commService.attemptSend(comm.id, company.id, actor.id); }
  catch (e: any) { rejected = e.message.includes('capability not enabled') || e.message.includes('kill switch'); }
  if (!rejected) throw new Error('Failed to reject send without capability');
  console.log('PASS: Send rejected without capability');

  // Enable capability and allowlist
  await prisma.productionCapability.upsert({ where: { companyId_capability_environment: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION' } }, update: { isEnabled: true }, create: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION', isEnabled: true } });
  await prisma.killSwitchConfig.upsert({ where: { companyId_feature: { companyId: company.id, feature: 'OUTBOUND_EMAIL' } }, update: { isDisabled: false }, create: { companyId: company.id, feature: 'OUTBOUND_EMAIL', isDisabled: false } });

  // 4. Send Communication
  console.log('Testing Communication Sending...');
  await prisma.customerCommunication.update({ where: { id: comm.id }, data: { status: 'APPROVED' } });
  const sentComm = await commService.attemptSend(comm.id, company.id, actor.id);
  if (sentComm.status !== 'SENT') throw new Error('Failed to mark comm as SENT');
  console.log('PASS: Communication marked as SENT');

  // 5. Update Inquiry Status
  console.log('Testing Requirements & Status Update...');
  await inquiryService.updateInquirySummary(inquiry.id, 'Verified: Email and pipelines needed.');
  await inquiryService.updateInquiryStatus(inquiry.id, 'QUALIFIED');
  console.log('PASS: Inquiry Requirements Updated');

  // 6. Convert to Opportunity
  console.log('Testing Opportunity Conversion...');
  const opp = await oppService.createOpportunity(company.id, actor.id, {
    clientId,
    inquiryId: inquiry.id,
    title: 'CRM Project',
    description: 'Custom CRM from inquiry',
    estimatedValue: 5000,
  });
  if (opp.inquiryId !== inquiry.id) throw new Error('Opportunity not linked to inquiry');
  console.log('PASS: Opportunity created from Inquiry', opp.id);

  console.log('All Communication & Requirements tests passed!');
  await app.close();
  await prisma.$disconnect();
}

runTest().catch((e: any) => { console.error(e); process.exit(1); });

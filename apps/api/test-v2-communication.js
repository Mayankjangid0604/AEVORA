"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const customer_communication_service_1 = require("./src/customer-operations/customer-communication.service");
const inquiry_service_1 = require("./src/inquiry/inquiry.service");
const sales_opportunity_service_1 = require("./src/sales/sales-opportunity.service");
const production_execution_gate_service_1 = require("./src/production/production-execution-gate.service");
const prisma = new client_1.PrismaClient();
async function runTest() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const commService = app.get(customer_communication_service_1.CustomerCommunicationService);
    const inquiryService = app.get(inquiry_service_1.InquiryService);
    const oppService = app.get(sales_opportunity_service_1.SalesOpportunityService);
    const gateService = app.get(production_execution_gate_service_1.ProductionExecutionGateService);
    const company = await prisma.company.findFirst({ where: { employees: { some: {} } } });
    const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });
    const clientId = 'test-comm-client-' + Date.now();
    await prisma.client.create({ data: { id: clientId, companyId: company.id, name: 'Comm Client', status: 'LEAD' } });
    console.log('Testing Inquiry Creation...');
    const inquiry = await inquiryService.createInquiry(company.id, clientId, {
        title: 'Need a CRM',
        description: 'We need a custom CRM to manage leads.',
        requirements: 'Must have email integration and pipelines.',
        budget: 5000,
    });
    console.log('PASS: Inquiry created', inquiry.id);
    console.log('Testing Communication Drafting...');
    const comm = await commService.draftCommunication(company.id, actor.id, {
        clientId,
        channel: 'EMAIL',
        subject: 'Re: Need a CRM',
        body: 'We can build this for you.',
        intent: 'DISCOVERY_RESPONSE',
    });
    console.log('PASS: Communication drafted', comm.id);
    console.log('Testing Send Rejection (No Capability)...');
    let rejected = false;
    try {
        await commService.attemptSend(comm.id, company.id, actor.id);
    }
    catch (e) {
        rejected = e.message.includes('capability not enabled') || e.message.includes('kill switch');
    }
    if (!rejected)
        throw new Error('Failed to reject send without capability');
    console.log('PASS: Send rejected without capability');
    await prisma.productionCapability.upsert({ where: { companyId_capability_environment: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION' } }, update: { isEnabled: true }, create: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION', isEnabled: true } });
    await prisma.killSwitchConfig.upsert({ where: { companyId_feature: { companyId: company.id, feature: 'OUTBOUND_EMAIL' } }, update: { isDisabled: false }, create: { companyId: company.id, feature: 'OUTBOUND_EMAIL', isDisabled: false } });
    console.log('Testing Communication Sending...');
    await prisma.customerCommunication.update({ where: { id: comm.id }, data: { status: 'APPROVED' } });
    const sentComm = await commService.attemptSend(comm.id, company.id, actor.id);
    if (sentComm.status !== 'SENT')
        throw new Error('Failed to mark comm as SENT');
    console.log('PASS: Communication marked as SENT');
    console.log('Testing Requirements & Status Update...');
    await inquiryService.updateInquirySummary(inquiry.id, 'Verified: Email and pipelines needed.');
    await inquiryService.updateInquiryStatus(inquiry.id, 'QUALIFIED');
    console.log('PASS: Inquiry Requirements Updated');
    console.log('Testing Opportunity Conversion...');
    const opp = await oppService.createOpportunity(company.id, actor.id, {
        clientId,
        inquiryId: inquiry.id,
        title: 'CRM Project',
        description: 'Custom CRM from inquiry',
        estimatedValue: 5000,
    });
    if (opp.inquiryId !== inquiry.id)
        throw new Error('Opportunity not linked to inquiry');
    console.log('PASS: Opportunity created from Inquiry', opp.id);
    console.log('All Communication & Requirements tests passed!');
    await app.close();
    await prisma.$disconnect();
}
runTest().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=test-v2-communication.js.map
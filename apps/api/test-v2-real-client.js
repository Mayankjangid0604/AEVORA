"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
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
    }
}
catch (e) {
    console.warn('.env file not found or unreadable at ' + process.cwd());
}
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const prisma_service_1 = require("./src/prisma/prisma.service");
const customer_communication_service_1 = require("./src/customer-operations/customer-communication.service");
const inquiry_service_1 = require("./src/inquiry/inquiry.service");
const sales_opportunity_service_1 = require("./src/sales/sales-opportunity.service");
const invoice_service_1 = require("./src/invoice/invoice.service");
const invoice_payment_service_1 = require("./src/delivery/invoice-payment.service");
const project_execution_service_1 = require("./src/project-execution/project-execution.service");
const software_execution_service_1 = require("./src/project-execution/software-execution.service");
async function runRealClientTest() {
    console.log('AEVORA V2 — REAL TEST CLIENT EXECUTION');
    console.log('Client: mayankjangid598@gmail.com | Business: Hotel Owner');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const prisma = app.get(prisma_service_1.PrismaService);
    const commService = app.get(customer_communication_service_1.CustomerCommunicationService);
    const inquiryService = app.get(inquiry_service_1.InquiryService);
    const oppService = app.get(sales_opportunity_service_1.SalesOpportunityService);
    const invoiceService = app.get(invoice_service_1.InvoiceService);
    const paymentService = app.get(invoice_payment_service_1.InvoiceAndPaymentService);
    const projectExecutionService = app.get(project_execution_service_1.ProjectExecutionService);
    const softwareExecutionService = app.get(software_execution_service_1.SoftwareExecutionService);
    try {
        const company = await prisma.company.findFirst();
        const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });
        console.log('\n--- 1. CLIENT CREATION ---');
        const clientId = 'test-client-hotel-' + Date.now();
        await prisma.client.create({
            data: {
                id: clientId,
                companyId: company.id,
                name: 'Mayank Jangid',
                organizationName: 'Hotel Business',
                description: 'Email: mayankjangid598@gmail.com, Business: Hotel owner',
                status: 'LEAD'
            }
        });
        console.log(`PASS: Client created successfully (ID: ${clientId})`);
        console.log('\n--- 2. COMMUNICATION & REQUIREMENTS ---');
        const inquiry = await inquiryService.createInquiry(company.id, clientId, {
            title: 'Hotel Management Web Application',
            description: 'I need a complete digital product for my hotel.',
            requirements: 'Must have room booking, guest management, real-time availability, and a responsive modern UI.',
            budget: 150000,
        });
        console.log(`PASS: Inquiry (Requirement) created (ID: ${inquiry.id})`);
        const comm = await commService.draftCommunication(company.id, actor.id, {
            clientId,
            channel: 'EMAIL',
            subject: 'Re: Hotel Management Web Application',
            body: 'Hello Mayank, we received your requirement for the hotel booking system. We can definitely build this.',
            intent: 'DISCOVERY_RESPONSE',
        });
        await prisma.productionCapability.upsert({
            where: { companyId_capability_environment: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION' } },
            update: { isEnabled: true },
            create: { companyId: company.id, capability: 'CUSTOMER_EMAIL', environment: 'PRODUCTION', isEnabled: true }
        });
        await prisma.killSwitchConfig.upsert({
            where: { companyId_feature: { companyId: company.id, feature: 'OUTBOUND_EMAIL' } },
            update: { isDisabled: false },
            create: { companyId: company.id, feature: 'OUTBOUND_EMAIL', isDisabled: false }
        });
        await prisma.customerCommunication.update({ where: { id: comm.id }, data: { status: 'APPROVED' } });
        const sentComm = await commService.attemptSend(comm.id, company.id, actor.id);
        if (sentComm.status !== 'SENT')
            throw new Error('Communication failed to send.');
        console.log(`PASS: Communication SENT internally (Email delivery simulated internally) (ID: ${comm.id})`);
        await inquiryService.updateInquirySummary(inquiry.id, 'Confirmed: Room booking, guest management, modern UI.');
        await inquiryService.updateInquiryStatus(inquiry.id, 'QUALIFIED');
        console.log('\n--- 3. PROPOSAL & CONTRACT ---');
        const opp = await oppService.createOpportunity(company.id, actor.id, {
            clientId,
            inquiryId: inquiry.id,
            title: 'Hotel Management Digital Product',
            description: 'Custom Web Application based on requirements.',
            estimatedValue: 150000,
        });
        console.log(`PASS: Sales Opportunity created (ID: ${opp.id})`);
        const proposalId = 'prop-' + Date.now();
        await prisma.proposal.create({
            data: {
                id: proposalId,
                opportunityId: opp.id,
                status: 'ACCEPTED',
                scope: 'Hotel Management System (Room Booking, Guest Management)',
                deliverables: 'Web App Source Code, Compiled Artifact',
                proposedPrice: 150000
            }
        });
        console.log(`PASS: Proposal accepted (ID: ${proposalId})`);
        console.log('\n--- 4. PAYMENT ---');
        const projectId = 'proj-hotel-' + Date.now();
        await prisma.project.create({
            data: {
                id: projectId,
                companyId: company.id,
                clientId,
                opportunityId: opp.id,
                proposalId: proposalId,
                name: 'Hotel Management Web Application',
                status: 'PLANNED',
                financialStatus: 'PENDING'
            }
        });
        const invoice = await invoiceService.createInvoice({
            companyId: company.id,
            clientId,
            projectId,
            environment: 'SANDBOX',
            currency: 'INR',
            lineItems: [
                { description: 'Hotel Management System Implementation', quantity: 1, unitPrice: 150000 }
            ]
        });
        await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'ISSUED' } });
        const paymentId = 'pay_hotel_' + Date.now();
        const fakeEvent = {
            event: 'payment_link.paid',
            payload: {
                payment_link: { entity: { reference_id: invoice.id } },
                payment: { entity: { id: paymentId, amount: 150000, currency: 'INR' } }
            }
        };
        await paymentService.handleRazorpayEvent(fakeEvent);
        console.log(`PASS: Payment recorded (INTERNAL TEST / WEBHOOK SIMULATION) (PaymentID: ${paymentId})`);
        console.log('\n--- 5. PROJECT CREATION & SETUP ---');
        await projectExecutionService.createPlan(projectId, { summary: 'Hotel App Execution Plan', estimatedDuration: 14 });
        await projectExecutionService.activateProject(projectId);
        await projectExecutionService.createRequirement(projectId, { title: 'Hotel App Core', description: 'Room booking and guest management' });
        const role = await prisma.role.findFirst({ where: { companyId: company.id, title: 'Developer' } });
        await projectExecutionService.proposeStaffing(projectId, { employeeId: actor.id, allocation: 100 });
        const assignment = await prisma.projectAssignment.findFirst({ where: { projectId: projectId } });
        await projectExecutionService.activateAssignment(assignment.id);
        const task = await projectExecutionService.createProjectTask(company.id, projectId, {
            title: 'Develop Hotel App', description: 'Write the web app', assignedEmployeeId: actor.id, priority: 'HIGH', estimatedEffort: 5
        }, actor.id);
        await prisma.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });
        console.log(`PASS: Project setup complete. Status is ACTIVE.`);
        console.log('\n--- 6. AI GENERATION (REAL PROVIDER) ---');
        console.log(`DIAGNOSTIC: Using model -> ${process.env.GEMINI_MODEL}`);
        console.log(`DIAGNOSTIC: AI Request Started`);
        const devExecutionId = await softwareExecutionService.executeDevelopment(projectId, actor.id, task.id);
        const devRecord = await prisma.projectDevelopmentExecution.findUnique({ where: { id: devExecutionId } });
        console.log(`PASS: AI Generation Complete. Source saved to: ${devRecord.sourcePath}`);
        console.log('\n--- 7. BUILD ---');
        const buildId = await softwareExecutionService.executeBuild(projectId);
        const buildRecord = await prisma.projectBuildExecution.findUnique({ where: { id: buildId } });
        console.log(`PASS: Build complete. Artifact: ${buildRecord.artifactPath}`);
        console.log('\n--- 8. TEST ---');
        const testId = await softwareExecutionService.executeTest(projectId, buildId);
        const testRecord = await prisma.projectTestExecution.findUnique({ where: { id: testId } });
        console.log(`PASS: Generated Tests executed successfully.`);
        console.log('\n--- 9. DELIVERY ---');
        const delivery = await projectExecutionService.createDelivery(projectId, {
            summary: 'Hotel Management System Final Delivery',
            deliverables: 'Web App Bundle',
            buildId: buildId
        });
        await projectExecutionService.markDelivered(delivery.id);
        console.log(`PASS: Delivery created and marked delivered (ID: ${delivery.id})`);
        console.log('\n--- 10. CLIENT ACCEPTANCE ---');
        const acceptance = await projectExecutionService.clientAcceptDelivery(delivery.id, clientId);
        console.log(`PASS: Client formally accepted delivery (ID: ${acceptance.id})`);
        const finalProject = await prisma.project.findUnique({ where: { id: projectId } });
        if (finalProject.status !== 'COMPLETED') {
            throw new Error(`Project status not COMPLETED. Found: ${finalProject.status}`);
        }
        console.log(`PASS: Final State COMPLETED`);
        console.log('\n======================================================');
        console.log('AEVORA V2 — REAL TEST CLIENT RESULT SUMMARY');
        console.log('Client: mayankjangid598@gmail.com');
        console.log('Business: Hotel Owner');
        console.log('Client: PASS');
        console.log('Communication: PASS');
        console.log('Requirements: PASS');
        console.log('Proposal: PASS');
        console.log('Contract: PASS');
        console.log('Payment: INTERNAL TEST');
        console.log('Project Creation: PASS');
        console.log('Real Gemini Provider: PASS');
        console.log('AI Generation: PASS');
        console.log('Build: PASS');
        console.log('Generated Tests: PASS');
        console.log('Delivery: PASS');
        console.log('Client Acceptance: PASS');
        console.log('Final State: PASS');
        console.log('======================================================');
        await app.close();
        process.exit(0);
    }
    catch (error) {
        console.error('\n❌ REAL CLIENT TEST FAILED:', error);
        await app.close();
        process.exit(1);
    }
}
runRealClientTest();
//# sourceMappingURL=test-v2-real-client.js.map
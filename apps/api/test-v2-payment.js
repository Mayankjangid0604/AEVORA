"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const invoice_service_1 = require("./src/invoice/invoice.service");
const invoice_payment_service_1 = require("./src/delivery/invoice-payment.service");
const prisma = new client_1.PrismaClient();
async function runTest() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const invoiceService = app.get(invoice_service_1.InvoiceService);
    const paymentService = app.get(invoice_payment_service_1.InvoiceAndPaymentService);
    const company = await prisma.company.findFirst();
    const actor = await prisma.employee.findFirst({ where: { companyId: company.id } });
    const clientId = 'test-payment-client-' + Date.now();
    await prisma.client.create({ data: { id: clientId, companyId: company.id, name: 'Payment Client', status: 'ACTIVE' } });
    const oppId = 'test-opp-' + Date.now();
    await prisma.opportunity.create({ data: { id: oppId, companyId: company.id, clientId, title: 'Opp', status: 'WON' } });
    const proposalId = 'test-prop-' + Date.now();
    await prisma.proposal.create({ data: { id: proposalId, opportunityId: oppId, status: 'ACCEPTED', scope: 'Dev scope', deliverables: 'Dev deliverables', proposedPrice: 50000 } });
    const projectId = 'test-proj-' + Date.now();
    await prisma.project.create({ data: { id: projectId, companyId: company.id, clientId, opportunityId: oppId, proposalId: proposalId, name: 'Test Project', status: 'ACTIVE', financialStatus: 'PENDING' } });
    console.log('Testing Invoice Creation...');
    const invoice = await invoiceService.createInvoice({
        companyId: company.id,
        clientId,
        projectId,
        environment: 'SANDBOX',
        currency: 'INR',
        lineItems: [
            { description: 'Development', quantity: 1, unitPrice: 50000 }
        ]
    });
    console.log('PASS: Invoice created', invoice.id);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'ISSUED' } });
    console.log('Testing V2 Payment Handling (Webhook Simulation)...');
    const paymentId = 'pay_' + Date.now();
    const idempotencyKey = `razorpay:${paymentId}`;
    const fakeEvent = {
        event: 'payment_link.paid',
        payload: {
            payment_link: {
                entity: {
                    reference_id: invoice.id
                }
            },
            payment: {
                entity: {
                    id: paymentId,
                    amount: 50000,
                    currency: 'INR'
                }
            }
        }
    };
    const result = await paymentService.handleRazorpayEvent(fakeEvent);
    if (result.status !== 'PAID') {
        throw new Error('Failed to mark invoice as PAID');
    }
    console.log('PASS: Invoice marked as PAID by webhook');
    const proj = await prisma.project.findUnique({ where: { id: projectId } });
    if (proj.financialStatus !== 'PAID') {
        throw new Error('Project financialStatus not updated to PAID');
    }
    console.log('PASS: Project financialStatus updated');
    const rmt = await prisma.realMoneyTransaction.findUnique({ where: { idempotencyKey } });
    if (!rmt) {
        throw new Error('RealMoneyTransaction not created');
    }
    console.log('PASS: RealMoneyTransaction created', rmt.id);
    const rev = await prisma.revenueRecord.findFirst({ where: { realMoneyAccountId: rmt.accountId } });
    if (!rev) {
        throw new Error('RevenueRecord not created');
    }
    console.log('PASS: RevenueRecord created');
    console.log('All V2 Payment tests passed!');
    await app.close();
    await prisma.$disconnect();
}
runTest().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=test-v2-payment.js.map
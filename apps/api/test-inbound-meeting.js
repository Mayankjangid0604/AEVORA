"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const inbound_message_service_1 = require("./src/sales-outreach/inbound-message.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
async function run() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, { logger: ['log', 'error', 'warn'] });
    const service = app.get(inbound_message_service_1.InboundMessageService);
    const prisma = app.get(prisma_service_1.PrismaService);
    const company = await prisma.company.findFirst();
    if (!company)
        throw new Error('No company');
    const lead = await prisma.salesLead.findFirst({ where: { contactEmail: 'mayankjangid598@gmail.com' } });
    if (lead) {
        console.log('Testing with lead:', lead.id, lead.name);
        const msg = await service.ingest(company.id, 'EMAIL', 'mayankjangid598@gmail.com', 'I want to schedule a meeting to discuss requirements.', 'Re: Pricing', { autoSubmitted: 'no', lead });
        console.log('Ingested msg:', msg);
        const call = await prisma.discoveryCall.findFirst({ where: { leadId: lead.id } });
        console.log('DiscoveryCall created/updated:', call);
    }
    await app.close();
    process.exit(0);
}
run();
//# sourceMappingURL=test-inbound-meeting.js.map
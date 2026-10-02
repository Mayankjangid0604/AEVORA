"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const inbound_message_service_1 = require("./src/sales-outreach/inbound-message.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
process.env.REAL_PROVIDER_CALL = 'true';
async function run() {
    console.log("Initializing context for inbound poll with REAL_PROVIDER_CALL=true...");
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const prisma = app.get(prisma_service_1.PrismaService);
    const inboundService = app.get(inbound_message_service_1.InboundMessageService);
    const company = await prisma.company.findFirst();
    const lastMsg = await prisma.inboundMessage.findFirst({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' }
    });
    if (lastMsg) {
        console.log('Deleting msg to force re-ingestion:', lastMsg.id);
        await prisma.inboundMessage.delete({ where: { id: lastMsg.id } });
    }
    console.log('Polling email inbox for company:', company.id);
    const res = await inboundService.pollEmailInbox(company.id);
    console.log('Poll result:', res);
    const newMsg = await prisma.inboundMessage.findFirst({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' }
    });
    console.log('Latest inbound message:', newMsg);
    await app.close();
}
run().catch(console.error);
//# sourceMappingURL=poll-inbox.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const inbound_message_service_1 = require("./src/sales-outreach/inbound-message.service");
const fs = require("fs");
const path = require("path");
try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envFile = fs.readFileSync(envPath, 'utf-8');
    for (const line of envFile.split('\n')) {
        if (line.startsWith('GEMINI_API_KEY=')) {
            process.env.GEMINI_API_KEY = line.substring('GEMINI_API_KEY='.length).trim();
        }
    }
}
catch (e) { }
process.env.REAL_PROVIDER_CALL = 'true';
async function main() {
    const prisma = new client_1.PrismaClient();
    const company = await prisma.company.findFirst();
    await prisma.inboundMessage.updateMany({
        where: { fromAddress: 'mayankjangid598@gmail.com', subject: { contains: 'Aevora V2' } },
        data: { status: 'NEW', extractedIntent: null }
    });
    const msg = await prisma.inboundMessage.findFirst({
        where: { fromAddress: 'mayankjangid598@gmail.com', subject: { contains: 'Aevora V2' } }
    });
    console.log("Reset message ID:", msg?.id);
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const inboundService = app.get(inbound_message_service_1.InboundMessageService);
    console.log("Processing message through InboundMessageService...");
    try {
        const classification = await inboundService.classify(msg.subject, msg.body);
        console.log("Classification result:", classification);
        await prisma.inboundMessage.update({
            where: { id: msg.id },
            data: {
                extractedIntent: classification.intent,
                confidence: classification.confidence,
                draftReply: classification.draftReply,
                metadata: { feedback: classification.feedback }
            }
        });
        console.log("Updated message in DB with intent:", classification.intent);
    }
    catch (e) {
        console.error("Failed to process message:", e);
    }
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
}
main();
//# sourceMappingURL=test-v2-reprocess-inbound.js.map
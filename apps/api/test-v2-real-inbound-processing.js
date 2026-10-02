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
catch (e) {
    console.warn('.env file not found or unreadable');
}
process.env.REAL_PROVIDER_CALL = 'true';
process.env.INBOX_ENABLED = 'true';
async function main() {
    const prisma = new client_1.PrismaClient();
    const company = await prisma.company.findFirst();
    let lead = await prisma.salesLead.findFirst({
        where: { contactEmail: 'mayankjangid598@gmail.com' }
    });
    if (!lead) {
        lead = await prisma.salesLead.create({
            data: {
                companyId: company.id,
                name: 'Mayank (Hotel Owner)',
                status: 'NEW',
                source: 'manual',
                contactEmail: 'mayankjangid598@gmail.com'
            }
        });
        console.log("Created lead:", lead.id);
    }
    else {
        console.log("Lead already exists:", lead.id);
    }
    await prisma.$disconnect();
    process.env.INBOX_ENABLED = 'true';
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const inboundService = app.get(inbound_message_service_1.InboundMessageService);
    console.log("Polling email inbox...");
    try {
        const res = await inboundService.pollEmailInbox(company.id);
        console.log("Inbox polling completed:", res);
        const messages = await inboundService.listNew(company.id);
        console.log(`Found ${messages.length} new messages.`);
        messages.forEach((m) => {
            console.log(`- From: ${m.fromAddress}`);
            console.log(`  Subject: ${m.subject}`);
            console.log(`  Intent: ${m.extractedIntent}`);
            console.log(`  Feedback: ${m.metadata?.feedback}`);
        });
    }
    catch (e) {
        console.error("Failed to poll inbox:", e);
    }
    await app.close();
    process.exit(0);
}
main();
//# sourceMappingURL=test-v2-real-inbound-processing.js.map
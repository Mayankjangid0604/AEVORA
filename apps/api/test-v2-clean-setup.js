"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const prisma_service_1 = require("./src/prisma/prisma.service");
const email_outreach_service_1 = require("./src/sales-outreach/email-outreach.service");
async function bootstrap() {
    console.log("Initializing application context...");
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const prisma = app.get(prisma_service_1.PrismaService);
    const emailOutreachService = app.get(email_outreach_service_1.EmailOutreachService);
    console.log("Fetching company and chairman...");
    const company = await prisma.company.findFirst();
    let chairman = await prisma.employee.findFirst({
        where: { role: { accessLevel: { in: ['CHAIRMAN', 'MANAGEMENT'] } }, status: 'ACTIVE', companyId: company.id },
        include: { role: true }
    });
    const clientEmail = "mayankjangid598@gmail.com";
    const uniqueName = "Mayank's Resort " + Date.now();
    console.log("Creating new SalesLead for " + clientEmail + " with name " + uniqueName);
    const lead = await prisma.salesLead.create({
        data: {
            companyId: company.id,
            name: uniqueName,
            industry: "Resort",
            contactEmail: clientEmail,
            website: "",
            status: "NEW",
            source: "TEST_V2_END_TO_END",
        }
    });
    console.log("Triggering EmailOutreachService.sendOutreachEmail()...");
    try {
        const res = await emailOutreachService.sendOutreachEmail(company.id, lead, chairman.id);
        console.log("Outreach email triggered successfully!");
        console.log("Result:", res);
    }
    catch (e) {
        console.error("Failed to send outreach email:", e);
    }
    await app.close();
    process.exit(0);
}
bootstrap();
//# sourceMappingURL=test-v2-clean-setup.js.map
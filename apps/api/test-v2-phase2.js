"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const prisma_service_1 = require("./src/prisma/prisma.service");
const customer_communication_service_1 = require("./src/customer-operations/customer-communication.service");
async function bootstrap() {
    console.log("Initializing Phase 2: Requirements Gathering...");
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const prisma = app.get(prisma_service_1.PrismaService);
    const commService = app.get(customer_communication_service_1.CustomerCommunicationService);
    const company = await prisma.company.findFirst();
    const chairman = await prisma.employee.findFirst({
        where: { role: { accessLevel: { in: ['CHAIRMAN', 'MANAGEMENT'] } }, status: 'ACTIVE', companyId: company.id },
    });
    const clientEmail = "mayankjangid598@gmail.com";
    let client = await prisma.client.findFirst({
        where: { description: { contains: clientEmail } },
        orderBy: { createdAt: 'desc' }
    });
    if (!client) {
        client = await prisma.client.create({
            data: {
                companyId: company.id,
                name: "Mayank's Hotel",
                organizationName: "Mayank's Hotel",
                description: `Email: ${clientEmail}, Business: Hotel owner`,
                status: 'LEAD',
            }
        });
    }
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
    console.log("Drafting and sending requirements gathering email...");
    const comm = await commService.draftCommunication(company.id, chairman.id, {
        clientId: client.id,
        channel: 'EMAIL',
        subject: 'Re: Exclusive Proposal for Mayank\'s Hotel',
        body: 'Thank you for your interest! To ensure we build exactly what you need, could you please share a few requirements? For example, do you need room booking, guest management, real-time availability, or anything specific?',
        intent: 'DISCOVERY_RESPONSE',
    });
    await prisma.customerCommunication.update({ where: { id: comm.id }, data: { status: 'APPROVED' } });
    try {
        const sentComm = await commService.attemptSend(comm.id, company.id, chairman.id);
        console.log("Requirements email sent successfully!", sentComm);
    }
    catch (e) {
        console.error("Failed to send requirements email", e);
    }
    await app.close();
    process.exit(0);
}
bootstrap();
//# sourceMappingURL=test-v2-phase2.js.map
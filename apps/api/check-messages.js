"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const messages = await prisma.inboundMessage.findMany({
        where: { fromAddress: 'mayankjangid598@gmail.com' },
        orderBy: { receivedAt: 'desc' },
        take: 5
    });
    console.log('Recent Inbound Messages:', messages.map(m => ({
        id: m.id,
        subject: m.subject,
        intent: m.extractedIntent,
        receivedAt: m.receivedAt,
        status: m.status
    })));
    const opp = await prisma.opportunity.findUnique({
        where: { id: 'cf37aae5-31c0-4f77-a45c-88c9f9de2fd3' }
    });
    console.log('Current Opp Stage:', opp?.salesStage);
}
main().finally(() => process.exit(0));
//# sourceMappingURL=check-messages.js.map
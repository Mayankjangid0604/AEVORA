"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const opp = await prisma.opportunity.findFirst({
        where: { salesStage: 'NEGOTIATION' }
    });
    if (opp) {
        const lead = await prisma.salesLead.findUnique({
            where: { id: opp.salesLeadId }
        });
        console.log('Opportunity found:', { opp, lead });
    }
    else {
        console.log('No negotiation opps found.');
    }
}
main().finally(() => process.exit(0));
//# sourceMappingURL=check-opp.js.map
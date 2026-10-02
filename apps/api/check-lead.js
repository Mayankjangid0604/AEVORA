"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const lead = await prisma.salesLead.findFirst({ where: { contactEmail: 'mayankjangid598@gmail.com' } });
    console.log('Lead:', lead);
    if (lead) {
        const opp = await prisma.opportunity.findFirst({ where: { salesLeadId: lead.id } });
        console.log('Opp:', opp);
    }
}
main().finally(() => process.exit(0));
//# sourceMappingURL=check-lead.js.map
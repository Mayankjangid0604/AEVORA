"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const lead = await prisma.salesLead.findFirst({
        where: { contactEmail: 'mayankjangid598@gmail.com' }
    });
    console.log('Lead:', lead);
    if (lead) {
        let opp = await prisma.opportunity.findFirst({
            where: { salesLeadId: lead.id }
        });
        console.log('Opp:', opp);
        if (opp) {
            opp = await prisma.opportunity.update({
                where: { id: opp.id },
                data: { salesStage: 'SOLUTION' }
            });
            console.log('Updated Opp:', opp);
        }
        else {
            console.log('No opportunity found for lead, checking if we need to create one or if it belongs to client');
            opp = await prisma.opportunity.findFirst({
                where: { title: 'Hotel Management Digital Product' }
            });
            if (opp) {
                opp = await prisma.opportunity.update({
                    where: { id: opp.id },
                    data: { salesStage: 'SOLUTION', salesLeadId: lead.id }
                });
                console.log('Updated Opp (by title):', opp);
            }
        }
    }
}
main().finally(() => process.exit(0));
//# sourceMappingURL=fix-opp.js.map
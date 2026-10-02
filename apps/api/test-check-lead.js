"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function main() {
    const prisma = new client_1.PrismaClient();
    const leads = await prisma.salesLead.findMany({
        where: {
            contactEmail: 'mayankjangid598@gmail.com'
        },
        include: {
            outreachCampaigns: true
        }
    });
    console.log("Leads with that email:");
    console.log(JSON.stringify(leads, null, 2));
    const allLeads = await prisma.salesLead.findMany();
    console.log("\nAll leads in DB: " + allLeads.length);
    const sampleLeads = allLeads.slice(0, 5).map(l => ({ name: l.name, email: l.contactEmail }));
    console.log("Sample leads:", sampleLeads);
    const campaigns = await prisma.outreachCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log("\nRecent campaigns:");
    console.log(campaigns.map(c => ({ id: c.id, leadId: c.leadId, status: c.status, emailMessageId: c.emailMessageId })));
}
main().finally(() => process.exit(0));
//# sourceMappingURL=test-check-lead.js.map
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
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

  // Check all outreach campaigns sent to any lead that has this email, or check latest campaigns
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

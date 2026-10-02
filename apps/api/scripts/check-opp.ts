import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const opp = await prisma.opportunity.findFirst({
    where: { salesStage: 'NEGOTIATION' }
  });
  
  if (opp) {
    const lead = await prisma.salesLead.findUnique({
      where: { id: opp.salesLeadId }
    });
    console.log('Opportunity found:', { opp, lead });
  } else {
    console.log('No negotiation opps found.');
  }
}
main().finally(() => process.exit(0));

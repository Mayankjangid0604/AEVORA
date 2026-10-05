import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const opps = await prisma.opportunity.findMany({ include: { client: true } });
  console.log(JSON.stringify(opps, null, 2));
}
main().finally(() => process.exit(0));

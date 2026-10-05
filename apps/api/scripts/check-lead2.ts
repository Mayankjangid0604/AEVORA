import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const opps = await prisma.opportunity.findMany({ 
      where: { client: { name: { contains: 'Mayank (Hotel Owner)' } } },
      include: { client: true }
  });
  console.log('Opps:', opps);
}
main().finally(() => process.exit(0));

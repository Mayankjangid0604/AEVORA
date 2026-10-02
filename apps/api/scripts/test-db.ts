import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('SalesLead:', await prisma.salesLead.findMany({where: {contactEmail: 'mayankjangid598@gmail.com'}}));
  console.log('Client:', await prisma.client.findMany({where: {description: {contains: 'mayank'}}}));
}
main().finally(() => prisma.$disconnect());

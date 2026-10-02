const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const chairman = await prisma.chairman.findFirst();
  console.log('CHAIRMAN:', chairman);
}
main().finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');

async function testChairmanCommands() {
  const prisma = new PrismaClient();
  console.log('Testing Chairman commands persistence via Prisma...');
  
  const company = await prisma.company.findFirst();
  const chairman = await prisma.chairman.findFirst({ where: { companyId: company?.id } });
  
  if (!company || !chairman) {
    console.error('Missing company or chairman context');
    process.exit(1);
  }

  // Find recent commands
  const commands = await prisma.chairmanCommand.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log(JSON.stringify(commands, null, 2));
  process.exit(0);
}

testChairmanCommands().catch(console.error);

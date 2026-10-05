import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const msgs = await prisma.inboundMessage.findMany({
    where: { fromAddress: 'mayankjangid598@gmail.com' }
  });
  console.log(JSON.stringify(msgs, null, 2));
}

main().finally(() => process.exit(0));

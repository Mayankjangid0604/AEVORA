import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { InboundMessageService } from './src/sales-outreach/inbound-message.service';
import { PrismaService } from './src/prisma/prisma.service';

process.env.REAL_PROVIDER_CALL = 'true';

async function run() {
  console.log("Initializing context for inbound poll with REAL_PROVIDER_CALL=true...");
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const inboundService = app.get(InboundMessageService);

  const company = await prisma.company.findFirst();

  // Delete latest message to force re-ingestion
  const lastMsg = await prisma.inboundMessage.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' }
  });
  
  if (lastMsg) {
    console.log('Deleting msg to force re-ingestion:', lastMsg.id);
    await prisma.inboundMessage.delete({ where: { id: lastMsg.id } });
  }

  console.log('Polling email inbox for company:', company.id);
  const res = await inboundService.pollEmailInbox(company.id);
  console.log('Poll result:', res);

  const newMsg = await prisma.inboundMessage.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest inbound message:', newMsg);

  await app.close();
}

run().catch(console.error);

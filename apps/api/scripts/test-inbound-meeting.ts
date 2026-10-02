import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { InboundMessageService } from './src/sales-outreach/inbound-message.service';
import { PrismaService } from './src/prisma/prisma.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const service = app.get(InboundMessageService);
  const prisma = app.get(PrismaService);
  
  const company = await prisma.company.findFirst();
  if (!company) throw new Error('No company');

  const lead = await prisma.salesLead.findFirst({ where: { contactEmail: 'mayankjangid598@gmail.com' } });
  
  if (lead) {
      console.log('Testing with lead:', lead.id, lead.name);
      
      const msg = await service.ingest(
          company.id, 
          'EMAIL', 
          'mayankjangid598@gmail.com', 
          'I want to schedule a meeting to discuss requirements.', 
          'Re: Pricing',
          { autoSubmitted: 'no', lead }
      );
      
      console.log('Ingested msg:', msg);
      
      const call = await prisma.discoveryCall.findFirst({ where: { leadId: lead.id } });
      console.log('DiscoveryCall created/updated:', call);
  }
  
  await app.close();
  process.exit(0);
}
run();

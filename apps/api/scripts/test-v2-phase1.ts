import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailOutreachService } from '../src/sales-outreach/email-outreach.service';

async function bootstrap() {
  console.log("Initializing application context...");
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const emailOutreachService = app.get(EmailOutreachService);

  console.log("Fetching company and chairman...");
  const company = await prisma.company.findFirst();
  let chairman: any = await prisma.employee.findFirst({
    where: { role: { accessLevel: { in: ['CHAIRMAN', 'MANAGEMENT'] } }, status: 'ACTIVE', companyId: company.id },
    include: { role: true }
  });

  if (!chairman) {
    let role = await prisma.role.findFirst({ where: { accessLevel: 'CHAIRMAN' } });
    const dept = await prisma.department.findFirst();
    chairman = await prisma.employee.create({
      data: { 
        name: 'Chairman', 
        company: { connect: { id: company.id } }, 
        role: { connect: { id: role.id } }, 
        department: { connect: { id: dept.id } },
        status: 'ACTIVE',
        identitySeed: 'default-seed'
      },
      include: { role: true }
    });
  }

  const clientEmail = "mayankjangid598@gmail.com";
  
  // Find or create a SalesLead
  let lead = await prisma.salesLead.findFirst({ where: { contactEmail: clientEmail, companyId: company.id } });
  if (!lead) {
    console.log("Creating new SalesLead for " + clientEmail);
    lead = await prisma.salesLead.create({
      data: {
        companyId: company.id,
        name: "Mayank's Hotel",
        industry: "Hotel",
        contactEmail: clientEmail,
        website: "",
        status: "NEW",
        source: "TEST_V2",
      }
    });
  } else {
    console.log("Found existing SalesLead.");
  }

  console.log("Triggering EmailOutreachService.sendOutreachEmail()...");
  try {
    const res = await emailOutreachService.sendOutreachEmail(company.id, lead, chairman.id);
    console.log("Outreach email triggered successfully!", res);
  } catch (e) {
    console.error("Failed to send outreach email:", e);
  }

  await app.close();
  process.exit(0);
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OutreachService } from './src/outreach/outreach.service';
import { PrismaService } from './src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const outreachService = app.get(OutreachService);

  console.log("Setting up test data...");
  const company = await prisma.company.findFirst();
  let chairman: any = await prisma.employee.findFirst({
    where: { role: { accessLevel: { in: ['CHAIRMAN', 'MANAGEMENT'] } }, status: 'ACTIVE', companyId: company.id },
    include: { role: true }
  });
  if (!chairman) {
    let role = await prisma.role.findFirst({ where: { accessLevel: 'CHAIRMAN' } });
    if (!role) {
      role = await prisma.role.create({ data: { title: 'Admin', accessLevel: 'CHAIRMAN', companyId: company.id, permissions: {} } });
    }
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

  console.log("Creating Draft...");
  const draft = await outreachService.createDraft(company.id, chairman.id, {
    recipientEmail: "mayankjangid598@gmail.com",
    recipientName: "Mayank (Hotel Owner)",
    subject: "Aevora V2 - Digital Business Proposal",
    messageBody: `Dear Mayank,

This is a real test-client message from Aevora V2. We understand you are a hotel owner and we'd love to help with your digital-business needs.

Could you reply to this email to confirm receipt?

Best regards,
Aevora Team`
  });

  console.log("Draft created: " + draft.id);
  console.log("Approving and sending...");

  try {
    const res = await outreachService.approveAndSend(company.id, chairman.id, draft.id);
    console.log("Email sent successfully!");
    console.log(res);
  } catch (e) {
    console.error("Failed to send email:", e);
  }

  await app.close();
  process.exit(0);
}

bootstrap();

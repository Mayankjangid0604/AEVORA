import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('No company found');
    return;
  }
  
  const leadId = 'web-lead-' + Date.now();
  await prisma.salesLead.create({
    data: {
      id: leadId,
      companyId: company.id,
      name: 'Alpha Web Agency',
      industry: 'Consulting',
      contactName: 'Mayank',
      contactEmail: 'mayankjangid598@gmail.com',
      status: 'NEW'
    }
  });

  const campaignId = 'web-camp-' + Date.now();
  await prisma.outreachCampaign.create({
    data: {
      id: campaignId,
      companyId: company.id,
      leadId: leadId,
      channel: 'EMAIL',
      status: 'SENT',
      sentAt: new Date()
    }
  });

  const to = 'mayankjangid598@gmail.com';
  const subject = 'Aevora Digital - Transforming your digital presence';
  const body = `Hi Mayank,

We noticed that Alpha Web Agency could benefit from a powerful digital upgrade. At Aevora, we build professional, fast, and scalable websites tailored to your business needs.

Would you be interested in learning how we can improve your online presence?

Best regards,
Aevora Sales Team
Reply STOP to unsubscribe.
  `;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'Saahvik2026@gmail.com',
      pass: 'fmcqweacchstuehl', 
    }
  });

  const info = await transporter.sendMail({
    from: 'Saahvik2026@gmail.com',
    to,
    subject,
    text: body
  });

  console.log('Outreach Email sent:', info.messageId);
  console.log('Lead ID:', leadId);
}

main().finally(() => process.exit(0));

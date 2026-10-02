import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';

const prisma = new PrismaClient();

async function main() {
  const oppId = 'cf37aae5-31c0-4f77-a45c-88c9f9de2fd3';
  const opp = await prisma.opportunity.findUnique({
    where: { id: oppId }
  });

  if (!opp) {
    console.error('Opportunity not found');
    return;
  }
  
  // Transition opportunity to WON
  await prisma.opportunity.update({
    where: { id: oppId },
    data: { salesStage: 'WON', estimatedValue: 120000 }
  });

  // Find the latest proposal and accept it
  const proposal = await prisma.proposal.findFirst({
    where: { opportunityId: opp.id },
    orderBy: { createdAt: 'desc' }
  });

  if (proposal) {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: 'ACCEPTED', proposedPrice: 120000, total: 141600, tax: 21600 }
    });
  }

  // Create Project
  const projectId = 'proj-' + Date.now();
  await prisma.project.create({
    data: {
      id: projectId,
      companyId: opp.companyId,
      clientId: opp.clientId,
      opportunityId: opp.id,
      proposalId: proposal?.id,
      name: opp.title,
      description: 'Accepted Project - execution pending',
      status: 'ACTIVE',
      financialStatus: 'PENDING'
    }
  });
  
  // Create an Invoice for 1,20,000 + 18% tax (21600) = 141600
  const invoice = await prisma.invoice.create({
    data: {
      companyId: opp.companyId,
      clientId: opp.clientId,
      projectId: projectId,
      environment: 'SANDBOX',
      invoiceNumber: `INV-${Date.now()}-A`,
      currency: 'INR',
      subtotal: 120000,
      taxAmount: 21600,
      total: 141600,
      status: 'ISSUED',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 86400000),
      lineItems: {
        create: [
          { description: 'Hotel Management System Development (Negotiated)', quantity: 1, unitPrice: 120000, total: 120000 }
        ]
      }
    }
  });

  console.log('Created Invoice:', invoice.id);

  // Send email
  const to = 'mayankjangid598@gmail.com';
  const subject = 'Invoice & Payment Link for Aevora Digital Project';
  const sandboxPaymentLink = `https://sandbox.aevora.com/pay/${invoice.id}`;
  const body = `Hi Mayank,

We accept your proposed budget of ₹1,20,000.
We have updated our proposal and created an invoice for your project.

Title: Hotel Management System
Subtotal: ₹1,20,000
Tax (18%): ₹21,600
Total Due: ₹1,41,600

Please complete your payment via our Sandbox Payment Gateway to begin development:
${sandboxPaymentLink}

After you simulate payment, please reply to this email with "Payment confirmed" or just let us know, and we will initiate project execution.

Best regards,
Aevora Finance & Sales Team
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

  console.log('Email sent:', info.messageId);
}

main().finally(() => process.exit(0));

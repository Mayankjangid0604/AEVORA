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

  const proposal = await prisma.proposal.create({
    data: {
      opportunityId: opp.id,
      customerId: opp.clientId,
      title: 'Hotel Management System Proposal',
      lineItems: [],
      quantity: 1,
      unitPrice: 150000,
      currency: 'INR',
      discount: 0,
      tax: 27000,
      total: 177000,
      scope: 'User auth, room booking, inventory, and basic reporting.',
      deliverables: 'Web application, database setup, deployment to AWS.',
      assumptions: null,
      exclusions: null,
      estimatedTimeline: 60,
      proposedPrice: 177000,
      internalEstimatedCost: 50000,
      status: 'DRAFT',
    }
  });

  console.log('Generated Proposal:', proposal.id);

  // Send email
  const to = 'mayankjangid598@gmail.com';
  const subject = 'Your Proposal for the Hotel Management System';
  const body = `Hi Mayank,

We have reviewed your requirements for the Hotel Management System. Please find your proposal below.

Title: ${proposal.title}
Scope: ${proposal.scope}
Deliverables: ${proposal.deliverables}
Total: ${proposal.currency} ${proposal.total}

Please reply with "I accept the proposal" if you wish to proceed.

Best regards,
Aevora Sales Team
`;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'Saahvik2026@gmail.com',
      pass: 'fmcqweacchstuehl', // removed spaces from password
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

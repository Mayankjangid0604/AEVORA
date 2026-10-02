import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './src/integration/integration.service';
import { ProposalService } from './src/proposal/proposal.service';
import { ProductionExecutionGateService } from './src/production/production-execution-gate.service';
import { ApprovalValidationService } from './src/approval/approval-validation.service';

const prisma = new PrismaClient();
const integration = new IntegrationService();
const gate = new ProductionExecutionGateService(prisma, integration);
const approval = new ApprovalValidationService(prisma);
const proposalService = new ProposalService(prisma, gate, approval);

async function main() {
  const opp = await prisma.opportunity.findUnique({
    where: { id: 'cf37aae5-31c0-4f77-a45c-88c9f9de2fd3' }
  });
  
  if (!opp) {
    console.error('Opp not found');
    return;
  }

  const proposal = await proposalService.createProposal(opp.id, {
    title: 'Hotel Management System Proposal',
    description: 'Complete basic featured hotel management system.',
    scope: 'User auth, room booking, inventory, and basic reporting.',
    deliverables: 'Web application, database setup, deployment to AWS.',
    quantity: 1,
    unitPrice: 150000,
    currency: 'INR',
    discount: 0,
    tax: 27000,
    internalEstimatedCost: 50000
  });

  console.log('Generated Proposal:', proposal.id);

  // Send the proposal to the client
  const env = {
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_SECURE: process.env.SMTP_SECURE !== 'false',
    SMTP_FROM: process.env.SMTP_FROM
  };

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

  try {
    const res = await integration.sendEmail(opp.companyId, env, { to, subject, body });
    console.log('Email send result:', res);
  } catch (err) {
    console.error('Error sending email:', err);
  }
}

main().finally(() => process.exit(0));

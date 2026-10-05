import { PrismaClient, InvoiceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const invoiceId = 'b3073779-b578-4970-a714-869af316d6cd'; // Replace with dynamic if needed
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    console.error('Invoice not found');
    return;
  }
  
  if (invoice.status === InvoiceStatus.PAID) {
    console.log('Invoice is already marked as PAID');
    return;
  }

  const paymentId = 'pay_' + Date.now();
  const idempotencyKey = `razorpay:${paymentId}`;

  const result = await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidDate: new Date(), paymentReference: paymentId },
    });

    const account = await tx.realMoneyAccount.upsert({
      where: { companyId: invoice.companyId },
      create: { companyId: invoice.companyId, balance: invoice.total },
      update: { balance: { increment: invoice.total } },
    });

    await tx.realMoneyTransaction.create({
      data: {
        accountId: account.id,
        amount: invoice.total,
        description: `Client payment for V2 invoice ${invoice.invoiceNumber}`,
        referenceType: 'CLIENT_PAYMENT',
        referenceId: invoice.id,
        idempotencyKey,
      },
    });

    await tx.revenueRecord.create({
      data: {
        companyId: invoice.companyId,
        realMoneyAccountId: account.id,
        amount: invoice.total,
        status: 'RECEIVED',
        source: 'CLIENT_PROJECT',
        description: `Invoice ${invoice.id}`,
        receivedAt: new Date(),
        recognizedAt: new Date(),
      },
    });

    if (invoice.projectId) {
      await tx.project.update({
        where: { id: invoice.projectId },
        data: { financialStatus: 'PAID', status: 'ACTIVE' },
      });
      console.log(`Project ${invoice.projectId} updated to PAID and ACTIVE`);
    }

    return true;
  });

  if (result) {
    console.log('Payment processed successfully. V2 Execution can begin.');
  }
}

main().finally(() => process.exit(0));

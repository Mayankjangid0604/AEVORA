import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueStatus } from '@prisma/client';

@Injectable()
export class RevenueService {
  constructor(private prisma: PrismaService) {}

  async createExpectedRevenue(companyId: string, projectId: string, amount: number, source: string, description?: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    
    return this.prisma.revenueRecord.create({
      data: {
        companyId,
        projectId,
        amount,
        status: RevenueStatus.EXPECTED,
        source,
        description
      }
    });
  }

  async invoiceRevenue(recordId: string) {
    const record = await this.prisma.revenueRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Revenue record not found');
    if (record.status !== RevenueStatus.EXPECTED) throw new BadRequestException('Can only invoice EXPECTED revenue');

    return this.prisma.revenueRecord.update({
      where: { id: recordId },
      data: { status: RevenueStatus.INVOICED }
    });
  }

  async markReceivable(recordId: string) {
    const record = await this.prisma.revenueRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Revenue record not found');
    if (record.status !== RevenueStatus.INVOICED) throw new BadRequestException('Can only mark INVOICED revenue as RECEIVABLE');

    return this.prisma.revenueRecord.update({
      where: { id: recordId },
      data: { status: RevenueStatus.RECEIVABLE }
    });
  }

  async receiveClientPayment(recordId: string, idempotencyKey?: string) {
    const record = await this.prisma.revenueRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Revenue record not found');
    if (record.status === RevenueStatus.RECEIVED) return record; // Idempotent check handled loosely here or via idempotencyKey
    if (record.status !== RevenueStatus.RECEIVABLE) throw new BadRequestException('Revenue must be RECEIVABLE to receive payment');

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existingTx = await tx.realMoneyTransaction.findFirst({
          where: { idempotencyKey }
        });
        if (existingTx) {
          return tx.revenueRecord.findUnique({ where: { id: recordId } });
        }
      }

      let destAccount = await tx.realMoneyAccount.findUnique({
        where: { companyId: record.companyId },
      });

      if (!destAccount) {
        destAccount = await tx.realMoneyAccount.create({
          data: {
            companyId: record.companyId,
            balance: 0,
          },
        });
      }

      // 1. Update real money account
      await tx.realMoneyAccount.update({
        where: { id: destAccount.id },
        data: { balance: destAccount.balance + record.amount },
      });

      // 2. Log transaction
      await tx.realMoneyTransaction.create({
        data: {
          accountId: destAccount.id,
          amount: record.amount,
          description: `Client payment for revenue record ${record.id}`,
          referenceType: 'CLIENT_PAYMENT',
          referenceId: record.id,
          idempotencyKey,
        },
      });

      // 3. Mark revenue as received
      return tx.revenueRecord.update({
        where: { id: recordId },
        data: {
          status: RevenueStatus.RECEIVED,
          receivedAt: new Date(),
          realMoneyAccountId: destAccount.id
        }
      });
    });
  }
}

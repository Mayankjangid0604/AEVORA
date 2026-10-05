import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidFinancialAmount } from '@aevora/shared';

@Injectable()
export class EconomyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Transfers AC from one wallet to another atomically.
   */
  async transferAC(
    sourceWalletId: string,
    destWalletId: string,
    amount: number,
    reason: string,
    idempotencyKey?: string,
  ) {
    if (sourceWalletId === destWalletId) {
      throw new BadRequestException('Source and destination wallets cannot be the same');
    }

    if (amount <= 0 || !isValidFinancialAmount(amount)) {
      throw new BadRequestException('Amount must be a positive, safe integer');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.aCTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing; // Return existing transaction if idempotent
      }
    }

    // Execute atomic transaction
    return this.prisma.$transaction(async (tx) => {
      // Atomic update for source
      const updatedSource = await tx.$executeRaw`
        UPDATE "ACWallet" 
        SET balance = balance - ${amount} 
        WHERE id = ${sourceWalletId} AND balance >= ${amount}
      `;

      if (updatedSource === 0) {
        throw new BadRequestException('Insufficient funds or source wallet not found');
      }

      // Atomic update for destination
      const updatedDest = await tx.$executeRaw`
        UPDATE "ACWallet" 
        SET balance = balance + ${amount} 
        WHERE id = ${destWalletId}
      `;

      if (updatedDest === 0) {
        throw new BadRequestException('Destination wallet not found');
      }

      // 5. Create transaction record
      const transaction = await tx.aCTransaction.create({
        data: {
          fromWalletId: sourceWalletId,
          toWalletId: destWalletId,
          amount,
          reason,
          idempotencyKey,
        },
      });

      return transaction;
    });
  }

  /**
   * Transfers Real Money atomically. Completely separate from AC.
   */
  async transferRealMoney(
    sourceAccountId: string,
    destAccountId: string,
    amount: number,
    description: string,
    idempotencyKey?: string,
  ) {
    if (sourceAccountId === destAccountId) {
      throw new BadRequestException('Source and destination accounts cannot be the same');
    }

    if (amount <= 0 || !isValidFinancialAmount(amount)) {
      throw new BadRequestException('Amount must be a positive, safe integer');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.realMoneyTransaction.findFirst({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedSource = await tx.$executeRaw`
        UPDATE "RealMoneyAccount" 
        SET balance = balance - ${amount} 
        WHERE id = ${sourceAccountId} AND balance >= ${amount}
      `;

      if (updatedSource === 0) {
        throw new BadRequestException('Insufficient funds or source account not found');
      }

      const updatedDest = await tx.$executeRaw`
        UPDATE "RealMoneyAccount" 
        SET balance = balance + ${amount} 
        WHERE id = ${destAccountId}
      `;

      if (updatedDest === 0) {
        throw new BadRequestException('Destination account not found');
      }

      // We only create one side of the transaction log here for simplicity, 
      // but a double-entry ledger would create two. For AEVORA, this is sufficient.
      const transaction = await tx.realMoneyTransaction.create({
        data: {
          accountId: sourceAccountId,
          amount: -amount, // Debit
          description,
          idempotencyKey,
        },
      });
      
      await tx.realMoneyTransaction.create({
        data: {
          accountId: destAccountId,
          amount: amount, // Credit
          description,
        }
      });

      return transaction;
    });
  }

  async getACWalletBalance(walletId: string) {
    const wallet = await this.prisma.aCWallet.findUnique({ where: { id: walletId }});
    if (!wallet) throw new BadRequestException('Wallet not found');
    return wallet.balance;
  }

  /**
   * Injects capital into the company treasury from the Chairman.
   * This is explicitly tracked as chairman funding.
   */
  async injectChairmanCapital(
    companyId: string,
    amount: number,
    description?: string,
    idempotencyKey?: string,
  ) {
    if (amount <= 0 || !isValidFinancialAmount(amount)) {
      throw new BadRequestException('Amount must be a positive, safe integer');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.realMoneyTransaction.findFirst({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let destAccount = await tx.realMoneyAccount.findUnique({
        where: { companyId },
      });

      if (!destAccount) {
        destAccount = await tx.realMoneyAccount.create({
          data: {
            companyId,
            balance: 0,
          },
        });
      }

      await tx.realMoneyAccount.update({
        where: { id: destAccount.id },
        data: { balance: { increment: amount } },
      });

      const transaction = await tx.realMoneyTransaction.create({
        data: {
          accountId: destAccount.id,
          amount: amount, // Credit
          description: description || 'Chairman Capital Injection',
          referenceType: 'CHAIRMAN_FUNDING',
          idempotencyKey,
        },
      });

      await tx.chairmanFundingRecord.create({
        data: {
          companyId,
          realMoneyAccountId: destAccount.id,
          amount,
          currency: 'INR',
        },
      });

      // Optional event emission could happen here

      return transaction;
    });
  }
}

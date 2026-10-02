import { Controller, Get, Post, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('economy')
export class EconomyController {
  constructor(
    private readonly economyService: EconomyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('wallet/:walletId')
  async getWalletBalance(@Param('walletId') walletId: string, @Request() req: any) {
    const wallet = await this.prisma.aCWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new ForbiddenException('Wallet not found');
    
    // Allow Chairman to see company wallets, or employee to see own wallet
    if (req.user.actorRole !== 'CHAIRMAN' && wallet.employeeId !== req.user.actorId) {
      throw new ForbiddenException('Unauthorized access to wallet');
    }

    const balance = await this.economyService.getACWalletBalance(walletId);
    return { walletId, balance };
  }

  @Post('transfer/ac')
  async transferAC(
    @Body() body: { sourceId: string; destId: string; amount: number; reason: string; idempotencyKey?: string },
    @Request() req: any
  ) {
    const sourceWallet = await this.prisma.aCWallet.findUnique({ where: { id: body.sourceId } });
    if (!sourceWallet) throw new ForbiddenException('Source wallet not found');
    
    // Allow Chairman to transfer from company wallet, or employee from their own
    if (req.user.actorRole === 'CHAIRMAN') {
      if (sourceWallet.companyId !== req.user.companyId) {
        throw new ForbiddenException('Unauthorized source wallet for Chairman');
      }
    } else {
      if (sourceWallet.employeeId !== req.user.actorId) {
        throw new ForbiddenException('Unauthorized source wallet for Employee');
      }
    }

    const transaction = await this.economyService.transferAC(
      body.sourceId,
      body.destId,
      body.amount,
      body.reason,
      body.idempotencyKey,
    );
    return { success: true, transaction };
  }
}

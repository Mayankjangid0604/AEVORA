import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { AccountType } from '@prisma/client';

@Injectable()
export class ChartOfAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createAccount(companyId: string, actorId: string, dto: {
    code: string; name: string; type: AccountType; parentId?: string;
    currency?: string; description?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.parentId) {
      const parent = await this.prisma.financialAccount.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.companyId !== companyId) throw new NotFoundException('Parent account not found');
      // Parent must be same type
      if (parent.type !== dto.type) throw new BadRequestException('Parent account must be the same AccountType');
      // Prevent cycles: reject self-reference
      if (dto.parentId === dto.code) throw new BadRequestException('Account cannot be its own parent');
    }

    const account = await this.prisma.financialAccount.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId,
        currency: dto.currency ?? 'INR',
        description: dto.description,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'ACCOUNT_CREATED',
      objectType: 'FinancialAccount', objectId: account.id,
      newValue: { code: dto.code, name: dto.name, type: dto.type },
    });
    return account;
  }

  async updateAccount(companyId: string, actorId: string, accountId: string, dto: {
    name?: string; description?: string; isActive?: boolean;
  }) {
    await this.verifyActor(actorId, companyId);
    const account = await this.prisma.financialAccount.findUnique({ where: { id: accountId } });
    if (!account || account.companyId !== companyId) throw new NotFoundException('Account not found');

    const updated = await this.prisma.financialAccount.update({
      where: { id: accountId },
      data: { ...dto },
    });
    await this.audit.record({
      companyId, actorId, action: 'ACCOUNT_UPDATED',
      objectType: 'FinancialAccount', objectId: accountId,
      oldValue: { name: account.name, isActive: account.isActive },
      newValue: { name: updated.name, isActive: updated.isActive },
    });
    return updated;
  }

  async getAccounts(companyId: string, type?: AccountType) {
    return this.prisma.financialAccount.findMany({
      where: { companyId, ...(type ? { type } : {}), isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async getAccount(companyId: string, accountId: string) {
    const a = await this.prisma.financialAccount.findUnique({ where: { id: accountId } });
    if (!a || a.companyId !== companyId) throw new NotFoundException('Account not found');
    return a;
  }
}

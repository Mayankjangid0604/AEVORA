import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TargetAccountStatus } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';

export interface CreateTargetAccountDto {
  organizationName: string;
  industry?: string;
  geography?: string;
  sizeCategory?: string;
  website?: string;
  description?: string;
  estimatedValue?: number;
  notes?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class TargetAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }
  }

  async createAccount(companyId: string, actorId: string, dto: CreateTargetAccountDto) {
    await this.verifyActor(actorId, companyId);

    const account = await this.prisma.targetAccount.create({
      data: {
        companyId,
        organizationName: dto.organizationName,
        industry: dto.industry,
        geography: dto.geography,
        sizeCategory: dto.sizeCategory,
        website: dto.website,
        description: dto.description,
        estimatedValue: dto.estimatedValue,
        notes: dto.notes,
        accountOwnerId: actorId,
        metadata: dto.metadata ?? {},
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'ACCOUNT_CREATED',
      objectType: 'TargetAccount', objectId: account.id,
      newValue: { organizationName: account.organizationName },
      targetAccountId: account.id,
    });

    return account;
  }

  async getAccount(companyId: string, accountId: string) {
    const account = await this.prisma.targetAccount.findUnique({
      where: { id: accountId },
      include: { salesLeads: true, activities: true },
    });
    if (!account || account.companyId !== companyId) {
      throw new NotFoundException('Target account not found');
    }
    return account;
  }

  async listAccounts(companyId: string) {
    return this.prisma.targetAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAccountStatus(
    companyId: string,
    actorId: string,
    accountId: string,
    status: TargetAccountStatus,
  ) {
    await this.verifyActor(actorId, companyId);

    const account = await this.prisma.targetAccount.findUnique({ where: { id: accountId } });
    if (!account || account.companyId !== companyId) {
      throw new NotFoundException('Target account not found');
    }

    const updated = await this.prisma.targetAccount.update({
      where: { id: accountId },
      data: { status },
    });

    await this.audit.record({
      companyId, actorId, action: 'ACCOUNT_STATUS_CHANGED',
      objectType: 'TargetAccount', objectId: accountId,
      oldValue: { status: account.status },
      newValue: { status },
      targetAccountId: accountId,
    });

    return updated;
  }
}

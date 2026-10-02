import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoBudgetService } from './ceo-budget.service';
import { NotificationService, NotificationPriority } from '../communication/notification.service';
import { CeoFinancialOperation, CeoFinancialAuthorityStatus, CeoFinancialDecision } from '@prisma/client';
import { GrantAuthorityDto, CheckAuthorityDto } from './dto/ceo-financial-authority.dto';

export interface AuthorityCheckResult {
  allowed: boolean;
  requiresChairmanApproval: boolean;
  denied: boolean;
  reason?: string;
  authorityId?: string;
  applicableLimit?: number;
  remainingDailyLimit?: number;
  remainingMonthlyLimit?: number;
  remainingBudget?: number;
}

@Injectable()
export class CeoFinancialAuthorityService {
  private readonly logger = new Logger(CeoFinancialAuthorityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: CeoBudgetService,
    private readonly notifications: NotificationService,
  ) {}

  async grantAuthority(companyId: string, chairmanId: string, dto: GrantAuthorityDto) {
    const authority = await this.prisma.ceoFinancialAuthority.create({
      data: {
        companyId,
        ceoEmployeeId: dto.ceoEmployeeId,
        singleTransactionLimit: dto.singleTransactionLimit,
        dailyLimit: dto.dailyLimit,
        monthlyLimit: dto.monthlyLimit,
        budgetLimit: dto.budgetLimit ?? true,
        allowedOperations: dto.allowedOperations,
        requiresChairmanApprovalAbove: dto.requiresChairmanApprovalAbove,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        grantedBy: chairmanId,
        reason: dto.reason,
      }
    });

    await this.notifications.createNotification(
      companyId,
      chairmanId,
      'FINANCIAL_AUTHORITY',
      'CEO Financial Authority Granted',
      `Financial authority granted to CEO with daily limit ${dto.dailyLimit}`,
      NotificationPriority.HIGH,
    );
    await this.notifications.createNotification(
      companyId,
      dto.ceoEmployeeId,
      'FINANCIAL_AUTHORITY',
      'CEO Financial Authority Granted',
      `Financial authority granted to CEO with daily limit ${dto.dailyLimit}`,
      NotificationPriority.HIGH,
    );

    return authority;
  }

  async getActiveAuthority(companyId: string, ceoEmployeeId: string) {
    const now = new Date();
    return await this.prisma.ceoFinancialAuthority.findFirst({
      where: {
        companyId,
        ceoEmployeeId,
        authorityStatus: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gt: now } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getUsage(companyId: string, authorityId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyDecisions, monthlyDecisions] = await Promise.all([
      this.prisma.ceoFinancialDecision.findMany({
        where: { authorityId, decision: 'AUTHORIZED', createdAt: { gte: todayStart } }
      }),
      this.prisma.ceoFinancialDecision.findMany({
        where: { authorityId, decision: 'AUTHORIZED', createdAt: { gte: monthStart } }
      })
    ]);

    const dailyUsed = dailyDecisions.reduce((sum, d) => sum + d.amount, 0);
    const monthlyUsed = monthlyDecisions.reduce((sum, d) => sum + d.amount, 0);

    return { dailyUsed, monthlyUsed };
  }

  async suspendAuthority(companyId: string, authorityId: string, revokedBy: string, reason?: string) {
    return await this.prisma.ceoFinancialAuthority.update({
      where: { id: authorityId, companyId },
      data: { authorityStatus: 'SUSPENDED', revokedBy, reason }
    });
  }

  async revokeAuthority(companyId: string, authorityId: string, revokedBy: string, reason?: string) {
    return await this.prisma.ceoFinancialAuthority.update({
      where: { id: authorityId, companyId },
      data: { authorityStatus: 'REVOKED', revokedBy, reason, effectiveUntil: new Date() }
    });
  }

  async checkFinancialAuthority(
    companyId: string,
    ceoEmployeeId: string,
    operation: CeoFinancialOperation,
    amount: number,
    currency: string = 'INR',
    budgetId?: string
  ): Promise<AuthorityCheckResult> {
    const authority = await this.getActiveAuthority(companyId, ceoEmployeeId);

    if (!authority) {
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'No active financial authority found' };
    }

    if (!authority.allowedOperations.includes(operation)) {
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Operation not allowed by current authority', authorityId: authority.id };
    }

    if (currency !== 'INR') { // Assuming base is INR for simple checking, can expand FX logic later
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Unsupported currency checking', authorityId: authority.id };
    }

    if (amount > authority.singleTransactionLimit) {
      if (authority.requiresChairmanApprovalAbove && amount >= authority.requiresChairmanApprovalAbove) {
          return { allowed: false, requiresChairmanApproval: true, denied: false, reason: 'Amount exceeds transaction limit but is eligible for Chairman approval', authorityId: authority.id };
      }
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Amount exceeds single transaction limit', authorityId: authority.id };
    }

    const usage = await this.getUsage(companyId, authority.id);

    if (usage.dailyUsed + amount > authority.dailyLimit) {
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Daily limit exceeded', authorityId: authority.id, remainingDailyLimit: Math.max(0, authority.dailyLimit - usage.dailyUsed) };
    }

    if (usage.monthlyUsed + amount > authority.monthlyLimit) {
      return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Monthly limit exceeded', authorityId: authority.id, remainingMonthlyLimit: Math.max(0, authority.monthlyLimit - usage.monthlyUsed) };
    }

    let remainingBudget = undefined;
    if (authority.budgetLimit && budgetId) {
      // Need to verify budget if operation requires it
      const budget = await this.prisma.companyBudget.findUnique({ where: { id: budgetId, companyId } });
      if (!budget) {
        return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Budget not found', authorityId: authority.id };
      }
      remainingBudget = budget.totalAmount - budget.spentAmount - budget.committedAmount;
      if (amount > remainingBudget) {
        return { allowed: false, requiresChairmanApproval: false, denied: true, reason: 'Insufficient remaining budget', authorityId: authority.id, remainingBudget };
      }
    }

    if (authority.requiresChairmanApprovalAbove && amount >= authority.requiresChairmanApprovalAbove) {
        return { allowed: false, requiresChairmanApproval: true, denied: false, reason: 'Amount requires Chairman approval', authorityId: authority.id };
    }

    return { 
      allowed: true, 
      requiresChairmanApproval: false, 
      denied: false, 
      authorityId: authority.id,
      applicableLimit: authority.singleTransactionLimit,
      remainingDailyLimit: authority.dailyLimit - usage.dailyUsed - amount,
      remainingMonthlyLimit: authority.monthlyLimit - usage.monthlyUsed - amount,
      remainingBudget: remainingBudget !== undefined ? remainingBudget - amount : undefined
    };
  }

  async recordDecision(
    companyId: string, 
    ceoEmployeeId: string, 
    operation: CeoFinancialOperation,
    amount: number,
    currency: string,
    result: AuthorityCheckResult,
    idempotencyKey: string,
    budgetId?: string,
    chairmanApprovalRef?: string
  ) {
      // Ensure idempotency
      const existing = await this.prisma.ceoFinancialDecision.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;

      let decisionStatus = 'REJECTED';
      if (result.allowed) decisionStatus = 'AUTHORIZED';
      else if (result.requiresChairmanApproval) decisionStatus = 'REQUIRES_APPROVAL';

      return await this.prisma.ceoFinancialDecision.create({
          data: {
              companyId,
              ceoEmployeeId,
              operation,
              amount,
              currency,
              budgetId,
              authorityId: result.authorityId,
              decision: decisionStatus,
              reason: result.reason,
              chairmanApprovalRef,
              idempotencyKey
          }
      });
  }

}

import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkerProfileService } from './worker-profile.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { BonusProposalStatus, EmployeeStatus, ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkforceAuditService,
    private readonly profileSvc: WorkerProfileService,
    private readonly approvalSvc: ApprovalValidationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async updateSalary(companyId: string, actorId: string, employeeId: string, newSalary: number, approvalId: string, reason: string) {
    await this.verifyActor(actorId, companyId);

    // An employee cannot update their own salary
    if (actorId === employeeId) throw new ForbiddenException('An employee cannot update their own salary');

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target || target.companyId !== companyId) throw new NotFoundException('Employee not found');
    if (target.status !== EmployeeStatus.ACTIVE) throw new BadRequestException('Cannot update salary of non-active employee');

    if (!Number.isInteger(newSalary) || newSalary < 0) throw new BadRequestException('salary must be a non-negative integer');

    // Salary change requires approval
    await this.approvalSvc.validateAndConsumeApproval(approvalId, {
      companyId, action: 'UPDATE_SALARY',
      environment: ExecutionEnvironment.PRODUCTION,
      targetType: 'Employee', targetId: employeeId,
      params: { employeeId, newSalary },
    });

    const oldSalary = target.salary;
    const updated = await this.prisma.$transaction(async (tx) => {
      const emp = await tx.employee.update({ where: { id: employeeId }, data: { salary: newSalary } });
      await tx.employmentHistory.create({
        data: { employeeId, eventType: 'SALARY_CHANGED', previousValue: String(oldSalary), newValue: String(newSalary), actor: actorId, reason },
      });
      return emp;
    });

    await this.audit.record({
      companyId, actorId, action: 'SALARY_UPDATED',
      objectType: 'Employee', objectId: employeeId,
      oldValue: { salary: oldSalary }, newValue: { salary: newSalary, reason },
    });
    return updated;
  }

  async proposeBonus(companyId: string, proposerId: string, employeeId: string, dto: {
    amount: number; currency?: string; reason: string; period: string;
  }) {
    await this.verifyActor(proposerId, companyId);

    // An AI worker must not propose a bonus for itself
    const proposerProfile = await this.profileSvc.ensureProfile(proposerId, companyId);
    const targetProfile = await this.profileSvc.ensureProfile(employeeId, companyId);

    if (proposerProfile.id === targetProfile.id) throw new ForbiddenException('Cannot propose bonus for yourself');

    if (!Number.isInteger(dto.amount) || dto.amount <= 0) throw new BadRequestException('amount must be positive integer');

    const proposal = await this.prisma.bonusProposal.create({
      data: {
        companyId, targetProfileId: targetProfile.id, proposerId: proposerProfile.id,
        amount: dto.amount, currency: dto.currency ?? 'AC',
        reason: dto.reason, period: dto.period,
        status: BonusProposalStatus.PROPOSED, isAdvisory: true,
      },
    });
    await this.audit.record({
      companyId, actorId: proposerId, action: 'BONUS_PROPOSED',
      objectType: 'BonusProposal', objectId: proposal.id,
      newValue: { amount: dto.amount, targetEmployeeId: employeeId, period: dto.period, isAdvisory: true },
    });
    return proposal;
  }

  async approveBonus(companyId: string, actorId: string, bonusId: string, approvalId: string) {
    await this.verifyActor(actorId, companyId);
    const bonus = await this.prisma.bonusProposal.findUnique({ where: { id: bonusId } });
    if (!bonus || bonus.companyId !== companyId) throw new NotFoundException('Bonus proposal not found');
    if (bonus.status !== BonusProposalStatus.REVIEW && bonus.status !== BonusProposalStatus.PROPOSED) {
      throw new BadRequestException('Bonus proposal must be in PROPOSED or REVIEW status');
    }

    // Approver cannot be the proposer or the target
    const actorProfile = await this.profileSvc.ensureProfile(actorId, companyId);
    if (actorProfile.id === bonus.proposerId || actorProfile.id === bonus.targetProfileId) {
      throw new ForbiddenException('Cannot approve your own bonus proposal or approve a bonus for yourself');
    }

    await this.approvalSvc.validateAndConsumeApproval(approvalId, {
      companyId, action: 'APPROVE_BONUS',
      environment: ExecutionEnvironment.PRODUCTION,
      targetType: 'BonusProposal', targetId: bonusId,
      params: { bonusId, amount: bonus.amount, currency: bonus.currency },
    });

    const updated = await this.prisma.bonusProposal.update({
      where: { id: bonusId },
      data: { status: BonusProposalStatus.APPROVED, approvalId, approvedById: actorId, approvedAt: new Date(), isAdvisory: false },
    });
    await this.audit.record({
      companyId, actorId, action: 'BONUS_APPROVED',
      objectType: 'BonusProposal', objectId: bonusId,
      oldValue: { status: 'PROPOSED' }, newValue: { status: 'APPROVED', isAdvisory: false },
    });
    return updated;
  }

  async awardBonus(companyId: string, actorId: string, bonusId: string) {
    await this.verifyActor(actorId, companyId);
    const bonus = await this.prisma.bonusProposal.findUnique({
      where: { id: bonusId },
      include: { targetProfile: { include: { employee: { include: { acWallet: true } } } } },
    });
    if (!bonus || bonus.companyId !== companyId) throw new NotFoundException('Bonus proposal not found');
    if (bonus.status !== BonusProposalStatus.APPROVED) throw new BadRequestException('Bonus must be APPROVED before awarding');

    const targetWalletId = bonus.targetProfile.employee.acWallet?.id;
    if (!targetWalletId) throw new BadRequestException('Target employee has no AC wallet');

    // All reads and writes happen inside a single transaction to prevent:
    // 1. Stale balance check (MEDIUM-F02 fix)
    // 2. Double-spend via concurrent award calls (MEDIUM-F04 fix)
    const updated = await this.prisma.$transaction(async (tx) => {
      // Re-read bonus inside transaction to get a consistent status check
      const lockedBonus = await tx.bonusProposal.findUnique({ where: { id: bonusId } });
      if (!lockedBonus || lockedBonus.status !== BonusProposalStatus.APPROVED) {
        throw new BadRequestException('Bonus must be APPROVED before awarding (or was already consumed)');
      }

      // Read wallet inside transaction for an accurate balance
      const companyWallet = await tx.aCWallet.findUnique({ where: { companyId } });
      if (!companyWallet) throw new BadRequestException('Company AC wallet not found');
      if (companyWallet.balance < lockedBonus.amount) throw new BadRequestException('Insufficient company AC balance for bonus');

      await tx.aCWallet.update({ where: { id: companyWallet.id }, data: { balance: { decrement: lockedBonus.amount } } });
      await tx.aCWallet.update({ where: { id: targetWalletId }, data: { balance: { increment: lockedBonus.amount } } });
      await tx.aCTransaction.create({
        data: {
          fromWalletId: companyWallet.id, toWalletId: targetWalletId,
          amount: lockedBonus.amount, reason: `Bonus award: ${lockedBonus.reason}`,
          referenceType: 'BONUS', referenceId: bonusId,
        },
      });

      // Mark AWARDED inside the same transaction — prevents concurrent double-award
      const consumed = await tx.bonusProposal.updateMany({
        where: { id: bonusId, status: BonusProposalStatus.APPROVED },
        data: { status: BonusProposalStatus.AWARDED, awardedAt: new Date() },
      });
      if (consumed.count === 0) throw new BadRequestException('Conflict: bonus already awarded');
      return tx.bonusProposal.findUnique({ where: { id: bonusId } });
    });
    await this.audit.record({
      companyId, actorId, action: 'BONUS_AWARDED',
      objectType: 'BonusProposal', objectId: bonusId,
      newValue: { status: 'AWARDED', amount: bonus.amount, awardedAt: new Date() },
    });
    return updated;
  }

  async getBonusProposals(companyId: string, status?: BonusProposalStatus) {
    return this.prisma.bonusProposal.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

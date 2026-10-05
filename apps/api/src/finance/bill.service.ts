import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { BillStatus, ExecutionEnvironment } from '@prisma/client';

const BILL_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  DRAFT: [BillStatus.SUBMITTED, BillStatus.CANCELLED],
  SUBMITTED: [BillStatus.APPROVED, BillStatus.CANCELLED],
  APPROVED: [BillStatus.PARTIALLY_PAID, BillStatus.PAID, BillStatus.OVERDUE, BillStatus.VOID],
  PARTIALLY_PAID: [BillStatus.PAID, BillStatus.OVERDUE],
  PAID: [],
  OVERDUE: [BillStatus.PAID, BillStatus.VOID],
  VOID: [],
  CANCELLED: [],
};

@Injectable()
export class BillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
    private readonly approvalSvc: ApprovalValidationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createBill(companyId: string, actorId: string, dto: {
    vendorName: string; vendorRef?: string; billNumber?: string;
    billDate: Date; dueDate: Date; currency?: string;
    subtotal: number; taxAmount?: number; description?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.subtotal) || dto.subtotal < 0) throw new BadRequestException('subtotal must be non-negative integer');
    const taxAmount = dto.taxAmount ?? 0;
    if (!Number.isInteger(taxAmount) || taxAmount < 0) throw new BadRequestException('taxAmount must be non-negative integer');
    const total = dto.subtotal + taxAmount;

    const bill = await this.prisma.bill.create({
      data: {
        companyId, vendorName: dto.vendorName, vendorRef: dto.vendorRef,
        billNumber: dto.billNumber, billDate: dto.billDate, dueDate: dto.dueDate,
        currency: dto.currency ?? 'INR', subtotal: dto.subtotal, taxAmount,
        total, description: dto.description, createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'BILL_CREATED',
      objectType: 'Bill', objectId: bill.id,
      newValue: { vendorName: dto.vendorName, total, status: 'DRAFT' },
    });
    return bill;
  }

  async advanceBillStatus(companyId: string, actorId: string, billId: string, newStatus: BillStatus, approvalId?: string) {
    await this.verifyActor(actorId, companyId);
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill || bill.companyId !== companyId) throw new NotFoundException('Bill not found');

    const allowed = BILL_TRANSITIONS[bill.status] ?? [];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition bill from ${bill.status} to ${newStatus}`);

    if (newStatus === BillStatus.APPROVED) {
      if (!approvalId) throw new BadRequestException('approvalId required to approve bill');
      await this.approvalSvc.validateAndConsumeApproval(approvalId, {
        companyId, action: 'APPROVE_BILL',
        environment: ExecutionEnvironment.PRODUCTION,
        targetType: 'Bill', targetId: billId,
        params: { billId, total: bill.total },
      });
    }

    const updated = await this.prisma.bill.update({
      where: { id: billId },
      data: {
        status: newStatus,
        ...(newStatus === BillStatus.APPROVED ? {
          approvalId, approvedById: actorId, approvedAt: new Date(),
        } : {}),
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'BILL_STATUS_CHANGED',
      objectType: 'Bill', objectId: billId,
      oldValue: { status: bill.status }, newValue: { status: newStatus },
    });
    return updated;
  }

  async getBills(companyId: string, status?: BillStatus) {
    return this.prisma.bill.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBill(companyId: string, billId: string) {
    const b = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!b || b.companyId !== companyId) throw new NotFoundException('Bill not found');
    return b;
  }
}

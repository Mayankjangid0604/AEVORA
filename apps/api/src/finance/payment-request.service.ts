import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { FinancePaymentRequestStatus, ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class PaymentRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
    private readonly approvalSvc: ApprovalValidationService,
    private readonly productionGate: ProductionExecutionGateService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createPaymentRequest(companyId: string, actorId: string, dto: {
    billId?: string; invoiceId?: string; beneficiaryName: string; beneficiaryRef?: string;
    amount: number; currency?: string; purpose: string; sandboxMode?: boolean;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) throw new BadRequestException('amount must be a positive integer');

    if (dto.billId) {
      const bill = await this.prisma.bill.findUnique({ where: { id: dto.billId } });
      if (!bill || bill.companyId !== companyId) throw new NotFoundException('Bill not found');
      if (bill.status !== 'APPROVED') throw new BadRequestException('Bill must be APPROVED before payment request');
    }

    const pr = await this.prisma.financePaymentRequest.create({
      data: {
        companyId, billId: dto.billId, invoiceId: dto.invoiceId,
        beneficiaryName: dto.beneficiaryName, beneficiaryRef: dto.beneficiaryRef,
        amount: dto.amount, currency: dto.currency ?? 'INR',
        purpose: dto.purpose, sandboxMode: dto.sandboxMode ?? false,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'PAYMENT_REQUEST_CREATED',
      objectType: 'FinancePaymentRequest', objectId: pr.id,
      newValue: { amount: dto.amount, beneficiaryName: dto.beneficiaryName, purpose: dto.purpose },
    });
    return pr;
  }

  async approvePaymentRequest(companyId: string, actorId: string, prId: string, approvalId: string) {
    await this.verifyActor(actorId, companyId);
    const pr = await this.prisma.financePaymentRequest.findUnique({ where: { id: prId } });
    if (!pr || pr.companyId !== companyId) throw new NotFoundException('Payment request not found');
    if (pr.status !== FinancePaymentRequestStatus.SUBMITTED) throw new BadRequestException('Payment request must be SUBMITTED');

    await this.approvalSvc.validateAndConsumeApproval(approvalId, {
      companyId, action: 'APPROVE_PAYMENT_REQUEST',
      environment: ExecutionEnvironment.PRODUCTION,
      targetType: 'FinancePaymentRequest', targetId: prId,
      params: { prId, amount: pr.amount },
    });

    const updated = await this.prisma.financePaymentRequest.update({
      where: { id: prId },
      data: {
        status: FinancePaymentRequestStatus.APPROVED,
        approvalId, approvedById: actorId, approvedAt: new Date(),
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'PAYMENT_REQUEST_APPROVED',
      objectType: 'FinancePaymentRequest', objectId: prId,
      oldValue: { status: 'SUBMITTED' }, newValue: { status: 'APPROVED' },
    });
    return updated;
  }

  async submitPaymentRequest(companyId: string, actorId: string, prId: string) {
    await this.verifyActor(actorId, companyId);
    const pr = await this.prisma.financePaymentRequest.findUnique({ where: { id: prId } });
    if (!pr || pr.companyId !== companyId) throw new NotFoundException('Payment request not found');
    if (pr.status !== FinancePaymentRequestStatus.DRAFT) throw new BadRequestException('Only DRAFT requests can be submitted');

    const updated = await this.prisma.financePaymentRequest.update({
      where: { id: prId },
      data: { status: FinancePaymentRequestStatus.SUBMITTED },
    });
    await this.audit.record({
      companyId, actorId, action: 'PAYMENT_REQUEST_SUBMITTED',
      objectType: 'FinancePaymentRequest', objectId: prId,
      oldValue: { status: 'DRAFT' }, newValue: { status: 'SUBMITTED' },
    });
    return updated;
  }

  async executePaymentRequest(
    companyId: string, actorId: string, prId: string,
    approvalId: string, idempotencyKey: string,
  ) {
    await this.verifyActor(actorId, companyId);
    const pr = await this.prisma.financePaymentRequest.findUnique({ where: { id: prId } });
    if (!pr || pr.companyId !== companyId) throw new NotFoundException('Payment request not found');

    // Idempotency: if already executed with this key, return idempotently
    if (pr.idempotencyKey === idempotencyKey && pr.status === FinancePaymentRequestStatus.EXECUTED) {
      return pr;
    }

    if (pr.status !== FinancePaymentRequestStatus.APPROVED) {
      throw new BadRequestException('Payment request must be APPROVED before execution');
    }

    // PAYMENT_EXECUTION goes through production gate — AI agents cannot call this
    await this.productionGate.authorizeProductionAction({
      actorId, companyId,
      environment: pr.sandboxMode ? ExecutionEnvironment.SANDBOX : ExecutionEnvironment.PRODUCTION,
      capability: 'PAYMENT_EXECUTION',
      action: 'EXECUTE_PAYMENT_REQUEST',
      resourceId: prId,
      parameters: { prId, amount: pr.amount, beneficiaryName: pr.beneficiaryName },
      approvalId,
      idempotencyKey,
    });

    const executed = await this.prisma.financePaymentRequest.update({
      where: { id: prId },
      data: {
        status: FinancePaymentRequestStatus.EXECUTED,
        executedById: actorId, executedAt: new Date(),
        idempotencyKey,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'PAYMENT_REQUEST_EXECUTED',
      objectType: 'FinancePaymentRequest', objectId: prId,
      newValue: { status: 'EXECUTED', executedAt: executed.executedAt, idempotencyKey },
    });
    return executed;
  }

  async getPaymentRequests(companyId: string, status?: FinancePaymentRequestStatus) {
    return this.prisma.financePaymentRequest.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPaymentRequest(companyId: string, prId: string) {
    const pr = await this.prisma.financePaymentRequest.findUnique({ where: { id: prId } });
    if (!pr || pr.companyId !== companyId) throw new NotFoundException('Payment request not found');
    return pr;
  }
}

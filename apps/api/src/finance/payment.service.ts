import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { ExecutionEnvironment, RevenueStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PaymentError } from '../common/errors/error-taxonomy';

@Injectable()
export class PaymentProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ProductionExecutionGateService,
    private readonly structuredLogger: StructuredLoggerService
  ) {}

  async processPayment(
    companyId: string,
    actorId: string,
    invoiceId: string,
    amount: number,
    currency: string = 'INR',
    approvalId?: string,
    environment: ExecutionEnvironment = ExecutionEnvironment.PRODUCTION
  ): Promise<any> {
    const invoice = await this.prisma.invoice.findFirst({ 
      where: { id: invoiceId, companyId, client: { companyId } },
      include: { client: true }
    });
    if (!invoice) throw new BadRequestException('Invoice not found or does not belong to company');

    await this.gate.authorizeProductionAction({
      companyId,
      actorId,
      environment,
      capability: 'PAYMENT_CAPTURE',
      action: 'CHARGE',
      parameters: { invoiceId, amount, currency, clientId: invoice.clientId },
      approvalId
    });

    const isProd = environment === ExecutionEnvironment.PRODUCTION;

    const providerIntegration = await this.prisma.providerIntegration.findFirst({
      where: {
        companyId,
        environment,
        capabilityType: 'PAYMENT_CAPTURE',
        status: 'ACTIVE'
      }
    });

    if (isProd && !providerIntegration) {
      throw new PaymentError('PROVIDER_NOT_CONFIGURED', 'Missing real provider configuration for production payments.');
    }

    const idempotencyKey = `pay_${companyId}_${invoiceId}`;
    const status = isProd ? 'PENDING' : 'COMPLETED';
    const providerName = providerIntegration ? providerIntegration.providerId : 'STRIPE_MOCK';
    const providerRef = isProd ? null : `ch_${crypto.randomUUID()}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        this.structuredLogger.log(`[EXTERNAL_PAYMENT] Charging ${amount} ${currency} for invoice ${invoiceId}`, PaymentProviderService.name, { companyId, actorId, invoiceId, amount, currency, approvalId });

        const paymentEvent = await tx.paymentEvent.create({
          data: {
            companyId,
            invoiceId,
            amount,
            currency,
            status,
            provider: providerName,
            providerRef,
            idempotencyKey
          }
        });

        if (status === 'COMPLETED') {
            const totalPaid = await tx.paymentEvent.aggregate({
              where: { invoiceId, status: 'COMPLETED' },
              _sum: { amount: true }
            });

            const newTotalPaid = totalPaid._sum.amount || 0;
            const newStatus = newTotalPaid >= invoice.total ? 'PAID' : 'PARTIALLY_PAID';

            await tx.invoice.updateMany({
              where: { id: invoiceId, companyId, status: { not: 'PAID' } },
              data: { status: newStatus as any, paidDate: newStatus === 'PAID' ? new Date() : null }
            });
        }

        return paymentEvent;
      });
      return result;
    } catch (e: any) {
      if (e.code === 'P2002') {
        this.structuredLogger.warn(`Idempotent payment capture ignored: ${idempotencyKey}`, PaymentProviderService.name, { companyId, invoiceId });
        return await this.prisma.paymentEvent.findUnique({ where: { idempotencyKey } });
      }
      throw e;
    }
  }
}

import { RevenueError, StateTransitionError } from '../common/errors/error-taxonomy';

@Injectable()
export class RevenueAccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async recognizeRevenue(
    companyId: string,
    projectId: string | null,
    amount: number,
    source: string,
    paymentEventId: string,
    description?: string
  ): Promise<any> {
    const paymentEvent = await this.prisma.paymentEvent.findUnique({ where: { id: paymentEventId } });
    if (!paymentEvent) throw new RevenueError('PAYMENT_NOT_FOUND', 'PaymentEvent not found');
    if (paymentEvent.companyId !== companyId) throw new RevenueError('COMPANY_MISMATCH', 'PaymentEvent does not belong to company');
    if (paymentEvent.status !== 'COMPLETED') throw new StateTransitionError('PAYMENT_NOT_COMPLETED', 'PaymentEvent is not completed');
    if (paymentEvent.amount !== amount) throw new RevenueError('AMOUNT_MISMATCH', 'PaymentEvent amount mismatch');

    return this.prisma.revenueRecord.create({
      data: {
        companyId,
        projectId,
        amount,
        source,
        description,
        status: RevenueStatus.RECEIVED,
        recognizedAt: new Date(),
        paymentEventId
      }
    });
  }
}

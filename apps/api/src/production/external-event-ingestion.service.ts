import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';
import * as crypto from 'crypto';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { SignatureMismatchError } from '../common/errors/error-taxonomy';

export interface ExternalEventPayload {
  provider: string;
  eventType: string;
  payload: any;
  signature: string;
  idempotencyKey?: string;
  correlationId?: string;
  environment?: ExecutionEnvironment;
}

@Injectable()
export class ExternalEventIngestionService {
  private readonly logger = new Logger(ExternalEventIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly structuredLogger: StructuredLoggerService
  ) {
    for (const k of ['WEBHOOK_SECRET_PROD', 'WEBHOOK_SECRET_SIM']) {
      if (!process.env[k]) throw new Error(`${k} is not set; refusing to start without a webhook secret`);
    }
  }

  async ingestEvent(data: ExternalEventPayload, companyId?: string): Promise<any> {
    const { provider, eventType, payload, signature, correlationId, environment = ExecutionEnvironment.SIMULATION } = data;

    const secret = environment === ExecutionEnvironment.PRODUCTION
      ? process.env.WEBHOOK_SECRET_PROD!
      : process.env.WEBHOOK_SECRET_SIM!;

    if (!signature) {
      throw new SignatureMismatchError('Missing webhook signature');
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    
    let signatureValid = false;
    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');
      if (sigBuf.length === expectedBuf.length) {
        signatureValid = crypto.timingSafeEqual(sigBuf, expectedBuf);
      }
    } catch (e) {
      signatureValid = false;
    }

    if (!signatureValid) {
      this.structuredLogger.warn(`Invalid signature for event ${eventType} from ${provider}`, ExternalEventIngestionService.name, { companyId, provider, eventType });
      if (companyId) {
        await this.prisma.externalEventLog.create({
          data: {
            companyId,
            provider,
            eventType,
            payload,
            signatureValid: false,
            status: 'ERROR',
            error: 'WEBHOOK_INVALID: Invalid signature'
          }
        });
      }
      throw new SignatureMismatchError('Invalid webhook signature');
    }

    if (companyId && payload?.companyId && payload.companyId !== companyId) {
      throw new ForbiddenException({ error: 'TENANT_MISMATCH', message: 'Payload companyId does not match webhook endpoint companyId' });
    }

    const providerEventId = payload?.id || payload?.eventId || crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const deterministicIdempotencyKey = `${provider}_${providerEventId}`;

    const existing = await this.prisma.externalEventLog.findUnique({
      where: { idempotencyKey: deterministicIdempotencyKey }
    });

    if (existing) {
      this.structuredLogger.log(`Idempotent webhook ignored: ${deterministicIdempotencyKey}`, ExternalEventIngestionService.name, { companyId, provider, eventType, idempotencyKey: deterministicIdempotencyKey });
      throw new BadRequestException({ error: 'WEBHOOK_DUPLICATE', message: 'Duplicate event' });
    }

    if (provider === 'STRIPE_LIVE' && eventType === 'payment_intent.succeeded' && environment === ExecutionEnvironment.PRODUCTION) {
        if (!payload?.invoiceId || !payload?.amount || !payload?.currency) {
             throw new BadRequestException({ error: 'WEBHOOK_INVALID', message: 'Missing payment details in payload' });
        }

        const pendingPayment = await this.prisma.paymentEvent.findFirst({
            where: {
                invoiceId: payload.invoiceId,
                status: 'PENDING',
                companyId: companyId
            }
        });

        if (!pendingPayment) {
            throw new BadRequestException({ error: 'WEBHOOK_INVALID', message: 'No matching pending payment found' });
        }
        
        if (pendingPayment.amount !== payload.amount) {
            throw new BadRequestException({ error: 'WEBHOOK_INVALID', message: 'Amount mismatch' });
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.paymentEvent.update({
                where: { id: pendingPayment.id },
                data: {
                    status: 'COMPLETED',
                    providerRef: payload.id
                }
            });

            const invoice = await tx.invoice.findUnique({ where: { id: payload.invoiceId } });
            if (invoice) {
                const totalPaid = await tx.paymentEvent.aggregate({
                  where: { invoiceId: invoice.id, status: 'COMPLETED' },
                  _sum: { amount: true }
                });

                const newTotalPaid = totalPaid._sum.amount || 0;
                const newStatus = newTotalPaid >= invoice.total ? 'PAID' : 'PARTIALLY_PAID';

                await tx.invoice.update({
                  where: { id: invoice.id },
                  data: { status: newStatus as any, paidDate: newStatus === 'PAID' ? new Date() : null }
                });
            }
        });
    }

    const eventLog = await this.prisma.externalEventLog.create({
      data: {
        companyId,
        provider,
        eventType,
        payload,
        signatureValid: true,
        idempotencyKey: deterministicIdempotencyKey,
        correlationId,
        status: 'RECEIVED'
      }
    });

    this.structuredLogger.log(`Ingested valid event ${eventType} from ${provider} for company ${companyId || 'UNKNOWN'}`, ExternalEventIngestionService.name, { companyId, provider, eventType, idempotencyKey: deterministicIdempotencyKey });

    return eventLog;
  }
}

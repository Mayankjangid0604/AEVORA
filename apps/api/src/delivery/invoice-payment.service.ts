import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionEnvironment, InvoiceStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from '../invoice/invoice.service';
import { IntegrationService } from '../integration/integration.service';
import { LeadGenService } from '../lead-gen/lead-gen.service';
import { MarketingContentService } from '../marketing-content/marketing-content.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { emailSignature, outreachEnv } from '../sales-outreach/email-outreach.service';
import { quoteLabel } from '../currency/currency.logic';

const DAY = 86_400_000;

export function verifyRazorpaySignature(rawBody: Buffer | string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

@Injectable()
export class InvoiceAndPaymentService {
  private readonly logger = new Logger(InvoiceAndPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
    private readonly integration: IntegrationService,
    private readonly leadGen: LeadGenService,
    private readonly realtime: RealtimeGateway,
    private readonly marketingContent: MarketingContentService,
  ) {}

  /** Client approved the sample: create Client + Invoice, send payment instructions. */
  async approve(companyId: string, projectId: string) {
    const p = await this.prisma.clientProject.findFirst({ where: { id: projectId, companyId }, include: { lead: true } });
    if (!p) throw new NotFoundException('Client project not found');
    if (p.invoiceId) return p; // idempotent
    if (p.status !== 'SAMPLE_SENT') throw new BadRequestException(`Cannot approve a project in ${p.status}`);
    if (!p.quotedAmount) throw new BadRequestException('Project has no quoted amount');
    await this.prisma.clientProject.update({ where: { id: p.id }, data: { status: 'APPROVED' } });

    const clientId =
      p.lead.convertedClientId ??
      (await this.prisma.client.create({
        data: { companyId, name: p.lead.name, organizationName: p.lead.organizationName, description: `From lead ${p.lead.id}` },
      })).id;
    if (!p.lead.convertedClientId) {
      await this.prisma.salesLead.update({ where: { id: p.lead.id }, data: { convertedClientId: clientId } });
    }

    // Production invoices need the approval flow; client-project invoices are tracked as SANDBOX until that is wired.
    const invoice = await this.invoices.createInvoice({
      companyId,
      clientId,
      environment: ExecutionEnvironment.SANDBOX,
      lineItems: [{ description: (p.scope as any)?.title ?? `${p.projectType} project`, quantity: 1, unitPrice: p.quotedAmount }],
    });
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ISSUED, issueDate: new Date(), dueDate: new Date(Date.now() + 7 * DAY) },
    });

    const paymentLinkUrl = await this.createPaymentLink(p.id, invoice.total, p.lead);
    const updated = await this.prisma.clientProject.update({
      where: { id: p.id },
      data: { invoiceId: invoice.id, paymentLinkUrl, status: 'INVOICED', lastReminderAt: new Date() },
    });
    await this.sendPaymentEmail(companyId, updated.id, false);
    return updated;
  }

  private async createPaymentLink(projectId: string, amountPaise: number, lead: { name: string; contactEmail: string | null; contactPhone: string | null }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !secret) {
      this.logger.warn('Razorpay not configured — using bank transfer instructions');
      return null;
    }
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        reference_id: projectId,
        description: `Payment for project ${projectId}`,
        customer: { name: lead.name, email: lead.contactEmail ?? undefined, contact: lead.contactPhone ?? undefined },
        notes: { projectId },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Razorpay ${res.status}: ${await res.text()}`);
    return (await res.json()).short_url as string;
  }

  private async sendPaymentEmail(companyId: string, projectId: string, reminder: boolean) {
    const p = await this.prisma.clientProject.findUniqueOrThrow({ where: { id: projectId }, include: { lead: true } });
    if (!p.lead.contactEmail) return;
    // Invoices and payment links are in INR; clients abroad also see their own currency for reference (item 26).
    const amount = quoteLabel(p);
    const howToPay = p.paymentLinkUrl
      ? `Pay securely here: ${p.paymentLinkUrl}`
      : `Please pay by bank transfer / UPI:\n${process.env.BANK_TRANSFER_INSTRUCTIONS ?? 'Contact us for bank details.'}\nReference: ${p.id}`;
    await this.integration.sendEmail(companyId, outreachEnv(), {
      to: p.lead.contactEmail,
      subject: `${reminder ? 'Reminder: ' : ''}Invoice for ${p.lead.name} — ${amount}`,
      body: `Hello ${p.lead.name} team,\n\nThank you for approving the work. Amount due: ${amount}.\n\n${howToPay}\n\n${emailSignature()}`,
    });
  }

  /** Follow up on unpaid invoices every N days. */
  async check(companyId: string) {
    const days = Number(process.env.PAYMENT_REMINDER_DAYS ?? 3);
    const due = await this.prisma.clientProject.findMany({
      where: { companyId, status: 'INVOICED', lastReminderAt: { lt: new Date(Date.now() - days * DAY) } },
      take: 20,
    });
    for (const p of due) {
      await this.sendPaymentEmail(companyId, p.id, true).catch((e) => this.logger.error(`Reminder ${p.id}: ${e.message}`));
      await this.prisma.clientProject.update({ where: { id: p.id }, data: { lastReminderAt: new Date() } });
    }
    return due.length;
  }

  /**
   * Payment received (Razorpay webhook or Chairman). Single transaction: credit RealMoneyAccount,
   * log RealMoneyTransaction (idempotencyKey), mark invoice + project PAID, record revenue.
   */
  async markPaid(companyId: string, projectId: string, idempotencyKey: string, paymentRef?: string) {
    if (!idempotencyKey) throw new BadRequestException('idempotencyKey is required');
    const p = await this.prisma.clientProject.findFirst({ where: { id: projectId, companyId } });
    if (!p) throw new NotFoundException('Client project not found');
    if (p.status === 'PAID' || p.status === 'CLOSED') return p;
    if (p.status !== 'INVOICED' || !p.invoiceId) throw new BadRequestException(`Cannot mark ${p.status} project paid`);
    const invoice = await this.prisma.invoice.findFirstOrThrow({ where: { id: p.invoiceId, companyId } });

    const result = await this.prisma.$transaction(async (tx) => {
      const current = () => tx.clientProject.findUniqueOrThrow({ where: { id: p.id } });
      if (await tx.realMoneyTransaction.findUnique({ where: { idempotencyKey } })) {
        return { project: await current(), credited: false };
      }
      const claimed = await tx.clientProject.updateMany({
        where: { id: p.id, status: 'INVOICED' },
        data: { status: 'PAID', paidAt: new Date(), paymentRef },
      });
      if (!claimed.count) return { project: await current(), credited: false };

      const account = await tx.realMoneyAccount.upsert({
        where: { companyId },
        create: { companyId, balance: invoice.total },
        update: { balance: { increment: invoice.total } },
      });
      await tx.realMoneyTransaction.create({
        data: {
          accountId: account.id,
          amount: invoice.total,
          description: `Client payment for invoice ${invoice.invoiceNumber}`,
          referenceType: 'CLIENT_PAYMENT',
          referenceId: invoice.id,
          idempotencyKey,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidDate: new Date(), paymentReference: paymentRef },
      });
      await tx.revenueRecord.create({
        data: {
          companyId,
          realMoneyAccountId: account.id,
          amount: invoice.total,
          status: 'RECEIVED',
          source: 'CLIENT_PROJECT',
          description: `ClientProject ${p.id}`,
          receivedAt: new Date(),
          recognizedAt: new Date(),
        },
      });
      await tx.salesLead.update({ where: { id: p.leadId }, data: { status: 'CONVERTED' } });
      return { project: await current(), credited: true };
    });

    if (result.credited) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
      this.realtime.broadcastToUser(company.chairmanId, 'payment.received', { projectId: p.id, amountPaise: invoice.total });
      // Keep the loop going: money in → find the next leads.
      this.leadGen.runForCompany(companyId, 'PAYMENT_RECEIVED').catch((e) => this.logger.warn(`Post-payment lead gen: ${e.message}`));
      // PIXEL drafts an anonymous CLIENT_SUCCESS post (background, never affects the payment).
      const lead = await this.prisma.salesLead.findUnique({ where: { id: p.leadId }, select: { industry: true } });
      this.marketingContent.generateSuccessPost(companyId, p.projectType, lead?.industry ?? null);
    }
    return result.project;
  }

  /**
   * V2 Payment handler for standard Invoice models.
   */
  async markV2InvoicePaid(companyId: string, invoiceId: string, idempotencyKey: string, paymentRef?: string) {
    if (!idempotencyKey) throw new BadRequestException('idempotencyKey is required');
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') return invoice;
    if (invoice.status !== 'ISSUED' && invoice.status !== 'DRAFT') throw new BadRequestException(`Cannot mark ${invoice.status} invoice paid`);

    const result = await this.prisma.$transaction(async (tx) => {
      const current = () => tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      if (await tx.realMoneyTransaction.findUnique({ where: { idempotencyKey } })) {
        return { invoice: await current(), credited: false };
      }

      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id },
        data: { status: 'PAID', paidDate: new Date(), paymentReference: paymentRef },
      });
      if (!claimed.count) return { invoice: await current(), credited: false };

      const account = await tx.realMoneyAccount.upsert({
        where: { companyId },
        create: { companyId, balance: invoice.total },
        update: { balance: { increment: invoice.total } },
      });

      await tx.realMoneyTransaction.create({
        data: {
          accountId: account.id,
          amount: invoice.total,
          description: `Client payment for V2 invoice ${invoice.invoiceNumber}`,
          referenceType: 'CLIENT_PAYMENT',
          referenceId: invoice.id,
          idempotencyKey,
        },
      });

      await tx.revenueRecord.create({
        data: {
          companyId,
          realMoneyAccountId: account.id,
          amount: invoice.total,
          status: 'RECEIVED',
          source: 'CLIENT_PROJECT',
          description: `Invoice ${invoice.id}`,
          receivedAt: new Date(),
          recognizedAt: new Date(),
        },
      });

      if (invoice.projectId) {
        const project = await tx.project.findUnique({ where: { id: invoice.projectId } });
        
        if (project?.status === 'ACCEPTED' && invoice.notes === 'FINAL_PAYMENT') {
          await tx.project.update({
            where: { id: invoice.projectId },
            data: { financialStatus: 'PAID', status: 'COMPLETED' },
          });
          if (project.opportunityId) {
             await tx.opportunity.update({
                where: { id: project.opportunityId },
                data: { status: 'WON' }
             });
          }
        } else {
          await tx.project.update({
            where: { id: invoice.projectId },
            data: { financialStatus: 'PAID' },
          });
        }
      }

      return { invoice: await current(), credited: true };
    });

    if (result.credited && invoice.projectId) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
      this.realtime.broadcastToUser(company.chairmanId, 'payment.received', { projectId: invoice.projectId, amountPaise: invoice.total });
    }
    return result.invoice;
  }

  /** Razorpay `payment_link.paid` webhook. Signature is verified by the controller. */
  async handleRazorpayEvent(event: any) {
    if (event?.event !== 'payment_link.paid') return { ignored: event?.event };
    const link = event.payload?.payment_link?.entity;
    const payment = event.payload?.payment?.entity;
    const referenceId = link?.reference_id;
    if (!referenceId || !payment?.id) throw new BadRequestException('Malformed Razorpay event');
    const p = await this.prisma.clientProject.findUnique({ where: { id: referenceId } });
    if (p) {
      const invoice = p.invoiceId ? await this.prisma.invoice.findUnique({ where: { id: p.invoiceId } }) : null;
      if (!invoice || payment.amount < invoice.total || payment.currency !== 'INR') {
        throw new BadRequestException('Payment does not match invoice');
      }
      return this.markPaid(p.companyId, p.id, `razorpay:${payment.id}`, payment.id);
    }
    
    const v2Invoice = await this.prisma.invoice.findUnique({ where: { id: referenceId } });
    if (v2Invoice) {
      if (payment.amount < v2Invoice.total || payment.currency !== 'INR') {
        throw new BadRequestException('Payment does not match invoice');
      }
      return this.markV2InvoicePaid(v2Invoice.companyId, v2Invoice.id, `razorpay:${payment.id}`, payment.id);
    }

    throw new NotFoundException('Unknown project or invoice reference');
  }
}

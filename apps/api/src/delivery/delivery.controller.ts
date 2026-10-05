import {
  BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, Query, RawBodyRequest, Req, Request, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard, Public } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryAgentWorker } from './delivery-agent.worker';
import { InvoiceAndPaymentService, verifyRazorpaySignature } from './invoice-payment.service';

import { FormalDeliveryService } from './formal-delivery.service';

@Controller('delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: DeliveryAgentWorker,
    private readonly payments: InvoiceAndPaymentService,
    private readonly formalDelivery: FormalDeliveryService,
  ) {}

  @Get('projects')
  projects(@Request() req, @Query('status') status?: string) {
    return this.prisma.clientProject.findMany({
      where: { companyId: req.user.companyId, ...(status ? { status: status as any } : {}) },
      select: {
        id: true, projectType: true, status: true, scope: true, sampleUrl: true, quotedAmount: true, revisionCount: true,
        invoiceId: true, paymentLinkUrl: true, paidAt: true, error: true, createdAt: true, updatedAt: true,
        lead: { select: { id: true, name: true, contactEmail: true, contactPhone: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  @Post('process')
  @Roles('CHAIRMAN')
  process(@Request() req) {
    return this.worker.processQueue(req.user.companyId);
  }

  @Post('projects/:id/revision')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  revision(@Request() req, @Param('id') id: string, @Body() body: { feedback: string }) {
    return this.worker.requestRevision(req.user.companyId, id, body.feedback);
  }

  @Post('projects/:id/approve')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  approve(@Request() req, @Param('id') id: string) {
    return this.payments.approve(req.user.companyId, id);
  }

  @Post('projects/:id/mark-paid')
  @Roles('CHAIRMAN')
  markPaid(@Request() req, @Param('id') id: string, @Body() body: { idempotencyKey: string; paymentRef?: string }) {
    return this.payments.markPaid(req.user.companyId, id, body.idempotencyKey, body.paymentRef);
  }

  // --- Formal Delivery ---

  @Post('formal/:projectId/package')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  packageDelivery(@Request() req, @Param('projectId') projectId: string, @Body() body: { summary: string; deliverables: string }) {
    return this.formalDelivery.packageDelivery(projectId, req.user?.id || 'system', body.summary, body.deliverables);
  }

  @Post('formal/deliveries/:id/accept')
  @Roles('CHAIRMAN', 'MANAGEMENT', 'CLIENT')
  acceptDelivery(@Request() req, @Param('id') id: string) {
    return this.formalDelivery.acceptDelivery(id, req.user.id || req.user.companyId);
  }

  @Post('formal/deliveries/:id/revise')
  @Roles('CHAIRMAN', 'MANAGEMENT', 'CLIENT')
  requestFormalRevision(@Request() req, @Param('id') id: string, @Body() body: { changesRequested: string }) {
    return this.formalDelivery.requestRevision(id, req.user.id || req.user.companyId, body.changesRequested);
  }

  /** Public sample link sent to the client. AI-generated HTML → served with CSP sandbox (no scripts, opaque origin). */
  @Public()
  @Get('samples/:id')
  async sample(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.clientProject.findUnique({ where: { id }, select: { sampleHtml: true } });
    if (!p?.sampleHtml) throw new NotFoundException();
    res
      .set('Content-Security-Policy', "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https:")
      .type('html')
      .send(p.sampleHtml);
  }

  @Public()
  @Post('webhooks/razorpay')
  async razorpay(@Req() req: RawBodyRequest<any>, @Headers('x-razorpay-signature') sig?: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Razorpay webhook not configured');
    if (!req.rawBody || !verifyRazorpaySignature(req.rawBody, sig, secret)) throw new UnauthorizedException('Bad signature');
    return this.payments.handleRazorpayEvent(JSON.parse(req.rawBody.toString('utf8')));
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryController } from './delivery.controller';
import { InvoiceAndPaymentService, verifyRazorpaySignature } from './invoice-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryAgentWorker } from './delivery-agent.worker';
import { FormalDeliveryService } from './formal-delivery.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('DeliveryController & Razorpay Ingress Verification', () => {
  let controller: DeliveryController;
  let mockPayments: Partial<InvoiceAndPaymentService>;

  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const testSecret = 'test_rzp_webhook_secret_key_12345';

  beforeEach(async () => {
    mockPayments = {
      handleRazorpayEvent: jest.fn().mockResolvedValue({ status: 'PROCESSED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryController],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: DeliveryAgentWorker, useValue: {} },
        { provide: InvoiceAndPaymentService, useValue: mockPayments },
        { provide: FormalDeliveryService, useValue: {} },
        { provide: AuthorizationService, useValue: {} },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DeliveryController>(DeliveryController);
  });

  afterAll(() => {
    if (originalSecret !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });

  describe('verifyRazorpaySignature utility', () => {
    it('returns true for genuine HMAC-SHA256 signature', () => {
      const body = JSON.stringify({ event: 'payment_link.paid', amount: 50000 });
      const expectedSig = crypto.createHmac('sha256', testSecret).update(body).digest('hex');

      expect(verifyRazorpaySignature(body, expectedSig, testSecret)).toBe(true);
    });

    it('returns false when signature does not match', () => {
      const body = JSON.stringify({ event: 'payment_link.paid', amount: 50000 });
      const badSig = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');

      expect(verifyRazorpaySignature(body, badSig, testSecret)).toBe(false);
    });

    it('returns false when signature is undefined or empty', () => {
      const body = JSON.stringify({ event: 'payment_link.paid' });
      expect(verifyRazorpaySignature(body, undefined, testSecret)).toBe(false);
      expect(verifyRazorpaySignature(body, '', testSecret)).toBe(false);
    });

    it('returns false when body has been tampered with', () => {
      const body = JSON.stringify({ event: 'payment_link.paid', amount: 50000 });
      const tampered = JSON.stringify({ event: 'payment_link.paid', amount: 10000 });
      const sig = crypto.createHmac('sha256', testSecret).update(body).digest('hex');

      expect(verifyRazorpaySignature(tampered, sig, testSecret)).toBe(false);
    });
  });

  describe('DeliveryController.razorpay webhook handler', () => {
    it('rejects with 400 when RAZORPAY_WEBHOOK_SECRET is not configured', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      const fakeReq: any = { rawBody: Buffer.from('{}') };

      await expect(controller.razorpay(fakeReq, 'any-sig')).rejects.toThrow(
        new BadRequestException('Razorpay webhook not configured'),
      );
    });

    it('rejects with 401 when signature is invalid', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;
      const fakeReq: any = { rawBody: Buffer.from(JSON.stringify({ event: 'test' })) };

      await expect(controller.razorpay(fakeReq, 'invalid-hex-signature')).rejects.toThrow(
        new UnauthorizedException('Bad signature'),
      );
    });

    it('rejects with 400 when rawBody is malformed JSON despite valid signature', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;
      const malformedBody = '{"event": "payment_link.paid", unclosed_json';
      const sig = crypto.createHmac('sha256', testSecret).update(malformedBody).digest('hex');
      const fakeReq: any = { rawBody: Buffer.from(malformedBody) };

      await expect(controller.razorpay(fakeReq, sig)).rejects.toThrow(
        new BadRequestException('Malformed JSON payload'),
      );
    });

    it('successfully processes genuine webhook event with valid signature and JSON', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;
      const validPayload = { event: 'payment_link.paid', id: 'pay_12345' };
      const rawBodyStr = JSON.stringify(validPayload);
      const sig = crypto.createHmac('sha256', testSecret).update(rawBodyStr).digest('hex');
      const fakeReq: any = { rawBody: Buffer.from(rawBodyStr) };

      const result = await controller.razorpay(fakeReq, sig);

      expect(result).toEqual({ status: 'PROCESSED' });
      expect(mockPayments.handleRazorpayEvent).toHaveBeenCalledWith(validPayload);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationService, EmailPayload } from './integration.service';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxEmailProvider } from './providers/sandbox-email.provider';
import { ProductionEmailProvider } from './providers/production-email.provider';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { ExecutionEnvironment } from '@prisma/client';

describe('IntegrationService — V13.5 Email Safety & Recipient Parity', () => {
  let service: IntegrationService;
  let prisma: any;
  let productionEmail: any;
  let sandboxEmail: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };

    prisma = {
      integrationAuditLog: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'audit-log-1',
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'audit-log-1',
          ...data,
        })),
      },
      providerIntegration: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Outbound gate dependencies: no kill switch, nothing suppressed, and an approved draft for whatever is sent.
      killSwitchConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      outreachResponse: { findFirst: jest.fn().mockResolvedValue(null) },
      salesLead: { findFirst: jest.fn().mockResolvedValue(null) },
      outreachDraft: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      emailSuppression: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    // Production mode is a server setting (OUTREACH_ENVIRONMENT); providers are mocks, so nothing leaves the process.
    process.env.OUTREACH_ENVIRONMENT = 'PRODUCTION';

    productionEmail = {
      send: jest.fn().mockResolvedValue({
        success: true,
        message: 'Email delivered via SMTP',
        referenceId: '<test-msg-123@smtp.mail>',
      }),
    };

    sandboxEmail = {
      send: jest.fn().mockResolvedValue({
        success: true,
        message: 'Sandbox email simulated',
        referenceId: '<sandbox-msg-456>',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductionEmailProvider, useValue: productionEmail },
        { provide: SandboxEmailProvider, useValue: sandboxEmail },
        {
          provide: StructuredLoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<IntegrationService>(IntegrationService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /** Makes the mocked DB hold an approved, SENDING draft for exactly this payload. */
  const approve = (payload: EmailPayload) => {
    prisma.outreachDraft.findFirst.mockResolvedValue({
      id: 'draft-1', companyId: 'company-1', status: 'SENDING', approvedBy: 'chairman-1', approvedAt: new Date(),
      recipientEmail: payload.to, subject: payload.subject, messageBody: payload.body,
    });
    return payload;
  };

  const samplePayload: EmailPayload = {
    to: 'real-business-owner@client-domain.com',
    subject: 'Proposal for Business',
    body: 'Hello from Aevora',
    senderName: 'Team Aevora',
    businessName: 'Delhi Bistro',
    leadId: 'lead-123',
    source: 'google',
  };

  it('6. Test mode redirects intended business recipient to mayankjangid598@gmail.com', async () => {
    process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
    process.env.TEST_EMAIL_RECIPIENT = 'mayankjangid598@gmail.com';
    process.env.SMTP_HOST = 'smtp.gmail.com';

    const res = await service.sendEmail(
      'company-1',
      ExecutionEnvironment.PRODUCTION,
      approve({ ...samplePayload }),
      undefined,
      { draftId: 'draft-1' },
    );

    expect(res.success).toBe(true);
    expect(res.redirected).toBe(true);
    expect(res.originalRecipient).toBe('real-business-owner@client-domain.com');
    expect(res.actualRecipient).toBe('mayankjangid598@gmail.com');

    // Verify production email provider was called with redirected recipient ONLY
    expect(productionEmail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'mayankjangid598@gmail.com',
      }),
    );
  });

  it('7. Direct attempts to specify another recipient cannot bypass test-mode protection', async () => {
    process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
    process.env.TEST_EMAIL_RECIPIENT = 'mayankjangid598@gmail.com';
    process.env.SMTP_HOST = 'smtp.gmail.com';

    // Attacker or rogue service passes another recipient
    const bypassAttempt: EmailPayload = {
      to: 'unauthorized-external-victim@company.com',
      subject: 'Phishing test',
      body: 'Content',
    };

    const res = await service.sendEmail(
      'company-1',
      ExecutionEnvironment.PRODUCTION,
      approve(bypassAttempt),
      undefined,
      { draftId: 'draft-1' },
    );

    expect(res.actualRecipient).toBe('mayankjangid598@gmail.com');
    expect(productionEmail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'mayankjangid598@gmail.com',
      }),
    );
    expect(productionEmail.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'unauthorized-external-victim@company.com',
      }),
    );
  });

  it('8. Actual recipient is recorded in the audit record', async () => {
    process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
    process.env.TEST_EMAIL_RECIPIENT = 'mayankjangid598@gmail.com';
    process.env.SMTP_HOST = 'smtp.gmail.com';

    await service.sendEmail(
      'company-1',
      ExecutionEnvironment.PRODUCTION,
      approve({ ...samplePayload }),
      undefined,
      { draftId: 'draft-1' },
    );

    // Verify requestPayload audit
    expect(prisma.integrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestPayload: expect.objectContaining({
          originalIntendedRecipient: 'real-business-owner@client-domain.com',
          actualDeliveredRecipient: 'mayankjangid598@gmail.com',
          redirected: true,
          selectedBusiness: 'Delhi Bistro',
        }),
      }),
    });

    // Verify responsePayload audit
    expect(prisma.integrationAuditLog.update).toHaveBeenCalledWith({
      where: { id: 'audit-log-1' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        responsePayload: expect.objectContaining({
          originalIntendedRecipient: 'real-business-owner@client-domain.com',
          actualDeliveredRecipient: 'mayankjangid598@gmail.com',
          redirected: true,
          deliveryStatus: 'SUCCESS',
        }),
      }),
    });
  });

  it('9. Email credentials are never stored in the audit record', async () => {
    process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
    process.env.TEST_EMAIL_RECIPIENT = 'mayankjangid598@gmail.com';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PASS = 'super-secret-password-xyz';
    process.env.SMTP_USER = 'sender@aevora.com';

    await service.sendEmail(
      'company-1',
      ExecutionEnvironment.PRODUCTION,
      approve({ ...samplePayload }),
      undefined,
      { draftId: 'draft-1' },
    );

    const createCall = prisma.integrationAuditLog.create.mock.calls[0][0];
    const updateCall = prisma.integrationAuditLog.update.mock.calls[0][0];

    const createJson = JSON.stringify(createCall);
    const updateJson = JSON.stringify(updateCall);

    expect(createJson).not.toContain('super-secret-password-xyz');
    expect(updateJson).not.toContain('super-secret-password-xyz');
    expect(createJson).not.toContain('password');
    expect(updateJson).not.toContain('password');
  });
});

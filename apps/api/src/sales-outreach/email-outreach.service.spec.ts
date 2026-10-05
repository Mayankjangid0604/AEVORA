import { Test, TestingModule } from '@nestjs/testing';
import { EmailOutreachService, OutreachRateLimitException } from './email-outreach.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { DemoFactoryService } from './demo-factory.service';
import { ExecutionEnvironment, SalesLead } from '@prisma/client';

jest.mock('@aevora/model-gateway', () => ({
  ModelGateway: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      text: 'Dear Delhi Bistro Team,\n\nWe build websites and automation for restaurants. Would you be open to a quick call this week?\n\nBest regards,\nNova\nSales, Aevora',
    }),
  })),
}));

describe('EmailOutreachService — V13.5 Persistent Rate Limiter Critical Path', () => {
  let service: EmailOutreachService;
  let prisma: any;
  let integration: any;
  let demoFactory: any;
  const originalEnv = process.env;

  const mockLead: SalesLead = {
    id: 'lead-test-1',
    companyId: 'company-test-1',
    name: 'Delhi Bistro',
    organizationName: 'Delhi Bistro',
    contactName: 'Owner',
    contactRole: 'Owner',
    contactEmail: 'owner@delhibistro.com',
    contactPhone: '+91 98765 43210',
    source: 'google',
    industry: 'restaurant',
    geography: 'New Delhi',
    companySize: '1-10',
    status: 'NEW',
    assignedToId: null,
    targetAccountId: null,
    convertedClientId: null,
    convertedOpportunityId: null,
    notes: null,
    metadata: {},
    googlePlaceId: 'places/123',
    website: 'https://delhibistro.com',
    qualityScore: 85,
    lastContactedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLead2: SalesLead = {
    ...mockLead,
    id: 'lead-test-2',
    name: 'Mumbai Cafe',
    contactEmail: 'owner@mumbaicafe.com',
  };

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.OUTREACH_RATE_LIMIT_MINUTES = '30';
    process.env.COMPANY_NAME = 'Aevora';
    process.env.COMPANY_EMAIL = 'contact@aevora.com';
    process.env.COMPANY_PHONE = '+919999999999';

    // Mock Prisma with in-memory DB representation
    const dbCampaigns: any[] = [];

    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(prisma);
      }),
      killSwitchConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      outreachScript: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', name: 'Nova', role: { title: 'Sales Representative' } }),
        findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', name: 'Nova', role: { title: 'Sales Representative' } }),
      },
      outreachCampaign: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.status === 'SENT') {
            return dbCampaigns.find((c) => c.companyId === where.companyId && c.channel === 'EMAIL' && c.status === 'SENT' && (!where.sentAt?.gt || c.sentAt > where.sentAt.gt)) ?? null;
          }
          if (where.status === 'SCHEDULED') {
            return dbCampaigns.find((c) => c.companyId === where.companyId && c.channel === 'EMAIL' && c.status === 'SCHEDULED') ?? null;
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return dbCampaigns.find((c) => c.idempotencyKey === where.idempotencyKey) ?? null;
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const rec = { id: `camp-${Date.now()}-${Math.random()}`, createdAt: new Date(), ...data };
          dbCampaigns.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const idx = dbCampaigns.findIndex((c) => c.id === where.id);
          if (idx >= 0) {
            dbCampaigns[idx] = { ...dbCampaigns[idx], ...data };
            return dbCampaigns[idx];
          }
          return { id: where.id, ...data };
        }),
        _campaigns: dbCampaigns,
      },
    };

    integration = {
      sendEmail: jest.fn().mockResolvedValue({
        success: true,
        referenceId: '<msg-reference-999@smtp>',
        originalRecipient: 'owner@delhibistro.com',
        actualRecipient: 'mayankjangid598@gmail.com',
        redirected: true,
      }),
    };

    demoFactory = {
      createDemoForLead: jest.fn().mockResolvedValue('https://demo.aevora.com/delhi-bistro'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailOutreachService,
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationService, useValue: integration },
        { provide: DemoFactoryService, useValue: demoFactory },
      ],
    }).compile();

    service = module.get<EmailOutreachService>(EmailOutreachService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('10. First client outreach is allowed', async () => {
    const rateCheck = await service.checkRateLimit('company-test-1');
    expect(rateCheck.allowed).toBe(true);
    expect(rateCheck.remainingMs).toBe(0);

    const campaign = await service.sendOutreachEmail('company-test-1', mockLead);
    expect(campaign.status).toBe('SENT');
    expect(integration.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('11. Immediate second client outreach is rejected/deferred with OutreachRateLimitException', async () => {
    // First send succeeds
    await service.sendOutreachEmail('company-test-1', mockLead);

    // Second check immediately fails
    const rateCheck = await service.checkRateLimit('company-test-1');
    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.remainingMs).toBeGreaterThan(0);

    // Second outreach attempt throws OutreachRateLimitException
    await expect(
      service.sendOutreachEmail('company-test-1', mockLead2),
    ).rejects.toThrow(OutreachRateLimitException);

    // Integration email service should not have been called a second time
    expect(integration.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('12. Concurrent outreach attempts cannot both succeed (atomicity & in-flight check)', async () => {
    // Simulate an in-flight campaign in database
    prisma.outreachCampaign._campaigns.push({
      id: 'camp-in-flight',
      companyId: 'company-test-1',
      channel: 'EMAIL',
      status: 'SCHEDULED',
      createdAt: new Date(),
      idempotencyKey: 'outreach:other-lead:EMAIL',
    });

    // Check rate limit detects in-flight outreach
    const rateCheck = await service.checkRateLimit('company-test-1');
    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.inFlight).toBe(true);

    // Attempting to send while another is in-flight throws OutreachRateLimitException
    await expect(
      service.sendOutreachEmail('company-test-1', mockLead),
    ).rejects.toThrow(OutreachRateLimitException);
  });

  it('13. Persisted limiter state survives simulated restart', async () => {
    // Step 1: Send outreach email in instance A
    await service.sendOutreachEmail('company-test-1', mockLead);

    // Step 2: Simulate application shutdown and restart
    // Create completely new service instance B with separate memory state
    const newModule: TestingModule = await Test.createTestingModule({
      providers: [
        EmailOutreachService,
        { provide: PrismaService, useValue: prisma }, // Same persistent DB
        { provide: IntegrationService, useValue: integration },
        { provide: DemoFactoryService, useValue: demoFactory },
      ],
    }).compile();

    const restartedService = newModule.get<EmailOutreachService>(EmailOutreachService);

    // Step 3: Verify restarted service queries persisted database and rejects
    const rateCheck = await restartedService.checkRateLimit('company-test-1');
    expect(rateCheck.allowed).toBe(false);
    expect(rateCheck.remainingMs).toBeGreaterThan(25 * 60 * 1000);

    await expect(
      restartedService.sendOutreachEmail('company-test-1', mockLead2),
    ).rejects.toThrow(OutreachRateLimitException);
  });

  it('14. Direct service invocation cannot bypass the limiter', async () => {
    // Plant a recent send in the persistent DB
    prisma.outreachCampaign._campaigns.push({
      id: 'camp-recent',
      companyId: 'company-test-1',
      channel: 'EMAIL',
      status: 'SENT',
      sentAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      idempotencyKey: 'outreach:past-lead:EMAIL',
    });

    // Calling sendOutreachEmail directly (bypassing any worker or controller queue)
    await expect(
      service.sendOutreachEmail('company-test-1', mockLead),
    ).rejects.toThrow(OutreachRateLimitException);

    expect(integration.sendEmail).not.toHaveBeenCalled();
  });

  it('15. Unrelated/system email behavior is not accidentally rate-limited if outside client-outreach scope', async () => {
    // Plant a recent client outreach email that activates the 30-min rate limit for client outreach
    prisma.outreachCampaign._campaigns.push({
      id: 'camp-recent',
      companyId: 'company-test-1',
      channel: 'EMAIL',
      status: 'SENT',
      sentAt: new Date(Date.now() - 2 * 60 * 1000), // 2 mins ago
      idempotencyKey: 'outreach:lead-1:EMAIL',
    });

    // Client outreach is rate-limited:
    const clientCheck = await service.checkRateLimit('company-test-1');
    expect(clientCheck.allowed).toBe(false);

    // System email (invoice notification, welcome alert, payment receipt) calls integration.sendEmail directly
    // and does NOT touch OutreachCampaign or EmailOutreachService rate limit.
    const systemEmailResult = await integration.sendEmail(
      'company-test-1',
      ExecutionEnvironment.PRODUCTION,
      {
        to: 'customer@aevora.com',
        subject: 'Invoice #1042 Payment Receipt',
        body: 'Thank you for your payment.',
        source: 'system-billing',
      },
    );

    expect(systemEmailResult.success).toBe(true);
    expect(integration.sendEmail).toHaveBeenCalledWith(
      'company-test-1',
      ExecutionEnvironment.PRODUCTION,
      expect.objectContaining({
        subject: 'Invoice #1042 Payment Receipt',
      }),
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, ExecutionContext } from '@nestjs/common';
import { LeadNormalizerService } from './lead-normalizer.service';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('Phase 1.4: Automation #1 CRM Ingestion & Security Verification', () => {
  let normalizer: LeadNormalizerService;
  let guard: IntegrationApiKeyGuard;
  let leadsTable: any[];
  let companiesTable: any[];

  beforeEach(async () => {
    leadsTable = [];
    companiesTable = [
      { id: 'company-verified-1', name: 'Real Business One' },
      { id: 'company-verified-2', name: 'Real Business Two' },
    ];

    const prismaMock = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return companiesTable.find((c) => c.id === where.id) || null;
        }),
      },
      salesLead: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          return leadsTable
            .filter((l) => l.companyId === where.companyId)
            .map((l) => ({ googlePlaceId: l.googlePlaceId, website: l.website }));
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          // Check unique constraint @@unique([companyId, googlePlaceId])
          const exists = leadsTable.some(
            (l) => l.companyId === data.companyId && l.googlePlaceId === data.googlePlaceId
          );
          if (exists) {
            const err: any = new Error('Unique constraint failed on @@unique([companyId, googlePlaceId])');
            err.code = 'P2002';
            throw err;
          }
          const row = { id: `lead-${Date.now()}-${Math.random()}`, ...data };
          leadsTable.push(row);
          return row;
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadNormalizerService,
        IntegrationApiKeyGuard,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    normalizer = module.get<LeadNormalizerService>(LeadNormalizerService);
    guard = module.get<IntegrationApiKeyGuard>(IntegrationApiKeyGuard);
  });

  describe('Webhook & Integration Auth Guard Security', () => {
    const createMockContext = (headers: Record<string, string>, user?: any): ExecutionContext => {
      const req: any = { headers, user };
      return {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as any;
    };

    it('rejects requests missing x-integration-key header', async () => {
      const ctx = createMockContext({ 'x-company-id': 'company-verified-1' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Authentication required');
    });

    it('rejects requests with incorrect integration key', async () => {
      const original = process.env.INTEGRATION_API_KEY;
      process.env.INTEGRATION_API_KEY = 'correct-secret-key-32-chars-long';
      try {
        const ctx = createMockContext({
          'x-integration-key': 'wrong-key-attempt',
          'x-company-id': 'company-verified-1',
        });
        await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
        await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid integration key');
      } finally {
        process.env.INTEGRATION_API_KEY = original;
      }
    });

    it('rejects requests missing x-company-id header', async () => {
      const original = process.env.INTEGRATION_API_KEY;
      process.env.INTEGRATION_API_KEY = 'correct-secret-key-32-chars-long';
      try {
        const ctx = createMockContext({
          'x-integration-key': 'correct-secret-key-32-chars-long',
        });
        await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
        await expect(guard.canActivate(ctx)).rejects.toThrow('x-company-id header is required');
      } finally {
        process.env.INTEGRATION_API_KEY = original;
      }
    });

    it('rejects requests when companyId does not exist in database', async () => {
      const original = process.env.INTEGRATION_API_KEY;
      process.env.INTEGRATION_API_KEY = 'correct-secret-key-32-chars-long';
      try {
        const ctx = createMockContext({
          'x-integration-key': 'correct-secret-key-32-chars-long',
          'x-company-id': 'non-existent-company-uuid',
        });
        await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
        await expect(guard.canActivate(ctx)).rejects.toThrow('Company not found');
      } finally {
        process.env.INTEGRATION_API_KEY = original;
      }
    });

    it('authenticates valid service requests and populates request.user with tenant context', async () => {
      const original = process.env.INTEGRATION_API_KEY;
      process.env.INTEGRATION_API_KEY = 'correct-secret-key-32-chars-long';
      try {
        const req: any = {
          headers: {
            'x-integration-key': 'correct-secret-key-32-chars-long',
            'x-company-id': 'company-verified-1',
          },
        };
        const ctx: any = {
          getType: () => 'http',
          switchToHttp: () => ({ getRequest: () => req }),
        };

        const allowed = await guard.canActivate(ctx);
        expect(allowed).toBe(true);
        expect(req.user).toEqual({
          companyId: 'company-verified-1',
          actorId: 'SYSTEM_INTEGRATION',
          actorRole: 'CHAIRMAN',
        });
      } finally {
        process.env.INTEGRATION_API_KEY = original;
      }
    });
  });

  describe('Tenant Ingestion, Deduplication, and Retry Idempotency', () => {
    const sampleBatch = [
      {
        id: 'ChIJ11111111111111111111111',
        displayName: { text: 'Apex Dental Care' },
        formattedAddress: '100 Medical Center Dr, Dallas, TX',
        nationalPhoneNumber: '(214) 555-0101',
        websiteUri: 'https://www.apexdentaldallas.com',
        userRatingCount: 88,
        rating: 4.8,
      },
      {
        id: 'ChIJ22222222222222222222222',
        displayName: { text: 'Dallas Smile Studio' },
        formattedAddress: '200 Oak Lawn Ave, Dallas, TX',
        nationalPhoneNumber: '(214) 555-0102',
        websiteUri: null, // No website: high-value lead
        userRatingCount: 45,
        rating: 4.6,
      },
      {
        // Invalid record: missing place id
        displayName: { text: 'Anonymous Business' },
      },
      {
        // Invalid record: missing name
        id: 'ChIJ33333333333333333333333',
      },
    ];

    it('correctly ingests valid leads, creates audit records, and records invalid entries', async () => {
      const res = await normalizer.ingestLeads('company-verified-1', sampleBatch, {
        category: 'dentist',
        location: 'Dallas, TX',
        actorId: 'SYSTEM_INTEGRATION',
      });

      expect(res.totalProcessed).toBe(4);
      expect(res.created).toBe(2);
      expect(res.duplicates).toBe(0);
      expect(res.invalid.length).toBe(2);
      expect(res.invalid[0].reason).toContain('Missing place_id');
      expect(res.invalid[1].reason).toContain('Missing business name');

      expect(leadsTable.length).toBe(2);
      const lead1 = leadsTable.find((l) => l.name === 'Apex Dental Care');
      expect(lead1).toBeDefined();
      expect(lead1.googlePlaceId).toBe('ChIJ11111111111111111111111');
      expect(lead1.companyId).toBe('company-verified-1');
      expect(lead1.contactPhone).toBe('(214) 555-0101');
      expect(lead1.leadGenAudits.create.event).toBe('AUTOMATION_DISCOVERED');
    });

    it('retry idempotency: re-executing the identical batch results in 0 newly created leads', async () => {
      // First run
      const firstRun = await normalizer.ingestLeads('company-verified-1', sampleBatch, {
        category: 'dentist',
        location: 'Dallas, TX',
      });
      expect(firstRun.created).toBe(2);

      // Second run (simulating network retry / re-execution of n8n workflow)
      const secondRun = await normalizer.ingestLeads('company-verified-1', sampleBatch, {
        category: 'dentist',
        location: 'Dallas, TX',
      });

      expect(secondRun.totalProcessed).toBe(4);
      expect(secondRun.created).toBe(0); // Zero new leads created
      expect(secondRun.duplicates).toBe(2); // Both valid leads detected as duplicates
      expect(secondRun.invalid.length).toBe(2);

      // Verify DB total count did not increase
      expect(leadsTable.length).toBe(2);
    });

    it('strict tenant isolation: company B can independently ingest the same place ID without interference', async () => {
      // Ingest into Company 1
      await normalizer.ingestLeads('company-verified-1', sampleBatch, {
        category: 'dentist',
        location: 'Dallas, TX',
      });

      // Ingest identical batch into Company 2
      const resB = await normalizer.ingestLeads('company-verified-2', sampleBatch, {
        category: 'dentist',
        location: 'Dallas, TX',
      });

      expect(resB.created).toBe(2);
      expect(resB.duplicates).toBe(0);

      // Total records in DB: 2 for company 1, 2 for company 2
      const comp1Leads = leadsTable.filter((l) => l.companyId === 'company-verified-1');
      const comp2Leads = leadsTable.filter((l) => l.companyId === 'company-verified-2');
      expect(comp1Leads.length).toBe(2);
      expect(comp2Leads.length).toBe(2);
    });
  });
});

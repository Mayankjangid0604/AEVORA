import { Test, TestingModule } from '@nestjs/testing';
import { LeadNormalizerService } from './lead-normalizer.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LeadNormalizerService — Business Lead Normalization & Ingestion', () => {
  let service: LeadNormalizerService;
  let mockDb: any[];

  beforeEach(async () => {
    mockDb = [];

    const prismaMock = {
      salesLead: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          return mockDb
            .filter((l) => l.companyId === where.companyId)
            .map((l) => ({ googlePlaceId: l.googlePlaceId, website: l.website }));
        }),
        create: jest.fn().mockImplementation(async ({ data }) => {
          // Check unique constraint @@unique([companyId, googlePlaceId])
          const exists = mockDb.some(
            (l) => l.companyId === data.companyId && l.googlePlaceId === data.googlePlaceId
          );
          if (exists) {
            const err: any = new Error('Unique constraint failed on @@unique([companyId, googlePlaceId])');
            err.code = 'P2002';
            throw err;
          }
          const row = { id: `lead-${Date.now()}-${Math.random()}`, ...data };
          mockDb.push(row);
          return row;
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadNormalizerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<LeadNormalizerService>(LeadNormalizerService);
  });

  describe('URL and Domain Normalization', () => {
    it('extracts root domain correctly from various URL formats', () => {
      expect(service.extractDomain('https://www.example.com/about')).toBe('example.com');
      expect(service.extractDomain('http://sub.domain.co.uk/page?x=1')).toBe('sub.domain.co.uk');
      expect(service.extractDomain('mybusiness.in/')).toBe('mybusiness.in');
      expect(service.extractDomain(null)).toBeNull();
      expect(service.extractDomain('')).toBeNull();
      expect(service.extractDomain('not a valid url ://')).toBeNull();
    });

    it('normalizes web URLs with https:// protocol and rejects dangerous schemes', () => {
      expect(service.normalizeUrl('example.com')).toBe('https://example.com/');
      expect(service.normalizeUrl('https://example.com/store')).toBe('https://example.com/store');
      expect(service.normalizeUrl('javascript:alert(1)')).toBeNull();
      expect(service.normalizeUrl('file:///etc/passwd')).toBeNull();
      expect(service.normalizeUrl('data:text/html,test')).toBeNull();
    });
  });

  describe('Record Normalization', () => {
    it('normalizes Google Places API v1 structured record', () => {
      const raw = {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: 'Blue Harbor Seafood' },
        formattedAddress: '42 Marine Dr, Sydney NSW 2000, Australia',
        nationalPhoneNumber: '(02) 9876 5432',
        websiteUri: 'https://blueharbor.com.au',
        rating: 4.6,
        userRatingCount: 142,
        primaryTypeDisplayName: { text: 'Seafood Restaurant' },
        editorialSummary: { text: 'Fresh coastal dining with harbor views.' },
        location: { latitude: -33.8688, longitude: 151.2093 },
      };

      const { lead, error } = service.normalizeRecord(raw, 'restaurant', 'Sydney, Australia');
      expect(error).toBeUndefined();
      expect(lead).toBeDefined();
      expect(lead?.googlePlaceId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(lead?.businessName).toBe('Blue Harbor Seafood');
      expect(lead?.industry).toBe('Seafood Restaurant');
      expect(lead?.geography).toBe('42 Marine Dr, Sydney NSW 2000, Australia');
      expect(lead?.contactPhone).toBe('(02) 9876 5432');
      expect(lead?.website).toBe('https://blueharbor.com.au/');
      expect(lead?.rating).toBe(4.6);
      expect(lead?.reviewCount).toBe(142);
      expect(lead?.source).toBe('AUTOMATION_1_GOOGLE_MAPS');
      expect(lead?.notes).toBe('Fresh coastal dining with harbor views.');
      expect(lead?.metadata.lat).toBe(-33.8688);
      expect(lead?.metadata.lng).toBe(151.2093);
      expect(lead?.qualityScore).toBeGreaterThan(0);
    });

    it('normalizes flattened n8n / scraper record', () => {
      const raw = {
        place_id: 'ChIJrTLr-GyuEmsRBfy61i59si0',
        business_name: 'Metro Fitness Gym',
        address: '100 Main St, Jaipur, Rajasthan',
        phone: '+91 141 2345678',
        website: 'metrofitness.in',
        reviews: '55',
        rating: '4.2',
        type: 'Gym / Fitness Center',
      };

      const { lead, error } = service.normalizeRecord(raw, 'gym', 'Jaipur, India');
      expect(error).toBeUndefined();
      expect(lead).toBeDefined();
      expect(lead?.googlePlaceId).toBe('ChIJrTLr-GyuEmsRBfy61i59si0');
      expect(lead?.businessName).toBe('Metro Fitness Gym');
      expect(lead?.industry).toBe('Gym / Fitness Center');
      expect(lead?.contactPhone).toBe('+91 141 2345678');
      expect(lead?.website).toBe('https://metrofitness.in/');
      expect(lead?.reviewCount).toBe(55);
    });

    it('rejects records missing place_id or business name', () => {
      const missingId = { name: 'Acme Store' };
      const missingName = { id: 'place-123' };

      expect(service.normalizeRecord(missingId, 'retail', 'London').error).toContain('Missing place_id');
      expect(service.normalizeRecord(missingName, 'retail', 'London').error).toContain('Missing business name');
    });

    it('awards high quality score to businesses with phone but no website (high value digital lead)', () => {
      const noWebsiteLead = {
        id: 'place-no-web',
        displayName: 'Local Pottery Studio',
        nationalPhoneNumber: '555-0199',
        userRatingCount: 85,
      };

      const { lead } = service.normalizeRecord(noWebsiteLead, 'craft', 'Portland, USA');
      expect(lead?.website).toBeNull();
      // Scoring formula: hasPhone (+25) + noWebsite (+30) + reviews (+8) = 63
      expect(lead?.qualityScore).toBeGreaterThanOrEqual(55);
      expect(lead?.metadata.scoreFactors?.noWebsite).toBe(30);
    });
  });

  describe('Tenant Ingestion & Deduplication', () => {
    it('ingests valid leads and deduplicates repeated place IDs within company', async () => {
      const records = [
        {
          id: 'place-001',
          name: 'First Cafe',
          phone: '111-222',
          website: 'firstcafe.com',
        },
        {
          id: 'place-002',
          name: 'Second Cafe',
          phone: '333-444',
          website: 'secondcafe.com',
        },
        {
          id: 'place-001', // Exact duplicate in batch
          name: 'First Cafe Duplicate',
          phone: '111-222',
        },
      ];

      const res = await service.ingestLeads('company-A', records, { category: 'cafe', location: 'Austin' });

      expect(res.totalProcessed).toBe(3);
      expect(res.created).toBe(2);
      expect(res.duplicates).toBe(1);
      expect(res.leadIds.length).toBe(2);

      // Verify records in mock db
      expect(mockDb.length).toBe(2);
      expect(mockDb[0].name).toBe('First Cafe');
      expect(mockDb[0].companyId).toBe('company-A');
      expect(mockDb[1].name).toBe('Second Cafe');
    });

    it('deduplicates based on website domain within company', async () => {
      const initial = [
        {
          id: 'place-alpha',
          name: 'Apex Dental Clinic',
          website: 'https://apexdental.com/branch1',
        },
      ];
      await service.ingestLeads('company-A', initial);

      const secondRun = [
        {
          id: 'place-beta', // Different place id, same domain
          name: 'Apex Dental Branch 2',
          website: 'https://www.apexdental.com/branch2',
        },
      ];

      const res = await service.ingestLeads('company-A', secondRun);
      expect(res.created).toBe(0);
      expect(res.duplicates).toBe(1);
    });

    it('enforces tenant isolation: different companies can ingest the same place ID independently', async () => {
      const lead = [
        {
          id: 'place-shared',
          name: 'Shared National Chain',
          website: 'https://nationalchain.com',
        },
      ];

      const resA = await service.ingestLeads('company-A', lead);
      const resB = await service.ingestLeads('company-B', lead);

      expect(resA.created).toBe(1);
      expect(resB.created).toBe(1);

      // Both tenants have their own isolated record
      const forA = mockDb.filter((l) => l.companyId === 'company-A');
      const forB = mockDb.filter((l) => l.companyId === 'company-B');
      expect(forA.length).toBe(1);
      expect(forB.length).toBe(1);
    });

    it('records audit event with automation identifier upon ingestion', async () => {
      const record = [{ id: 'place-audit', name: 'Audited Business' }];
      await service.ingestLeads('company-A', record, {
        actorId: 'chair-1',
        automationId: 'automation-1-google-lead-finding',
      });

      expect(mockDb[0].leadGenAudits.create.event).toBe('AUTOMATION_DISCOVERED');
      expect(mockDb[0].leadGenAudits.create.detail.automationId).toBe('automation-1-google-lead-finding');
    });

    it('strictly caps newly created leads when limit option is provided', async () => {
      const records = [
        { id: 'place-1', name: 'Business 1' },
        { id: 'place-2', name: 'Business 2' },
        { id: 'place-3', name: 'Business 3' },
        { id: 'place-4', name: 'Business 4' },
        { id: 'place-5', name: 'Business 5' },
      ];

      const res = await service.ingestLeads('company-A', records, { limit: 3 });
      expect(res.created).toBe(3);
      expect(res.leadIds.length).toBe(3);
      expect(mockDb.length).toBe(3);
    });

    it('persists pilotId in metadata and leadGenAudit when provided', async () => {
      const records = [{ id: 'place-pilot', name: 'Pilot Business' }];
      const res = await service.ingestLeads('company-A', records, {
        pilotId: 'pro1-pilot-run-1',
      });

      expect(res.created).toBe(1);
      expect(mockDb[0].metadata.pilotId).toBe('pro1-pilot-run-1');
      expect(mockDb[0].leadGenAudits.create.detail.pilotId).toBe('pro1-pilot-run-1');
    });
  });
});

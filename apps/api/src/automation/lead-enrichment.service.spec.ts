import { Test, TestingModule } from '@nestjs/testing';
import { LeadEnrichmentService } from './lead-enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteExtractorService } from './website-extractor.service';
import { EmailVerifierService } from './email-verifier.service';
import { OllamaClientService } from './ollama-client.service';
import { NotFoundException } from '@nestjs/common';
import { SalesLeadStatus } from '@prisma/client';

describe('LeadEnrichmentService', () => {
  let service: LeadEnrichmentService;
  let mockPrisma: any;
  let mockWebsiteExtractor: any;
  let mockEmailVerifier: any;
  let mockOllamaClient: any;

  const sampleLead = {
    id: 'lead-123',
    companyId: 'company-abc',
    name: 'Dallas Cosmetic Dental',
    website: 'https://dallascosmeticdental.com/',
    contactPhone: '(214) 915-2086',
    contactEmail: null,
    qualityScore: 40,
    status: SalesLeadStatus.NEW,
    metadata: {},
  };

  beforeEach(async () => {
    mockPrisma = {
      salesLead: {
        findFirst: jest.fn().mockResolvedValue({ ...sampleLead }),
        findMany: jest.fn().mockResolvedValue([{ ...sampleLead }]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...sampleLead, ...args.data })),
      },
    };

    mockWebsiteExtractor = {
      crawlWebsite: jest.fn().mockResolvedValue({
        reachable: true,
        statusCode: 200,
        responseTimeMs: 350,
        finalUrl: 'https://dallascosmeticdental.com/',
        pagesCrawled: 2,
        aggregatedText: 'Dallas Cosmetic Dental provides porcelain veneers and dental implants.',
        emailsFound: ['info@dallascosmeticdental.com'],
        phonesFound: ['(214) 915-2086'],
        socialLinks: { facebook: 'https://facebook.com/dallascosmeticdental' },
      }),
    };

    mockEmailVerifier = {
      verifyEmail: jest.fn().mockResolvedValue({
        email: 'info@dallascosmeticdental.com',
        status: 'VALID_SYNTAX_MX',
        syntaxValid: true,
        domain: 'dallascosmeticdental.com',
        mxFound: true,
        mxRecords: ['mx.google.com'],
        verificationMethod: 'DNS_MX',
        isDeliverableInbox: false,
        notes: 'Domain MX verified via DNS',
        verifiedAt: new Date().toISOString(),
      }),
    };

    mockOllamaClient = {
      extractBusinessFacts: jest.fn().mockResolvedValue({
        facts: {
          businessDescription: 'High-end cosmetic dentistry clinic in Dallas specializing in veneers.',
          services: ['Porcelain Veneers', 'Dental Implants', 'Teeth Whitening'],
          contactEmails: ['info@dallascosmeticdental.com'],
          contactPhones: ['(214) 915-2086'],
          socialLinks: { facebook: 'https://facebook.com/dallascosmeticdental' },
          businessSignals: { onlineBookingAvailable: true },
          idealCustomerProfile: 'Patients seeking premium smile makeovers.',
          enrichmentSummary: 'Established cosmetic dental practice with active web presence.',
        },
        durationMs: 800,
        model: 'qwen2.5:7b',
        provider: 'ollama',
        usedFallback: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadEnrichmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebsiteExtractorService, useValue: mockWebsiteExtractor },
        { provide: EmailVerifierService, useValue: mockEmailVerifier },
        { provide: OllamaClientService, useValue: mockOllamaClient },
      ],
    }).compile();

    service = module.get<LeadEnrichmentService>(LeadEnrichmentService);
  });

  describe('Enrichment Score Calculation', () => {
    it('should assign a balanced score based on verified factors', () => {
      const scoreResult = service.calculateScore({
        websiteReachable: true, // 20
        hasFacts: true, // 25
        emailVerification: {
          email: 'test@example.com',
          status: 'VALID_SYNTAX_MX',
          syntaxValid: true,
          domain: 'example.com',
          mxFound: true,
          mxRecords: ['mx.example.com'],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: false,
          notes: '',
          verifiedAt: '',
        }, // 25
        phonePresent: true, // 15
        socialCount: 2, // 15
      });

      expect(scoreResult.enrichmentScore).toBe(100);
      expect(scoreResult.factors.websiteReachable).toBe(20);
      expect(scoreResult.factors.businessFactsExtracted).toBe(25);
      expect(scoreResult.factors.emailVerified).toBe(25);
      expect(scoreResult.factors.phoneVerified).toBe(15);
      expect(scoreResult.factors.socialPresence).toBe(15);
      expect(scoreResult.explanation).toContain('Live responsive website confirmed');
    });

    it('should assign lower score when email or website is unverified', () => {
      const scoreResult = service.calculateScore({
        websiteReachable: false,
        hasFacts: false,
        emailVerification: null,
        phonePresent: true,
        socialCount: 0,
      });

      expect(scoreResult.enrichmentScore).toBe(15);
      expect(scoreResult.factors.websiteReachable).toBe(0);
      expect(scoreResult.factors.phoneVerified).toBe(15);
    });
  });

  describe('Lead Enrichment Workflow', () => {
    it('should enrich a lead, update contact email if missing, and persist to CRM', async () => {
      const result = await service.enrichLead('company-abc', 'lead-123');

      expect(result.status).toBe('ENRICHED');
      expect(result.enrichmentScore).toBeGreaterThanOrEqual(70);
      expect(result.metadata.reachability.reachable).toBe(true);
      expect(result.metadata.emailVerification?.status).toBe('VALID_SYNTAX_MX');
      expect(result.updatedFields.contactEmail).toBe('info@dallascosmeticdental.com');

      // Verify Prisma update call
      expect(mockPrisma.salesLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-123' },
          data: expect.objectContaining({
            contactEmail: 'info@dallascosmeticdental.com',
            status: SalesLeadStatus.QUALIFIED,
          }),
        })
      );
    });

    it('should enforce tenant isolation and throw NotFoundException for foreign lead', async () => {
      mockPrisma.salesLead.findFirst.mockResolvedValueOnce(null);

      await expect(service.enrichLead('other-company', 'lead-123')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should skip already enriched leads unless forceRefresh is true (idempotency)', async () => {
      mockPrisma.salesLead.findFirst.mockResolvedValueOnce({
        ...sampleLead,
        metadata: {
          enrichment: {
            status: 'ENRICHED',
            score: { enrichmentScore: 85 },
          },
        },
      });

      const result = await service.enrichLead('company-abc', 'lead-123', { forceRefresh: false });

      expect(result.status).toBe('ENRICHED');
      // Website extractor should not be called again
      expect(mockWebsiteExtractor.crawlWebsite).not.toHaveBeenCalled();
    });

    it('should handle unreachable website gracefully without crashing', async () => {
      mockWebsiteExtractor.crawlWebsite.mockResolvedValueOnce({
        reachable: false,
        statusCode: 503,
        responseTimeMs: 200,
        pagesCrawled: 0,
        pages: [],
        aggregatedText: '',
        emailsFound: [],
        phonesFound: [],
        socialLinks: {},
        error: 'Service Unavailable',
      });

      const result = await service.enrichLead('company-abc', 'lead-123');

      expect(result.status).toBe('UNREACHABLE');
      expect(result.metadata.reachability.reachable).toBe(false);
      expect(result.metadata.reachability.statusCode).toBe(503);
      expect(mockPrisma.salesLead.update).toHaveBeenCalled();
    });

    it('should preserve existing contact email and record conflict if extracted email differs', async () => {
      mockPrisma.salesLead.findFirst.mockResolvedValueOnce({
        ...sampleLead,
        contactEmail: 'existing@dallascosmeticdental.com',
      });

      const result = await service.enrichLead('company-abc', 'lead-123');

      expect(result.status).toBe('ENRICHED');
      expect(result.metadata.provenance.conflicts.length).toBeGreaterThan(0);
      expect(result.metadata.provenance.conflicts[0].resolution).toBe('PRESERVED_EXISTING');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SalesResearchService } from './sales-research.service';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClientService } from './ollama-client.service';
import { OpportunityScoringEngine } from './opportunity-scoring.engine';
import { WebsiteExtractorService } from './website-extractor.service';
import { OpportunityScoreResult, ResearchBrief } from './automation.types';

describe('SalesResearchService', () => {
  let service: SalesResearchService;
  let prisma: any;
  let ollamaClient: any;
  let scoringEngine: OpportunityScoringEngine;
  let websiteExtractor: any;

  const mockCompanyId = 'company-test-123';
  const mockLeadId = 'lead-test-456';
  const mockEmployeeId = 'employee-test-789';

  const mockLead = {
    id: mockLeadId,
    companyId: mockCompanyId,
    name: 'Midtown Family Dentistry',
    industry: 'Dentist',
    status: 'QUALIFIED',
    qualityScore: 75,
    website: 'https://www.midtowndentistrydallas.com',
    contactPhone: '(469) 529-6016',
    contactEmail: 'contact@midtown.com',
    googlePlaceId: 'place-123',
    geography: 'Dallas, TX',
    createdAt: new Date(),
    metadata: {
      scoreFactors: { reviews: 20 },
      enrichment: {
        enrichedAt: '2026-10-15T00:00:00.000Z',
        reachability: { checked: true, reachable: true, statusCode: 200, responseTimeMs: 950 },
        extracted: {
          businessDescription: 'Dental practice in Dallas providing family dentistry.',
          services: ['Cleaning', 'Whitening', 'Implants'],
          contactEmails: ['contact@midtown.com'],
          contactPhones: ['(469) 529-6016'],
          socialLinks: { facebook: 'https://facebook.com/midtown' },
          businessSignals: { onlineBookingAvailable: false, hasContactForm: false },
        },
        emailVerification: {
          email: 'contact@midtown.com',
          status: 'VALID_SYNTAX_MX',
          syntaxValid: true,
          domain: 'midtown.com',
          mxFound: true,
          mxRecords: ['mx.midtown.com'],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: true,
          notes: 'Valid',
          verifiedAt: '2026-10-15T00:00:00.000Z',
        },
      },
    },
  };

  const mockOllamaInsights = {
    executiveSummary: 'Midtown Family Dentistry is an established local practice with modernization potential.',
    identifiedPains: ['Lacks self-service online booking workflow'],
    identifiedOpportunities: ['Deploy automated appointment booking and patient inquiry assistant'],
    buyingSignals: ['Active practice with multiple service lines and phone coverage'],
    recommendedPitch: 'Help Midtown Dentistry automate patient bookings directly from web and social.',
    recommendedNextAction: 'Schedule a discovery discussion on online booking automation.',
    missingEvidence: ['Current dental practice management software unconfirmed.'],
  };

  beforeEach(async () => {
    prisma = {
      salesLead: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
      },
      qualificationRecord: {
        create: jest.fn(),
      },
      leadGenAudit: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    ollamaClient = {
      generateResearchInsights: jest.fn().mockResolvedValue({
        insights: mockOllamaInsights,
        durationMs: 1200,
        model: 'qwen2.5:7b',
        provider: 'ollama',
      }),
    };

    scoringEngine = new OpportunityScoringEngine();

    websiteExtractor = {
      extract: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesResearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: OllamaClientService, useValue: ollamaClient },
        { provide: OpportunityScoringEngine, useValue: scoringEngine },
        { provide: WebsiteExtractorService, useValue: websiteExtractor },
      ],
    }).compile();

    service = module.get<SalesResearchService>(SalesResearchService);
  });

  describe('Tenant Isolation & Authorization', () => {
    it('throws NotFoundException when lead does not belong to the requesting company', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(null);

      await expect(
        service.researchLead('company-wrong-id', mockLeadId)
      ).rejects.toThrow(NotFoundException);

      expect(prisma.salesLead.findFirst).toHaveBeenCalledWith({
        where: { id: mockLeadId, companyId: 'company-wrong-id' },
      });
    });
  });

  describe('Eligibility Evaluation', () => {
    it('recognizes QUALIFIED leads as eligible', () => {
      expect(service.isLeadEligible({ status: 'QUALIFIED', qualityScore: 65 })).toBe(true);
    });

    it('recognizes ENRICHED leads as eligible', () => {
      expect(service.isLeadEligible({ status: 'ENRICHED', qualityScore: 60 })).toBe(true);
    });

    it('rejects low score leads with NEW status', () => {
      expect(service.isLeadEligible({ status: 'NEW', qualityScore: 40 })).toBe(false);
    });

    it('returns INELIGIBLE status when lead does not meet eligibility threshold', async () => {
      const ineligibleLead = { ...mockLead, status: 'NEW', qualityScore: 35 };
      prisma.salesLead.findFirst.mockResolvedValue(ineligibleLead);

      const result = await service.researchLead(mockCompanyId, mockLeadId);
      expect(result.status).toBe('INELIGIBLE');
      expect(ollamaClient.generateResearchInsights).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency Behavior', () => {
    it('skips Ollama and returns cached brief if lead already researched without forceRefresh', async () => {
      const alreadyResearchedLead = {
        ...mockLead,
        metadata: {
          ...mockLead.metadata,
          researchBrief: {
            leadId: mockLeadId,
            companyId: mockCompanyId,
            opportunityScore: 82,
            confidence: 85,
            priority: 'HIGH',
            recommendation: 'QUALIFIED',
            executiveSummary: 'Already researched.',
          },
        },
      };

      prisma.salesLead.findFirst.mockResolvedValue(alreadyResearchedLead);

      const result = await service.researchLead(mockCompanyId, mockLeadId, { forceRefresh: false });

      expect(result.status).toBe('SKIPPED');
      expect(result.opportunityScore).toBe(82);
      expect(ollamaClient.generateResearchInsights).not.toHaveBeenCalled();
      expect(prisma.qualificationRecord.create).not.toHaveBeenCalled();
    });

    it('re-executes research when forceRefresh is explicitly true', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      prisma.qualificationRecord.create.mockResolvedValue({ id: 'qual-123' });

      const result = await service.researchLead(mockCompanyId, mockLeadId, { forceRefresh: true });

      expect(result.status).toBe('RESEARCHED');
      expect(ollamaClient.generateResearchInsights).toHaveBeenCalled();
      expect(prisma.salesLead.update).toHaveBeenCalled();
      expect(prisma.qualificationRecord.create).toHaveBeenCalled();
    });
  });

  describe('Full Research Execution and Persistence', () => {
    it('executes research, computes scores, persists brief and audit event', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      prisma.qualificationRecord.create.mockResolvedValue({ id: 'qual-rec-001' });

      const result = await service.researchLead(mockCompanyId, mockLeadId);

      expect(result.status).toBe('RESEARCHED');
      expect(result.opportunityScore).toBeGreaterThanOrEqual(50);
      expect(result.brief).toBeDefined();
      expect(result.brief?.executiveSummary).toBe(mockOllamaInsights.executiveSummary);

      // Verify SalesLead update preserved existing metadata
      expect(prisma.salesLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockLeadId },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              enrichment: mockLead.metadata.enrichment,
              research: expect.any(Object),
              researchBrief: expect.any(Object),
            }),
          }),
        })
      );

      // Verify QualificationRecord creation
      expect(prisma.qualificationRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: mockCompanyId,
          salesLeadId: mockLeadId,
          evaluatorId: mockEmployeeId,
          evaluatorType: 'AI_AGENT',
          overallScore: result.opportunityScore,
          recommendation: result.recommendation,
        }),
      });

      // Verify LeadGenAudit creation
      expect(prisma.leadGenAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          leadId: mockLeadId,
          event: 'OPPORTUNITY_RESEARCH_COMPLETED',
          detail: expect.objectContaining({
            opportunityScore: result.opportunityScore,
            priority: result.priority,
            model: 'qwen2.5:7b',
            automationId: 'automation-3-sales-research',
          }),
        }),
      });
    });
  });

  describe('Ollama Failure Handling', () => {
    it('handles Ollama failure cleanly without external AI fallback', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      ollamaClient.generateResearchInsights.mockRejectedValue(
        new Error('Ollama service connection refused at http://127.0.0.1:11434')
      );

      const result = await service.researchLead(mockCompanyId, mockLeadId);

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Ollama inference failed');
      expect(prisma.salesLead.update).not.toHaveBeenCalled();
      expect(prisma.qualificationRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('Batch Research', () => {
    it('processes batch of candidate leads and returns comprehensive summary', async () => {
      prisma.salesLead.findMany.mockResolvedValue([mockLead]);
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      prisma.employee.findFirst.mockResolvedValue({ id: mockEmployeeId });
      prisma.qualificationRecord.create.mockResolvedValue({ id: 'qual-rec-002' });

      const summary = await service.researchCompanyLeads(mockCompanyId, { limit: 5 });

      expect(summary.totalRequested).toBe(1);
      expect(summary.processed).toBe(1);
      expect(summary.researched).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.leads).toHaveLength(1);
    });
  });
});

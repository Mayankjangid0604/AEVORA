import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalRequestStatus, SalesActorType, SalesActivityType } from '@prisma/client';
import { SalesOutreachService } from './sales-outreach.service';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClientService } from './ollama-client.service';
import { OutreachDraft, ResearchBrief } from './automation.types';

describe('SalesOutreachService', () => {
  let service: SalesOutreachService;
  let prisma: any;
  let ollamaClient: any;

  const mockCompanyId = '607da85a-7ad3-43b6-bf88-eace1125984d';
  const otherCompanyId = 'other-tenant-999';
  const mockLeadId = 'lead-auto4-test-123';
  const mockEmployeeId = 'employee-test-456';
  const mockApprovalReqId = 'app-req-uuid-789';

  const mockResearchBrief: ResearchBrief = {
    leadId: mockLeadId,
    companyId: mockCompanyId,
    opportunityScore: 78,
    confidence: 85,
    priority: 'HIGH',
    recommendation: 'QUALIFIED',
    executiveSummary: 'Midtown Family Dentistry has high operational maturity with missing online booking workflows.',
    identifiedPains: ['Lacks self-service online booking workflow'],
    identifiedOpportunities: ['Deploy automated appointment booking and patient intake assistant'],
    buyingSignals: ['Active practice with multiple dental service lines'],
    recommendedPitch: 'Help Midtown Dentistry automate patient bookings directly from web and social.',
    recommendedNextAction: 'Schedule a 15-minute introductory workflow review call.',
    evidenceSources: [{ type: 'WEBSITE_SCRAPE', url: 'https://midtowndentistry.com' }],
    missingEvidence: ['Internal dental software stack unconfirmed'],
    researchedAt: '2026-10-15T00:00:00.000Z',
    model: 'qwen2.5:7b',
    scoringVersion: '1.0',
    components: {} as any,
  };

  const mockLead = {
    id: mockLeadId,
    companyId: mockCompanyId,
    name: 'Midtown Family Dentistry',
    industry: 'Dentist',
    status: 'QUALIFIED',
    qualityScore: 78,
    website: 'https://midtowndentistry.com',
    contactPhone: '(469) 529-6016',
    contactEmail: 'contact@midtowndentistry.com',
    notes: 'Established local dental clinic',
    createdAt: new Date(),
    metadata: {
      researchBrief: mockResearchBrief,
      enrichment: {
        extracted: {
          businessDescription: 'Dental clinic providing dental implants and hygiene.',
          services: ['Implants', 'Cleaning'],
          businessSignals: { onlineBookingAvailable: false, hasContactForm: true },
        },
      },
    },
  };

  const mockOllamaOutreach = {
    subject: 'Modernizing patient booking for Midtown Family Dentistry',
    body: 'Hi Dr. Smith,\n\nI noticed Midtown Family Dentistry provides implants and family dental care in Dallas, but does not currently offer direct online booking for patients.\n\nWe help practices automate booking and inquiries directly from their website, reducing phone backlog.\n\nWould you be open to a 15-minute introductory workflow review next Tuesday?',
    personalizationRationale: 'Referenced verified dental service offerings and lack of online booking detected during enrichment.',
    evidenceReferences: ['Implants and Cleaning services', 'Online booking currently absent'],
    recommendedNextStep: '15-minute introductory workflow review call',
    followUpIntervalDays: 4,
    followUpRecommendation: 'Send gentle follow-up focusing on after-hours patient intake inquiries.',
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
        findFirst: jest.fn().mockResolvedValue({ id: mockEmployeeId }),
      },
      approvalRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: mockApprovalReqId,
          companyId: mockCompanyId,
          status: ApprovalRequestStatus.PENDING,
          proposedParams: { version: 1 },
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      salesActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-uuid-1' }),
      },
      leadGenAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
      emailSuppression: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    ollamaClient = {
      generateSalesOutreach: jest.fn().mockResolvedValue({
        draft: mockOllamaOutreach,
        durationMs: 950,
        model: 'qwen2.5:7b',
        provider: 'ollama',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOutreachService,
        { provide: PrismaService, useValue: prisma },
        { provide: OllamaClientService, useValue: ollamaClient },
      ],
    }).compile();

    service = module.get<SalesOutreachService>(SalesOutreachService);
  });

  describe('1. Draft Quality Structure & Evidence Grounding', () => {
    it('generates structured outreach draft grounded in verified facts and research brief', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('APPROVAL_PENDING');
      expect(result.draft).toBeDefined();
      expect(result.draft?.subject).toBe(mockOllamaOutreach.subject);
      expect(result.draft?.body).toBe(mockOllamaOutreach.body);
      expect(result.draft?.personalizationRationale).toBe(mockOllamaOutreach.personalizationRationale);
      expect(result.draft?.evidenceReferences).toEqual(mockOllamaOutreach.evidenceReferences);
      expect(result.draft?.recommendedNextStep).toBe(mockOllamaOutreach.recommendedNextStep);
      expect(result.draft?.followUpIntervalDays).toBe(4);
      expect(result.draft?.confidence).toBeGreaterThanOrEqual(70);
      expect(result.draft?.deliveryStatus).toBe('DISABLED');
      expect(result.draft?.approvalStatus).toBe('PENDING');

      // Verify Ollama was invoked with grounded facts
      expect(ollamaClient.generateSalesOutreach).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: mockLead.name,
          industry: mockLead.industry,
          researchBrief: mockResearchBrief,
        })
      );

      // Verify ApprovalRequest creation
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: mockCompanyId,
            action: 'SALES_OUTREACH_SEND',
            targetType: 'SalesLead',
            targetId: mockLeadId,
            status: ApprovalRequestStatus.PENDING,
          }),
        })
      );
    });
  });

  describe('2. Local Ollama Failure and Timeout Handling', () => {
    it('handles Ollama timeout or error safely without falling back to external paid AI', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      ollamaClient.generateSalesOutreach.mockRejectedValue(
        new Error('Ollama connection timeout after 90000ms')
      );

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Ollama connection timeout');
      expect(result.draft).toBeUndefined();
      expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('3. Missing Research Data and Low-Confidence Evidence Handling', () => {
    it('sets low confidence and records missing evidence when research brief is absent', async () => {
      const bareLead = {
        ...mockLead,
        metadata: {}, // No research brief, no enrichment
      };
      prisma.salesLead.findFirst.mockResolvedValue(bareLead);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId, { forceRefresh: true });

      expect(result.status).toBe('APPROVAL_PENDING');
      expect(result.draft?.confidence).toBeLessThanOrEqual(50);
      expect(result.draft?.missingEvidence).toEqual(
        expect.arrayContaining(['Comprehensive opportunity research brief from Automation #3 is absent'])
      );
    });

    it('rejects ineligible lead with low quality score and no research brief', async () => {
      const lowQualityLead = {
        ...mockLead,
        status: 'NEW',
        qualityScore: 25,
        metadata: {},
      };
      prisma.salesLead.findFirst.mockResolvedValue(lowQualityLead);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('INELIGIBLE');
      expect(result.error).toContain('not eligible');
      expect(ollamaClient.generateSalesOutreach).not.toHaveBeenCalled();
    });
  });

  describe('4. Tenant Isolation and Cross-Tenant Rejection', () => {
    it('rejects operation when caller companyId does not own the lead', async () => {
      // prisma findFirst scopes by companyId and returns null
      prisma.salesLead.findFirst.mockResolvedValue(null);

      await expect(
        service.generateOutreachDraft(otherCompanyId, mockLeadId)
      ).rejects.toThrow(NotFoundException);

      expect(prisma.salesLead.findFirst).toHaveBeenCalledWith({
        where: { id: mockLeadId, companyId: otherCompanyId },
      });
    });

    it('prevents approval of another tenant lead', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(null);

      await expect(
        service.approveDraft(otherCompanyId, mockLeadId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. Approval Required Before Sending Safeguard', () => {
    it('throws ForbiddenException if attempting to send an unapproved draft', async () => {
      const unapprovedLead = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-uuid-1',
            version: 1,
            subject: 'Test Subject',
            body: 'Test Body',
            status: 'APPROVAL_PENDING',
            approvalStatus: 'PENDING',
            approvalRequestId: mockApprovalReqId,
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(unapprovedLead);

      await expect(
        service.sendOutreach(mockCompanyId, mockLeadId)
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.sendOutreach(mockCompanyId, mockLeadId)
      ).rejects.toThrow(/Explicit human approval is required/);
    });

    it('throws ForbiddenException if approval request record is not in APPROVED state', async () => {
      const leadWithApprovedDraftMeta = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-uuid-1',
            version: 1,
            status: 'APPROVED',
            approvalStatus: 'APPROVED',
            approvalRequestId: mockApprovalReqId,
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithApprovedDraftMeta);
      // DB ApprovalRequest is still PENDING
      prisma.approvalRequest.findFirst.mockResolvedValue({
        id: mockApprovalReqId,
        status: ApprovalRequestStatus.PENDING,
      });

      await expect(
        service.sendOutreach(mockCompanyId, mockLeadId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Draft Edits Invalidating Prior Approval', () => {
    it('cancels prior approval request and creates a new one when regenerating draft', async () => {
      const leadWithExistingDraft = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-1',
            version: 1,
            status: 'APPROVED',
            approvalStatus: 'APPROVED',
            approvalRequestId: 'old-approval-req-1',
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithExistingDraft);
      prisma.approvalRequest.findMany.mockResolvedValue([
        { id: 'old-approval-req-1', status: ApprovalRequestStatus.APPROVED },
      ]);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId, { forceRefresh: true });

      expect(result.status).toBe('APPROVAL_PENDING');
      expect(result.draft?.version).toBe(2);
      expect(result.draft?.approvalStatus).toBe('PENDING');

      // Verify prior approval was cancelled
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'old-approval-req-1' },
        data: expect.objectContaining({
          status: ApprovalRequestStatus.CANCELLED,
          decisionReason: expect.stringContaining('prior approval invalidated'),
        }),
      });
    });

    it('increments version and creates new approval request when human edits draft during approval', async () => {
      const existingDraft: OutreachDraft = {
        id: 'draft-v1',
        version: 1,
        channel: 'EMAIL',
        subject: 'Old Subject',
        body: 'Old Body',
        personalizationRationale: 'Test',
        evidenceReferences: ['Test'],
        recommendedNextStep: 'Call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Follow up',
        status: 'APPROVAL_PENDING',
        approvalRequestId: 'req-v1',
        approvalStatus: 'PENDING',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 80,
        missingEvidence: [],
      };

      const leadWithDraft = {
        ...mockLead,
        metadata: { outreachDraft: existingDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithDraft);
      prisma.approvalRequest.create.mockResolvedValue({ id: 'req-v2', status: ApprovalRequestStatus.APPROVED });

      const result = await service.approveDraft(mockCompanyId, mockLeadId, {
        actorId: 'editor-user-1',
        reason: 'Adjusted subject line tone',
        editedSubject: 'Customized Subject for Midtown Dentistry',
      });

      expect(result.status).toBe('APPROVED');
      expect(result.draft?.version).toBe(2);
      expect(result.draft?.subject).toBe('Customized Subject for Midtown Dentistry');
      expect(result.draft?.isEdited).toBe(true);
      expect(result.draft?.approvalStatus).toBe('APPROVED');

      // Old request cancelled
      expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-v1', companyId: mockCompanyId },
        data: expect.objectContaining({
          status: ApprovalRequestStatus.CANCELLED,
        }),
      });

      // New request created and marked approved
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApprovalRequestStatus.APPROVED,
            approverId: 'editor-user-1',
          }),
        })
      );
    });
  });

  describe('7. Duplicate Prevention and Idempotent Retries', () => {
    it('returns existing draft when already generated and forceRefresh is false', async () => {
      const existingDraft: OutreachDraft = {
        id: 'draft-existing-1',
        version: 1,
        channel: 'EMAIL',
        subject: 'Existing Subject',
        body: 'Existing Body',
        personalizationRationale: 'Grounded rationale',
        evidenceReferences: ['Dental services'],
        recommendedNextStep: 'Discovery call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Follow-up',
        status: 'APPROVAL_PENDING',
        approvalRequestId: mockApprovalReqId,
        approvalStatus: 'PENDING',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 85,
        missingEvidence: [],
      };

      const leadWithDraft = {
        ...mockLead,
        metadata: { outreachDraft: existingDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithDraft);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId, { forceRefresh: false });

      expect(result.status).toBe('SKIPPED');
      expect(result.draft).toEqual(existingDraft);
      expect(ollamaClient.generateSalesOutreach).not.toHaveBeenCalled();
      expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('8. Opt-Outs and Suppression Rules', () => {
    it('suppresses lead when metadata.optOut is true', async () => {
      const optedOutLead = {
        ...mockLead,
        metadata: {
          ...mockLead.metadata,
          optOut: true,
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(optedOutLead);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('SUPPRESSED');
      expect(result.error).toContain('explicitly opted out');
      expect(ollamaClient.generateSalesOutreach).not.toHaveBeenCalled();
    });

    it('suppresses lead when status is DO_NOT_CONTACT', async () => {
      const dncLead = {
        ...mockLead,
        status: 'DO_NOT_CONTACT',
      };
      prisma.salesLead.findFirst.mockResolvedValue(dncLead);

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('SUPPRESSED');
      expect(result.error).toContain('DO_NOT_CONTACT');
      expect(ollamaClient.generateSalesOutreach).not.toHaveBeenCalled();
    });

    it('suppresses lead when recipient email is registered in persistent EmailSuppression table', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      prisma.emailSuppression.findUnique.mockResolvedValue({
        id: 'suppression-1',
        companyId: mockCompanyId,
        email: mockLead.contactEmail.toLowerCase(),
        reason: 'UNSUBSCRIBE_LINK',
      });

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('SUPPRESSED');
      expect(result.error).toContain('registered in suppression database');
      expect(ollamaClient.generateSalesOutreach).not.toHaveBeenCalled();
      expect(prisma.emailSuppression.findUnique).toHaveBeenCalledWith({
        where: {
          companyId_email: {
            companyId: mockCompanyId,
            email: mockLead.contactEmail.toLowerCase(),
          },
        },
      });
    });

    it('blocks sendOutreach if prospect opted out after approval was granted', async () => {
      const optedOutApprovedLead = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-approved-opted-out',
            version: 1,
            approvalRequestId: 'req-1',
            approvalStatus: 'APPROVED',
            status: 'APPROVED',
          },
          optOut: true,
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(optedOutApprovedLead);

      await expect(
        service.sendOutreach(mockCompanyId, mockLeadId)
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks sendOutreach if recipient email is added to EmailSuppression table after approval', async () => {
      const approvedLead = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-approved-suppressed',
            version: 1,
            approvalRequestId: 'req-1',
            approvalStatus: 'APPROVED',
            status: 'APPROVED',
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(approvedLead);
      prisma.emailSuppression.findUnique.mockResolvedValue({
        id: 'suppression-2',
        companyId: mockCompanyId,
        email: mockLead.contactEmail.toLowerCase(),
        reason: 'INBOUND_REPLY',
      });

      await expect(
        service.sendOutreach(mockCompanyId, mockLeadId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('9. Invalid Inputs and Error Handling', () => {
    it('throws BadRequestException when companyId or leadId is missing', async () => {
      await expect(service.generateOutreachDraft('', mockLeadId)).rejects.toThrow(BadRequestException);
      await expect(service.generateOutreachDraft(mockCompanyId, '')).rejects.toThrow(BadRequestException);
      await expect(service.approveDraft('', mockLeadId)).rejects.toThrow(BadRequestException);
      await expect(service.rejectDraft(mockCompanyId, '')).rejects.toThrow(BadRequestException);
      await expect(service.sendOutreach('', mockLeadId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('10. Delivery Safeguard Policy (No Accidental Delivery)', () => {
    it('strictly keeps external delivery disabled even for approved drafts in this phase', async () => {
      const approvedDraft: OutreachDraft = {
        id: 'draft-approved-1',
        version: 1,
        channel: 'EMAIL',
        subject: 'Approved Subject',
        body: 'Approved Body',
        personalizationRationale: 'Test rationale',
        evidenceReferences: ['Verified booking lack'],
        recommendedNextStep: 'Discovery call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Gentle nudge',
        status: 'APPROVED',
        approvalRequestId: mockApprovalReqId,
        approvalStatus: 'APPROVED',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 85,
        missingEvidence: [],
      };

      const leadWithApprovedDraft = {
        ...mockLead,
        metadata: { outreachDraft: approvedDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithApprovedDraft);
      prisma.approvalRequest.findFirst.mockResolvedValue({
        id: mockApprovalReqId,
        status: ApprovalRequestStatus.APPROVED,
        proposedParams: { version: 1 },
      });

      const sendResult = await service.sendOutreach(mockCompanyId, mockLeadId);

      expect(sendResult.status).toBe('BLOCKED_BY_SAFEGUARD');
      expect(sendResult.deliveryStatus).toBe('DISABLED');
      expect(sendResult.message).toContain('disabled by AEVORA safeguard policy');

      // Verify audit log of safeguard block
      expect(prisma.leadGenAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'OUTREACH_DELIVERY_BLOCKED_SAFEGUARD',
          }),
        })
      );
    });

    it('rejects sendOutreach if lead has no contactEmail', async () => {
      const leadWithoutEmail = {
        ...mockLead,
        contactEmail: null,
        metadata: {
          outreachDraft: {
            id: 'draft-no-email',
            version: 1,
            approvalRequestId: mockApprovalReqId,
            approvalStatus: 'APPROVED',
            status: 'APPROVED',
            deliveryStatus: 'DISABLED',
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithoutEmail);

      await expect(service.sendOutreach(mockCompanyId, mockLeadId)).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate sendOutreach if draft deliveryStatus is DELIVERED', async () => {
      const deliveredLead = {
        ...mockLead,
        metadata: {
          outreachDraft: {
            id: 'draft-delivered',
            version: 1,
            approvalRequestId: mockApprovalReqId,
            approvalStatus: 'APPROVED',
            status: 'APPROVED',
            deliveryStatus: 'DELIVERED',
          },
        },
      };
      prisma.salesLead.findFirst.mockResolvedValue(deliveredLead);

      await expect(service.sendOutreach(mockCompanyId, mockLeadId)).rejects.toThrow(BadRequestException);
    });

    it('captures mock dispatch without external transmission when captureOnly is true', async () => {
      const approvedDraft: OutreachDraft = {
        id: 'draft-approved-capture',
        version: 1,
        channel: 'EMAIL',
        subject: 'Approved Subject',
        body: 'Approved Body',
        personalizationRationale: 'Test rationale',
        evidenceReferences: ['Verified booking lack'],
        recommendedNextStep: 'Discovery call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Gentle nudge',
        status: 'APPROVED',
        approvalRequestId: mockApprovalReqId,
        approvalStatus: 'APPROVED',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 85,
        missingEvidence: [],
      };
      const leadWithApprovedDraft = {
        ...mockLead,
        metadata: { outreachDraft: approvedDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithApprovedDraft);
      prisma.approvalRequest.findFirst.mockResolvedValue({
        id: mockApprovalReqId,
        status: ApprovalRequestStatus.APPROVED,
        proposedParams: { version: 1 },
      });

      const sendResult = await service.sendOutreach(mockCompanyId, mockLeadId, { captureOnly: true });

      expect(sendResult.status).toBe('CAPTURED_MOCK');
      expect(sendResult.deliveryStatus).toBe('CAPTURED_MOCK');
      expect(sendResult.message).toContain('Mock email captured successfully');
      expect(prisma.leadGenAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'OUTREACH_DISPATCH_CAPTURED_MOCK',
          }),
        })
      );
    });
  });

  describe('11. Draft Editing and Stale Approval Invalidation', () => {
    it('edits a draft, increments version, and cancels prior approval', async () => {
      const existingDraft: OutreachDraft = {
        id: 'draft-v1',
        version: 1,
        channel: 'EMAIL',
        subject: 'Version 1 Subject',
        body: 'Version 1 Body',
        personalizationRationale: 'Initial rationale',
        evidenceReferences: ['Booking gap'],
        recommendedNextStep: 'Call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Follow-up',
        status: 'APPROVED',
        approvalRequestId: 'old-approval-req-id',
        approvalStatus: 'APPROVED',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 85,
        missingEvidence: [],
      };
      const leadWithDraft = {
        ...mockLead,
        metadata: { outreachDraft: existingDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithDraft);
      prisma.approvalRequest.create.mockResolvedValue({
        id: 'new-approval-req-id',
        companyId: mockCompanyId,
        status: ApprovalRequestStatus.PENDING,
        proposedParams: { version: 2 },
      });

      const result = await service.editDraft(mockCompanyId, mockLeadId, {
        subject: 'Version 2 Subject Edited',
        body: 'Version 2 Body Edited',
      });

      expect(result.status).toBe('APPROVAL_PENDING');
      expect(result.draft.version).toBe(2);
      expect(result.draft.subject).toBe('Version 2 Subject Edited');
      expect(result.draft.approvalStatus).toBe('PENDING');
      expect(result.draft.isEdited).toBe(true);

      // Verify prior approval was cancelled
      expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'old-approval-req-id', companyId: mockCompanyId },
        data: expect.objectContaining({
          status: ApprovalRequestStatus.CANCELLED,
        }),
      });

      // Verify OUTREACH_DRAFT_EDITED audit event
      expect(prisma.leadGenAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'OUTREACH_DRAFT_EDITED',
          }),
        })
      );
    });
  });

  describe('12. Human Rejection and Failure Handling', () => {
    it('rejects an outreach draft, updates approval request to REJECTED, and logs audit event', async () => {
      const existingDraft: OutreachDraft = {
        id: 'draft-to-reject',
        version: 1,
        channel: 'EMAIL',
        subject: 'Pending Subject',
        body: 'Pending Body',
        personalizationRationale: 'Test rationale',
        evidenceReferences: ['Verified need'],
        recommendedNextStep: 'Call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'Follow-up',
        status: 'APPROVAL_PENDING',
        approvalRequestId: mockApprovalReqId,
        approvalStatus: 'PENDING',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 80,
        missingEvidence: [],
      };

      const leadWithDraft = {
        ...mockLead,
        metadata: { outreachDraft: existingDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithDraft);

      const result = await service.rejectDraft(mockCompanyId, mockLeadId, {
        actorId: 'human-reviewer-1',
        reason: 'Tone is overly aggressive for healthcare clinic',
      });

      expect(result.status).toBe('REJECTED');
      expect(result.draft.status).toBe('REJECTED');
      expect(result.draft.approvalStatus).toBe('REJECTED');
      expect(result.draft.approvedBy).toBe('human-reviewer-1');

      // Verify approval request was updated to REJECTED
      expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: mockApprovalReqId, companyId: mockCompanyId },
        data: expect.objectContaining({
          status: ApprovalRequestStatus.REJECTED,
          approverId: 'human-reviewer-1',
          decisionReason: 'Tone is overly aggressive for healthcare clinic',
        }),
      });

      // Verify OUTREACH_DRAFT_REJECTED audit event
      expect(prisma.leadGenAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'OUTREACH_DRAFT_REJECTED',
            actorId: 'human-reviewer-1',
          }),
        })
      );
    });

    it('rejects sendOutreach when draft is in REJECTED status', async () => {
      const rejectedDraft: OutreachDraft = {
        id: 'draft-rejected',
        version: 1,
        channel: 'EMAIL',
        subject: 'Rejected Subject',
        body: 'Rejected Body',
        personalizationRationale: 'Test rationale',
        evidenceReferences: [],
        recommendedNextStep: 'Call',
        followUpIntervalDays: 4,
        followUpRecommendation: 'None',
        status: 'REJECTED',
        approvalRequestId: mockApprovalReqId,
        approvalStatus: 'REJECTED',
        deliveryStatus: 'DISABLED',
        generatedAt: new Date().toISOString(),
        model: 'qwen2.5:7b',
        confidence: 80,
        missingEvidence: [],
      };

      const leadWithRejectedDraft = {
        ...mockLead,
        metadata: { outreachDraft: rejectedDraft },
      };
      prisma.salesLead.findFirst.mockResolvedValue(leadWithRejectedDraft);

      await expect(service.sendOutreach(mockCompanyId, mockLeadId)).rejects.toThrow(ForbiddenException);
    });

    it('gracefully handles Ollama timeout and returns FAILED status without crashing', async () => {
      prisma.salesLead.findFirst.mockResolvedValue(mockLead);
      ollamaClient.generateSalesOutreach.mockRejectedValue(
        new Error('Ollama connection timeout after 90000ms')
      );

      const result = await service.generateOutreachDraft(mockCompanyId, mockLeadId);

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Ollama connection timeout');
    });
  });
});

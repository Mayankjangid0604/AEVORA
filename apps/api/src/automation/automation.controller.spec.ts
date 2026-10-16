import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationRegistryService } from './automation-registry.service';
import { N8nClientService } from './n8n-client.service';
import { LeadNormalizerService } from './lead-normalizer.service';
import { LeadEnrichmentService } from './lead-enrichment.service';
import { SalesResearchService } from './sales-research.service';
import { SalesOutreachService } from './sales-outreach.service';
import { OllamaClientService } from './ollama-client.service';
import { WebsiteExtractorService } from './website-extractor.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('AutomationController — REST Endpoints', () => {
  let controller: AutomationController;
  let registry: AutomationRegistryService;
  let normalizer: LeadNormalizerService;
  let n8nClient: N8nClientService;
  let enrichment: LeadEnrichmentService;
  let research: SalesResearchService;
  let outreach: SalesOutreachService;
  let ollamaClient: OllamaClientService;
  let websiteExtractor: WebsiteExtractorService;

  beforeEach(async () => {
    registry = new AutomationRegistryService();

    const n8nMock = {
      getStatus: jest.fn().mockResolvedValue({ configured: false, connected: false }),
      isConfigured: jest.fn().mockReturnValue(false),
      deployWorkflow: jest.fn().mockResolvedValue({ deployed: true, n8nWorkflowId: 'wf-1' }),
      executeWorkflow: jest.fn(),
    };

    const normalizerMock = {
      ingestLeads: jest.fn().mockResolvedValue({
        totalProcessed: 2,
        created: 2,
        duplicates: 0,
        invalid: [],
        leadIds: ['l-1', 'l-2'],
      }),
    };

    const enrichmentMock = {
      enrichCompanyLeads: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalRequested: 2,
        processed: 2,
        enriched: 2,
        noWebsite: 0,
        unreachable: 0,
        failed: 0,
        leads: [],
      }),
      enrichLead: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'ENRICHED',
        enrichmentScore: 85,
        metadata: {},
        updatedFields: {},
      }),
      getEnrichmentStatus: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalLeads: 5,
        counts: { enriched: 3, pending: 2, unreachable: 0, noWebsite: 0, failed: 0 },
        coveragePercent: 60,
      }),
    };

    const researchMock = {
      researchCompanyLeads: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalRequested: 2,
        processed: 2,
        researched: 2,
        skipped: 0,
        ineligible: 0,
        failed: 0,
        leads: [],
      }),
      researchLead: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'RESEARCHED',
        opportunityScore: 80,
        confidence: 85,
        priority: 'HIGH',
      }),
      getResearchStatus: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalLeads: 5,
        eligibleLeads: 3,
        researched: 2,
        pendingResearch: 1,
        priorityBreakdown: { high: 2, medium: 0, low: 0 },
      }),
    };

    const outreachMock = {
      processCompanyLeads: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalRequested: 2,
        processed: 2,
        drafted: 2,
        skipped: 0,
        suppressed: 0,
        ineligible: 0,
        failed: 0,
        leads: [],
      }),
      generateOutreachDraft: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'APPROVAL_PENDING',
        draft: { id: 'd-1', subject: 'Test Subject', body: 'Test Body' },
        approvalRequestId: 'req-1',
      }),
      approveDraft: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'APPROVED',
        draft: { id: 'd-1', approvalStatus: 'APPROVED' },
        approvalRequestId: 'req-1',
      }),
      rejectDraft: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'REJECTED',
        draft: { id: 'd-1', approvalStatus: 'REJECTED' },
        approvalRequestId: 'req-1',
      }),
      editDraft: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'APPROVAL_PENDING',
        draft: { id: 'd-1', version: 2, isEdited: true },
        approvalRequestId: 'req-2',
      }),
      sendOutreach: jest.fn().mockResolvedValue({
        leadId: 'lead-1',
        companyId: 'comp-101',
        status: 'BLOCKED_BY_SAFEGUARD',
        deliveryStatus: 'DISABLED',
        message: 'Delivery disabled by safeguard policy',
      }),
      getOutreachStatus: jest.fn().mockResolvedValue({
        companyId: 'comp-101',
        totalLeads: 5,
        eligibleLeads: 3,
        suppressedLeads: 0,
        draftsTotal: 2,
        pendingApproval: 1,
        approved: 1,
        rejected: 0,
        deliveryDisabled: 1,
      }),
    };

    const ollamaMock = {
      checkReadiness: jest.fn().mockResolvedValue({
        ready: true,
        version: '0.35.0',
        models: ['qwen2.5:7b'],
      }),
    };

    const extractorMock = {
      crawlWebsite: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationController],
      providers: [
        { provide: AutomationRegistryService, useValue: registry },
        { provide: N8nClientService, useValue: n8nMock },
        { provide: LeadNormalizerService, useValue: normalizerMock },
        { provide: LeadEnrichmentService, useValue: enrichmentMock },
        { provide: SalesResearchService, useValue: researchMock },
        { provide: SalesOutreachService, useValue: outreachMock },
        { provide: OllamaClientService, useValue: ollamaMock },
        { provide: WebsiteExtractorService, useValue: extractorMock },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(IntegrationApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AutomationController>(AutomationController);
    n8nClient = module.get<N8nClientService>(N8nClientService);
    normalizer = module.get<LeadNormalizerService>(LeadNormalizerService);
    enrichment = module.get<LeadEnrichmentService>(LeadEnrichmentService);
    research = module.get<SalesResearchService>(SalesResearchService);
    outreach = module.get<SalesOutreachService>(SalesOutreachService);
    ollamaClient = module.get<OllamaClientService>(OllamaClientService);
    websiteExtractor = module.get<WebsiteExtractorService>(WebsiteExtractorService);
  });

  it('lists registered automations with n8n connection status', async () => {
    const list = await controller.listWorkflows();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const auto1 = list.find((a) => a.number === 1);
    expect(auto1).toBeDefined();
    expect(auto1?.name).toBe('Generate Leads with Google Maps');

    const auto2 = list.find((a) => a.number === 2);
    expect(auto2).toBeDefined();
    expect(auto2?.name).toBe('Enrich & Verify Leads with Ollama & Web Scraper');
  });

  it('returns readiness status probe for Ollama, crawler, n8n, DNS', async () => {
    const readiness = await controller.getReadiness();
    expect(readiness.ollama.ready).toBe(true);
    expect(readiness.ollama.model).toBe('qwen2.5:7b');
    expect(readiness.crawler.ready).toBe(true);
    expect(readiness.dns.ready).toBe(true);
  });

  it('triggers lead enrichment start for company leads', async () => {
    const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
    const res = await controller.startEnrichment(req, { limit: 5 });

    expect(res.companyId).toBe('comp-101');
    expect(res.processed).toBe(2);
    expect(enrichment.enrichCompanyLeads).toHaveBeenCalledWith(
      'comp-101',
      expect.objectContaining({ limit: 5, actorId: 'user-1' })
    );
  });

  it('returns enrichment status summary for company', async () => {
    const req = { user: { companyId: 'comp-101' } };
    const res = await controller.getEnrichmentStatus(req);

    expect(res.totalLeads).toBe(5);
    expect(res.counts.enriched).toBe(3);
    expect(enrichment.getEnrichmentStatus).toHaveBeenCalledWith('comp-101');
  });

  it('handles enrichment webhook callback from n8n', async () => {
    const req = { user: { companyId: 'comp-101', actorId: 'n8n-webhook' } };
    const res = await controller.enrichmentWebhook(req, { limit: 10 });

    expect(res.success).toBe(true);
    expect(res.companyId).toBe('comp-101');
    expect(enrichment.enrichCompanyLeads).toHaveBeenCalledWith(
      'comp-101',
      expect.objectContaining({ limit: 10 })
    );
  });

  it('retries enrichment for a specific lead', async () => {
    const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
    const res = await controller.retryEnrichment(req, { leadId: 'lead-1' });

    expect(res.status).toBe('ENRICHED');
    expect(enrichment.enrichLead).toHaveBeenCalledWith(
      'comp-101',
      'lead-1',
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('rejects enrichment retry without leadId', async () => {
    const req = { user: { companyId: 'comp-101' } };
    await expect(controller.retryEnrichment(req, { leadId: '' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('processes incoming leads from n8n webhook for Automation #1', async () => {
    const req = { user: { companyId: 'comp-101', actorId: 'SYSTEM_INTEGRATION' } };
    const payload = {
      category: 'restaurant',
      location: 'Jaipur',
      records: [
        { id: 'p1', name: 'Test Resto 1' },
        { id: 'p2', name: 'Test Resto 2' },
      ],
    };

    const res = await controller.ingestLeadsWebhook(req, payload);
    expect(res.success).toBe(true);
    expect(res.companyId).toBe('comp-101');
    expect(res.created).toBe(2);
  });

  it('triggers sales research start for company leads', async () => {
    const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
    const res = await controller.startResearch(req, { limit: 5 });

    expect(res.companyId).toBe('comp-101');
    expect(res.processed).toBe(2);
    expect(research.researchCompanyLeads).toHaveBeenCalledWith(
      'comp-101',
      expect.objectContaining({ limit: 5, actorId: 'user-1' })
    );
  });

  it('returns sales research status summary for company', async () => {
    const req = { user: { companyId: 'comp-101' } };
    const res = await controller.getResearchStatus(req);

    expect(res.totalLeads).toBe(5);
    expect(res.researched).toBe(2);
    expect(research.getResearchStatus).toHaveBeenCalledWith('comp-101');
  });

  it('handles research webhook callback from n8n', async () => {
    const req = { user: { companyId: 'comp-101', actorId: 'n8n-webhook' } };
    const res = await controller.researchWebhook(req, { limit: 10 });

    expect(res.success).toBe(true);
    expect(res.companyId).toBe('comp-101');
    expect(research.researchCompanyLeads).toHaveBeenCalledWith(
      'comp-101',
      expect.objectContaining({ limit: 10 })
    );
  });

  it('retries research for a specific lead', async () => {
    const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
    const res = await controller.retryResearch(req, { leadId: 'lead-1' });

    expect(res.status).toBe('RESEARCHED');
    expect(research.researchLead).toHaveBeenCalledWith(
      'comp-101',
      'lead-1',
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('rejects research retry without leadId', async () => {
    const req = { user: { companyId: 'comp-101' } };
    await expect(controller.retryResearch(req, { leadId: '' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('executes Automation #3 directly when triggered via workflows execute', async () => {
    const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
    const res = await controller.executeWorkflow('automation-3-sales-research', req, { limit: 5 });

    expect(res.status).toBe('COMPLETED');
    expect(res.automationId).toBe('automation-3-sales-research');
    expect(research.researchCompanyLeads).toHaveBeenCalledWith(
      'comp-101',
      expect.objectContaining({ limit: 5 })
    );
  });

  describe('Automation #4 — Outreach & Follow-up Endpoints', () => {
    it('handles webhook/outreach callback and delegates to outreach service', async () => {
      const req = { user: { companyId: 'comp-101' } };
      const res = await controller.outreachWebhook(req, { limit: 5, channel: 'EMAIL' });

      expect(res.success).toBe(true);
      expect(outreach.processCompanyLeads).toHaveBeenCalledWith(
        'comp-101',
        expect.objectContaining({ limit: 5, channel: 'EMAIL' })
      );
    });

    it('drafts outreach for a specific lead via outreach/draft', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
      const res = await controller.draftOutreach(req, { leadId: 'lead-1', channel: 'EMAIL' });

      expect(res.status).toBe('APPROVAL_PENDING');
      expect(outreach.generateOutreachDraft).toHaveBeenCalledWith(
        'comp-101',
        'lead-1',
        expect.objectContaining({ channel: 'EMAIL' })
      );
    });

    it('rejects outreach draft request without leadId', async () => {
      const req = { user: { companyId: 'comp-101' } };
      await expect(controller.draftOutreach(req, { leadId: '' })).rejects.toThrow(BadRequestException);
    });

    it('approves outreach draft via outreach/approve', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'reviewer-1' } };
      const res = await controller.approveOutreach(req, { leadId: 'lead-1', reason: 'Reviewed and approved' });

      expect(res.status).toBe('APPROVED');
      expect(outreach.approveDraft).toHaveBeenCalledWith(
        'comp-101',
        'lead-1',
        expect.objectContaining({ reason: 'Reviewed and approved' })
      );
    });

    it('rejects outreach draft via outreach/reject', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'reviewer-1' } };
      const res = await controller.rejectOutreach(req, { leadId: 'lead-1', reason: 'Not a good fit' });

      expect(res.status).toBe('REJECTED');
      expect(outreach.rejectDraft).toHaveBeenCalledWith(
        'comp-101',
        'lead-1',
        expect.objectContaining({ reason: 'Not a good fit' })
      );
    });

    it('edits outreach draft via outreach/edit', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'editor-1' } };
      const res = await controller.editOutreach(req, {
        leadId: 'lead-1',
        subject: 'Edited Subject',
        body: 'Edited Body',
      });

      expect(res.status).toBe('APPROVAL_PENDING');
      expect(outreach.editDraft).toHaveBeenCalledWith(
        'comp-101',
        'lead-1',
        expect.objectContaining({ subject: 'Edited Subject', body: 'Edited Body' })
      );
    });

    it('rejects outreach edit request without subject or body', async () => {
      const req = { user: { companyId: 'comp-101' } };
      await expect(controller.editOutreach(req, { leadId: 'lead-1', subject: '', body: '' })).rejects.toThrow(BadRequestException);
    });

    it('safeguards outreach/send request through sendOutreach', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
      const res = await controller.sendOutreach(req, { leadId: 'lead-1' });

      expect(res.status).toBe('BLOCKED_BY_SAFEGUARD');
      expect(res.deliveryStatus).toBe('DISABLED');
      expect(outreach.sendOutreach).toHaveBeenCalledWith('comp-101', 'lead-1', expect.any(Object));
    });

    it('retrieves outreach status summary via outreach/status', async () => {
      const req = { user: { companyId: 'comp-101' } };
      const res = await controller.getOutreachStatus(req);

      expect(res.companyId).toBe('comp-101');
      expect(res.draftsTotal).toBe(2);
      expect(outreach.getOutreachStatus).toHaveBeenCalledWith('comp-101');
    });

    it('executes Automation #4 directly when triggered via workflows execute', async () => {
      const req = { user: { companyId: 'comp-101', userId: 'user-1' } };
      const res = await controller.executeWorkflow('automation-4-sales-outreach', req, { limit: 5, channel: 'EMAIL' });

      expect(res.status).toBe('COMPLETED');
      expect(res.automationId).toBe('automation-4-sales-outreach');
      expect(outreach.processCompanyLeads).toHaveBeenCalledWith(
        'comp-101',
        expect.objectContaining({ limit: 5, channel: 'EMAIL' })
      );
    });
  });
});


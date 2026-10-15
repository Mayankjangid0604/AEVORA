import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationRegistryService } from './automation-registry.service';
import { N8nClientService } from './n8n-client.service';
import { LeadNormalizerService } from './lead-normalizer.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { IntegrationApiKeyGuard } from '../authorization/integration-api-key.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('AutomationController — REST Endpoints', () => {
  let controller: AutomationController;
  let registry: AutomationRegistryService;
  let normalizer: LeadNormalizerService;
  let n8nClient: N8nClientService;

  beforeEach(async () => {
    registry = new AutomationRegistryService();

    const n8nMock = {
      getStatus: jest.fn().mockResolvedValue({ configured: false, connected: false }),
      isConfigured: jest.fn().mockReturnValue(false),
      deployWorkflow: jest.fn().mockResolvedValue({ deployed: true, n8nWorkflowId: 'wf-1' }),
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationController],
      providers: [
        { provide: AutomationRegistryService, useValue: registry },
        { provide: N8nClientService, useValue: n8nMock },
        { provide: LeadNormalizerService, useValue: normalizerMock },
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
  });

  it('lists registered automations with n8n connection status', async () => {
    const list = await controller.listWorkflows();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);

    const auto1 = list.find((a) => a.number === 1);
    expect(auto1).toBeDefined();
    expect(auto1?.name).toBe('Generate Leads with Google Maps');
    expect(auto1?.n8nConnection).toBeDefined();
  });

  it('retrieves detailed workflow definition by id', async () => {
    const auto = await controller.getWorkflow('automation-1-google-lead-finding');
    expect(auto.id).toBe('automation-1-google-lead-finding');
    expect(auto.inputParameters.category).toBeDefined();
    expect(auto.inputParameters.location).toBeDefined();
  });

  it('processes incoming leads from n8n webhook', async () => {
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
    expect(normalizer.ingestLeads).toHaveBeenCalledWith(
      'comp-101',
      payload.records,
      expect.objectContaining({ category: 'restaurant', location: 'Jaipur' })
    );
  });

  it('rejects lead webhook with empty records array', async () => {
    const req = { user: { companyId: 'comp-101' } };
    await expect(
      controller.ingestLeadsWebhook(req, { records: [] })
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects execution when category or location is missing', async () => {
    const req = { user: { companyId: 'comp-101' } };
    await expect(
      controller.executeWorkflow('automation-1-google-lead-finding', req, { category: '', location: 'Jaipur' })
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects execution when neither Google Places key nor n8n is configured', async () => {
    const req = { user: { companyId: 'comp-101' } };
    const originalKey = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;

    try {
      await expect(
        controller.executeWorkflow('automation-1-google-lead-finding', req, { category: 'gym', location: 'Mumbai' })
      ).rejects.toThrow(/Execution blocked: Neither GOOGLE_PLACES_API_KEY nor n8n API connection is configured/);
    } finally {
      process.env.GOOGLE_PLACES_API_KEY = originalKey;
    }
  });

  it('dispatches live execution via n8nClient when configured', async () => {
    (n8nClient.isConfigured as jest.Mock).mockReturnValue(true);
    (n8nClient as any).executeWorkflow = jest.fn().mockResolvedValue({
      executed: true,
      automationId: 'automation-1-google-lead-finding',
      result: { created: 3, duplicates: 0, count: 3 },
    });

    const req = { user: { companyId: 'comp-101' } };
    const res = await controller.executeWorkflow('automation-1-google-lead-finding', req, {
      category: 'dentists',
      location: 'Dallas, TX',
      maxResults: 5,
    });

    expect(res.status).toBe('COMPLETED');
    expect(res.result).toEqual({ created: 3, duplicates: 0, count: 3 });
    expect((n8nClient as any).executeWorkflow).toHaveBeenCalledWith(
      'automation-1-google-lead-finding',
      expect.objectContaining({ category: 'dentists', location: 'Dallas, TX', companyId: 'comp-101' })
    );
  });
});

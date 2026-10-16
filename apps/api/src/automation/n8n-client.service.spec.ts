import { BadRequestException } from '@nestjs/common';
import { N8nClientService } from './n8n-client.service';
import { AutomationRegistryService } from './automation-registry.service';

describe('N8nClientService — n8n API Integration & Workflow Deployment', () => {
  let service: N8nClientService;
  let registry: AutomationRegistryService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    registry = new AutomationRegistryService();
    service = new N8nClientService(registry);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports unconfigured status safely when N8N_API_URL or N8N_API_KEY is missing', async () => {
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;

    const status = await service.getStatus();
    expect(status.configured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.error).toContain('not configured');
  });

  it('refuses to deploy workflow when n8n API connection is not configured', async () => {
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;

    await expect(
      service.deployWorkflow('automation-1-google-lead-finding')
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.deployWorkflow('automation-1-google-lead-finding')
    ).rejects.toThrow(/n8n API connection is not configured/);
  });

  it('probes n8n connection when configured and handles offline server gracefully', async () => {
    process.env.N8N_API_URL = 'http://127.0.0.1:5678';
    process.env.N8N_API_KEY = 'test-n8n-key-12345';

    // Mock global fetch to simulate unreachable n8n instance
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      const status = await service.getStatus();
      expect(status.configured).toBe(true);
      expect(status.connected).toBe(false);
      expect(status.error).toContain('ECONNREFUSED');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('successfully creates workflow via n8n REST API when reachable', async () => {
    process.env.N8N_API_URL = 'http://127.0.0.1:5678';
    process.env.N8N_API_KEY = 'test-n8n-key-12345';

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/v1/workflows?limit=100')) {
        return {
          ok: true,
          json: async () => ({ data: [] }),
        };
      }
      if (url.includes('/api/v1/workflows') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 'n8n-wf-101', name: 'Generate Leads with Google Maps', active: false }),
        };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    });

    try {
      const result = await service.deployWorkflow('automation-1-google-lead-finding');
      expect(result.deployed).toBe(true);
      expect(result.n8nWorkflowId).toBe('n8n-wf-101');
      expect(result.message).toContain('created new');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('refuses to execute workflow when n8n is not configured', async () => {
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;

    await expect(
      service.executeWorkflow('automation-1-google-lead-finding', {
        category: 'dentists',
        location: 'Dallas, TX',
        companyId: 'comp-101',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('triggers n8n webhook and returns execution result when configured', async () => {
    process.env.N8N_API_URL = 'http://127.0.0.1:5678';
    process.env.N8N_API_KEY = 'test-n8n-key-12345';

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/webhook/aevora-leads-trigger') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            companyId: 'comp-101',
            created: 3,
            duplicates: 0,
            count: 3,
          }),
        };
      }
      return { ok: false, status: 500, text: async () => 'Internal Error' };
    });

    try {
      const res = await service.executeWorkflow('automation-1-google-lead-finding', {
        category: 'dentists',
        location: 'Dallas, TX',
        maxResults: 3,
        companyId: 'comp-101',
      });

      expect(res.executed).toBe(true);
      expect(res.result?.created).toBe(3);
      expect(res.result?.count).toBe(3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles n8n execution errors gracefully without crashing', async () => {
    process.env.N8N_API_URL = 'http://127.0.0.1:5678';
    process.env.N8N_API_KEY = 'test-n8n-key-12345';

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection timed out'));

    try {
      const res = await service.executeWorkflow('automation-1-google-lead-finding', {
        category: 'dentists',
        location: 'Dallas, TX',
        companyId: 'comp-101',
      });

      expect(res.executed).toBe(false);
      expect(res.error).toContain('Connection timed out');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

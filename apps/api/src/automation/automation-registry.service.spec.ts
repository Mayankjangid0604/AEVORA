import { AutomationRegistryService } from './automation-registry.service';

describe('AutomationRegistryService — Automation #1 (Google Maps Lead Finding)', () => {
  let service: AutomationRegistryService;

  beforeEach(() => {
    service = new AutomationRegistryService();
  });

  it('registers Automation #1 with complete metadata and schema', () => {
    const automations = service.listAutomations();
    expect(automations.length).toBeGreaterThanOrEqual(1);

    const auto1 = automations.find((a) => a.number === 1);
    expect(auto1).toBeDefined();
    expect(auto1?.id).toBe('automation-1-google-lead-finding');
    expect(auto1?.name).toBe('Generate Leads with Google Maps');
    expect(auto1?.category).toBe('LEAD_GENERATION');
    expect(auto1?.workflowFile).toBe('n8n/1.google-lead-finding.json');
  });

  it('successfully locates, parses, and validates n8n/1.google-lead-finding.json', () => {
    const auto1 = service.getAutomation('automation-1-google-lead-finding');
    expect(auto1.metadata.validationErrors).toBeUndefined();
    expect(auto1.metadata.nodeCount).toBe(4);
    expect(auto1.metadata.triggers).toContain('Aevora Trigger Webhook');
    expect(auto1.metadata.gmapsEndpoint).toBe('https://places.googleapis.com/v1/places:searchText');
  });

  it('defines valid input parameters and types', () => {
    const auto1 = service.getAutomation(1);
    expect(auto1.inputParameters.category).toBeDefined();
    expect(auto1.inputParameters.category.required).toBe(true);
    expect(auto1.inputParameters.location).toBeDefined();
    expect(auto1.inputParameters.location.required).toBe(true);
    expect(auto1.inputParameters.radiusMeters).toBeDefined();
    expect(auto1.inputParameters.maxResults).toBeDefined();
  });

  it('defines required credentials and tracks their configuration state', () => {
    const auto1 = service.getAutomation(1);
    expect(auto1.requiredCredentials.googlePlacesApi).toBeDefined();
    expect(auto1.requiredCredentials.googlePlacesApi.envVar).toBe('GOOGLE_PLACES_API_KEY');
    expect(auto1.requiredCredentials.n8nApiConnection).toBeDefined();
    expect(auto1.requiredCredentials.aevoraIntegrationAuth).toBeDefined();
    expect(typeof auto1.requiredCredentials.googlePlacesApi.configured).toBe('boolean');
  });

  it('loads raw workflow JSON structure correctly', () => {
    const json = service.loadWorkflowJson('automation-1-google-lead-finding');
    expect(json).toBeDefined();
    expect(json.name).toBe('Automation #1 - Google Maps Lead Finding (Live)');
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.nodes.length).toBe(4);

    const gmapsNode = json.nodes.find((n: any) => n.name === 'Google Places API v1');
    expect(gmapsNode).toBeDefined();
    expect(gmapsNode.type).toBe('n8n-nodes-base.httpRequest');
    expect(gmapsNode.parameters.method).toBe('POST');
  });

  it('throws NotFoundException for unregistered automation ID', () => {
    expect(() => service.getAutomation('non-existent-automation')).toThrow(
      /Automation "non-existent-automation" not found/
    );
  });

  describe('Automation #3 (AI Sales Research & Opportunity Scoring)', () => {
    it('registers Automation #3 with complete metadata and schema', () => {
      const automations = service.listAutomations();
      expect(automations.length).toBeGreaterThanOrEqual(3);

      const auto3 = automations.find((a) => a.number === 3);
      expect(auto3).toBeDefined();
      expect(auto3?.id).toBe('automation-3-sales-research');
      expect(auto3?.name).toBe('AI Sales Research & Opportunity Scoring');
      expect(auto3?.category).toBe('SALES');
      expect(auto3?.workflowFile).toBe('n8n/3.ai-sales-research-opportunity-scoring.json');
    });

    it('locates and validates n8n/3.ai-sales-research-opportunity-scoring.json', () => {
      const auto3 = service.getAutomation('automation-3-sales-research');
      expect(auto3.metadata.validationErrors).toBeUndefined();
      expect(auto3.metadata.nodeCount).toBeGreaterThan(0);
      expect(auto3.requiredCredentials.ollamaLocalInference).toBeDefined();
      expect(auto3.requiredCredentials.n8nApiConnection).toBeDefined();
      expect(auto3.requiredCredentials.aevoraIntegrationAuth).toBeDefined();
    });

    it('loads raw workflow JSON for Automation #3 correctly', () => {
      const json = service.loadWorkflowJson('automation-3-sales-research');
      expect(json).toBeDefined();
      expect(Array.isArray(json.nodes)).toBe(true);
    });
  });

  describe('Automation #4 (AI Sales Outreach & Follow-up)', () => {
    it('registers Automation #4 with complete metadata and schema', () => {
      const automations = service.listAutomations();
      expect(automations.length).toBeGreaterThanOrEqual(4);

      const auto4 = automations.find((a) => a.number === 4);
      expect(auto4).toBeDefined();
      expect(auto4?.id).toBe('automation-4-sales-outreach');
      expect(auto4?.name).toBe('AI Sales Outreach & Follow-up with Ollama');
      expect(auto4?.category).toBe('SALES');
      expect(auto4?.workflowFile).toBe('n8n/4.ai-sales-outreach-follow-up.json');
    });

    it('locates and validates n8n/4.ai-sales-outreach-follow-up.json', () => {
      const auto4 = service.getAutomation('automation-4-sales-outreach');
      expect(auto4.metadata.validationErrors).toBeUndefined();
      expect(auto4.metadata.nodeCount).toBeGreaterThan(0);
      expect(auto4.requiredCredentials.ollamaLocalInference).toBeDefined();
      expect(auto4.requiredCredentials.n8nApiConnection).toBeDefined();
      expect(auto4.requiredCredentials.aevoraIntegrationAuth).toBeDefined();
    });

    it('loads raw workflow JSON for Automation #4 correctly and verifies zero retention settings', () => {
      const json = service.loadWorkflowJson('automation-4-sales-outreach');
      expect(json).toBeDefined();
      expect(Array.isArray(json.nodes)).toBe(true);
      expect(json.settings.saveDataSuccessExecution).toBe('none');
      expect(json.settings.saveDataErrorExecution).toBe('none');
    });
  });
});


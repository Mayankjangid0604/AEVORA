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
    expect(auto1.metadata.nodeCount).toBe(42);
    expect(auto1.metadata.triggers).toContain('When clicking "Execute Workflow"');
    expect(auto1.metadata.triggers).toContain('Run workflow every hours');
    expect(auto1.metadata.triggers).toContain('Execute Workflow Trigger');
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
    expect(json.name).toBe('Generate Leads with Google Maps - AlexK1919');
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.nodes.length).toBe(42);

    const gmapsNode = json.nodes.find((n: any) => n.name === 'GMaps API');
    expect(gmapsNode).toBeDefined();
    expect(gmapsNode.type).toBe('n8n-nodes-base.httpRequest');
    expect(gmapsNode.parameters.method).toBe('POST');
  });

  it('throws NotFoundException for unregistered automation ID', () => {
    expect(() => service.getAutomation('non-existent-automation')).toThrow(
      /Automation "non-existent-automation" not found/
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { LeadSearchService, LeadSearchQuery } from './lead-search.service';

describe('LeadSearchService — V13.5 Fail-Closed Critical Path', () => {
  let service: LeadSearchService;
  const originalEnv = process.env;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadSearchService],
    }).compile();

    service = module.get<LeadSearchService>(LeadSearchService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const query: LeadSearchQuery = {
    category: 'restaurant',
    location: 'Connaught Place, New Delhi',
    maxResults: 5,
  };

  it('1. Google provider succeeds → real provider data flows through', async () => {
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    delete process.env.LEAD_GEN_SOURCE;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'places/ChIJRealBusiness123',
            displayName: { text: 'Real Delhi Bistro' },
            formattedAddress: '12 Connaught Place, New Delhi',
            websiteUri: 'https://realdelhibistro.com',
            nationalPhoneNumber: '+91 11 2345 6789',
            editorialSummary: { text: 'Authentic North Indian cuisine' },
            userRatingCount: 150,
            location: { latitude: 28.6315, longitude: 77.2167 },
          },
        ],
      }),
    });

    // Mock website scrape
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Contact us at info@realdelhibistro.com</body></html>',
    });

    const results = await service.search(query);

    expect(results).toHaveLength(1);
    expect(results[0].businessName).toBe('Real Delhi Bistro');
    expect(results[0].googlePlaceId).toBe('places/ChIJRealBusiness123');
    expect(results[0].website).toBe('https://realdelhibistro.com');
    expect(results[0].reviewCount).toBe(150);
  });

  it('2. Google provider fails → no synthetic business is generated (fails closed)', async () => {
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    delete process.env.LEAD_GEN_SOURCE;

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Request had insufficient authentication scopes.',
    });

    await expect(service.search(query)).rejects.toThrow(
      /Google Places API request failed with status 403/,
    );

    // Verify it NEVER called mock generator or returned fake leads
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('3. Missing provider configuration → fails safely without generating synthetic leads', async () => {
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'true';
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.LEAD_GEN_SOURCE;

    await expect(service.search(query)).rejects.toThrow(
      /Google Places API key is missing/,
    );

    // Also test provider disabled
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'false';
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';

    await expect(service.search(query)).rejects.toThrow(
      /Google Places provider is disabled/,
    );
  });

  it('4. Invalid provider response → fails safely without fallback to fake leads', async () => {
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    delete process.env.LEAD_GEN_SOURCE;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: { code: 400, message: 'Invalid field mask' },
      }),
    });

    await expect(service.search(query)).rejects.toThrow(
      /Google Places API returned error/,
    );
  });

  it('5. Provider provenance remains intact (preserves googlePlaceId)', async () => {
    process.env.LEAD_GEN_PROVIDER_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    delete process.env.LEAD_GEN_SOURCE;

    const testPlaceId = 'places/ChIJVerifiedProviderId999';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          {
            id: testPlaceId,
            displayName: { text: 'Provenance Test Business' },
            formattedAddress: 'Sector 18, Noida',
            websiteUri: null,
            nationalPhoneNumber: '+91 120 4567890',
            userRatingCount: 42,
          },
        ],
      }),
    });

    const results = await service.search(query);
    expect(results).toHaveLength(1);
    expect(results[0].googlePlaceId).toBe(testPlaceId);
    expect(results[0].googlePlaceId.startsWith('mock-')).toBe(false);
  });
});

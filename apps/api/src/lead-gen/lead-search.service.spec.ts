import { Test, TestingModule } from '@nestjs/testing';
import {
  LeadSearchService,
  LeadSearchQuery,
  scoreLead,
  scoreFactors,
} from './lead-search.service';

describe('LeadSearchService — Primary Lead Source Migration', () => {
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

  it('1. Legacy direct Google Places search in LeadSearchService is retired in favor of Automation #1 (n8n)', async () => {
    delete process.env.LEAD_GEN_SOURCE;

    await expect(service.search(query)).rejects.toThrow(
      /Direct Google Places search in LeadSearchService is retired\. Google Maps lead finding routes via Automation #1 \(n8n\)/
    );
  });

  it('2. OpenStreetMap provider searches continue to work', async () => {
    process.env.LEAD_GEN_SOURCE = 'osm';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 12345,
          name: 'Delhi Cafe',
          display_name: 'Connaught Place, New Delhi, India',
          class: 'amenity',
          type: 'cafe',
          lat: '28.6315',
          lon: '77.2167',
        },
      ],
    });

    const results = await service.search(query);
    expect(results).toHaveLength(1);
    expect(results[0].businessName).toBe('Delhi Cafe');
    expect(results[0].googlePlaceId).toBe('osm-nom-12345');
    expect(results[0].qualityScore).toBeGreaterThanOrEqual(20);
  });

  it('3. Mock provider works explicitly in test environment', async () => {
    process.env.LEAD_GEN_SOURCE = 'mock';
    process.env.NODE_ENV = 'development';

    const results = await service.search(query);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].googlePlaceId).toMatch(/^mock-/);
  });

  it('4. Mock provider is strictly blocked in production', async () => {
    process.env.LEAD_GEN_SOURCE = 'mock';
    process.env.NODE_ENV = 'production';

    await expect(service.search(query)).rejects.toThrow(
      /Mock lead discovery provider is strictly prohibited in production/,
    );
  });

  it('5. Score algorithm evaluates lead signals correctly', () => {
    const fullLead = {
      phone: '+1 214 555 1234',
      email: 'owner@dentist.com',
      website: null,
      reviewCount: 150,
    };
    expect(scoreFactors(fullLead)).toEqual({
      hasPhone: 25,
      hasEmail: 25,
      noWebsite: 30,
      reviews: 15,
    });
    expect(scoreLead(fullLead)).toBe(95);

    const minimalLead = {
      phone: null,
      email: null,
      website: 'https://existing.com',
      reviewCount: 0,
    };
    expect(scoreLead(minimalLead)).toBe(0);
  });
});

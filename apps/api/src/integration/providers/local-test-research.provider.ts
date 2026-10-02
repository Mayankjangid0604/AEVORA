import { Injectable } from '@nestjs/common';
import { ResearchProvider, ResearchQuery, ResearchResultData } from './research-provider.interface';

@Injectable()
export class LocalTestResearchProvider implements ResearchProvider {
  async search(query: ResearchQuery): Promise<ResearchResultData[]> {
    // Generate deterministic test data based on query
    return [
      {
        businessName: `Test Business for ${query.query}`,
        website: 'https://example.com',
        industry: query.industry || 'Technology',
        location: query.location || 'Test City',
        source: 'LocalTestProvider',
        sourceUrl: 'local://test',
        contactInfo: [
          { name: 'John Doe', email: 'john@example.com', role: 'CEO', confidence: 95 }
        ],
        qualificationHypothesis: `Strong fit based on the query: ${query.query}`,
        confidence: 85,
        evidence: { testMode: true, rawQuery: query }
      }
    ];
  }
}

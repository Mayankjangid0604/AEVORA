import { Injectable, Logger } from '@nestjs/common';
import { ResearchProvider, ResearchQuery, ResearchResultData } from './research-provider.interface';

@Injectable()
export class ExternalSearchProvider implements ResearchProvider {
  private readonly logger = new Logger(ExternalSearchProvider.name);
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.RESEARCH_API_KEY || '';
  }

  async search(query: ResearchQuery): Promise<ResearchResultData[]> {
    if (!this.apiKey) {
      throw new Error('Production research provider is not configured properly (missing RESEARCH_API_KEY).');
    }

    this.logger.log(`[EXTERNAL RESEARCH] Researching query: ${query.query}`);

    try {
      // In a real implementation, we would call an external API (e.g. SERP, Clearbit, or a scraping service)
      // Since we don't have the explicit API selected by the user, we'll mock the external call structure
      // but ensure it fails safely if the network request were real.
      
      const response = await fetch('https://api.example.com/v1/research', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.query, industry: query.industry }),
      });

      if (!response.ok) {
        throw new Error(`Research API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Map external data to our ResearchResultData
      return data.results.map((r: any) => ({
        businessName: r.name,
        website: r.website,
        industry: r.industry,
        location: r.location,
        source: 'ExternalSearchAPI',
        sourceUrl: r.url,
        contactInfo: r.contacts || [],
        qualificationHypothesis: `Extracted via External API for ${query.query}`,
        confidence: r.confidence || 70,
        evidence: { rawData: r }
      }));
    } catch (error) {
      this.logger.error(`[EXTERNAL RESEARCH] Failed: ${error.message}`);
      throw error; // Fail safely as requested
    }
  }
}

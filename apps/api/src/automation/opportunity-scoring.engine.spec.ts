import { OpportunityScoringEngine } from './opportunity-scoring.engine';
import { OpportunityScoringInput } from './opportunity-scoring.engine';

describe('OpportunityScoringEngine', () => {
  let engine: OpportunityScoringEngine;

  beforeEach(() => {
    engine = new OpportunityScoringEngine();
  });

  describe('Component Weights and Math', () => {
    it('weights sum exactly to 1.0 (100%)', () => {
      const sum =
        OpportunityScoringEngine.WEIGHTS.commercialFit +
        OpportunityScoringEngine.WEIGHTS.digitalModernization +
        OpportunityScoringEngine.WEIGHTS.operationalMaturity +
        OpportunityScoringEngine.WEIGHTS.contactability +
        OpportunityScoringEngine.WEIGHTS.serviceExpansion;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('calculates weighted score within [0, 100]', () => {
      const input: OpportunityScoringInput = {
        leadName: 'Midtown Family Dentistry',
        industry: 'Dentist',
        website: 'https://www.midtowndentistrydallas.com',
        contactPhone: '(469) 529-6016',
        contactEmail: 'contact@midtowndentistrydallas.com',
        emailVerification: {
          email: 'contact@midtowndentistrydallas.com',
          status: 'VALID_SYNTAX_MX',
          syntaxValid: true,
          domain: 'midtowndentistrydallas.com',
          mxFound: true,
          mxRecords: ['mail.midtowndentistrydallas.com'],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: true,
          notes: 'Valid',
          verifiedAt: new Date().toISOString(),
        },
        reachability: {
          checked: true,
          reachable: true,
          statusCode: 200,
          responseTimeMs: 1450,
        },
        extractedFacts: {
          businessDescription: 'Full service dental clinic offering family and emergency dental care.',
          services: [
            'Checkup and Cleaning',
            'Invisalign',
            'Dental Implants',
            'Root Canal',
            'Pediatric Dentistry',
            'Emergency Dental Care',
          ],
          contactEmails: ['contact@midtowndentistrydallas.com'],
          contactPhones: ['(469) 529-6016'],
          socialLinks: {
            facebook: 'https://facebook.com/midtown',
            instagram: 'https://instagram.com/midtown',
          },
          businessSignals: {
            onlineBookingAvailable: false,
            hasContactForm: false,
            yearsInBusiness: 6,
          },
          idealCustomerProfile: 'Families seeking comprehensive dental care in Dallas.',
          enrichmentSummary: 'Midtown Family Dentistry offers complete dental solutions.',
        },
      };

      const result = engine.calculateOpportunityScore(input);

      expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(result.opportunityScore).toBeLessThanOrEqual(100);
      expect(result.priority).toBe('HIGH');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.scoringVersion).toBe('1.0.0');

      // Verify each component has correct weight
      expect(result.components.commercialFit.weight).toBe(0.25);
      expect(result.components.digitalModernization.weight).toBe(0.25);
      expect(result.components.operationalMaturity.weight).toBe(0.20);
      expect(result.components.contactability.weight).toBe(0.15);
      expect(result.components.serviceExpansion.weight).toBe(0.15);
    });
  });

  describe('Priority Boundaries', () => {
    it('classifies scores >= 75 as HIGH', () => {
      expect(engine.classifyPriority(75)).toBe('HIGH');
      expect(engine.classifyPriority(80)).toBe('HIGH');
      expect(engine.classifyPriority(100)).toBe('HIGH');
    });

    it('classifies scores 50-74 as MEDIUM', () => {
      expect(engine.classifyPriority(74)).toBe('MEDIUM');
      expect(engine.classifyPriority(50)).toBe('MEDIUM');
      expect(engine.classifyPriority(65)).toBe('MEDIUM');
    });

    it('classifies scores 0-49 as LOW', () => {
      expect(engine.classifyPriority(49)).toBe('LOW');
      expect(engine.classifyPriority(25)).toBe('LOW');
      expect(engine.classifyPriority(0)).toBe('LOW');
    });
  });

  describe('Missing Evidence & Neutral Baseline Behavior', () => {
    it('does not penalize missing industry/services as negative fit', () => {
      const input: OpportunityScoringInput = {
        leadName: 'Acme Commercial Entity',
        industry: null,
        extractedFacts: null,
      };

      const result = engine.calculateOpportunityScore(input);
      // Neutral commercial fit baseline is 50
      expect(result.components.commercialFit.score).toBe(50);
      expect(result.components.commercialFit.signals).toContain(
        'Industry and services unverified; neutral baseline applied without penalty'
      );
    });

    it('does not treat missing website as proof of modernization problems', () => {
      const input: OpportunityScoringInput = {
        leadName: 'Legacy Workshop',
        website: null,
        reachability: null,
        extractedFacts: null,
      };

      const result = engine.calculateOpportunityScore(input);
      // When website is unverified, modernization score is neutral (40) rather than artificially high
      expect(result.components.digitalModernization.score).toBe(40);
      expect(result.components.digitalModernization.signals).toContain(
        'Website unverified or absent; missing evidence not treated as confirmed problem (neutral 40)'
      );
    });

    it('does not inflate scores based on Google review counts or arbitrary data volume', () => {
      const baseInput: OpportunityScoringInput = {
        leadName: 'Dr. John Dental',
        industry: 'Dentist',
        contactPhone: '555-0100',
        placeScoreFactors: { reviews: 0 },
      };

      const highReviewInput: OpportunityScoringInput = {
        ...baseInput,
        placeScoreFactors: { reviews: 5000 },
      };

      const baseScore = engine.calculateOpportunityScore(baseInput);
      const highReviewScore = engine.calculateOpportunityScore(highReviewInput);

      // Review count alone must not independently inflate opportunity scores
      expect(baseScore.opportunityScore).toBe(highReviewScore.opportunityScore);
    });
  });

  describe('Confidence Calculation', () => {
    it('calculates low confidence for sparse lead data', () => {
      const sparseInput: OpportunityScoringInput = {
        leadName: 'Unknown Business',
      };
      const confidence = engine.calculateConfidence(sparseInput);
      expect(confidence).toBe(20);
    });

    it('calculates high confidence for fully enriched lead with verified MX and crawl', () => {
      const richInput: OpportunityScoringInput = {
        leadName: 'Apex Dental',
        website: 'https://apexdental.com',
        contactPhone: '555-0100',
        contactEmail: 'hi@apexdental.com',
        emailVerification: {
          email: 'hi@apexdental.com',
          status: 'VALID_SYNTAX_MX',
          syntaxValid: true,
          domain: 'apexdental.com',
          mxFound: true,
          mxRecords: ['mx.apexdental.com'],
          verificationMethod: 'DNS_MX',
          isDeliverableInbox: true,
          notes: 'Valid',
          verifiedAt: new Date().toISOString(),
        },
        reachability: {
          checked: true,
          reachable: true,
          statusCode: 200,
        },
        extractedFacts: {
          businessDescription: 'Dental practice in Austin',
          services: ['Cleaning', 'Whitening'],
          contactEmails: ['hi@apexdental.com'],
          contactPhones: ['555-0100'],
          socialLinks: {},
          businessSignals: {},
        },
      };

      const confidence = engine.calculateConfidence(richInput);
      expect(confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Configurable ICP Matching & Zero Industry Bias', () => {
    const makeFacts = (services: string[]) => ({
      businessDescription: 'Commercial business offering standard services.',
      services,
      contactEmails: [],
      contactPhones: [],
      socialLinks: {},
      businessSignals: {},
    });

    it('shows zero industry bias when ICP configuration is omitted', () => {
      const dentalLead: OpportunityScoringInput = {
        leadName: 'Midtown Dental Clinic',
        industry: 'Dentistry',
        extractedFacts: makeFacts(['Cleaning', 'Whitening', 'Extraction']),
      };

      const softwareLead: OpportunityScoringInput = {
        leadName: 'Midtown Cloud Systems',
        industry: 'Software & Technology',
        extractedFacts: makeFacts(['Cloud Hosting', 'Data Backup', 'Migration']),
      };

      const plumbingLead: OpportunityScoringInput = {
        leadName: 'Midtown Plumbing & Pipe',
        industry: 'Plumbing Services',
        extractedFacts: makeFacts(['Drain Cleaning', 'Pipe Repair', 'Water Heater']),
      };

      const dentalResult = engine.calculateOpportunityScore(dentalLead);
      const softwareResult = engine.calculateOpportunityScore(softwareLead);
      const plumbingResult = engine.calculateOpportunityScore(plumbingLead);

      // Equivalent evidence must produce exactly identical commercial fit scores
      expect(dentalResult.components.commercialFit.score).toBe(70);
      expect(softwareResult.components.commercialFit.score).toBe(70);
      expect(plumbingResult.components.commercialFit.score).toBe(70);
      expect(dentalResult.components.commercialFit.score).toBe(softwareResult.components.commercialFit.score);
    });

    it('different industries receive the same commercial-fit baseline when evidence and configuration are equivalent', () => {
      const industries = ['Legal', 'Veterinary', 'Roofing', 'Accounting', 'Dentistry', 'Manufacturing'];
      const scores = industries.map((ind) => {
        const res = engine.calculateOpportunityScore({
          leadName: `Acme ${ind}`,
          industry: ind,
          extractedFacts: makeFacts(['Service 1', 'Service 2', 'Service 3']),
        });
        return res.components.commercialFit.score;
      });

      // All industries must receive the exact same score (50 base + 10 verified industry + 10 service depth = 70)
      expect(new Set(scores).size).toBe(1);
      expect(scores[0]).toBe(70);
    });

    it('explicit ICP configuration affects the relevant scoring component only when supplied', () => {
      const inputWithoutIcp: OpportunityScoringInput = {
        leadName: 'Dallas Precision Machining',
        industry: 'Advanced Manufacturing',
        extractedFacts: {
          businessDescription: 'Precision CNC machining and rapid prototyping services.',
          services: ['CNC Milling', 'Turning', 'Prototyping', 'Assembly'],
          contactEmails: [],
          contactPhones: [],
          socialLinks: {},
          businessSignals: {},
        },
      };

      const inputWithIcp: OpportunityScoringInput = {
        ...inputWithoutIcp,
        icpConfig: {
          targetIndustries: ['Advanced Manufacturing'],
          targetKeywords: ['prototyping', 'machining'],
          minServiceLines: 3,
        },
      };

      const score1 = engine.calculateOpportunityScore(inputWithoutIcp);
      const score2 = engine.calculateOpportunityScore(inputWithIcp);

      expect(score2.components.commercialFit.score).toBeGreaterThan(
        score1.components.commercialFit.score
      );
      expect(score2.components.commercialFit.signals).toContain(
        'Explicit match with configured tenant ICP target industries (+20)'
      );
      expect(score2.components.commercialFit.signals.some((s) => s.includes('Matches configured tenant ICP target keywords'))).toBe(true);
      expect(score2.components.commercialFit.signals.some((s) => s.includes('Meets configured tenant ICP minimum service lines'))).toBe(true);
    });

    it('missing evidence remains explicitly recorded without penalizing lack of fit', () => {
      const sparseLead: OpportunityScoringInput = {
        leadName: 'Anonymous Commercial Entity',
        industry: null,
        extractedFacts: null,
      };

      const result = engine.calculateOpportunityScore(sparseLead);
      expect(result.components.commercialFit.score).toBe(50);
      expect(result.components.commercialFit.signals).toContain(
        'Industry and services unverified; neutral baseline applied without penalty'
      );
    });
  });

  describe('Recommendation Classification', () => {
    it('recommends QUALIFIED for high score with good confidence', () => {
      expect(engine.classifyRecommendation(78, 80)).toBe('QUALIFIED');
    });

    it('recommends NEEDS_MORE_INFO if confidence is insufficient regardless of score', () => {
      expect(engine.classifyRecommendation(85, 30)).toBe('NEEDS_MORE_INFO');
    });

    it('recommends DISQUALIFIED if score is very low', () => {
      expect(engine.classifyRecommendation(30, 80)).toBe('DISQUALIFIED');
    });
  });
});

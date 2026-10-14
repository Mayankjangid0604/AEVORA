import { Test, TestingModule } from '@nestjs/testing';
import { OfferMarketService } from './offer-market.service';
import { OfferFinancialIntelligenceService } from './offer-financial-intelligence.service';
import { OfferEvaluationService } from './offer-evaluation.service';
import { OfferGovernanceService } from './offer-governance.service';
import { OfferMarketingIntegrationService } from './offer-marketing-integration.service';
import { OfferMeasurementOptimizationService } from './offer-measurement-optimization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalActionGatewayService } from '../external-action-gateway/external-action-gateway.service';
import {
  DiscountType,
  EpistemicReliability,
  OfferCreatorRole,
  OfferStatus,
  OptimizationAction,
  RecommendationVerdict,
} from './offer-market.types';
import { AuthorityTier } from '../governance/authority-context.types';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ExecutionEnvironment } from '@prisma/client';

describe('AEVORA V24 — Offer Market & Autonomous Offer Engine Specification', () => {
  let offerService: OfferMarketService;
  let financialIntelligence: OfferFinancialIntelligenceService;
  let evaluationEngine: OfferEvaluationService;
  let _governanceService: OfferGovernanceService;
  let marketingIntegration: OfferMarketingIntegrationService;
  let measurementService: OfferMeasurementOptimizationService;
  let mockPrisma: any;
  let mockGateway: any;

  const testCompanyId = 'comp-v24-test-alpha';
  const foreignCompanyId = 'comp-v24-test-beta';
  const chairmanActorId = 'usr-chairman-001';
  const ceoActorId = 'usr-ceo-001';

  beforeEach(async () => {
    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === testCompanyId) {
            return Promise.resolve({
              id: testCompanyId,
              name: 'Alpha Corp',
              status: 'ACTIVE',
              emergencyStatus: 'NORMAL',
            });
          }
          if (where.id === 'comp-stopped') {
            return Promise.resolve({
              id: 'comp-stopped',
              name: 'Halted Corp',
              status: 'ACTIVE',
              emergencyStatus: 'EMERGENCY_STOP',
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    mockGateway = {
      executeAction: jest.fn().mockImplementation((_req) => {
        return Promise.resolve({
          actionId: `act_mock_${Date.now()}`,
          success: true,
          provider: 'AEVORA_V24_OFFER_MARKET_ADAPTER',
          externalReferenceId: `ext_ref_${Date.now()}`,
          verifiedAt: new Date().toISOString(),
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferFinancialIntelligenceService,
        OfferEvaluationService,
        OfferGovernanceService,
        OfferMarketService,
        OfferMarketingIntegrationService,
        OfferMeasurementOptimizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ExternalActionGatewayService, useValue: mockGateway },
      ],
    }).compile();

    offerService = module.get<OfferMarketService>(OfferMarketService);
    financialIntelligence = module.get<OfferFinancialIntelligenceService>(OfferFinancialIntelligenceService);
    evaluationEngine = module.get<OfferEvaluationService>(OfferEvaluationService);
    _governanceService = module.get<OfferGovernanceService>(OfferGovernanceService);
    marketingIntegration = module.get<OfferMarketingIntegrationService>(OfferMarketingIntegrationService);
    measurementService = module.get<OfferMeasurementOptimizationService>(OfferMeasurementOptimizationService);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1: OFFER MARKET CREATION, MATERIAL TERMS & TENANT ISOLATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 1: Offer Market Creation, Material Terms & Tenant Isolation', () => {
    it('1.1 should create a Chairman-created offer in DRAFT status with initial evaluation', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Enterprise Cloud Suite 20% Off',
        description: 'Targeted Q4 enterprise expansion offer',
        targetAudience: 'ENTERPRISE_B2B',
        productServiceIds: ['prod-cloud-infra-01'],
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxRedemptions: 50,
        termsAndConditions: 'Valid for new enterprise contracts with 12-month commitment.',
      });

      expect(offer).toBeDefined();
      expect(offer.id).toMatch(/^off_comp-v24-test-alpha_/);
      expect(offer.status).toBe(OfferStatus.DRAFT);
      expect(offer.creatorRole).toBe(OfferCreatorRole.CHAIRMAN);
      expect(offer.materialTerms.finalPrice).toBe(800);
      expect(offer.version).toBe(1);
      expect(offer.termsVersion).toBe(1);
      expect(offer.termsHistory).toHaveLength(1);
      expect(offer.financialAnalysis).toBeDefined();
      expect(offer.ceoEvaluation).toBeDefined();
      expect(offer.isChairmanGated).toBe(false); // 20% discount is below 50% threshold
    });

    it('1.2 should create a CEO-proposed offer and flag Chairman requirement if discount > 50%', async () => {
      const offer = await offerService.createOffer(testCompanyId, ceoActorId, 'CEO', {
        name: 'Aggressive Market Grab 60% Off',
        description: 'End of year customer acquisition sprint',
        targetAudience: 'STARTUPS',
        productServiceIds: ['prod-startup-starter'],
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 60,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        maxRedemptions: 25,
        termsAndConditions: 'Limit one per company. Non-refundable.',
      });

      expect(offer.creatorRole).toBe(OfferCreatorRole.CEO);
      expect(offer.materialTerms.finalPrice).toBe(200);
      expect(offer.isChairmanGated).toBe(true);
      expect(offer.requiresChairmanApproval).toBe(true);
      expect(offer.ceoEvaluation?.escalationRequired).toBe(true);
      expect(offer.ceoEvaluation?.escalationReason).toContain('Discount exceeds 50% threshold');
    });

    it('1.3 should handle idempotent offer creation with idempotencyKey', async () => {
      const dto = {
        name: 'Idempotent Offer Alpha',
        description: 'Test idempotency',
        targetAudience: 'MID_MARKET',
        productServiceIds: ['prod-mid-01'],
        originalPrice: 200,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        termsAndConditions: 'Standard terms.',
        idempotencyKey: 'idemp-offer-creation-999',
      };

      const offer1 = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', dto);
      const offer2 = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', dto);

      expect(offer1.id).toBe(offer2.id);
      expect(offer1.createdAt).toBe(offer2.createdAt);
    });

    it('1.4 should enforce strict multi-tenant isolation', async () => {
      const offerAlpha = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Alpha Secret Offer',
        description: 'Confidential',
        targetAudience: 'VIP',
        productServiceIds: ['prod-vip'],
        originalPrice: 2000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        termsAndConditions: 'VIP only.',
      });

      // Querying with foreignCompanyId should 404
      await expect(offerService.getOffer(foreignCompanyId, offerAlpha.id)).rejects.toThrow(
        NotFoundException,
      );

      const foreignList = await offerService.listOffers(foreignCompanyId);
      expect(foreignList.find((o) => o.id === offerAlpha.id)).toBeUndefined();
    });

    it('1.5 should track versioned terms history when termsAndConditions are updated', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Versioned Terms Offer',
        description: 'Terms tracking test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        termsAndConditions: 'Terms v1: Standard 30 days warranty.',
      });

      expect(offer.termsVersion).toBe(1);

      const updated = await offerService.updateOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', offer.id, {
        termsAndConditions: 'Terms v2: Extended 60 days warranty with SLA.',
        changeReason: 'Customer feedback amendment',
      });

      expect(updated.termsVersion).toBe(2);
      expect(updated.version).toBe(2);
      expect(updated.termsHistory).toHaveLength(2);
      expect(updated.termsHistory[1].version).toBe(2);
      expect(updated.termsHistory[1].terms).toContain('Extended 60 days warranty');
      expect(updated.termsHistory[1].changeReason).toBe('Customer feedback amendment');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: FINANCIAL & COMMERCIAL INTELLIGENCE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 2: Financial & Commercial Intelligence', () => {
    it('2.1 should compute deterministic financial formulas accurately', () => {
      const terms = {
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 25,
        finalPrice: 750,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxRedemptions: 100,
        productServiceIds: ['prod-01'],
        targetAudience: 'ENTERPRISE',
        termsAndConditions: 'Standard',
      };

      const context = {
        unitCost: {
          value: 300,
          source: 'ERP_COST_LEDGER',
          reliability: EpistemicReliability.VERIFIED_HISTORICAL,
          uncertaintyScore: 0.05,
        },
        expectedVolume: {
          value: 100,
          source: 'CRM_PIPELINE',
          reliability: EpistemicReliability.CURRENT_OPERATIONAL,
          uncertaintyScore: 0.15,
        },
        baselineVolume: {
          value: 40,
          source: 'HISTORICAL_RUN_RATE',
          reliability: EpistemicReliability.VERIFIED_HISTORICAL,
          uncertaintyScore: 0.1,
        },
        variableCostPerUnit: {
          value: 50,
          source: 'OPS_ESTIMATE',
          reliability: EpistemicReliability.CURRENT_OPERATIONAL,
          uncertaintyScore: 0.2,
        },
        marketingBudgetAllocated: {
          value: 5000,
          source: 'CAMPAIGN_BUDGET',
          reliability: EpistemicReliability.CURRENT_OPERATIONAL,
          uncertaintyScore: 0.1,
        },
      };

      const result = financialIntelligence.calculateFinancialIntelligence(terms, context);

      // Expected Revenue: 100 * 750 = 75,000
      expect(result.expectedRevenue).toBe(75000);
      // Baseline Revenue: 40 * 1000 = 40,000
      expect(result.baselineRevenue).toBe(40000);
      // Incremental Revenue: 75,000 - 40,000 = 35,000
      expect(result.incrementalRevenue).toBe(35000);
      // Discount Cost: 100 * 250 = 25,000
      expect(result.discountCost).toBe(25000);
      // COGS: 100 * 300 = 30,000; Gross Profit: 75,000 - 30,000 = 45,000
      expect(result.grossProfit).toBe(45000);
      // Variable: 100 * 50 = 5,000; Marketing: 5,000; Contribution: 45,000 - 5,000 - 5,000 = 35,000
      expect(result.contributionProfit).toBe(35000);
      // Post-Discount Margin: (750 - 300) / 750 = 60.0%
      expect(result.postDiscountMarginPct).toBe(60);
      // Original Margin: (1000 - 300) / 1000 = 70.0%
      expect(result.originalMarginPct).toBe(70);
      // Margin Erosion: 70 - 60 = 10.0%
      expect(result.marginErosionPct).toBe(10);
      // CAC: 5000 / (100 * 0.8) = 5000 / 80 = $62.50
      expect(result.cac).toBe(62.5);
      expect(result.breakEven.volume).toBeGreaterThan(0);
      expect(result.guardrailViolations).toHaveLength(0);
    });

    it('2.2 should flag negative margin guardrail violation if finalPrice < unitCost', () => {
      const terms = {
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 70, // 70% off $100 = $30
        finalPrice: 30,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        productServiceIds: ['prod-loss-leader'],
        targetAudience: 'ALL',
        termsAndConditions: 'Loss leader promo',
      };

      const context = {
        unitCost: {
          value: 50, // Cost is $50, final price is $30!
          source: 'DIRECT_COGS',
          reliability: EpistemicReliability.VERIFIED_HISTORICAL,
          uncertaintyScore: 0.05,
        },
      };

      const result = financialIntelligence.calculateFinancialIntelligence(terms, context);

      expect(result.postDiscountMarginPct).toBeLessThan(0);
      expect(result.guardrailViolations.some((v) => v.includes('NEGATIVE_MARGIN'))).toBe(true);
      expect(result.guardrailViolations.some((v) => v.includes('DEEP_DISCOUNT_THRESHOLD_EXCEEDED'))).toBe(true);
    });

    it('2.3 should distinguish verified vs estimated inputs and expose uncertainty', () => {
      const terms = {
        originalPrice: 200,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        finalPrice: 170,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        productServiceIds: ['prod-test'],
        targetAudience: 'SMB',
        termsAndConditions: 'Standard',
      };

      // No context provided -> triggers epistemic fallback
      const result = financialIntelligence.calculateFinancialIntelligence(terms, undefined);

      expect(result.provenance.inputs['unitCost'].reliability).toBe(EpistemicReliability.ESTIMATED);
      expect(result.provenance.missingDataItems).toContain('unitCost');
      expect(result.provenance.missingDataItems).toContain('expectedVolume');
      expect(result.provenance.explicitAssumptions.length).toBeGreaterThan(0);
      expect(result.provenance.overallConfidence).toBeLessThan(0.7);
    });

    it('2.4 should generate best-case, expected-case, and worst-case scenarios', () => {
      const terms = {
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        finalPrice: 400,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        productServiceIds: ['prod-service'],
        targetAudience: 'BUSINESS',
        termsAndConditions: 'Standard',
      };

      const result = financialIntelligence.calculateFinancialIntelligence(terms);

      const { bestCase, expectedCase, worstCase } = result.scenarios;
      expect(bestCase.volume).toBeGreaterThan(expectedCase.volume);
      expect(expectedCase.volume).toBeGreaterThan(worstCase.volume);
      expect(bestCase.revenue).toBeGreaterThan(expectedCase.revenue);
      expect(expectedCase.revenue).toBeGreaterThan(worstCase.revenue);
      expect(bestCase.grossProfit).toBeGreaterThan(worstCase.grossProfit);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3: CEO OFFER EVALUATION & RECOMMENDATION ENGINE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 3: CEO Offer Evaluation & Recommendation Engine', () => {
    it('3.1 should recommend APPROVE for high-margin, positive-contribution offers', () => {
      const terms = {
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        finalPrice: 80,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxRedemptions: 20,
        productServiceIds: ['prod-suite'],
        targetAudience: 'ENTERPRISE',
        termsAndConditions: 'Standard terms',
      };

      const analysis = financialIntelligence.calculateFinancialIntelligence(terms, {
        unitCost: { value: 20, source: 'ERP', reliability: EpistemicReliability.VERIFIED_HISTORICAL, uncertaintyScore: 0.05 },
      });

      const evaluation = evaluationEngine.evaluateOffer(terms, analysis);

      expect(evaluation.verdict).toBe(RecommendationVerdict.APPROVE);
      expect(evaluation.scores.profitabilityScore).toBeGreaterThanOrEqual(70);
      expect(evaluation.scores.compositeScore).toBeGreaterThanOrEqual(70);
      expect(evaluation.escalationRequired).toBe(false);
      expect(evaluation.advisoryDisclaimer).toContain('ADVISORY ONLY');
    });

    it('3.2 should recommend REJECT for negative-margin or loss-making offers', () => {
      const terms = {
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 80,
        finalPrice: 20,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        productServiceIds: ['prod-loss'],
        targetAudience: 'ALL',
        termsAndConditions: 'Flash sale',
      };

      const analysis = financialIntelligence.calculateFinancialIntelligence(terms, {
        unitCost: { value: 60, source: 'ERP', reliability: EpistemicReliability.VERIFIED_HISTORICAL, uncertaintyScore: 0.05 },
      });

      const evaluation = evaluationEngine.evaluateOffer(terms, analysis);

      expect(evaluation.verdict).toBe(RecommendationVerdict.REJECT);
      expect(evaluation.escalationRequired).toBe(true);
      expect(evaluation.explanation.riskEscalationTriggers.some((t) => t.includes('Negative unit margin'))).toBe(true);
    });

    it('3.3 should provide alternative discount sensitivity comparisons', () => {
      const terms = {
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 25,
        finalPrice: 750,
        currency: 'USD',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        productServiceIds: ['prod-01'],
        targetAudience: 'ENTERPRISE',
        termsAndConditions: 'Standard',
      };

      const analysis = financialIntelligence.calculateFinancialIntelligence(terms);
      const evaluation = evaluationEngine.evaluateOffer(terms, analysis);

      expect(evaluation.alternativeDiscountComparisons).toHaveLength(4); // 10%, 20%, 30%, 50%
      expect(evaluation.alternativeDiscountComparisons.map((a) => a.discountValue)).toEqual([10, 20, 30, 50]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 4: CHAIRMAN AUTHORITY & GOVERNANCE SAFEGUARDS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 4: Chairman Authority & Governance Safeguards', () => {
    it('4.1 should enforce V20 Discount Rule: Discount > 50% strictly requires Chairman approval', async () => {
      const steepOffer = await offerService.createOffer(testCompanyId, ceoActorId, 'CEO', {
        name: 'Steep 55% Off Promo',
        description: 'Over 50% test',
        targetAudience: 'SMB',
        productServiceIds: ['p1'],
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 55, // > 50%
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 10 * 86400000).toISOString(),
        termsAndConditions: 'Promo terms',
      });

      expect(steepOffer.requiresChairmanApproval).toBe(true);

      // Attempt approval by CEO or Executive tier -> MUST BE REJECTED
      await expect(
        offerService.approveOffer(
          testCompanyId,
          ceoActorId,
          'CEO',
          AuthorityTier.CEO,
          steepOffer.id,
          {},
        ),
      ).rejects.toThrow(ForbiddenException);

      // Approval by Sovereign Chairman -> MUST SUCCEED
      const approvedByChairman = await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        steepOffer.id,
        {},
      );

      expect(approvedByChairman.status).toBe(OfferStatus.APPROVED);
      expect(approvedByChairman.approvalBinding).toBeDefined();
      expect(approvedByChairman.approvalBinding?.approverRole).toBe('CHAIRMAN');
    });

    it('4.2 should prevent CEO self-approval of Chairman-gated offers', async () => {
      const offer = await offerService.createOffer(testCompanyId, ceoActorId, 'CEO', {
        name: 'CEO Proposed 65% Deal',
        description: 'Self-approval test',
        targetAudience: 'CORP',
        productServiceIds: ['p1'],
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 65,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 5 * 86400000).toISOString(),
        termsAndConditions: 'Self approval',
      });

      await expect(
        offerService.approveOffer(
          testCompanyId,
          ceoActorId,
          'CEO',
          AuthorityTier.CEO,
          offer.id,
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4.3 should invalidate approval when material terms are modified', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Approved Offer to Mutate',
        description: 'Tamper test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        termsAndConditions: 'Original terms',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      expect(offer.status).toBe(OfferStatus.APPROVED);

      // Mutate material discount from 20% to 40%
      const modified = await offerService.updateOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        offer.id,
        { discountValue: 40 },
      );

      // Must be invalidated
      expect(modified.status).toBe(OfferStatus.REVISION_REQUIRED);
      expect(modified.approvalBinding).toBeUndefined();
    });

    it('4.4 should reject activation if approval was tampered or stale', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Tamper Test Offer',
        description: 'Hash mismatch test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 400,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        termsAndConditions: 'Terms',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      // Artificially tamper parametersHash
      offer.approvalBinding!.parametersHash = '0000000000000000000000000000000000000000000000000000000000000000';

      await expect(
        offerService.activateOffer(
          testCompanyId,
          chairmanActorId,
          'CHAIRMAN',
          AuthorityTier.CHAIRMAN,
          offer.id,
          { idempotencyKey: 'idemp-tamper-test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('4.5 should enforce anti-replay protection on consumed approvals', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Replay Test Offer',
        description: 'Replay protection test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 300,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        termsAndConditions: 'Terms',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      // Activate first time -> Consumes approval
      await offerService.activateOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { idempotencyKey: 'idemp-activation-first' },
      );

      // Artificially reset status to APPROVED with same approvalId to attempt replay
      offer.status = OfferStatus.APPROVED;

      await expect(
        offerService.activateOffer(
          testCompanyId,
          chairmanActorId,
          'CHAIRMAN',
          AuthorityTier.CHAIRMAN,
          offer.id,
          { idempotencyKey: 'idemp-activation-second' },
        ),
      ).rejects.toThrow(/Approval Replay Detected/);
    });

    it('4.6 should fail closed unconditionally when company is under EMERGENCY_STOP', async () => {
      const offerOnStoppedComp = await offerService.createOffer('comp-stopped', chairmanActorId, 'CHAIRMAN', {
        name: 'Offer on Emergency Stopped Company',
        description: 'Stop test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 10 * 86400000).toISOString(),
        termsAndConditions: 'Emergency stopped company',
      });

      await offerService.approveOffer(
        'comp-stopped',
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offerOnStoppedComp.id,
        {},
      );

      // Attempting to activate while under EMERGENCY_STOP must fail closed
      await expect(
        offerService.activateOffer(
          'comp-stopped',
          chairmanActorId,
          'CHAIRMAN',
          AuthorityTier.CHAIRMAN,
          offerOnStoppedComp.id,
          { idempotencyKey: 'idemp-stopped-act' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5: GOVERNED ACTIVATION, DISPATCH & REDEMPTION ENGINE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 5: Governed Activation, Dispatch & Redemption Engine', () => {
    it('5.1 should activate offer through External Action Gateway and record reference', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Gateway Activated Offer',
        description: 'Gateway integration test',
        targetAudience: 'RETAIL',
        productServiceIds: ['prod-retail-01'],
        originalPrice: 200,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxRedemptions: 10,
        termsAndConditions: 'Max 10 redemptions.',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      const activated = await offerService.activateOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { idempotencyKey: 'idemp-gateway-dispatch-001', environment: 'SANDBOX' },
      );

      expect(activated.status).toBe(OfferStatus.ACTIVE);
      expect(activated.activatedAt).toBeDefined();
      expect(mockGateway.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'DISPATCH_OFFER',
          environment: ExecutionEnvironment.SANDBOX,
        }),
      );
    });

    it('5.2 should process redemptions atomically and update currentRedemptions counter', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Redeemable Offer',
        description: 'Redemption test',
        targetAudience: 'VIP',
        productServiceIds: ['p1'],
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20, // Final: 400, Discount: 100
        validFrom: new Date(Date.now() - 3600000).toISOString(), // Started 1 hour ago
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        maxRedemptions: 2,
        termsAndConditions: 'Strictly limited to 2 uses.',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      await offerService.activateOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { idempotencyKey: 'idemp-act-redemption-test' },
      );

      // Redemption 1
      const rdm1 = await offerService.redeemOffer(testCompanyId, offer.id, {
        customerId: 'cust-101',
        transactionValue: 500,
      });

      expect(rdm1.netPaid).toBe(400);
      expect(rdm1.discountApplied).toBe(100);
      expect(rdm1.evidenceHash).toBeDefined();
      expect(offer.currentRedemptions).toBe(1);
      expect(offer.status).toBe(OfferStatus.ACTIVE);

      // Redemption 2 (exhausts limit)
      const _rdm2 = await offerService.redeemOffer(testCompanyId, offer.id, {
        customerId: 'cust-102',
        transactionValue: 500,
      });

      expect(offer.currentRedemptions).toBe(2);
      expect(offer.status).toBe(OfferStatus.EXPIRED); // Automatically transitioned to EXPIRED when exhausted

      // Redemption 3 should be rejected because offer has exhausted max redemptions
      await expect(
        offerService.redeemOffer(testCompanyId, offer.id, {
          customerId: 'cust-103',
        }),
      ).rejects.toThrow(/Offer is not ACTIVE|redemption limit/);
    });

    it('5.3 should reject redemption when offer promotional window is expired or in the future', async () => {
      const futureOffer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Future Launch Offer',
        description: 'Date window test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(Date.now() + 86400000).toISOString(), // Starts tomorrow!
        validUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
        termsAndConditions: 'Future only',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        futureOffer.id,
        {},
      );

      futureOffer.status = OfferStatus.ACTIVE; // artificially mark active for date test

      await expect(
        offerService.redeemOffer(testCompanyId, futureOffer.id, { customerId: 'cust-early' }),
      ).rejects.toThrow(/promotional window has not started/);
    });

    it('5.4 should handle redemption idempotency with idempotencyKey', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Idempotent Redemption Offer',
        description: 'Duplicate redemption test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 150,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        validFrom: new Date(Date.now() - 1000).toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        termsAndConditions: 'Terms',
      });

      await offerService.approveOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {});
      await offerService.activateOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {
        idempotencyKey: 'idemp-act-rdm-idemp',
      });

      const rdmDto = {
        customerId: 'cust-idemp-1',
        idempotencyKey: 'idemp-redemption-token-abc',
      };

      const res1 = await offerService.redeemOffer(testCompanyId, offer.id, rdmDto);
      const res2 = await offerService.redeemOffer(testCompanyId, offer.id, rdmDto);

      expect(res1.id).toBe(res2.id);
      expect(offer.currentRedemptions).toBe(1); // Did not double-count!
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 6: MARKETING INTEGRATION & SANDBOX SAFETY
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 6: Marketing Integration & Sandbox Safety', () => {
    it('6.1 should generate multi-channel marketing copy and attribution links bound to approved offer', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Q4 Enterprise Cloud Accelerator',
        description: 'Marketing integration test',
        targetAudience: 'FINTECH_ENTERPRISE',
        productServiceIds: ['cloud-fintech-01'],
        originalPrice: 2000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 25,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        termsAndConditions: 'Annual enterprise billing only.',
      });

      await offerService.approveOffer(
        testCompanyId,
        chairmanActorId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {},
      );

      const marketingCopy = await marketingIntegration.generateOfferCampaignDrafts(offer);

      expect(marketingCopy).toBeDefined();
      expect(marketingCopy.offerId).toBe(offer.id);
      expect(marketingCopy.offerVersion).toBe(offer.version);
      expect(marketingCopy.approvedParametersHash).toBe(offer.approvalBinding?.parametersHash);
      expect(marketingCopy.emailDraft.subject).toContain('25% OFF');
      expect(marketingCopy.emailDraft.bodyMarkdown).toContain('$1500'); // Final price
      expect(marketingCopy.socialDrafts.linkedIn).toContain('FINTECH_ENTERPRISE');
      expect(marketingCopy.attributionLinks.trackingSlug).toBeDefined();
      expect(marketingCopy.isSandboxDraft).toBe(true); // Safeguard: marked as sandbox
    });

    it('6.2 should reject generating marketing campaigns for unapproved draft offers', async () => {
      const draftOffer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Draft Only Offer',
        description: 'Unapproved test',
        targetAudience: 'ALL',
        productServiceIds: ['p1'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 10 * 86400000).toISOString(),
        termsAndConditions: 'Draft',
      });

      await expect(marketingIntegration.generateOfferCampaignDrafts(draftOffer)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 7: MEASUREMENT & FORECAST VARIANCE RECONCILIATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 7: Measurement & Forecast Variance Reconciliation', () => {
    it('7.1 should reconcile actual redemptions against forecast and flag significant drift (>25%)', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Measurement Tracking Offer',
        description: 'Drift test',
        targetAudience: 'VIP',
        productServiceIds: ['p1'],
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 30, // Final 700
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        maxRedemptions: 50,
        termsAndConditions: 'Terms',
      });

      await offerService.approveOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {});
      await offerService.activateOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {
        idempotencyKey: 'idemp-act-meas',
      });

      // Simulate 5 redemptions
      for (let i = 1; i <= 5; i++) {
        await offerService.redeemOffer(testCompanyId, offer.id, {
          customerId: `cust-meas-${i}`,
          transactionValue: 1000,
        });
      }

      const measurement = await measurementService.getOfferMeasurement(testCompanyId, offer.id);

      expect(measurement.redemptions).toBe(5);
      expect(measurement.totalGrossRevenue).toBe(5000);
      expect(measurement.totalDiscountCost).toBe(1500); // 5 * 300
      expect(measurement.totalNetRevenue).toBe(3500); // 5 * 700
      expect(measurement.forecastVariance.actualRedemptions).toBe(5);
      expect(measurement.forecastVariance.isSignificantDrift).toBe(true); // Actual 5 is far below default 100 expected!
      expect(measurement.causalConfidenceDisclaimer).toContain('observational correlation');
    });

    it('7.2 should produce evidence-backed optimization recommendations', async () => {
      const offer = await offerService.createOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', {
        name: 'Optimization Offer',
        description: 'Recommendation test',
        targetAudience: 'SMB',
        productServiceIds: ['p1'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(Date.now() - 1000).toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        termsAndConditions: 'Terms',
      });

      await offerService.approveOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {});
      await offerService.activateOffer(testCompanyId, chairmanActorId, 'CHAIRMAN', AuthorityTier.CHAIRMAN, offer.id, {
        idempotencyKey: 'idemp-act-opt',
      });

      const recommendation = await measurementService.getOptimizationRecommendation(testCompanyId, offer.id);

      expect(recommendation).toBeDefined();
      expect(Object.values(OptimizationAction)).toContain(recommendation.action);
      expect(recommendation.confidenceScore).toBeGreaterThan(0);
      expect(recommendation.evidencePoints.length).toBeGreaterThan(0);
    });
  });
});

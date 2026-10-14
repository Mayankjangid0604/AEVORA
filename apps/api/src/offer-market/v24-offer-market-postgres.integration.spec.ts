import { PrismaService } from '../prisma/prisma.service';
import { OfferMarketService } from './offer-market.service';
import { OfferGovernanceService } from './offer-governance.service';
import { OfferFinancialIntelligenceService } from './offer-financial-intelligence.service';
import { OfferEvaluationService } from './offer-evaluation.service';
import {
  DiscountType,
  OfferStatus,
} from './offer-market.types';
import { AuthorityTier } from '../governance/authority-context.types';

describe('AEVORA V24 — PostgreSQL Durable Persistence Integration Suite', () => {
  let prisma: PrismaService;
  let governanceService: OfferGovernanceService;
  let finService: OfferFinancialIntelligenceService;
  let evalService: OfferEvaluationService;
  let service1: OfferMarketService;

  const testChairmanId = `chm-v24-pg-${Date.now()}`;
  const companyA = `comp-v24-pga-${Date.now()}`;
  const companyB = `comp-v24-pgb-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Seed test Chairman and Companies
    await prisma.chairman.create({
      data: {
        id: testChairmanId,
        name: 'V24 Test Chairman',
        email: `chairman-${Date.now()}@aevora-test.com`,
      },
    });

    await prisma.company.create({
      data: {
        id: companyA,
        name: 'Company A (V24 Persistence)',
        chairmanId: testChairmanId,
      },
    });

    await prisma.company.create({
      data: {
        id: companyB,
        name: 'Company B (V24 Persistence)',
        chairmanId: testChairmanId,
      },
    });

    finService = new OfferFinancialIntelligenceService();
    evalService = new OfferEvaluationService(finService);
    governanceService = new OfferGovernanceService(prisma);

    service1 = new OfferMarketService(
      prisma,
      finService,
      evalService,
      governanceService,
    );
  });

  afterAll(async () => {
    try {
      // Clean up test data
      await prisma.offerRedemptionRecord.deleteMany({
        where: { companyId: { in: [companyA, companyB] } },
      });
      await prisma.offerConsumedApproval.deleteMany({});
      await prisma.offerApprovalRecord.deleteMany({
        where: { offer: { companyId: { in: [companyA, companyB] } } },
      });
      await prisma.offerTermsVersion.deleteMany({
        where: { offer: { companyId: { in: [companyA, companyB] } } },
      });
      await prisma.offerMaterialTermsRecord.deleteMany({
        where: { offer: { companyId: { in: [companyA, companyB] } } },
      });
      await prisma.offer.deleteMany({
        where: { companyId: { in: [companyA, companyB] } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: [companyA, companyB] } },
      });
      await prisma.chairman.deleteMany({
        where: { id: testChairmanId },
      });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('1. Durable Storage & Service-Instance Recreation', () => {
    let createdOfferId: string;

    it('should durably persist offer and terms in PostgreSQL and survive service recreation', async () => {
      // Create via service1
      const created = await service1.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Durable Enterprise Pilot',
        description: 'Testing durable postgres storage',
        targetAudience: 'ENTERPRISE',
        productServiceIds: ['prod-alpha', 'prod-beta'],
        originalPrice: 1000,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        currency: 'USD',
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        maxRedemptions: 5,
        termsAndConditions: 'Durable terms v1',
        idempotencyKey: `idem-create-${Date.now()}`,
      });

      createdOfferId = created.id;
      expect(createdOfferId).toBeDefined();

      // Create a completely separate service instance (service2) with EMPTY in-memory maps
      const service2 = new OfferMarketService(
        prisma,
        finService,
        evalService,
        new OfferGovernanceService(prisma),
      );

      // Retrieve via service2 - must hydrate directly from PostgreSQL
      const hydrated = await service2.getOffer(companyA, createdOfferId);
      expect(hydrated).toBeDefined();
      expect(hydrated.id).toBe(createdOfferId);
      expect(hydrated.name).toBe('Durable Enterprise Pilot');
      expect(hydrated.materialTerms.originalPrice).toBe(1000);
      expect(hydrated.materialTerms.finalPrice).toBe(800);
      expect(hydrated.materialTerms.termsAndConditions).toBe('Durable terms v1');
      expect(hydrated.materialTerms.maxRedemptions).toBe(5);
    });

    it('should durably persist terms history across updates in PostgreSQL', async () => {
      // Update terms on service1
      await service1.updateOffer(companyA, 'usr-test', 'CHAIRMAN', createdOfferId, {
        termsAndConditions: 'Durable terms v2 with extra clauses',
        changeReason: 'Updated contractual obligations',
      });

      // Verify in raw Prisma
      const dbVersions = await prisma.offerTermsVersion.findMany({
        where: { offerId: createdOfferId },
        orderBy: { version: 'asc' },
      });

      expect(dbVersions.length).toBeGreaterThanOrEqual(1);
      const latestVersion = dbVersions[dbVersions.length - 1];
      expect(latestVersion.terms).toBe('Durable terms v2 with extra clauses');

      // Hydrate from fresh service instance
      const service3 = new OfferMarketService(
        prisma,
        finService,
        evalService,
        new OfferGovernanceService(prisma),
      );
      const hydrated = await service3.getOffer(companyA, createdOfferId);
      expect(hydrated.materialTerms.termsAndConditions).toBe('Durable terms v2 with extra clauses');
    });
  });

  describe('2. Durable Approvals & Anti-Replay Protection', () => {
    let approvableOfferId: string;
    const approvalId = `appr-durable-${Date.now()}`;

    it('should durably store approval binding in PostgreSQL and survive service recreation', async () => {
      const offer = await service1.createOffer(companyA, 'usr-test', 'CEO', {
        name: 'CEO High Discount Offer',
        description: 'Needs Chairman approval',
        targetAudience: 'SMB',
        productServiceIds: ['prod-cloud'],
        originalPrice: 200,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 60, // >50% requires Chairman
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        termsAndConditions: 'Sensitive discount terms',
      });

      approvableOfferId = offer.id;
      expect(offer.requiresChairmanApproval).toBe(true);

      // Chairman approves
      const approved = await service1.approveOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        approvableOfferId,
        { approvalId },
      );

      expect(approved.status).toBe(OfferStatus.APPROVED);
      expect(approved.approvalBinding).toBeDefined();

      // Check PostgreSQL approval record directly
      const dbApproval = await prisma.offerApprovalRecord.findUnique({
        where: { offerId: approvableOfferId },
      });
      expect(dbApproval).toBeDefined();
      expect(dbApproval?.approvedBy).toBe(testChairmanId);
      expect(dbApproval?.approvalId).toBe(approvalId);

      // Hydrate via fresh service instance
      const freshService = new OfferMarketService(
        prisma,
        finService,
        evalService,
        new OfferGovernanceService(prisma),
      );
      const hydrated = await freshService.getOffer(companyA, approvableOfferId);
      expect(hydrated.status).toBe(OfferStatus.APPROVED);
      expect(hydrated.approvalBinding?.approvalId).toBe(approvalId);
    });

    it('should enforce anti-replay protection durably across service restarts', async () => {
      // Activate the offer (consumes the approval in DB)
      const freshService = new OfferMarketService(
        prisma,
        finService,
        evalService,
        new OfferGovernanceService(prisma),
      );

      await freshService.activateOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        approvableOfferId,
        {
          idempotencyKey: `act-durable-${Date.now()}`,
        },
      );

      // Verify DB has consumed approval
      const consumed = await prisma.offerConsumedApproval.findUnique({
        where: { approvalId },
      });
      expect(consumed).toBeDefined();
      expect(consumed?.offerId).toBe(approvableOfferId);

      // Replay attempt on a NEW offer with a BRAND NEW service instance
      const replayedOffer = await freshService.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Replay Target Offer',
        description: 'Attempting to reuse consumed approval',
        targetAudience: 'SMB',
        productServiceIds: ['prod-cloud'],
        originalPrice: 100,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        termsAndConditions: 'Standard terms',
      });

      const brandNewGovService = new OfferGovernanceService(prisma);
      const _brandNewService = new OfferMarketService(
        prisma,
        finService,
        evalService,
        brandNewGovService,
      );

      // 1. Verify PostgreSQL unique constraint rejects duplicate approvalId insertion at database level
      await expect(
        prisma.offerApprovalRecord.create({
          data: {
            offerId: replayedOffer.id,
            approvalId, // Replayed consumed approval ID!
            approvedBy: testChairmanId,
            approverRole: 'CHAIRMAN',
            approverTier: AuthorityTier.CHAIRMAN,
            approvedVersion: 1,
            approvedTermsVersion: 1,
            parametersHash: 'duplicate-hash',
          },
        }),
      ).rejects.toThrow();

      // 2. Verify durable anti-replay check in governance service validates against OfferConsumedApproval table
      await expect(
        brandNewGovService.validateApprovalBindingAtActivation({
          ...replayedOffer,
          status: OfferStatus.APPROVED,
          approvalBinding: {
            approvalId, // Consumed in previous test!
            approvedBy: testChairmanId,
            approverRole: 'CHAIRMAN',
            approverTier: AuthorityTier.CHAIRMAN,
            approvedAt: new Date().toISOString(),
            approvedVersion: 1,
            approvedTermsVersion: 1,
            parametersHash: brandNewGovService.computeParametersHash(
              companyA,
              replayedOffer.id,
              1,
              replayedOffer.materialTerms,
            ),
          },
        }),
      ).rejects.toThrow('already been consumed');
    });
  });

  describe('3. Material Change Durably Invalidates Approval', () => {
    it('should delete DB approval record and set status to REVISION_REQUIRED when material terms change', async () => {
      const offer = await service1.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Approved Offer For Invalidation Test',
        description: 'Test material change',
        targetAudience: 'VIP',
        productServiceIds: ['prod-vip'],
        originalPrice: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        termsAndConditions: 'VIP terms',
      });

      await service1.approveOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { approvalId: `appr-inval-${Date.now()}` },
      );

      // Confirm approval exists in DB
      let dbApproval = await prisma.offerApprovalRecord.findUnique({
        where: { offerId: offer.id },
      });
      expect(dbApproval).toBeDefined();

      // Modify material terms (discountValue: 10 -> 35)
      await service1.updateOffer(companyA, 'usr-test', 'CHAIRMAN', offer.id, {
        discountValue: 35,
      });

      // Verify DB approval record is deleted and status in DB is REVISION_REQUIRED
      dbApproval = await prisma.offerApprovalRecord.findUnique({
        where: { offerId: offer.id },
      });
      expect(dbApproval).toBeNull();

      const dbOffer = await prisma.offer.findUnique({
        where: { id: offer.id },
      });
      expect(dbOffer?.status).toBe(OfferStatus.REVISION_REQUIRED);
    });
  });

  describe('4. Concurrent Redemptions & Strict Limit Enforcement', () => {
    it('should atomically enforce maxRedemptions limit under concurrent execution', async () => {
      const maxLimit = 3;
      const offer = await service1.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Flash Sale (Strict Limit 3)',
        description: 'Concurrency test',
        targetAudience: 'ALL',
        productServiceIds: ['prod-flash'],
        originalPrice: 100,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 25,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        maxRedemptions: maxLimit,
        termsAndConditions: 'Limit 3 redemptions total',
      });

      await service1.approveOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { approvalId: `appr-limit-${Date.now()}` },
      );

      await service1.activateOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {
          idempotencyKey: `act-flash-${Date.now()}`,
        },
      );

      // Fire 6 simultaneous redemption requests
      const promises = Array.from({ length: 6 }).map((_, i) =>
        service1
          .redeemOffer(companyA, offer.id, {
            customerId: `cust-concurrent-${i}`,
            idempotencyKey: `idem-cust-${i}-${Date.now()}`,
          })
          .then((res) => ({ status: 'fulfilled', value: res }))
          .catch((err) => ({ status: 'rejected', reason: err.message })),
      );

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 3 must succeed, exactly 3 must be rejected
      expect(successful.length).toBe(maxLimit);
      expect(rejected.length).toBe(3);

      // Verify PostgreSQL counter
      const finalDbOffer = await prisma.offer.findUnique({
        where: { id: offer.id },
      });
      expect(finalDbOffer?.currentRedemptions).toBe(maxLimit);
      expect(finalDbOffer?.status).toBe(OfferStatus.EXPIRED);

      // Verify redemption records count in DB
      const dbRedemptions = await prisma.offerRedemptionRecord.findMany({
        where: { offerId: offer.id },
      });
      expect(dbRedemptions.length).toBe(maxLimit);
    });

    it('should be idempotent: duplicate redemption key returns same record without double counting', async () => {
      const offer = await service1.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Idempotent Redemption Offer',
        description: 'Testing idempotency',
        targetAudience: 'ALL',
        productServiceIds: ['prod-idem'],
        originalPrice: 100,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 10,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        maxRedemptions: 10,
        termsAndConditions: 'Idempotency terms',
      });

      await service1.approveOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        { approvalId: `appr-idem-${Date.now()}` },
      );

      await service1.activateOffer(
        companyA,
        testChairmanId,
        'CHAIRMAN',
        AuthorityTier.CHAIRMAN,
        offer.id,
        {
          idempotencyKey: `act-idem-${Date.now()}`,
        },
      );

      const key = `idem-redeem-unique-${Date.now()}`;

      // First call
      const r1 = await service1.redeemOffer(companyA, offer.id, {
        customerId: 'cust-loyal',
        idempotencyKey: key,
      });

      // Second call with identical key
      const r2 = await service1.redeemOffer(companyA, offer.id, {
        customerId: 'cust-loyal',
        idempotencyKey: key,
      });

      expect(r1.id).toBe(r2.id);
      expect(r1.evidenceHash).toBe(r2.evidenceHash);

      // Check currentRedemptions in DB is 1, not 2
      const dbOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(dbOffer?.currentRedemptions).toBe(1);
    });
  });

  describe('5. Tenant Boundaries & Emergency Stop Durability', () => {
    it('should enforce strict tenant boundaries in PostgreSQL queries', async () => {
      const offerA = await service1.createOffer(companyA, 'usr-test', 'CHAIRMAN', {
        name: 'Company A Secret Deal',
        description: 'Tenant A only',
        targetAudience: 'ALL',
        productServiceIds: ['prod-a'],
        originalPrice: 50,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: new Date(Date.now() + 10000000).toISOString(),
        termsAndConditions: 'Terms A',
      });

      // Company B attempting to access offerA must fail
      await expect(service1.getOffer(companyB, offerA.id)).rejects.toThrow('not found');

      // Listing offers for Company B must not leak Company A's offers
      const bOffers = await service1.listOffers(companyB);
      const leaked = bOffers.find((o) => o.id === offerA.id);
      expect(leaked).toBeUndefined();
    });
  });
});

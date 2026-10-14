import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { BrandConsistencyService } from './brand-consistency.service';
import { BrandService } from './brand.service';
import { MultiChannelCopyService } from './multi-channel-copy.service';
import { CreativeAssetService } from './creative-asset.service';
import { SocialPublishingGatewayService } from './social-publishing-gateway.service';
import { MockSocialAdapter } from './adapters/mock-social.adapter';
import { WordPressCmsAdapter } from './adapters/wordpress-cms.adapter';
import { AttributionTrackingService } from './attribution-tracking.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ProductionExecutionGateService } from '../production/production-execution-gate.service';
import { IncidentManagerService } from '../reliability/incident-manager.service';
import { MarketingOfferAdapter } from '../external-action-gateway/adapters/marketing-offer.adapter';
import {
  AssetType,
  AttributionModelType,
  TargetPlatform,
} from './marketing.types';
import {
  ContentStatus,
  ContentType,
  ExecutionEnvironment,
  MarketingChannel,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

describe('AEVORA V20 — Complete Growth & Marketing Engine Specification', () => {
  let copyService: MultiChannelCopyService;
  let creativeAssetService: CreativeAssetService;
  let publishingGateway: SocialPublishingGatewayService;
  let trackingService: AttributionTrackingService;
  let offerAdapter: MarketingOfferAdapter;

  const mockCompanyId = 'comp-v20-test-alpha';
  const otherCompanyId = 'comp-v20-test-beta';
  const mockActorId = 'emp-v20-marketer';
  const otherActorId = 'emp-v20-intruder';
  const testWorkspaceDir = path.join(process.cwd(), '.workspace', mockCompanyId, 'marketing');

  let memoryStore: {
    employees: any[];
    brandProfiles: any[];
    brandGuidelines: any[];
    contents: any[];
    campaigns: any[];
    auditEvents: any[];
    inquiries: any[];
    opportunities: any[];
    invoices: any[];
    incidents: any[];
  };

  beforeAll(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    memoryStore = {
      employees: [
        { id: mockActorId, companyId: mockCompanyId, name: 'Growth Lead', status: 'ACTIVE' },
        { id: otherActorId, companyId: otherCompanyId, name: 'Intruder', status: 'ACTIVE' },
      ],
      brandProfiles: [
        {
          id: 'brand-01',
          companyId: mockCompanyId,
          brandName: 'Aevora Autonomous',
          toneOfVoice: 'visionary, analytical, authoritative',
          targetAudience: 'Enterprise CTOs and COOs',
          brandPillars: ['Autonomous Operations', 'Verifiable Governance', 'Deterministic Execution'],
          prohibitedMessaging: ['cheap', 'magic', 'unregulated'],
        },
      ],
      brandGuidelines: [
        {
          id: 'guide-01',
          companyId: mockCompanyId,
          version: 1,
          rules: {
            bannedWords: ['cheap', 'magic', 'unregulated'],
            requiredPhrases: ['verifiable governance'],
          },
        },
      ],
      contents: [],
      campaigns: [
        {
          id: 'camp-q4-growth',
          companyId: mockCompanyId,
          name: 'Q4 Autonomous Growth',
          status: 'ACTIVE',
        },
      ],
      auditEvents: [],
      inquiries: [],
      opportunities: [],
      invoices: [],
      incidents: [],
    };

    const mockPrisma = {
      employee: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.employees.find((e) => e.id === where.id) || null;
        }),
      },
      brandProfile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.brandProfiles.find((b) => b.companyId === where.companyId) || null;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.brandProfiles.find((b) => b.companyId === where.companyId) || null;
        }),
      },
      brandGuideline: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.brandGuidelines.find((g) => g.companyId === where.companyId) || null;
        }),
      },
      marketingContent: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.contents.find((c) => c.id === where.id) || null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const idx = memoryStore.contents.findIndex((c) => c.id === where.id);
          if (idx === -1) throw new Error('Not found');
          const updated = { ...memoryStore.contents[idx], ...data };
          memoryStore.contents[idx] = updated;
          return updated;
        }),
      },
      marketingCampaign: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.campaigns.find((c) => c.id === where.id) || null;
        }),
      },
      marketingAuditEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const evt = { id: `evt-${Date.now()}`, ...data };
          memoryStore.auditEvents.push(evt);
          return evt;
        }),
      },
      clientInquiry: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.inquiries.filter((i) => i.companyId === where.companyId);
        }),
      },
      opportunity: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.opportunities.filter((o) => o.companyId === where.companyId);
        }),
      },
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return memoryStore.invoices.filter((inv) => inv.companyId === where.companyId);
        }),
      },
    };

    const mockApprovalSvc = {
      validateAndConsumeApproval: jest.fn().mockResolvedValue(true),
    };

    const mockProductionGate = {
      authorizeProductionAction: jest.fn().mockImplementation(async (params) => {
        if (params.approvalId === 'INVALID_APPROVAL') {
          throw new BadRequestException('Approval invalid or expired');
        }
        if (params.parameters?.forceGateFailure) {
          throw new BadRequestException('Production gate emergency kill-switch active');
        }
        return { authorized: true };
      }),
    };

    const mockIncidentManager = {
      reportOrDeduplicateIncident: jest.fn().mockImplementation(async (dto) => {
        const inc = { id: `inc-${Date.now()}`, ...dto };
        memoryStore.incidents.push(inc);
        return inc;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        MarketingAuditService,
        BrandService,
        BrandConsistencyService,
        MultiChannelCopyService,
        CreativeAssetService,
        MockSocialAdapter,
        WordPressCmsAdapter,
        SocialPublishingGatewayService,
        AttributionTrackingService,
        MarketingOfferAdapter,
        { provide: ApprovalValidationService, useValue: mockApprovalSvc },
        { provide: ProductionExecutionGateService, useValue: mockProductionGate },
        { provide: IncidentManagerService, useValue: mockIncidentManager },
      ],
    }).compile();

    copyService = module.get<MultiChannelCopyService>(MultiChannelCopyService);
    creativeAssetService = module.get<CreativeAssetService>(CreativeAssetService);
    publishingGateway = module.get<SocialPublishingGatewayService>(SocialPublishingGatewayService);
    trackingService = module.get<AttributionTrackingService>(AttributionTrackingService);
    offerAdapter = module.get<MarketingOfferAdapter>(MarketingOfferAdapter);
  });

  // ============================================================================
  // STEP 1 — MULTI-CHANNEL CONTENT & CREATIVE ASSETS
  // ============================================================================
  describe('Step 1: Multi-Channel Content & Creative Asset Management', () => {
    it('1.1 should generate structured LinkedIn copy with brand consistency scoring and hashtags', async () => {
      const copy = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.LINKEDIN,
        topic: 'Autonomous Enterprise Architecture and Verifiable Governance',
        keyPoints: ['Deterministic execution', 'Zero unsupervised spend', 'Real-time telemetry'],
      });

      expect(copy).toBeDefined();
      expect(copy.platform).toBe(TargetPlatform.LINKEDIN);
      expect(copy.headline).toBeTruthy();
      expect(copy.body).toContain('Autonomous Enterprise Architecture');
      expect(copy.characterCount).toBeGreaterThan(50);
      expect(copy.hashtags.length).toBeGreaterThan(0);
      expect(copy.isSimulated).toBe(true);
      expect(copy.brandFitScore).toBeGreaterThanOrEqual(70);
    });

    it('1.2 should generate Twitter/X copy adhering to length limits and generating thread parts if needed', async () => {
      const copy = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.TWITTER_X,
        topic: 'AI Reliability & Instant Failover in Financial Workflows',
      });

      expect(copy.platform).toBe(TargetPlatform.TWITTER_X);
      expect(copy.body.length).toBeLessThanOrEqual(280);
      expect(copy.metadata.threadParts).toBeDefined();
      expect(copy.hashtags).toContain('#Aevora');
    });

    it('1.3 should generate structured Blog Article, Newsletter, and Advertisement content', async () => {
      const blog = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.BLOG,
        topic: 'Why Modern Enterprises Demand Deterministic Orchestration',
      });
      expect(blog.platform).toBe(TargetPlatform.BLOG);
      expect(blog.metadata.readingTimeSeconds).toBeGreaterThan(0);
      expect(blog.body).toContain('Executive Summary');

      const newsletter = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.NEWSLETTER,
        topic: 'Weekly Innovation Pulse',
      });
      expect(newsletter.platform).toBe(TargetPlatform.NEWSLETTER);
      expect(newsletter.body).toContain('Dear Innovators');

      const ad = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.ADVERTISEMENT,
        topic: 'Autonomous Cloud Governance',
      });
      expect(ad.platform).toBe(TargetPlatform.ADVERTISEMENT);
      expect(ad.metadata.callToAction).toBeTruthy();
    });

    it('1.4 should flag brand guideline violations when banned words are used', async () => {
      const copy = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.LINKEDIN,
        topic: 'This cheap solution offers magic unregulated results',
      });

      expect(copy.brandConsistencyFindings.some((f) => f.severity === 'VIOLATION')).toBe(true);
      expect(copy.brandFitScore).toBeLessThan(70);
    });

    it('1.5 should generate deterministic mock SVG images without external billable API usage', async () => {
      const asset = await creativeAssetService.generateImage(mockCompanyId, mockActorId, {
        prompt: 'Modern high-tech data pipeline with glowing neural nodes',
        aspectRatio: '16:9',
        title: 'Neural Data Highway',
      });

      expect(asset).toBeDefined();
      expect(asset.id).toMatch(/^asset_img_/);
      expect(asset.companyId).toBe(mockCompanyId);
      expect(asset.mimeType).toBe('image/svg+xml');
      expect(asset.isSimulated).toBe(true);
      expect(asset.generatorProvider).toContain('AEVORA_LOCAL_DETERMINISTIC_SVG_MOCK');
      expect(asset.dimensions).toEqual({ width: 1200, height: 630 });

      // Verify file exists on disk in company workspace
      const fullPath = path.resolve(process.cwd(), asset.storagePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('Neural Data Highway');
    });

    it('1.6 should generate deterministic mock video creative manifests', async () => {
      const videoAsset = await creativeAssetService.generateVideo(mockCompanyId, mockActorId, {
        script: 'Introducing the autonomous growth engine that scales your B2B enterprise pipeline.',
        durationSeconds: 30,
        orientation: 'LANDSCAPE',
        title: 'Enterprise Pipeline Teaser',
      });

      expect(videoAsset.id).toMatch(/^asset_vid_/);
      expect(videoAsset.assetType).toBe(AssetType.VIDEO);
      expect(videoAsset.isSimulated).toBe(true);
      expect(videoAsset.dimensions).toEqual({ width: 1920, height: 1080 });
    });

    it('1.7 should reject policy-violating creative asset generation prompts', async () => {
      await expect(
        creativeAssetService.generateImage(mockCompanyId, mockActorId, {
          prompt: 'Guaranteed 1000% returns crypto pyramid scheme banner',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('1.8 should enforce multi-tenant isolation on creative assets', async () => {
      const asset = await creativeAssetService.generateImage(mockCompanyId, mockActorId, {
        prompt: 'Executive boardroom analytics',
      });

      // Same company can read
      const found = await creativeAssetService.getAsset(mockCompanyId, asset.id);
      expect(found.id).toBe(asset.id);

      // Other company cannot read
      await expect(creativeAssetService.getAsset(otherCompanyId, asset.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ============================================================================
  // STEP 2 — GOVERNED PUBLISHING GATEWAY
  // ============================================================================
  describe('Step 2: Governed Publishing Gateway & Provider Adapters', () => {
    let approvedContentId: string;
    let draftContentId: string;
    let modifiedContentId: string;

    beforeEach(() => {
      approvedContentId = 'content-app-01';
      draftContentId = 'content-draft-01';
      modifiedContentId = 'content-mod-01';

      memoryStore.contents.push({
        id: approvedContentId,
        companyId: mockCompanyId,
        title: 'Verifiable Autonomy in 2026',
        body: 'Here is our detailed analysis of verifiable autonomy.',
        contentType: ContentType.SOCIAL_POST,
        channel: MarketingChannel.SOCIAL_LINKEDIN,
        status: ContentStatus.APPROVED,
        contentVersion: 1,
        approvedVersion: 1,
        approvalId: 'appr-valid-123',
      });

      memoryStore.contents.push({
        id: draftContentId,
        companyId: mockCompanyId,
        title: 'Unreviewed Draft Post',
        body: 'This has not been approved yet.',
        contentType: ContentType.SOCIAL_POST,
        channel: MarketingChannel.SOCIAL_TWITTER,
        status: ContentStatus.DRAFT,
        contentVersion: 1,
        approvedVersion: null,
      });

      memoryStore.contents.push({
        id: modifiedContentId,
        companyId: mockCompanyId,
        title: 'Modified Post After Approval',
        body: 'Altered text',
        contentType: ContentType.SOCIAL_POST,
        channel: MarketingChannel.SOCIAL_LINKEDIN,
        status: ContentStatus.APPROVED,
        contentVersion: 2, // version incremented after approval
        approvedVersion: 1, // stale!
        approvalId: 'appr-stale-456',
      });
    });

    it('2.1 should publish approved content deterministically and return evidence hash', async () => {
      const idempotencyKey = 'pub-key-001';
      const result = await publishingGateway.publish(
        mockCompanyId,
        mockActorId,
        approvedContentId,
        'appr-valid-123',
        idempotencyKey,
      );

      expect(result.success).toBe(true);
      expect(result.isSimulated).toBe(true);
      expect(result.externalPostId).toBeTruthy();
      expect(result.publishedUrl).toContain('mock-social.aevora.internal');
      expect(result.evidenceHash).toBeTruthy();

      // Content in store should now be PUBLISHED
      const updated = memoryStore.contents.find((c) => c.id === approvedContentId);
      expect(updated.status).toBe(ContentStatus.PUBLISHED);
      expect(updated.publicationIdempotencyKey).toBe(idempotencyKey);
    });

    it('2.2 should return cached result idempotently when publishing with same key', async () => {
      const idempotencyKey = 'pub-key-idempotent-replay';
      const res1 = await publishingGateway.publish(
        mockCompanyId,
        mockActorId,
        approvedContentId,
        'appr-valid-123',
        idempotencyKey,
      );

      const res2 = await publishingGateway.publish(
        mockCompanyId,
        mockActorId,
        approvedContentId,
        'appr-valid-123',
        idempotencyKey,
      );

      expect(res1.externalPostId).toBe(res2.externalPostId);
      expect(res1.evidenceHash).toBe(res2.evidenceHash);
    });

    it('2.3 should reject unapproved content with BadRequestException', async () => {
      await expect(
        publishingGateway.publish(
          mockCompanyId,
          mockActorId,
          draftContentId,
          'appr-any',
          'pub-key-fail-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.4 should reject stale approvals where content was modified after approval', async () => {
      await expect(
        publishingGateway.publish(
          mockCompanyId,
          mockActorId,
          modifiedContentId,
          'appr-stale-456',
          'pub-key-fail-2',
        ),
      ).rejects.toThrow('Content was modified after approval. Re-approval required.');
    });

    it('2.5 should reject publication if actor does not belong to company', async () => {
      await expect(
        publishingGateway.publish(
          mockCompanyId,
          otherActorId,
          approvedContentId,
          'appr-valid-123',
          'pub-key-fail-3',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('2.6 should trigger incident management and block publication if production gate fails', async () => {
      await expect(
        publishingGateway.publish(
          mockCompanyId,
          mockActorId,
          approvedContentId,
          'appr-valid-123',
          'pub-key-fail-gate',
          { metadata: { forceGateFailure: true } },
        ),
      ).rejects.toThrow('Production gate emergency kill-switch active');

      // Incident should have been reported
      expect(memoryStore.incidents.length).toBeGreaterThan(0);
      expect(memoryStore.incidents[0].title).toContain('Marketing Publication Blocked');
    });

    it('2.7 should handle WordPress CMS publishing with offline simulation', async () => {
      const blogContentId = 'blog-content-01';
      memoryStore.contents.push({
        id: blogContentId,
        companyId: mockCompanyId,
        title: 'Deep Dive: State Machine Resilience',
        body: 'Detailed technical blog article body.',
        contentType: ContentType.BLOG_ARTICLE,
        channel: MarketingChannel.BLOG,
        status: ContentStatus.APPROVED,
        contentVersion: 1,
        approvedVersion: 1,
      });

      const res = await publishingGateway.publish(
        mockCompanyId,
        mockActorId,
        blogContentId,
        'appr-wp-1',
        'pub-wp-001',
      );

      expect(res.channel).toBe(MarketingChannel.BLOG);
      expect(res.provider).toBe('AEVORA_WORDPRESS_CMS_ADAPTER');
      expect(res.publishedUrl).toContain('blog.aevora.internal');
      expect(res.isSimulated).toBe(true);
    });

    it('2.8 should reject live WordPress publishing if required credentials are not configured', async () => {
      const blogContentId = 'blog-live-unauth';
      memoryStore.contents.push({
        id: blogContentId,
        companyId: mockCompanyId,
        title: 'Attempted Live Post',
        body: 'Attempting to push live without credentials.',
        contentType: ContentType.BLOG_ARTICLE,
        channel: MarketingChannel.BLOG,
        status: ContentStatus.APPROVED,
        contentVersion: 1,
        approvedVersion: 1,
      });

      await expect(
        publishingGateway.publish(
          mockCompanyId,
          mockActorId,
          blogContentId,
          'appr-wp-live',
          'pub-wp-live-key',
          { requireLivePublication: true },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // STEP 3 — TRACKING & REVENUE ATTRIBUTION
  // ============================================================================
  describe('Step 3: Tracking & Closed-Loop Revenue Attribution', () => {
    it('3.1 should generate deterministic UTM parameters and tracking slug', async () => {
      const link = await trackingService.createTrackingLink(mockCompanyId, mockActorId, {
        destinationUrl: 'https://aevora.com/platform/governance',
        channel: MarketingChannel.SOCIAL_LINKEDIN,
        campaignId: 'q4-launch',
        utmCampaign: 'enterprise_q4',
      });

      expect(link.slug).toMatch(/^tr_[a-f0-9]{10}$/);
      expect(link.utmSource).toBe('social_linkedin');
      expect(link.utmMedium).toBe('social');
      expect(link.utmCampaign).toBe('enterprise_q4');
      expect(link.aevoraCid).toBe(mockCompanyId);
      expect(link.fullTrackingUrl).toContain('utm_source=social_linkedin');
      expect(link.fullTrackingUrl).toContain('aevora_cid=' + mockCompanyId);
    });

    it('3.2 should prevent open redirects to invalid or non-HTTP protocols', async () => {
      await expect(
        trackingService.createTrackingLink(mockCompanyId, mockActorId, {
          destinationUrl: 'javascript:alert(1)',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        trackingService.createTrackingLink(mockCompanyId, mockActorId, {
          destinationUrl: 'not-a-valid-url',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        trackingService.createTrackingLink(mockCompanyId, mockActorId, {
          destinationUrl: 'https://aevora.com/t/recursive-loop',
        }),
      ).rejects.toThrow('Recursive tracking redirect loop detected');
    });

    it('3.3 should record clicks with hashed IP and User-Agent without storing raw PII', async () => {
      const link = await trackingService.createTrackingLink(mockCompanyId, mockActorId, {
        destinationUrl: 'https://aevora.com/solutions',
        channel: MarketingChannel.SOCIAL_TWITTER,
      });

      const clickResult = await trackingService.resolveAndRecordClick(link.slug, {
        clientIp: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        referer: 'https://t.co/xyz123',
      });

      expect(clickResult.redirectUrl).toBe(link.fullTrackingUrl);
      expect(clickResult.record.totalClicks).toBe(1);
      expect(clickResult.record.uniqueClicks).toBe(1);

      // Repeat click from same IP/UA should increment totalClicks but not uniqueClicks
      await trackingService.resolveAndRecordClick(link.slug, {
        clientIp: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      const updatedLink = await trackingService.getTrackingLink(mockCompanyId, link.slug);
      expect(updatedLink.totalClicks).toBe(2);
      expect(updatedLink.uniqueClicks).toBe(1);
    });

    it('3.4 should calculate First-Touch, Last-Touch, and Linear attribution across CRM conversions', async () => {
      // 1. Create two tracking links for different channels
      const linkLinkedIn = await trackingService.createTrackingLink(mockCompanyId, mockActorId, {
        destinationUrl: 'https://aevora.com/demo',
        channel: MarketingChannel.SOCIAL_LINKEDIN,
        campaignId: 'camp-q4-growth',
      });

      const linkSearch = await trackingService.createTrackingLink(mockCompanyId, mockActorId, {
        destinationUrl: 'https://aevora.com/demo',
        channel: MarketingChannel.PAID_SEARCH,
        campaignId: 'camp-q4-growth',
      });

      // 2. Simulate clicks: LinkedIn first, then Search ad
      await trackingService.resolveAndRecordClick(linkLinkedIn.slug, {
        clientIp: '203.0.113.10',
        userAgent: 'Browser-1',
      });

      await trackingService.resolveAndRecordClick(linkSearch.slug, {
        clientIp: '203.0.113.20',
        userAgent: 'Browser-2',
      });

      // 3. Add CRM conversions: 1 Inquiry + 1 Paid Invoice of Rs 500,000 (50,000,000 paise)
      memoryStore.inquiries.push({
        id: 'inq-001',
        companyId: mockCompanyId,
        title: 'Enterprise Architecture Inquiry',
        createdAt: new Date(),
      });

      memoryStore.invoices.push({
        id: 'inv-001',
        companyId: mockCompanyId,
        total: 50000000,
        totalAmount: 50000000, // paise
        status: 'PAID',
        createdAt: new Date(),
      });

      // Test Linear Attribution (equal split)
      const linearReport = await trackingService.calculateAttribution(
        mockCompanyId,
        AttributionModelType.LINEAR,
        'camp-q4-growth',
      );

      expect(linearReport.totalConversions).toBe(2);
      expect(linearReport.totalRevenuePaise).toBe(50000000);
      expect(linearReport.channelBreakdown.length).toBe(2);

      const liStats = linearReport.channelBreakdown.find((c) => c.channel === 'SOCIAL_LINKEDIN');
      const adStats = linearReport.channelBreakdown.find((c) => c.channel === 'PAID_SEARCH');
      expect(liStats?.attributedRevenuePaise).toBe(25000000);
      expect(adStats?.attributedRevenuePaise).toBe(25000000);

      // Test First-Touch Attribution (100% to LinkedIn)
      const firstTouchReport = await trackingService.calculateAttribution(
        mockCompanyId,
        AttributionModelType.FIRST_TOUCH,
        'camp-q4-growth',
      );
      const ftLinkedIn = firstTouchReport.channelBreakdown.find((c) => c.channel === 'SOCIAL_LINKEDIN');
      expect(ftLinkedIn?.attributedRevenuePaise).toBe(50000000);

      // Test Last-Touch Attribution (100% to Search Ad)
      const lastTouchReport = await trackingService.calculateAttribution(
        mockCompanyId,
        AttributionModelType.LAST_TOUCH,
        'camp-q4-growth',
      );
      const ltAd = lastTouchReport.channelBreakdown.find((c) => c.channel === 'PAID_SEARCH');
      expect(ltAd?.attributedRevenuePaise).toBe(50000000);
    });

    it('3.5 should return explicit disclaimer and zero causal claim when data is missing', async () => {
      const emptyReport = await trackingService.calculateAttribution(
        'comp-empty-test',
        AttributionModelType.LINEAR,
      );

      expect(emptyReport.totalConversions).toBe(0);
      expect(emptyReport.totalRevenuePaise).toBe(0);
      expect(emptyReport.disclaimer).toContain('Zero causal link claimed');
    });
  });

  // ============================================================================
  // STEP 4 — V24 OFFER MARKET & GOVERNANCE INTEGRATION
  // ============================================================================
  describe('Step 4: V24 Offer Market & Governance Boundary Integration', () => {
    it('4.1 should integrate V24 promotional messaging in multi-channel copy when requested', async () => {
      const promoCopy = await copyService.generateMultiChannelCopy(mockCompanyId, mockActorId, {
        platform: TargetPlatform.LINKEDIN,
        topic: 'Q4 Enterprise Cloud Transformation',
        includeOfferPromotion: true,
      });

      expect(promoCopy.body).toContain('Special Offer');
      expect(promoCopy.metadata.callToAction).toContain('Claim exclusive consultation');
    });

    it('4.2 should enforce V24 discount governance boundary (>50% discount requires Chairman approval)', async () => {
      // 1. Discount <= 50% executes without approvalId
      const normalDiscount = await offerAdapter.execute({
        actionId: 'act-001',
        idempotencyKey: 'idemp-001',
        actionType: 'APPLY_DISCOUNT',
        companyId: mockCompanyId,
        requestingActorId: mockActorId,
        requestingActorRole: 'EMPLOYEE',
        sanitizedPayload: { discountPercent: 20 },
        target: { targetId: 'offer-101', targetType: 'OFFER' },
        financialExposure: 200000,
        intendedEffect: 'Standard B2B discount',
        riskTier: 'LOW',
        reversibility: 'REVERSIBLE',
        consequenceSeverity: 'LOW',
        isAutonomousPermitted: true,
        requiresChairmanApproval: false,
        requiresSecondarySafeguards: false,
        approvalConsumed: false,
        executionEnvironment: ExecutionEnvironment.PRODUCTION,
        evaluatedAt: new Date(),
      } as any);
      expect(normalDiscount.success).toBe(true);

      // 2. Discount > 50% without approvalId must fail
      const steepDiscountWithoutApproval = await offerAdapter.execute({
        actionId: 'act-002',
        idempotencyKey: 'idemp-002',
        actionType: 'APPLY_DISCOUNT',
        companyId: mockCompanyId,
        requestingActorId: mockActorId,
        requestingActorRole: 'EMPLOYEE',
        sanitizedPayload: { discountPercent: 65 },
        target: { targetId: 'offer-102', targetType: 'OFFER' },
        financialExposure: 650000,
        intendedEffect: 'Aggressive end of quarter discount',
        riskTier: 'HIGH',
        reversibility: 'IRREVERSIBLE',
        consequenceSeverity: 'HIGH',
        isAutonomousPermitted: false,
        requiresChairmanApproval: true,
        requiresSecondarySafeguards: true,
        approvalConsumed: false,
        executionEnvironment: ExecutionEnvironment.PRODUCTION,
        evaluatedAt: new Date(),
      } as any);
      expect(steepDiscountWithoutApproval.success).toBe(false);
      expect(steepDiscountWithoutApproval.errorMessage).toContain(
        'Discounts exceeding 50% require explicit Chairman approval',
      );

      // 3. Discount > 50% with approvalId succeeds
      const steepDiscountWithApproval = await offerAdapter.execute({
        actionId: 'act-003',
        idempotencyKey: 'idemp-003',
        actionType: 'APPLY_DISCOUNT',
        companyId: mockCompanyId,
        requestingActorId: mockActorId,
        requestingActorRole: 'EMPLOYEE',
        sanitizedPayload: { discountPercent: 65 },
        target: { targetId: 'offer-102', targetType: 'OFFER' },
        financialExposure: 650000,
        approvalId: 'appr-chair-approved-discount',
        intendedEffect: 'Approved steep discount',
        riskTier: 'HIGH',
        reversibility: 'IRREVERSIBLE',
        consequenceSeverity: 'HIGH',
        isAutonomousPermitted: false,
        requiresChairmanApproval: true,
        requiresSecondarySafeguards: true,
        approvalConsumed: true,
        executionEnvironment: ExecutionEnvironment.PRODUCTION,
        evaluatedAt: new Date(),
      } as any);
      expect(steepDiscountWithApproval.success).toBe(true);
    });
  });
});

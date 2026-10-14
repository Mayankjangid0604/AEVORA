import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingChannel } from '@prisma/client';
import {
  AttributionModelType,
  AttributionReport,
  ClickEventRecord,
  TrackingLinkRecord,
} from './marketing.types';

export interface CreateTrackingLinkDto {
  destinationUrl: string;
  channel?: MarketingChannel;
  campaignId?: string;
  contentId?: string;
  utmCampaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmContent?: string;
  utmTerm?: string;
}

@Injectable()
export class AttributionTrackingService {
  private readonly logger = new Logger(AttributionTrackingService.name);
  private readonly trackingLinks = new Map<string, TrackingLinkRecord>();
  private readonly clickEvents: ClickEventRecord[] = [];
  private readonly uniqueClickTracker = new Set<string>();
  private readonly baseStorageDir: string;
  private readonly salt: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
  ) {
    this.baseStorageDir = path.resolve(process.cwd(), '.workspace');
    this.salt = process.env.ATTRIBUTION_HASH_SALT || 'aevora-v20-tracking-salt-default';
  }

  private validateDestinationUrl(urlStr: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new BadRequestException(`Invalid destination URL: '${urlStr}'`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`Disallowed URL protocol '${parsed.protocol}'. Only http: and https: are allowed.`);
    }

    // Prevent open redirect loops to the tracking endpoint itself
    if (parsed.pathname.startsWith('/t/') || parsed.pathname.startsWith('/marketing/t/')) {
      throw new BadRequestException('Recursive tracking redirect loop detected');
    }

    return parsed;
  }

  createUtmParameters(dto: CreateTrackingLinkDto, companyId: string): {
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent?: string;
    utmTerm?: string;
    aevoraCid: string;
  } {
    const channelLower = (dto.channel ?? 'DIRECT').toString().toLowerCase();
    
    let defaultMedium = 'referral';
    if (
      channelLower.includes('social') ||
      channelLower.includes('linkedin') ||
      channelLower.includes('twitter') ||
      channelLower.includes('instagram') ||
      channelLower.includes('facebook')
    ) {
      defaultMedium = 'social';
    } else if (channelLower.includes('blog') || channelLower.includes('website')) {
      defaultMedium = 'organic';
    } else if (channelLower.includes('newsletter') || channelLower.includes('email')) {
      defaultMedium = 'email';
    } else if (channelLower.includes('advertisement') || channelLower.includes('paid')) {
      defaultMedium = 'cpc';
    }

    const utmSource = dto.utmSource || channelLower;
    const utmMedium = dto.utmMedium || defaultMedium;
    const utmCampaign = (dto.utmCampaign || dto.campaignId || 'general_growth')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_');
    const utmContent = dto.utmContent || (dto.contentId ? `content_${dto.contentId.slice(0, 8)}` : undefined);
    const utmTerm = dto.utmTerm;
    const aevoraCid = companyId;

    return {
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      aevoraCid,
    };
  }

  async createTrackingLink(
    companyId: string,
    actorId: string,
    dto: CreateTrackingLinkDto,
  ): Promise<TrackingLinkRecord> {
    if (!companyId) throw new BadRequestException('companyId is required');
    const parsedUrl = this.validateDestinationUrl(dto.destinationUrl);

    const utms = this.createUtmParameters(dto, companyId);
    const slugHash = crypto
      .createHash('sha256')
      .update(`${companyId}:${dto.destinationUrl}:${utms.utmSource}:${utms.utmCampaign}:${Date.now()}`)
      .digest('hex')
      .slice(0, 10);
    const slug = `tr_${slugHash}`;

    // Append UTMs to destinationUrl to construct the full tracked target
    const fullTarget = new URL(parsedUrl.toString());
    fullTarget.searchParams.set('utm_source', utms.utmSource);
    fullTarget.searchParams.set('utm_medium', utms.utmMedium);
    fullTarget.searchParams.set('utm_campaign', utms.utmCampaign);
    if (utms.utmContent) fullTarget.searchParams.set('utm_content', utms.utmContent);
    if (utms.utmTerm) fullTarget.searchParams.set('utm_term', utms.utmTerm);
    fullTarget.searchParams.set('aevora_cid', utms.aevoraCid);

    const record: TrackingLinkRecord = {
      id: `trk_${crypto.randomUUID()}`,
      slug,
      companyId,
      campaignId: dto.campaignId,
      contentId: dto.contentId,
      channel: dto.channel,
      destinationUrl: dto.destinationUrl,
      fullTrackingUrl: fullTarget.toString(),
      utmSource: utms.utmSource,
      utmMedium: utms.utmMedium,
      utmCampaign: utms.utmCampaign,
      utmContent: utms.utmContent,
      utmTerm: utms.utmTerm,
      aevoraCid: utms.aevoraCid,
      totalClicks: 0,
      uniqueClicks: 0,
      createdAt: new Date(),
    };

    this.trackingLinks.set(slug, record);

    await this.audit.record({
      companyId,
      actorId,
      action: 'TRACKING_LINK_CREATED',
      objectType: 'TrackingLink',
      objectId: record.id,
      campaignId: dto.campaignId,
      contentId: dto.contentId,
      newValue: {
        slug,
        destinationUrl: record.destinationUrl,
        utmSource: record.utmSource,
        utmCampaign: record.utmCampaign,
      },
    });

    return record;
  }

  async resolveAndRecordClick(
    slug: string,
    reqMeta: { clientIp?: string; userAgent?: string; referer?: string },
  ): Promise<{ redirectUrl: string; record: TrackingLinkRecord }> {
    const link = this.trackingLinks.get(slug);
    if (!link) {
      throw new NotFoundException(`Tracking link for slug '${slug}' not found`);
    }

    const rawIp = reqMeta.clientIp || '127.0.0.1';
    const rawUa = reqMeta.userAgent || 'unknown';

    // Hash PII immediately with salt
    const ipHash = crypto
      .createHash('sha256')
      .update(`${rawIp}:${this.salt}`)
      .digest('hex')
      .slice(0, 16);

    const userAgentHash = crypto
      .createHash('sha256')
      .update(rawUa)
      .digest('hex')
      .slice(0, 16);

    const dateKey = new Date().toISOString().split('T')[0];
    const uniqueFingerprint = `${link.id}:${ipHash}:${userAgentHash}:${dateKey}`;

    link.totalClicks += 1;
    link.lastClickedAt = new Date();

    if (!this.uniqueClickTracker.has(uniqueFingerprint)) {
      this.uniqueClickTracker.add(uniqueFingerprint);
      link.uniqueClicks += 1;
    }

    const clickEvent: ClickEventRecord = {
      id: `clk_${crypto.randomUUID()}`,
      trackingSlug: slug,
      companyId: link.companyId,
      campaignId: link.campaignId,
      contentId: link.contentId,
      timestamp: new Date(),
      ipHash,
      userAgentHash,
      referer: reqMeta.referer?.slice(0, 255),
      destinationUrl: link.fullTrackingUrl,
    };

    this.clickEvents.push(clickEvent);

    return {
      redirectUrl: link.fullTrackingUrl,
      record: link,
    };
  }

  async getTrackingLink(companyId: string, slug: string): Promise<TrackingLinkRecord> {
    const link = this.trackingLinks.get(slug);
    if (!link || link.companyId !== companyId) {
      throw new NotFoundException(`Tracking link '${slug}' not found`);
    }
    return link;
  }

  async listTrackingLinks(companyId: string, campaignId?: string): Promise<TrackingLinkRecord[]> {
    const list: TrackingLinkRecord[] = [];
    for (const link of this.trackingLinks.values()) {
      if (link.companyId !== companyId) continue;
      if (campaignId && link.campaignId !== campaignId) continue;
      list.push(link);
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async calculateAttribution(
    companyId: string,
    model: AttributionModelType = AttributionModelType.LINEAR,
    campaignId?: string,
    lookbackDays = 30,
  ): Promise<AttributionReport> {
    // 1. Gather all clicks for this company & optional campaign within lookback window
    const now = new Date();
    const lookbackThreshold = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const relevantClicks = this.clickEvents.filter((c) => {
      if (c.companyId !== companyId) return false;
      if (campaignId && c.campaignId !== campaignId) return false;
      return c.timestamp >= lookbackThreshold;
    });

    // 2. Fetch conversions from DB: Inquiries, Opportunities, Invoices
    const [inquiries, opportunities, invoices] = await Promise.all([
      this.prisma.clientInquiry.findMany({
        where: { companyId },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, createdAt: { gte: lookbackThreshold } },
      }),
      this.prisma.invoice.findMany({
        where: { companyId, createdAt: { gte: lookbackThreshold } },
      }),
    ]);

    const totalConversions = inquiries.length + opportunities.length + invoices.length;

    // Calculate revenue from invoices (total is in Paise / minor units)
    let totalRevenuePaise = 0;
    for (const inv of invoices) {
      totalRevenuePaise += (inv as any).total ?? (inv as any).totalAmount ?? (inv as any).subtotal ?? 0;
    }
    // If no invoices yet, fall back to estimatedValue from opportunities
    if (totalRevenuePaise === 0) {
      for (const opp of opportunities) {
        totalRevenuePaise += Math.round((opp.estimatedValue || 0) * 100);
      }
    }

    // 3. Map touchpoints to channels
    const channelClicksMap = new Map<string, number>();
    for (const click of relevantClicks) {
      const link = this.trackingLinks.get(click.trackingSlug);
      const ch = link?.channel ? link.channel.toString() : (link?.utmSource || 'direct').toUpperCase();
      channelClicksMap.set(ch, (channelClicksMap.get(ch) || 0) + 1);
    }

    const touchpointCount = relevantClicks.length;
    const touchpointsList: AttributionReport['touchpoints'] = [];
    const channelAttributionMap = new Map<
      string,
      { clicks: number; conversions: number; revenuePaise: number }
    >();

    // Initialise map
    for (const [ch, clicks] of channelClicksMap.entries()) {
      channelAttributionMap.set(ch, { clicks, conversions: 0, revenuePaise: 0 });
    }

    if (touchpointCount > 0 && totalConversions > 0) {
      if (model === AttributionModelType.FIRST_TOUCH) {
        // Earliest click receives 100% of conversion & revenue
        const sorted = [...relevantClicks].sort((a, b) => {
          const diff = a.timestamp.getTime() - b.timestamp.getTime();
          if (diff !== 0) return diff;
          return relevantClicks.indexOf(a) - relevantClicks.indexOf(b);
        });
        const first = sorted[0];
        const link = this.trackingLinks.get(first.trackingSlug);
        const ch = link?.channel ? link.channel.toString() : (link?.utmSource || 'direct').toUpperCase();

        const cur = channelAttributionMap.get(ch) || { clicks: 1, conversions: 0, revenuePaise: 0 };
        cur.conversions = totalConversions;
        cur.revenuePaise = totalRevenuePaise;
        channelAttributionMap.set(ch, cur);

        touchpointsList.push({
          touchpointId: first.id,
          contentId: first.contentId,
          channel: ch,
          timestamp: first.timestamp,
          attributionWeight: 1.0,
          attributedRevenuePaise: totalRevenuePaise,
        });
      } else if (model === AttributionModelType.LAST_TOUCH) {
        // Most recent click receives 100%
        const sorted = [...relevantClicks].sort((a, b) => {
          const diff = b.timestamp.getTime() - a.timestamp.getTime();
          if (diff !== 0) return diff;
          return relevantClicks.indexOf(b) - relevantClicks.indexOf(a);
        });
        const last = sorted[0];
        const link = this.trackingLinks.get(last.trackingSlug);
        const ch = link?.channel ? link.channel.toString() : (link?.utmSource || 'direct').toUpperCase();

        const cur = channelAttributionMap.get(ch) || { clicks: 1, conversions: 0, revenuePaise: 0 };
        cur.conversions = totalConversions;
        cur.revenuePaise = totalRevenuePaise;
        channelAttributionMap.set(ch, cur);

        touchpointsList.push({
          touchpointId: last.id,
          contentId: last.contentId,
          channel: ch,
          timestamp: last.timestamp,
          attributionWeight: 1.0,
          attributedRevenuePaise: totalRevenuePaise,
        });
      } else {
        // LINEAR model: evenly divide among all touchpoints
        const weightPerTouch = 1.0 / touchpointCount;
        const revPerTouch = Math.round(totalRevenuePaise / touchpointCount);

        for (const click of relevantClicks) {
          const link = this.trackingLinks.get(click.trackingSlug);
          const ch = link?.channel ? link.channel.toString() : (link?.utmSource || 'direct').toUpperCase();

          const cur = channelAttributionMap.get(ch) || { clicks: 1, conversions: 0, revenuePaise: 0 };
          cur.conversions += totalConversions / touchpointCount;
          cur.revenuePaise += revPerTouch;
          channelAttributionMap.set(ch, cur);

          touchpointsList.push({
            touchpointId: click.id,
            contentId: click.contentId,
            channel: ch,
            timestamp: click.timestamp,
            attributionWeight: weightPerTouch,
            attributedRevenuePaise: revPerTouch,
          });
        }
      }
    }

    const channelBreakdown: AttributionReport['channelBreakdown'] = [];
    for (const [channel, stats] of channelAttributionMap.entries()) {
      const percentage = totalRevenuePaise > 0
        ? Math.round((stats.revenuePaise / totalRevenuePaise) * 1000) / 10
        : 0;
      channelBreakdown.push({
        channel,
        clicks: stats.clicks,
        attributedConversions: Math.round(stats.conversions * 10) / 10,
        attributedRevenuePaise: stats.revenuePaise,
        attributedPercentage: percentage,
      });
    }

    const disclaimer = touchpointCount === 0 || totalConversions === 0
      ? 'ATTRIBUTION_NOTICE: Zero causal link claimed. Either marketing touches or CRM conversion events are absent in the lookback window.'
      : 'ATTRIBUTION_NOTICE: Attribution model weights computed deterministically from verified marketing click touchpoints and recorded CRM inquiries/invoices.';

    return {
      campaignId,
      companyId,
      model,
      totalConversions,
      totalRevenuePaise,
      totalClicksTracked: relevantClicks.length,
      channelBreakdown,
      touchpoints: touchpointsList,
      disclaimer,
    };
  }
}

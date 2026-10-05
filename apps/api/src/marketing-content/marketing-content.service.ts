import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { parseJson } from '../common/parse-json';
import { companyLine, companyProfile } from '../config/company';

export const CONTENT_TYPES = ['SERVICE_SHOWCASE', 'CLIENT_SUCCESS', 'TIP_VALUE', 'FESTIVAL_GREETING', 'BEHIND_SCENES', 'OFFER_PROMOTION'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PIXEL_SEED = 'pixel-marketing-saahvik';

/** ISO-8601 week (Monday start); the year is the ISO week-year, so 30 Dec can belong to next year's week 1. */
export function isoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7), year: d.getUTCFullYear() };
}

/** "#Sikar", "sikar business", "#sikar" → ["#Sikar", "#sikarbusiness"] (deduped case-insensitively, max 30). */
export function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of raw) {
    const tag = String(h).replace(/[#\s]+/g, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(`#${tag}`);
    if (out.length === 30) break;
  }
  return out;
}

const asType = (t: unknown, fallback: ContentType): ContentType => (CONTENT_TYPES.includes(t as ContentType) ? (t as ContentType) : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Model calendar → at most 7 clean day entries (missing day/type filled from the Monday–Sunday plan). */
export function normalizeCalendar(raw: any, week: number) {
  const plan: ContentType[] = ['SERVICE_SHOWCASE', 'TIP_VALUE', 'BEHIND_SCENES', 'TIP_VALUE', 'OFFER_PROMOTION', 'SERVICE_SHOWCASE', 'TIP_VALUE'];
  const posts = (Array.isArray(raw?.posts) ? raw.posts : [])
    .filter((p: any) => str(p?.caption))
    .slice(0, 7)
    .map((p: any, i: number) => ({
      day: DAYS.includes(str(p.day)) ? str(p.day) : DAYS[i],
      contentType: asType(p.contentType, plan[i]),
      topic: str(p.topic),
      caption: str(p.caption),
      hashtags: normalizeHashtags(p.hashtags),
      imageDescription: str(p.imageDescription),
    }));
  return { theme: str(raw?.theme).slice(0, 120) || `Week ${week} content`, posts };
}

const postPrompt = (contentType: string, topic: string) => `You are PIXEL, Social Media Manager at ${companyLine()}.
Create an Instagram post for a tech company that builds websites, apps and automation for businesses in India and worldwide.

CONTENT TYPE: ${contentType}
TOPIC: ${topic}
TARGET AUDIENCE: Business owners in India and abroad
LANGUAGE: Clear English (a Hindi line is fine for Indian audiences)
TONE: Professional but friendly

Generate a post with:
- Caption: 3-4 sentences, engaging, includes a call to action
- End with: "${companyLine()} | ${companyProfile().email}"
- Hashtags: 15-20 relevant hashtags in English
- Image description: What the image should look like (for reference)
- Image prompt: Detailed prompt for AI image generation

Content type guidelines:
SERVICE_SHOWCASE: Show one specific service with benefits and price range
CLIENT_SUCCESS: Celebrate a completed project (keep client anonymous)
TIP_VALUE: Share one useful digital tip for small business owners
FESTIVAL_GREETING: Warm festival wishes with subtle brand mention
BEHIND_SCENES: Show the team working, building something
OFFER_PROMOTION: Time-limited special offer with clear CTA

Return ONLY this JSON:
{
  "caption": "full caption text here",
  "hashtags": ["hashtag1", "hashtag2"],
  "imageDescription": "what the image should show",
  "imagePrompt": "detailed AI image generation prompt"
}`;

const calendarPrompt = (week: number, year: number, hasSuccessStory: boolean) => `You are PIXEL, Content Creator at ${companyLine()}.
Create a 7-day Instagram content calendar for a web development company.

COMPANY: ${companyProfile().name} — builds websites, apps, and automation for businesses in India and worldwide
HEADQUARTERS: ${companyProfile().address || 'India'}
TARGET: Business owners in India and abroad (restaurants, gyms, salons, clinics, shops)
WEEK: Week ${week} of ${year}
HAS CLIENT SUCCESS TO SHARE: ${hasSuccessStory}

Create variety — do not repeat content types on consecutive days.
Mix Hindi/English naturally. Keep it local and relatable.

Return ONLY this JSON:
{
  "theme": "Weekly theme in 5 words",
  "posts": [
    {
      "day": "Monday",
      "contentType": "SERVICE_SHOWCASE",
      "topic": "specific topic for this post",
      "caption": "full Instagram caption 3-4 sentences with CTA",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"],
      "imageDescription": "what the image should show"
    }
  ]
}

Include all 7 days. Use these content types across the week:
Monday: SERVICE_SHOWCASE
Tuesday: TIP_VALUE
Wednesday: ${hasSuccessStory ? 'CLIENT_SUCCESS' : 'BEHIND_SCENES'}
Thursday: TIP_VALUE
Friday: OFFER_PROMOTION
Saturday: ${hasSuccessStory ? 'CLIENT_SUCCESS' : 'SERVICE_SHOWCASE'}
Sunday: FESTIVAL_GREETING or TIP_VALUE`;

const broadcastPrompt = (industry: string, offer: string) => `You are PIXEL, Content Creator at ${companyLine()}.
Write a WhatsApp broadcast message for local business owners.

TARGET INDUSTRY: ${industry}
OFFER TYPE: ${offer}
LENGTH: Maximum 5 lines
LANGUAGE: Hinglish (Hindi + English mix)
TONE: Friendly, personal, not salesy

Include:
- Greeting
- One specific benefit relevant to ${industry}
- Clear offer
- Call to action (reply to this message)
- Signature: Team ${companyLine()}

Return ONLY the message text, no JSON, no explanation.`;

@Injectable()
export class MarketingContentService {
  private readonly logger = new Logger(MarketingContentService.name);
  private readonly gateway = new ModelGateway();
  /** Companies with a calendar generation in flight — the business loop ticks far more often than phi4 finishes. */
  private readonly calendarsInFlight = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async generatePost(companyId: string, contentType: string, topic: string) {
    const type = asType(contentType, 'SERVICE_SHOWCASE');
    if (type !== contentType) throw new BadRequestException(`contentType must be one of ${CONTENT_TYPES.join(', ')}`);
    this.logger.log(`Generating ${type} post: ${topic.slice(0, 80)}`);

    const g = parseJson(await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, postPrompt(type, topic), undefined, { json: true }));
    if (!str(g?.caption)) throw new ServiceUnavailableException('PIXEL returned no usable post (model output was not valid JSON) — try again');
    const pixel = await this.pixel(companyId);
    const { week, year } = isoWeek(new Date());

    const post = await this.prisma.contentPost.create({
      data: {
        companyId,
        createdByEmployeeId: pixel?.id ?? null,
        contentType: type,
        caption: str(g.caption),
        hashtags: normalizeHashtags(g.hashtags),
        imagePrompt: str(g.imagePrompt) || null,
        imageDescription: str(g.imageDescription) || null,
        weekNumber: week,
        year,
      },
    });
    this.logger.log(`Post created: ${post.id} (${type})`);
    return post;
  }

  /** One calendar per ISO week; the calendar and its 7 draft posts are saved together. */
  async generateWeeklyCalendar(companyId: string) {
    const { week, year } = isoWeek(new Date());
    const where = { companyId_weekNumber_year: { companyId, weekNumber: week, year } };
    const existing = await this.prisma.contentCalendar.findUnique({ where });
    if (existing) return existing;

    const paidProjects = await this.prisma.clientProject.count({ where: { companyId, status: { in: ['PAID', 'CLOSED'] } } });
    // 7 full posts overflow LOCAL_BASIC's 2000-token cap (JSON gets cut off); LOCAL_COMPLEX allows 4000.
    const calendar = normalizeCalendar(parseJson(await this.gateway.callWithTier(ModelTier.LOCAL_COMPLEX, calendarPrompt(week, year, paidProjects > 0), undefined, { json: true })), week);
    if (!calendar.posts.length) throw new ServiceUnavailableException('PIXEL returned no usable calendar (model output was not valid JSON) — try again');
    const pixel = await this.pixel(companyId);

    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const cal = await tx.contentCalendar.create({ data: { companyId, weekNumber: week, year, theme: calendar.theme, posts: calendar.posts as any } });
        await tx.contentPost.createMany({
          data: calendar.posts.map((p) => ({
            companyId, createdByEmployeeId: pixel?.id ?? null, contentType: p.contentType, caption: p.caption,
            hashtags: p.hashtags, imageDescription: p.imageDescription || null, weekNumber: week, year,
          })),
        });
        return cal;
      });
      this.logger.log(`Weekly calendar generated: week ${week}/${year}, theme "${calendar.theme}", ${calendar.posts.length} posts`);
      return saved;
    } catch (e) {
      // Another run finished first for this week — keep theirs.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.contentCalendar.findUniqueOrThrow({ where });
      throw e;
    }
  }

  async generateWhatsAppBroadcast(targetIndustry: string, offerType: string): Promise<string> {
    return (await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, broadcastPrompt(targetIndustry, offerType))).trim();
  }

  getPosts(companyId: string, status?: string) {
    return this.prisma.contentPost.findMany({ where: { companyId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  getCurrentCalendar(companyId: string) {
    const { week, year } = isoWeek(new Date());
    return this.prisma.contentCalendar.findUnique({ where: { companyId_weekNumber_year: { companyId, weekNumber: week, year } } });
  }

  getCalendars(companyId: string) {
    return this.prisma.contentCalendar.findMany({ where: { companyId }, orderBy: { generatedAt: 'desc' }, take: 10 });
  }

  approvePost(companyId: string, postId: string) {
    return this.setStatus(companyId, postId, { status: 'APPROVED' });
  }

  markPosted(companyId: string, postId: string) {
    return this.setStatus(companyId, postId, { status: 'POSTED', postedAt: new Date() });
  }

  /**
   * PIXEL's Monday job, called from the business loop. Runs in the background with an in-flight guard:
   * the calendar takes minutes on phi4 and must not hold up the loop or start twice.
   */
  runPixelWeeklyWork(companyId: string): 'started' | 'already-running' {
    if (this.calendarsInFlight.has(companyId)) return 'already-running';
    this.calendarsInFlight.add(companyId);
    this.generateWeeklyCalendar(companyId)
      .then(() => this.logger.log(`[${companyId}] PIXEL weekly calendar ready`))
      .catch((e) => this.logger.error(`[${companyId}] PIXEL weekly work failed: ${e.message}`))
      .finally(() => this.calendarsInFlight.delete(companyId));
    return 'started';
  }

  /** Called when a client pays — best effort, never blocks or fails the payment. */
  generateSuccessPost(companyId: string, projectType: string, industry: string | null) {
    const topic = `A ${industry ?? 'local'} business got a new ${projectType.toLowerCase().replace(/_/g, ' ')} from ${companyProfile().name}`;
    this.generatePost(companyId, 'CLIENT_SUCCESS', topic).catch((e) => this.logger.warn(`[${companyId}] success post failed: ${e.message}`));
  }

  private pixel(companyId: string) {
    return this.prisma.employee.findFirst({ where: { companyId, identitySeed: PIXEL_SEED, status: 'ACTIVE' }, select: { id: true } });
  }

  private async setStatus(companyId: string, postId: string, data: Prisma.ContentPostUpdateManyMutationInput) {
    const r = await this.prisma.contentPost.updateMany({ where: { id: postId, companyId }, data });
    if (!r.count) throw new NotFoundException('Post not found');
    return this.prisma.contentPost.findUniqueOrThrow({ where: { id: postId } });
  }
}

import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { MarketingContentService } from './marketing-content.service';

const text = (v: unknown, field: string, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new BadRequestException(`${field} is required`);
  if (s.length > max) throw new BadRequestException(`${field} too long (max ${max} characters)`);
  return s;
};

/** PIXEL's content studio (Chairman-only). Separate from the Phase 27 /marketing API. */
@Controller('marketing-content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class MarketingContentController {
  constructor(private readonly service: MarketingContentService) {}

  @Get('posts')
  posts(@Request() req, @Query('status') status?: string) {
    return this.service.getPosts(req.user.companyId, status);
  }

  @Post('posts/generate')
  generatePost(@Request() req, @Body() body: { contentType: string; topic: string }) {
    return this.service.generatePost(req.user.companyId, text(body?.contentType, 'contentType', 40), text(body?.topic, 'topic', 500));
  }

  @Post('posts/:id/approve')
  approve(@Request() req, @Param('id') id: string) {
    return this.service.approvePost(req.user.companyId, id);
  }

  @Post('posts/:id/posted')
  posted(@Request() req, @Param('id') id: string) {
    return this.service.markPosted(req.user.companyId, id);
  }

  @Get('calendars')
  calendars(@Request() req) {
    return this.service.getCalendars(req.user.companyId);
  }

  @Get('calendars/current')
  async current(@Request() req) {
    return (await this.service.getCurrentCalendar(req.user.companyId)) ?? {};
  }

  @Post('calendars/generate')
  generateCalendar(@Request() req) {
    return this.service.generateWeeklyCalendar(req.user.companyId);
  }

  @Post('whatsapp/broadcast')
  async broadcast(@Body() body: { targetIndustry: string; offerType: string }) {
    const message = await this.service.generateWhatsAppBroadcast(text(body?.targetIndustry, 'targetIndustry', 100), text(body?.offerType, 'offerType', 200));
    return { message };
  }

  @Post('pixel/run')
  runPixel(@Request() req) {
    const r = this.service.runPixelWeeklyWork(req.user.companyId);
    return { message: r === 'started' ? 'PIXEL weekly work started — the calendar appears in a few minutes' : 'PIXEL is already generating this week’s calendar' };
  }
}

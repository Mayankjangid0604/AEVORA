import { BadRequestException, Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../authorization/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { recordSuppression, verifyUnsubscribeToken } from '../common/outbound-policy';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body>`;

/**
 * Public, login-free opt-out. The only input is the signed token from the email, so nobody can suppress (or probe)
 * an address or tenant they did not receive mail for. GET never changes state (mail scanners prefetch links);
 * POST — the confirmation form or an RFC 8058 one-click client — records the opt-out. Repeats are idempotent.
 */
@Public()
@Controller('unsubscribe')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class UnsubscribeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  confirm(@Query('t') token: string) {
    const who = verifyUnsubscribeToken(token);
    if (!who) throw new BadRequestException('Invalid or expired unsubscribe link');
    return page(`<h1>Unsubscribe</h1><p>Stop all emails to <b>${esc(who.email)}</b>?</p>
<form method="post" action="?t=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`);
  }

  @Post()
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async unsubscribe(@Query('t') token: string) {
    const who = verifyUnsubscribeToken(token);
    if (!who) throw new BadRequestException('Invalid or expired unsubscribe link');
    await recordSuppression(this.prisma, who.companyId, who.email, 'UNSUBSCRIBE_LINK', 'email-link');
    return page(`<h1>You're unsubscribed</h1><p>We won't email <b>${esc(who.email)}</b> again.</p>`);
  }
}

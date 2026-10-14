import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InquiryStatus } from '@prisma/client';
import { JwtAuthGuard, Public } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { validateIntake } from './intake';
import { InquiryService } from './inquiry.service';

/**
 * Public customer intake. No login; the receiving company is server configuration. Responses carry only the
 * customer-facing reference and a coarse status — never row ids, tenant ids, notes or anyone else's data.
 * Submitting sends nothing and publishes nothing.
 */
@Public()
@Controller('public/requests')
export class PublicIntakeController {
  constructor(private readonly inquiries: InquiryService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async submit(@Body() body: unknown) {
    const v = validateIntake(body);
    if ('errors' in v) throw new BadRequestException({ message: 'Please correct the highlighted fields.', errors: v.errors });
    const r = await this.inquiries.submitPublic(v.value);
    return { ...r, message: 'Thank you. We have received your request and will reply by email.' };
  }

  /** POST so the customer's email never appears in a URL or access log. */
  @Post('status')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  status(@Body() body: { reference?: unknown; email?: unknown }) {
    return this.inquiries.publicStatus(body?.reference, body?.email);
  }
}

/** Operator queue. Tenant is always req.user.companyId; foreign ids are 404. Staff can read, management can act. */
@Controller('inquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'EMPLOYEE')
export class InquiryController {
  constructor(private readonly inquiries: InquiryService) {}

  @Get()
  list(@Request() req, @Query('status') status?: string) {
    if (status && !(status in InquiryStatus)) throw new BadRequestException(`Invalid status ${status}`);
    return this.inquiries.list(req.user.companyId, status as InquiryStatus | undefined);
  }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) {
    return this.inquiries.get(req.user.companyId, id);
  }

  @Post(':id/transition')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  transition(@Request() req, @Param('id') id: string, @Body() body: { from?: string; to?: string }) {
    return this.inquiries.transition(req.user.companyId, actor(req), id, body?.from, body?.to);
  }

  @Post(':id/notes')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  note(@Request() req, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.inquiries.addNote(req.user.companyId, actor(req), id, body?.note);
  }
}

const actor = (req: any) => ({ actorId: req.user.actorId, actorType: req.user.actorRole === 'CHAIRMAN' ? 'CHAIRMAN' : 'EMPLOYEE' });

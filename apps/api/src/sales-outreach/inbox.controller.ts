import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { InboundMessageService } from './inbound-message.service';

/** Chairman's view of client replies read from Gmail (Phase 44 Part 7). */
@Controller('inbox')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class InboxController {
  constructor(private readonly inbound: InboundMessageService) {}

  @Get('messages')
  messages(@Request() req, @Query('status') status?: string) {
    return this.inbound.list(req.user.companyId, status);
  }

  @Get('unread-count')
  async unreadCount(@Request() req) {
    return { count: await this.inbound.unreadCount(req.user.companyId), enabled: process.env.INBOX_ENABLED === 'true' };
  }

  @Post('check')
  check(@Request() req) {
    return this.inbound.checkInbox(req.user.companyId);
  }

  @Post('messages/:id/reply')
  reply(@Request() req, @Param('id') id: string, @Body() body: { replyText: string }) {
    const text = body?.replyText?.trim();
    if (!text) throw new BadRequestException('replyText is required');
    if (text.length > 5000) throw new BadRequestException('replyText too long (max 5000 characters)');
    return this.inbound.sendReply(req.user.companyId, id, text);
  }

  @Post('messages/:id/ignore')
  ignore(@Request() req, @Param('id') id: string) {
    return this.inbound.ignore(req.user.companyId, id);
  }
}

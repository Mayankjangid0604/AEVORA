import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ChairmanMailService, ReplyChannel } from './chairman-mail.service';

@Controller('chairman-mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class ChairmanMailController {
  constructor(private readonly mail: ChairmanMailService) {}

  @Get()
  list(@Request() req, @Query('status') status?: string) {
    return this.mail.list(req.user.companyId, ['OPEN', 'REPLIED', 'CLOSED'].includes(status ?? '') ? status : undefined);
  }

  @Get('unread-count')
  unread(@Request() req) {
    return this.mail.unreadCount(req.user.companyId);
  }

  /** Check the inbox for the Chairman's email replies now (also runs every 2 minutes). */
  @Post('check-replies')
  check() {
    return this.mail.pollEmailReplies();
  }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) {
    return this.mail.get(req.user.companyId, id);
  }

  @Post(':id/reply')
  reply(@Request() req, @Param('id') id: string, @Body() body: { text: string; channel?: ReplyChannel }) {
    const channel: ReplyChannel = body?.channel === 'PORTAL_VOICE' ? 'PORTAL_VOICE' : 'PORTAL_TEXT';
    return this.mail.reply(req.user.companyId, id, body?.text, channel);
  }

  @Post(':id/close')
  close(@Request() req, @Param('id') id: string) {
    return this.mail.close(req.user.companyId, id);
  }
}

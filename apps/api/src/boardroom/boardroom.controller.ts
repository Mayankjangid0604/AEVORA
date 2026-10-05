import { Body, Controller, Get, Param, Post, Request, StreamableFile, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { BoardroomService, ScheduleInput } from './boardroom.service';

@Controller('boardroom')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class BoardroomController {
  constructor(private readonly boardroom: BoardroomService) {}

  @Post('meetings')
  schedule(@Request() req, @Body() body: ScheduleInput) {
    return this.boardroom.schedule(req.user.companyId, { ...body, ledBy: undefined });
  }

  @Get('meetings')
  list(@Request() req) { return this.boardroom.list(req.user.companyId); }

  /** Registered before :id so "active" isn't read as an id. */
  @Get('meetings/active')
  active(@Request() req) { return this.boardroom.active(req.user.companyId); }

  @Get('briefing')
  briefing(@Request() req) { return this.boardroom.pendingBriefings(req.user.companyId); }

  @Get('meetings/:id')
  get(@Request() req, @Param('id') id: string) { return this.boardroom.get(req.user.companyId, id); }

  @Post('meetings/:id/join')
  join(@Request() req, @Param('id') id: string) { return this.boardroom.join(req.user.companyId, id); }

  @Post('meetings/:id/reschedule')
  reschedule(@Request() req, @Param('id') id: string, @Body() body: { scheduledAt: string }) {
    return this.boardroom.reschedule(req.user.companyId, id, body?.scheduledAt);
  }

  @Post('meetings/:id/delegate')
  delegate(@Request() req, @Param('id') id: string) { return this.boardroom.delegate(req.user.companyId, id); }

  @Post('meetings/:id/cancel')
  cancel(@Request() req, @Param('id') id: string) { return this.boardroom.cancel(req.user.companyId, id); }

  /** Next AI line (the office/mobile player calls this one line at a time). */
  @Post('meetings/:id/next')
  next(@Request() req, @Param('id') id: string) { return this.boardroom.takeTurn(req.user.companyId, id); }

  @Post('meetings/:id/say')
  say(@Request() req, @Param('id') id: string, @Body() body: { text: string }) {
    return this.boardroom.say(req.user.companyId, id, body?.text);
  }

  @Post('meetings/:id/pause')
  pause(@Request() req, @Param('id') id: string) { return this.boardroom.setPaused(req.user.companyId, id, true); }

  @Post('meetings/:id/resume')
  resume(@Request() req, @Param('id') id: string) { return this.boardroom.setPaused(req.user.companyId, id, false); }

  @Post('meetings/:id/end')
  end(@Request() req, @Param('id') id: string) { return this.boardroom.finish(req.user.companyId, id); }

  @Post('meetings/:id/briefed')
  briefed(@Request() req, @Param('id') id: string) { return this.boardroom.markBriefed(req.user.companyId, id); }

  @Get('meetings/:id/transcript')
  transcript(@Request() req, @Param('id') id: string) { return this.boardroom.transcript(req.user.companyId, id); }

  @Get('meetings/:id/summary-file')
  async summaryFile(@Request() req, @Param('id') id: string) {
    const f = await this.boardroom.summaryFile(req.user.companyId, id);
    return new StreamableFile(fs.createReadStream(f.path), { type: 'application/pdf', disposition: `attachment; filename="${f.name}"` });
  }
}

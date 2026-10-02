import { Controller, Post, Get, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { OutreachService, CreateDraftDto } from './outreach.service';
import { OutreachDraftStatus } from '@prisma/client';

@Controller('outreach')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class OutreachController {
  constructor(private readonly outreachService: OutreachService) {}

  @Post('drafts')
  createDraft(@Request() req, @Body() dto: CreateDraftDto) {
    return this.outreachService.createDraft(req.user.companyId, req.user.actorId, dto);
  }

  @Get('drafts')
  getDrafts(@Request() req, @Param('status') status?: OutreachDraftStatus) {
    return this.outreachService.getDrafts(req.user.companyId, status);
  }

  @Post('drafts/:id/approve')
  approveAndSend(@Request() req, @Param('id') id: string) {
    return this.outreachService.approveAndSend(req.user.companyId, req.user.actorId, id);
  }

  @Post('drafts/:id/reject')
  rejectDraft(@Request() req, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.outreachService.rejectDraft(req.user.companyId, req.user.actorId, id, body.reason);
  }
}

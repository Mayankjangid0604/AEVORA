import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { VoiceCommandService } from './voice-command.service';

@Controller('voice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class VoiceAssistantController {
  constructor(private readonly voice: VoiceCommandService) {}

  @Post('command')
  command(@Request() req, @Body() body: { transcript: string; sessionId?: string }) {
    return this.voice.processCommand(body.transcript, req.user.companyId, req.user.actorId, body.sessionId);
  }

  @Get('commands')
  commands(@Request() req) {
    return this.voice.listCommands(req.user.companyId);
  }

  @Post('sessions')
  start(@Request() req) {
    return this.voice.startSession(req.user.companyId);
  }

  @Post('sessions/:id/end')
  end(@Request() req, @Param('id') id: string) {
    return this.voice.endSession(req.user.companyId, id);
  }
}

import { Controller, Get, Param, Post, Body, Put, UseGuards } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';

@Controller('voice-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Get(':employeeId')
  async getProfile(@Param('employeeId') employeeId: string) {
    return this.voiceService.resolveEmployeeVoice(employeeId);
  }

  @Post(':employeeId/assign')
  async assignVoice(@Param('employeeId') employeeId: string) {
    return this.voiceService.assignVoice(employeeId);
  }
  @Post(':employeeId/provision')
  async provisionVoice(
    @Param('employeeId') employeeId: string,
    @Body() body: { force?: boolean }
  ) {
    return this.voiceService.provisionVoice(employeeId, body.force);
  }

  @Post(':employeeId/generate')
  async generateSpeech(@Param('employeeId') employeeId: string, @Body() body: { text: string; context?: any }) {
    return this.voiceService.generateSpeech(employeeId, body.text, body.context);
  }

  @Put(':employeeId')
  async updateProfile(@Param('employeeId') employeeId: string, @Body() data: any) {
    return this.voiceService.updateProfile(employeeId, data);
  }
}

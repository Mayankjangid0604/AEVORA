import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { BrowserWorkerService } from './browser-worker.service';
import { BrowserConversationService } from './browser-conversation.service';

@Controller('browser-ai')
export class BrowserAiController {
  constructor(
    private readonly workerService: BrowserWorkerService,
    private readonly conversationService: BrowserConversationService
  ) {}

  @Get('profiles')
  async getProfiles() {
    return this.workerService.listProfiles();
  }

  @Post('profiles/:id/assign')
  async assignProfile(@Param('id') profileId: string, @Body('employeeId') employeeId: string) {
    await this.workerService.assignProfile(employeeId, profileId);
    return { success: true };
  }

  @Post('profiles/:id/release')
  async releaseProfile(@Param('id') profileId: string) {
    await this.workerService.releaseProfile(profileId);
    return { success: true };
  }

  @Post('profiles/:id/open')
  async openBrowser(@Param('id') profileId: string) {
    await this.workerService.openBrowser(profileId);
    return { success: true };
  }

  @Post('profiles/:id/close')
  async closeBrowser(@Param('id') profileId: string) {
    await this.workerService.closeBrowser(profileId);
    return { success: true };
  }
}

import { Controller, Get, Param, Post, Body, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { CompanyConversationService } from './company-conversation.service';
import { CompanyAutonomyService, AutonomyState } from './company-autonomy.service';
import { JwtAuthGuard, StreamTokenAuth } from '../authorization/jwt-auth.guard';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('company-conversations')
export class CompanyConversationController {
  constructor(
    private readonly conversationService: CompanyConversationService,
    private readonly autonomyService: CompanyAutonomyService
  ) {}

  // EventSource can't send headers: the web gets a 60 s stream token (POST /auth/stream-token) and passes it as ?token=.
  @StreamTokenAuth()
  @Sse('stream')
  streamEvents(): Observable<MessageEvent> {
    return this.autonomyService.getStream().pipe(
      map((payload) => ({ data: payload.data }))
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('autonomy/state')
  async setAutonomyState(@Body() body: { state: AutonomyState }) {
    this.autonomyService.setState(body.state);
    return { state: this.autonomyService.getState() };
  }

  @UseGuards(JwtAuthGuard)
  @Get('autonomy/state')
  async getAutonomyState() {
    return { state: this.autonomyService.getState() };
  }

  @UseGuards(JwtAuthGuard)
  @Post('autonomy/event')
  async triggerAutonomyEvent(@Body() body: { priority: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL', topic: string, description: string }) {
    this.autonomyService.queueEvent(body.priority, body.topic, body.description);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createConversation(@Body() body: { participantIds: string[]; subject: string; eventContext: string; urgency?: 'NORMAL'|'URGENT'|'CRITICAL' }) {
    return this.conversationService.createConversation(body.participantIds, body.subject, body.eventContext, body.urgency);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getConversation(@Param('id') id: string) {
    return this.conversationService.getConversation(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/turn')
  async generateTurn(@Param('id') id: string, @Body() body: { forceSpeakerId?: string }) {
    return this.conversationService.generateNextTurn(id, body.forceSpeakerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/stop')
  async stopConversation(@Param('id') id: string) {
    return this.conversationService.stopConversation(id);
  }
}

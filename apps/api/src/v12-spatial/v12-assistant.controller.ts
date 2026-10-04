import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { V12AssistantAdapter } from './v12-assistant.adapter';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12IntentType, V12ExecutiveAssistantContext, V12AssistantResponse, WorldMode } from '@aevora/shared';

@Controller('v12-assistant')
@UseGuards(JwtAuthGuard)
export class V12AssistantController {
  constructor(private readonly assistantAdapter: V12AssistantAdapter) {}

  @Post('ask')
  async askQuestion(
    @Request() req,
    @Body() body: { intent: V12IntentType; context: V12ExecutiveAssistantContext; parameters: any; mode?: WorldMode }
  ): Promise<V12AssistantResponse> {
    // JWT payloads carry `actorId` (see AuthService); `id` is kept as a fallback.
    const userId = req.user.actorId ?? req.user.id;
    return this.assistantAdapter.processQuestion(userId, body.intent, body.context, body.parameters, body.mode);
  }
}

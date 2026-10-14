import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AssistantAdapter } from './assistant.adapter';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12IntentType, V12ExecutiveAssistantContext, V12AssistantResponse, WorldMode } from '@aevora/shared';

@Controller(['spatial/assistant', 'v12-assistant'])
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantAdapter: AssistantAdapter) {}

  @Post('ask')
  async askQuestion(
    @Request() req,
    @Body() body: { intent: V12IntentType; context: V12ExecutiveAssistantContext; parameters: any; mode?: WorldMode }
  ): Promise<V12AssistantResponse> {
    // JWT payloads carry `actorId` (see AuthService); `id` is kept as a fallback.
    const userId = req.user.actorId ?? req.user.id;

    // Security Embodiment: Client-provided companyId cannot override authenticated company context
    if (req.user.companyId) {
      if (!body.context) body.context = { timestamp: new Date().toISOString(), correlationId: '' };
      body.context.currentCompanyId = req.user.companyId;
    }

    return this.assistantAdapter.processQuestion(userId, body.intent, body.context, body.parameters, body.mode);
  }
}

export const V12AssistantController = AssistantController;
export type V12AssistantController = AssistantController;

import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { CommandAdapter, V12CommandResult } from './command.adapter';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12IntentType, V12IntentContext, WorldMode } from '@aevora/shared';

@Controller(['spatial/command', 'v12-command'])
@UseGuards(JwtAuthGuard)
export class CommandController {
  constructor(private readonly commandAdapter: CommandAdapter) {}

  @Post('execute')
  async executeCommand(
    @Request() req,
    @Body() body: { intent: V12IntentType; context: V12IntentContext; parameters: any; mode?: WorldMode }
  ): Promise<V12CommandResult> {
    // JWT payloads carry `actorId` (see AuthService); `id` is kept as a fallback.
    const userId = req.user.actorId ?? req.user.id;
    
    // Security Embodiment: Client-provided companyId cannot override authenticated company context
    if (req.user.companyId) {
      if (!body.context) body.context = {};
      body.context.currentCompanyId = req.user.companyId;
    }

    return this.commandAdapter.executeVoiceCommand(userId, body.intent, body.context, body.parameters, body.mode);
  }
}

export const V12CommandController = CommandController;
export type V12CommandController = CommandController;

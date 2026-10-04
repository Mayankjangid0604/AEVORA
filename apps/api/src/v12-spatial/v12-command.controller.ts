import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { V12CommandAdapter, V12CommandResult } from './v12-command.adapter';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12IntentType, V12IntentContext, WorldMode } from '@aevora/shared';

@Controller('v12-command')
@UseGuards(JwtAuthGuard)
export class V12CommandController {
  constructor(private readonly commandAdapter: V12CommandAdapter) {}

  @Post('execute')
  async executeCommand(
    @Request() req,
    @Body() body: { intent: V12IntentType; context: V12IntentContext; parameters: any; mode?: WorldMode }
  ): Promise<V12CommandResult> {
    // JWT payloads carry `actorId` (see AuthService); `id` is kept as a fallback.
    const userId = req.user.actorId ?? req.user.id;
    return this.commandAdapter.executeVoiceCommand(userId, body.intent, body.context, body.parameters, body.mode);
  }
}

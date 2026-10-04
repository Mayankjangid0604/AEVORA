import { Injectable, Logger } from '@nestjs/common';
import { V12IntentType, V12IntentContext, WorldMode } from '@aevora/shared';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';

export interface V12CommandResult {
  status: 'ACCEPTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'REPLAY_READ_ONLY';
  commandId: string;
  correlationId?: string;
  intent: V12IntentType;
  message?: string;
  authoritativeEntityId?: string;
}

@Injectable()
export class V12CommandAdapter {
  private readonly logger = new Logger(V12CommandAdapter.name);

  constructor(private readonly replaySessions: ReplaySessionService) {}

  async executeVoiceCommand(
    userId: string,
    intent: V12IntentType,
    context: V12IntentContext,
    parameters: any,
    mode?: WorldMode
  ): Promise<V12CommandResult> {
    const commandId = `cmd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const correlationId = `corr_${commandId}`;

    // Replay is read-only. The server-side replay session is authoritative: a client that omits or
    // falsifies `mode` is still rejected while its replay session is active. Checked before any business call.
    const serverReplay = this.replaySessions.isReplayActive(userId);
    if (mode === WorldMode.REPLAY || serverReplay) {
      this.logger.warn(`Rejected command ${intent} from user ${userId}: REPLAY is read-only (client mode=${mode ?? 'unset'}, server session=${serverReplay})`);
      return {
        status: 'REPLAY_READ_ONLY',
        commandId,
        correlationId,
        intent,
        message: 'Commands cannot be executed while viewing historical replay.'
      };
    }

    this.logger.log(`Received command from user ${userId}: ${intent} with context ${JSON.stringify(context)}`);

    // Verify existing backend capabilities
    switch (intent) {
      case V12IntentType.BRING_EXECUTIVE:
      case V12IntentType.START_MEETING:
      case V12IntentType.CALL_EXECUTIVE:
        // The authoritative backend does not yet support physical orchestration of meetings/executives
        return {
          status: 'UNSUPPORTED',
          commandId,
          correlationId,
          intent,
          message: 'BACKEND CAPABILITY NOT AVAILABLE'
        };

      default:
        return {
          status: 'UNSUPPORTED',
          commandId,
          correlationId,
          intent,
          message: `Intent ${intent} is not recognized for backend execution.`
        };
    }
  }
}

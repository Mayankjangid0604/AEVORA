import { Injectable } from '@nestjs/common';
import { V12IntentType, V12IntentContext, WorldMode } from '@aevora/shared';
import { ReplaySessionService } from '../world-state-gateway/replay-session.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export interface V12CommandResult {
  status: 'ACCEPTED' | 'CONFIRMED' | 'SUCCESS' | 'REJECTED' | 'FAILED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'REPLAY_READ_ONLY' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'BACKEND_FAILURE' | 'CONFLICT' | 'TEMPORARILY_UNAVAILABLE' | 'ERROR';
  commandId: string;
  correlationId?: string;
  causationId?: string;
  intent: V12IntentType;
  message?: string;
  authoritativeEntityId?: string;
  resultingEvents?: string[];
}

import { PrismaService } from '../prisma/prisma.service';
import { MeetingService } from '../communication/meeting.service';
import { V12NavigationService } from './v12-navigation.service';

@Injectable()
export class V12CommandAdapter {

  constructor(
    private readonly replaySessions: ReplaySessionService,
    private readonly authService: AuthorizationService,
    private readonly logger: StructuredLoggerService,
    private readonly prisma: PrismaService,
    private readonly meetingService: MeetingService,
    private readonly navigationService: V12NavigationService
  ) {}

  async executeVoiceCommand(
    userId: string,
    intent: V12IntentType,
    context: V12IntentContext,
    parameters: any,
    mode?: WorldMode
  ): Promise<V12CommandResult> {
    const timestamp = (context as any).timestamp || Date.now().toString();
    const commandId = (context as any).correlationId || `cmd_${userId}_${timestamp}`;
    const correlationId = (context as any).correlationId || commandId;

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

    // Security Embodiment: Enforce business isolation and authorization BEFORE any command processing.
    // Ensure the client provided a companyId (now enforced by controller) and authorize it.
    if (!context.currentCompanyId) {
      return {
        status: 'REJECTED',
        commandId,
        correlationId,
        intent,
        message: 'No active company context provided for execution.'
      };
    }

    try {
      // Basic check: Does this user have ANY rights in this company context?
      // A more granular permission can be requested based on the intent.
      await this.authService.checkPermission(userId, 'V12_COMMAND_EXECUTE', context.currentCompanyId);
    } catch (e: any) {
      this.logger.warn(`Unauthorized V12 command ${intent} from user ${userId}: ${e.message}`);
      return {
        status: 'REJECTED',
        commandId,
        correlationId,
        intent,
        message: 'You are not authorized to execute this command.'
      };
    }

    // Verify existing backend capabilities
    switch (intent) {
      case V12IntentType.BRING_EXECUTIVE:
      case V12IntentType.CALL_EXECUTIVE: {
        // We find the target employee and command them to move to the user's location
        const targetName = parameters?.targetName;
        if (!targetName && !context.selectedEmployeeId) {
          return { status: 'AMBIGUOUS', commandId, correlationId, intent, message: 'Specify who to bring.' };
        }

        let targetId = context.selectedEmployeeId;
        if (!targetId && targetName) {
           const lower = targetName.toLowerCase();
           const employees = await this.prisma.employee.findMany({ where: { companyId: context.currentCompanyId }, include: { role: true } });
           const matched = employees.filter(e => e.name.toLowerCase().includes(lower) || e.role.title.toLowerCase().includes(lower));
           if (matched.length > 1) return { status: 'AMBIGUOUS', commandId, correlationId, intent, message: 'Multiple executives match.' };
           if (matched.length === 1) targetId = matched[0].id;
        }

        if (!targetId) return { status: 'NOT_FOUND', commandId, correlationId, intent, message: 'Executive not found.' };

        // Get user's location (from workspace or room)
        const userWs = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId: userId } });
        if (!userWs) return { status: 'NOT_FOUND', commandId, correlationId, intent, message: 'Your location is unknown.' };

        const targetNode = await this.prisma.v12NavigationNode.findFirst({ where: { entityId: userWs.roomId } });
        if (!targetNode) return { status: 'NOT_FOUND', commandId, correlationId, intent, message: 'Destination node not found.' };

        await this.navigationService.requestEntityMovement(targetId, targetNode.id, { intentSource: 'COMMAND', correlationId });

        return {
          status: 'SUCCESS',
          commandId,
          correlationId,
          intent,
          message: 'Executive is on their way.',
          authoritativeEntityId: targetId
        };
      }

      case V12IntentType.START_MEETING: {
        const targetName = parameters?.targetName;
        let targetId = context.selectedEmployeeId;
        if (!targetId && targetName) {
           const lower = targetName.toLowerCase();
           const employees = await this.prisma.employee.findMany({ where: { companyId: context.currentCompanyId }, include: { role: true } });
           const matched = employees.filter(e => e.name.toLowerCase().includes(lower) || e.role.title.toLowerCase().includes(lower));
           if (matched.length > 1) return { status: 'AMBIGUOUS', commandId, correlationId, intent, message: 'Multiple people match.' };
           if (matched.length === 1) targetId = matched[0].id;
        }

        if (!targetId) return { status: 'NOT_FOUND', commandId, correlationId, intent, message: 'Participant not found.' };
        if (targetId === userId) return { status: 'REJECTED', commandId, correlationId, intent, message: 'Cannot start meeting with yourself.' };

        const meeting = await this.meetingService.scheduleMeeting(
          context.currentCompanyId!,
          userId,
          parameters?.title || 'Ad-hoc Executive Meeting',
          new Date(),
          30,
          [targetId],
          undefined,
          undefined,
          'Initiated via V12 Voice Command'
        );

        await this.meetingService.startMeeting(context.currentCompanyId!, meeting.id, userId);

        return {
          status: 'SUCCESS',
          commandId,
          correlationId,
          intent,
          message: 'Meeting started.',
          authoritativeEntityId: meeting.id
        };
      }

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

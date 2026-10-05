import {
  Controller, Get, Post, Delete, Param, Sse, MessageEvent, Query, Request,
  BadRequestException, ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateReplayService } from './world-state-replay.service';
import { WorldStateEventService } from './world-state-event.service';
import { ReplaySessionService } from './replay-session.service';
import { StreamTokenAuth } from '../authorization/jwt-auth.guard';
import { HistoryTarget, WorldSnapshot } from '@aevora/shared';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function parseNum(name: string, v: string | undefined, required = false): number | undefined {
  if (v === undefined || v === '') {
    if (required) throw new BadRequestException(`${name} is required`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequestException(`${name} must be a number`);
  return n;
}

/**
 * All routes are authenticated by the global JwtAuthGuard and additionally company-scoped here: the requested
 * :companyId must equal the company resolved for the caller (`req.user.companyId`, which the guard resolves from
 * the token or a validated x-company-id header). Cross-company access is rejected with 403.
 */
@Controller('world-state')
export class WorldStateGatewayController {
  constructor(
    private readonly gatewayService: WorldStateGatewayService,
    private readonly eventService: WorldStateEventService,
    private readonly replayService: WorldStateReplayService,
    private readonly replaySessions: ReplaySessionService,
  ) {}

  private scope(req: any, companyId: string): string {
    const user = req?.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!user.companyId || user.companyId !== companyId) {
      throw new ForbiddenException('World-state access is restricted to your company scope');
    }
    return user.actorId ?? user.id;
  }

  private target(timestamp?: string, sequence?: string, eventId?: string): HistoryTarget {
    const t: HistoryTarget = {
      timestamp: parseNum('timestamp', timestamp),
      sequence: parseNum('sequence', sequence),
      eventId: eventId || undefined,
    };
    const given = [t.timestamp !== undefined, t.sequence !== undefined, !!t.eventId].filter(Boolean).length;
    if (given > 1) throw new BadRequestException('Specify only one of timestamp, sequence or eventId');
    return t;
  }

  @Get('snapshot/:companyId')
  async getSnapshot(@Request() req, @Param('companyId') companyId: string, @Query('viewportEntityId') viewportEntityId?: string): Promise<WorldSnapshot> {
    this.scope(req, companyId);
    return this.gatewayService.generateSnapshot(companyId, viewportEntityId);
  }

  /** CURRENT (no target) | HISTORICAL | NOT_AVAILABLE */
  @Get('history/state/:companyId')
  async getWorldState(
    @Request() req, @Param('companyId') companyId: string,
    @Query('timestamp') timestamp?: string, @Query('sequence') sequence?: string, @Query('eventId') eventId?: string,
  ) {
    this.scope(req, companyId);
    return this.replayService.getWorldState(companyId, this.target(timestamp, sequence, eventId));
  }

  @Get('history/snapshot/:companyId')
  async getHistoricalSnapshot(@Request() req, @Param('companyId') companyId: string, @Query('timestamp') timestamp: string) {
    this.scope(req, companyId);
    return this.replayService.getSnapshotAt(companyId, parseNum('timestamp', timestamp, true)!);
  }

  @Get('history/entity/:companyId/:entityId')
  async getHistoricalEntity(
    @Request() req, @Param('companyId') companyId: string, @Param('entityId') entityId: string,
    @Query('timestamp') timestamp?: string, @Query('sequence') sequence?: string, @Query('eventId') eventId?: string,
  ) {
    this.scope(req, companyId);
    return this.replayService.getEntityAt(companyId, entityId, this.target(timestamp, sequence, eventId));
  }

  @Get('history/events/:companyId')
  async getHistoricalEvents(
    @Request() req, @Param('companyId') companyId: string,
    @Query('startTime') startTime?: string, @Query('endTime') endTime?: string,
    @Query('fromSequence') fromSequence?: string, @Query('toSequence') toSequence?: string,
    @Query('entityId') entityId?: string, @Query('correlationId') correlationId?: string,
    @Query('limit') limit?: string,
  ) {
    this.scope(req, companyId);
    return this.replayService.getHistoricalEvents(companyId, {
      startTime: parseNum('startTime', startTime),
      endTime: parseNum('endTime', endTime),
      fromSequence: parseNum('fromSequence', fromSequence),
      toSequence: parseNum('toSequence', toSequence),
      entityId: entityId || undefined,
      correlationId: correlationId || undefined,
      limit: parseNum('limit', limit),
    });
  }

  @Get('history/window/:companyId')
  async getReplayWindow(@Request() req, @Param('companyId') companyId: string, @Query('from') from: string, @Query('to') to: string) {
    const actorId = this.scope(req, companyId);
    this.replaySessions.refresh(actorId, companyId);
    return this.replayService.getReplayWindow(companyId, parseNum('from', from, true)!, parseNum('to', to, true)!);
  }

  @Get('history/trace/:companyId/:eventId')
  async traceEvent(@Request() req, @Param('companyId') companyId: string, @Param('eventId') eventId: string) {
    this.scope(req, companyId);
    return this.replayService.traceEvent(companyId, eventId);
  }

  @Post('history/baseline/:companyId')
  async captureBaseline(@Request() req, @Param('companyId') companyId: string) {
    this.scope(req, companyId);
    return this.replayService.captureBaseline(companyId);
  }

  @Get('history/health/:companyId')
  async historyHealth(@Request() req, @Param('companyId') companyId: string) {
    this.scope(req, companyId);
    return { ...this.eventService.getHistoryHealth(), retentionDays: this.replayService.retentionDays };
  }

  @Post('replay/session/:companyId')
  async enterReplay(@Request() req, @Param('companyId') companyId: string) {
    const actorId = this.scope(req, companyId);
    return this.replaySessions.enter(actorId, companyId);
  }

  @Delete('replay/session/:companyId')
  async exitReplay(@Request() req, @Param('companyId') companyId: string) {
    const actorId = this.scope(req, companyId);
    return this.replaySessions.exit(actorId);
  }

  @Get('replay/session/:companyId')
  async replaySession(@Request() req, @Param('companyId') companyId: string) {
    const actorId = this.scope(req, companyId);
    return this.replaySessions.get(actorId);
  }

  @StreamTokenAuth()
  @Sse('stream/:companyId')
  stream(@Request() req, @Param('companyId') companyId: string, @Query('viewportEntityId') viewportEntityId?: string): Observable<MessageEvent> {
    this.scope(req, companyId);
    // In a full implementation, the stream can be filtered by gatewayService.isInViewport(companyId, event.entityId, viewportEntityId).
    // For now, we emit delta events. The snapshot provides the initial culled state.
    return this.eventService.getCompanyStream(companyId).pipe(
      map((event) => {
        return {
          data: event as any,
          type: event.eventType
        } as MessageEvent;
      })
    );
  }
}

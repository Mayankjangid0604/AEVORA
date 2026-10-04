import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { WorldStateGatewayController } from './world-state-gateway.controller';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateReplayService } from './world-state-replay.service';
import { ReplaySessionService } from './replay-session.service';
import { Subject, firstValueFrom } from 'rxjs';

const reqFor = (companyId: string, actorId = 'actor-a') => ({ user: { actorId, actorRole: 'CHAIRMAN', companyId } });

describe('WorldStateGatewayController', () => {
  let controller: WorldStateGatewayController;
  let eventService: any;
  let replayService: any;
  let gatewayService: any;
  let sessions: ReplaySessionService;
  let mockStream: Subject<any>;

  beforeEach(async () => {
    mockStream = new Subject<any>();
    gatewayService = { generateSnapshot: jest.fn().mockResolvedValue({ version: '1.0.0' }) };
    eventService = {
      getCompanyStream: jest.fn().mockReturnValue(mockStream.asObservable()),
      getHistoryHealth: jest.fn().mockReturnValue({ healthy: true }),
    };
    replayService = {
      retentionDays: 30,
      getHistoricalEvents: jest.fn().mockResolvedValue({ events: [] }),
      getWorldState: jest.fn().mockResolvedValue({ status: 'CURRENT' }),
      getSnapshotAt: jest.fn().mockResolvedValue({ status: 'HISTORICAL' }),
      getEntityAt: jest.fn().mockResolvedValue({ status: 'HISTORICAL' }),
      getReplayWindow: jest.fn().mockResolvedValue({ status: 'HISTORICAL' }),
      traceEvent: jest.fn().mockResolvedValue({ status: 'HISTORICAL' }),
      captureBaseline: jest.fn().mockResolvedValue({ status: 'COMMITTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorldStateGatewayController],
      providers: [
        { provide: WorldStateGatewayService, useValue: gatewayService },
        { provide: WorldStateEventService, useValue: eventService },
        { provide: WorldStateReplayService, useValue: replayService },
        ReplaySessionService,
      ],
    }).compile();

    controller = module.get<WorldStateGatewayController>(WorldStateGatewayController);
    sessions = module.get(ReplaySessionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get snapshot', async () => {
    const res = await controller.getSnapshot(reqFor('comp-1'), 'comp-1');
    expect(res).toBeDefined();
    expect(res.version).toBe('1.0.0');
  });

  it('should return an SSE stream observable that wraps events in MessageEvent', async () => {
    const streamObservable = controller.stream(reqFor('comp-1'), 'comp-1');
    const promise = firstValueFrom(streamObservable);
    const mockV12Event = { eventType: 'ENTITY_UPDATED', entityId: 'ent-1', sequence: 101 };
    mockStream.next(mockV12Event);
    const messageEvent = await promise;
    expect(messageEvent.type).toBe('ENTITY_UPDATED');
    expect(messageEvent.data).toEqual(mockV12Event);
  });

  describe('multi-company isolation', () => {
    const A = 'company-A';
    const B = 'company-B';
    const reqA = reqFor(A);

    const routes: Array<[string, () => Promise<any> | any]> = [
      ['snapshot', () => controller.getSnapshot(reqA, B)],
      ['history/state', () => controller.getWorldState(reqA, B, '1000')],
      ['history/snapshot', () => controller.getHistoricalSnapshot(reqA, B, '1000')],
      ['history/entity', () => controller.getHistoricalEntity(reqA, B, 'ent-1', '1000')],
      ['history/events', () => controller.getHistoricalEvents(reqA, B)],
      ['history/window', () => controller.getReplayWindow(reqA, B, '0', '1000')],
      ['history/trace', () => controller.traceEvent(reqA, B, 'evt-1')],
      ['history/baseline', () => controller.captureBaseline(reqA, B)],
      ['history/health', () => controller.historyHealth(reqA, B)],
      ['replay/session enter', () => controller.enterReplay(reqA, B)],
      ['replay/session exit', () => controller.exitReplay(reqA, B)],
      ['replay/session get', () => controller.replaySession(reqA, B)],
      ['stream', () => controller.stream(reqA, B)],
    ];

    it.each(routes)('company A cannot access company B via %s (403)', async (_name, call) => {
      await expect(Promise.resolve().then(call)).rejects.toBeInstanceOf(ForbiddenException);
      // no backing service was reached
      for (const fn of Object.values(replayService)) if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
      expect(gatewayService.generateSnapshot).not.toHaveBeenCalled();
      expect(eventService.getCompanyStream).not.toHaveBeenCalled();
    });

    it('company B session is not created when A tries to enter B replay', async () => {
      await expect(controller.enterReplay(reqA, B)).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessions.isReplayActive('actor-a')).toBe(false);
    });

    it('unauthenticated requests are rejected (401)', async () => {
      await expect(controller.getHistoricalEvents({}, A)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(controller.getReplayWindow({ user: undefined }, A, '0', '1')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('a user without a resolved company is rejected (403)', async () => {
      await expect(controller.getHistoricalEvents({ user: { actorId: 'x' } }, A)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('company A can access its own history, scoped to A', async () => {
      await controller.getHistoricalEvents(reqA, A, '10', '20', undefined, undefined, 'ent-1', undefined, '50');
      expect(replayService.getHistoricalEvents).toHaveBeenCalledWith(A, expect.objectContaining({
        startTime: 10, endTime: 20, entityId: 'ent-1', limit: 50,
      }));
      await controller.getHistoricalEntity(reqA, A, 'ent-1', undefined, '7');
      expect(replayService.getEntityAt).toHaveBeenCalledWith(A, 'ent-1', { timestamp: undefined, sequence: 7, eventId: undefined });
      await controller.traceEvent(reqA, A, 'evt-1');
      expect(replayService.traceEvent).toHaveBeenCalledWith(A, 'evt-1');
    });
  });

  describe('target validation', () => {
    const r = reqFor('c');
    it('rejects more than one target', async () => {
      await expect(controller.getWorldState(r, 'c', '1', '2')).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getHistoricalEntity(r, 'c', 'e', '1', undefined, 'evt')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('rejects non-numeric parameters', async () => {
      await expect(controller.getWorldState(r, 'c', 'abc')).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getHistoricalEvents(r, 'c', undefined, undefined, undefined, undefined, undefined, undefined, 'x'))
        .rejects.toBeInstanceOf(BadRequestException);
    });
    it('requires timestamp for history/snapshot and from/to for window', async () => {
      await expect(controller.getHistoricalSnapshot(r, 'c', undefined as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getReplayWindow(r, 'c', '1', undefined as any)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('no target → CURRENT request passes an empty target', async () => {
      await controller.getWorldState(r, 'c');
      expect(replayService.getWorldState).toHaveBeenCalledWith('c', { timestamp: undefined, sequence: undefined, eventId: undefined });
    });
  });

  describe('replay sessions', () => {
    it('enter / get / exit a server-side replay session', async () => {
      const r = reqFor('c', 'actor-1');
      const entered = await controller.enterReplay(r, 'c');
      expect(entered.active).toBe(true);
      expect(sessions.isReplayActive('actor-1')).toBe(true);
      expect((await controller.replaySession(r, 'c')).active).toBe(true);
      await controller.exitReplay(r, 'c');
      expect(sessions.isReplayActive('actor-1')).toBe(false);
    });

    it('sessions expire after TTL', () => {
      sessions.enter('actor-2', 'c', 1000);
      expect(sessions.isReplayActive('actor-2', 1000 + sessions.ttlMs - 1)).toBe(true);
      expect(sessions.isReplayActive('actor-2', 1000 + sessions.ttlMs)).toBe(false);
    });

    it('history health includes retention days', async () => {
      const h = await controller.historyHealth(reqFor('c'), 'c');
      expect(h).toEqual({ healthy: true, retentionDays: 30 });
    });
  });
});

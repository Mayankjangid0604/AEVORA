import * as http from 'http';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateGatewayController } from './world-state-gateway.controller';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateReplayService } from './world-state-replay.service';
import { ReplaySessionService } from './replay-session.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { V12EventType, V12EntityType, applyEvent, emptyReducedState, ReducedWorldState } from '@aevora/shared';

/**
 * REAL local network verification: this boots the actual NestJS application (real
 * WorldStateGatewayController, real WorldStateEventService — the same class used in production,
 * not a mock), listens on a real ephemeral TCP port, and opens genuine HTTP connections to the
 * real `/world-state/stream/:companyId` SSE endpoint using Node's `http` module directly (not
 * EventSource-in-jsdom, not a direct service-method call). Multiple independent sockets receive
 * the real persist-then-broadcast output and each feeds it through the real production reducer.
 *
 * Same in-memory history-store fake as world-state-event.service.spec.ts, so the real
 * WorldStateEventService's persistence/sequencing/dedup logic runs unmodified.
 */
function makeHistoryPrisma() {
  const rows = new Map<string, any>();
  return {
    v12SpatialHistoryEvent: {
      create: jest.fn(async ({ data }: any) => {
        if (rows.has(data.eventId)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['eventId'] } });
        for (const r of rows.values()) {
          if (r.companyId === data.companyId && r.sequence === data.sequence) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['companyId', 'sequence'] } });
          }
        }
        rows.set(data.eventId, { ...data });
        return data;
      }),
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.eventId) ?? null),
      groupBy: jest.fn(async ({ where }: any) => {
        const max = new Map<string, bigint>();
        for (const r of rows.values()) {
          if (where?.companyId && r.companyId !== where.companyId) continue;
          if (!max.has(r.companyId) || r.sequence > max.get(r.companyId)!) max.set(r.companyId, r.sequence);
        }
        return [...max.entries()].map(([companyId, sequence]) => ({ companyId, _max: { sequence } }));
      }),
    },
    company: { findFirst: jest.fn(async () => null) },
  };
}

/** Opens a real HTTP GET to the SSE endpoint and parses real `data: {...}` frames as they arrive on the socket. */
function openSseClient(port: number, path: string): { events: any[]; close: () => void; waitFor: (n: number, timeoutMs?: number) => Promise<void> } {
  const events: any[] = [];
  let buffer = '';
  let resolveWait: (() => void) | null = null;
  let waitTarget = 0;

  const req = http.get({ host: '127.0.0.1', port, path, headers: { Accept: 'text/event-stream' }, agent: false }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
        if (dataLine) {
          try {
            events.push(JSON.parse(dataLine.slice('data:'.length).trim()));
            if (resolveWait && events.length >= waitTarget) { resolveWait(); resolveWait = null; }
          } catch { /* ignore non-JSON keepalive frames */ }
        }
      }
    });
  });
  req.on('error', () => { /* connection closed during teardown */ });

  return {
    events,
    close: () => req.destroy(),
    waitFor: (n: number, timeoutMs = 3000) => {
      if (events.length >= n) return Promise.resolve();
      waitTarget = n;
      return new Promise<void>((resolve, reject) => {
        resolveWait = resolve;
        setTimeout(() => reject(new Error(`Timed out waiting for ${n} SSE events, got ${events.length}`)), timeoutMs);
      });
    },
  };
}

describe('V12 real HTTP/SSE multi-client acceptance (actual local network sockets, real gateway + real event service)', () => {
  let app: any;
  let port: number;
  let eventService: WorldStateEventService;
  const SECRET = 'v12-sse-e2e-secret';
  const companyId = 'comp-sse-1';

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [WorldStateGatewayController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: PrismaService, useValue: makeHistoryPrisma() },
        WorldStateEventService, // the REAL production class — not a mock
        { provide: WorldStateGatewayService, useValue: { generateSnapshot: jest.fn() } },
        { provide: WorldStateReplayService, useValue: {} },
        { provide: ReplaySessionService, useValue: { isReplayActive: () => false } },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    port = app.getHttpServer().address().port;
    eventService = moduleRef.get(WorldStateEventService);
  });

  afterAll(async () => { await app?.close(); });

  function streamToken(company: string) {
    const jwt = app.get(JwtService);
    return jwt.sign({ actorId: 'actor-1', actorRole: 'EMPLOYEE', companyId: company, purpose: 'sse' }, { expiresIn: '60s' });
  }

  it('three real, independent HTTP/SSE clients receive the real broadcast and converge to identical reduced state, including a deduplicated duplicate', async () => {
    const path = `/world-state/stream/${companyId}?token=${streamToken(companyId)}`;
    const clientA = openSseClient(port, path);
    const clientB = openSseClient(port, path);
    const clientC = openSseClient(port, path);

    // Give the real sockets a moment to actually establish before the first broadcast.
    await new Promise((r) => setTimeout(r, 150));

    const e1 = eventService.createEventEnvelope(V12EventType.ENTITY_CREATED, 'emp-1', V12EntityType.PERSON, { name: 'Ana' }, companyId);
    await eventService.broadcastEvent(companyId, e1);

    const e2 = eventService.createEventEnvelope(V12EventType.MOVEMENT_STARTED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'MOVING', entityId: 'emp-1', progress: 0 } }, companyId);
    await eventService.broadcastEvent(companyId, e2);

    // A genuine duplicate broadcast of the same event (same eventId+sequence) over the real persistence path.
    const dup = await eventService.broadcastEvent(companyId, e2);
    expect(dup.status).toBe('DUPLICATE');

    const e3 = eventService.createEventEnvelope(V12EventType.MOVEMENT_ARRIVED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'ARRIVED', entityId: 'emp-1', progress: 1 } }, companyId);
    await eventService.broadcastEvent(companyId, e3);

    // Exactly 3 real SSE frames must arrive at each real socket — the duplicate must NOT produce a 4th.
    await Promise.all([clientA.waitFor(3), clientB.waitFor(3), clientC.waitFor(3)]);
    // Give a little extra time to prove a 4th frame does NOT show up for the duplicate.
    await new Promise((r) => setTimeout(r, 150));
    expect(clientA.events.length).toBe(3);
    expect(clientB.events.length).toBe(3);
    expect(clientC.events.length).toBe(3);

    const reduce = (frames: any[]): ReducedWorldState => {
      const state = emptyReducedState();
      for (const envelope of frames) applyEvent(state, envelope);
      return state;
    };

    const stateA = reduce(clientA.events);
    const stateB = reduce(clientB.events);
    const stateC = reduce(clientC.events);

    expect(stateA.entities).toEqual(stateB.entities);
    expect(stateB.entities).toEqual(stateC.entities);
    expect(stateA.movementStates).toEqual(stateB.movementStates);
    expect(stateB.movementStates).toEqual(stateC.movementStates);
    expect(stateA.movementStates['emp-1'].movementState).toBe('ARRIVED');

    clientA.close(); clientB.close(); clientC.close();
  }, 15000);

  it('company isolation holds over the real socket: a client subscribed to a different company never receives this company\'s events', async () => {
    const otherCompanyId = 'comp-sse-2';
    const otherClient = openSseClient(port, `/world-state/stream/${otherCompanyId}?token=${streamToken(otherCompanyId)}`);
    await new Promise((r) => setTimeout(r, 150));

    const e = eventService.createEventEnvelope(V12EventType.ENTITY_CREATED, 'emp-iso', V12EntityType.PERSON, { name: 'Iso' }, companyId);
    await eventService.broadcastEvent(companyId, e);

    await new Promise((r) => setTimeout(r, 300));
    expect(otherClient.events.length).toBe(0);
    otherClient.close();
  }, 10000);

  it('rejects a connection with no valid token (401) at the real HTTP layer', async () => {
    const result = await new Promise<number>((resolve) => {
      const r = http.get({ host: '127.0.0.1', port, path: `/world-state/stream/${companyId}`, agent: false }, (res) => { res.resume(); resolve(res.statusCode!); });
      r.on('error', () => resolve(-1));
    });
    expect(result).toBe(401);
  });
});

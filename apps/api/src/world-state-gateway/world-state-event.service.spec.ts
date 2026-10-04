import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateEventService, SpatialHistoryPersistenceError } from './world-state-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { V12EventType, V12EntityType, V12EventEnvelope } from '@aevora/shared';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

function makePrisma() {
  const rows = new Map<string, any>();
  const prisma: any = {
    rows,
    v12SpatialHistoryEvent: {
      create: jest.fn(async ({ data }) => {
        if (rows.has(data.eventId)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['eventId'] } });
        for (const r of rows.values()) {
          if (r.companyId === data.companyId && r.sequence === data.sequence) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['companyId', 'sequence'] } });
          }
        }
        rows.set(data.eventId, { ...data });
        return data;
      }),
      findUnique: jest.fn(async ({ where }) => rows.get(where.eventId) ?? null),
      groupBy: jest.fn(async ({ where }) => {
        const max = new Map<string, bigint>();
        for (const r of rows.values()) {
          if (where?.companyId && r.companyId !== where.companyId) continue;
          if (!max.has(r.companyId) || r.sequence > max.get(r.companyId)!) max.set(r.companyId, r.sequence);
        }
        return [...max.entries()].map(([companyId, sequence]) => ({ companyId, _max: { sequence } }));
      }),
    },
  };
  return prisma;
}

describe('WorldStateEventService', () => {
  let service: WorldStateEventService;
  let prisma: any;

  beforeAll(() => { process.env.V12_HISTORY_PERSIST_BACKOFF_MS = '0'; });

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorldStateEventService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WorldStateEventService>(WorldStateEventService);
  });

  const envelope = (companyId = 'comp-1', entityId = 'ent-1') =>
    service.createEventEnvelope(V12EventType.ENTITY_UPDATED, entityId, V12EntityType.PERSON, { a: 1 }, companyId, 'cause-1', 'corr-1');

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should maintain monotonically increasing sequence per company', () => {
    const companyId = 'comp-1';
    const initSeq = service.getCurrentSequence(companyId);

    const env1 = service.createEventEnvelope(V12EventType.ENTITY_UPDATED, 'ent-1', V12EntityType.PERSON, {}, companyId);
    expect(env1.sequence).toBe(initSeq + 1);

    const env2 = service.createEventEnvelope(V12EventType.ENTITY_UPDATED, 'ent-2', V12EntityType.PERSON, {}, companyId);
    expect(env2.sequence).toBe(initSeq + 2);
    
    expect(service.getCurrentSequence(companyId)).toBe(initSeq + 2);
  });

  it('should isolate sequences between different companies', () => {
    const comp1 = 'comp-1';
    const comp2 = 'comp-2';

    const initSeq1 = service.getCurrentSequence(comp1);
    const initSeq2 = service.getCurrentSequence(comp2);

    service.createEventEnvelope(V12EventType.ENTITY_UPDATED, 'ent-1', V12EntityType.PERSON, {}, comp1);
    
    expect(service.getCurrentSequence(comp1)).toBe(initSeq1 + 1);
    expect(service.getCurrentSequence(comp2)).toBe(initSeq2);
  });

  it('should broadcast events to the correct company stream', async () => {
    const companyId = 'comp-1';
    const otherCompanyId = 'comp-2';
    
    const streamPromise = firstValueFrom(service.getCompanyStream(companyId).pipe(take(1)));
    
    let otherStreamHit = false;
    service.getCompanyStream(otherCompanyId).subscribe(() => {
      otherStreamHit = true;
    });

    const env = service.createEventEnvelope(V12EventType.ENTITY_UPDATED, 'ent-1', V12EntityType.PERSON, {}, companyId);
    await service.broadcastEvent(companyId, env);

    const receivedEvent = await streamPromise;
    expect(receivedEvent.eventId).toBe(env.eventId);
    expect(otherStreamHit).toBe(false);
  });

  describe('persistence safety (persist -> broadcast)', () => {
    it('persists with all trace fields BEFORE broadcasting', async () => {
      const order: string[] = [];
      prisma.v12SpatialHistoryEvent.create.mockImplementationOnce(async ({ data }) => { order.push('persist'); prisma.rows.set(data.eventId, data); return data; });
      service.getCompanyStream('comp-1').subscribe(() => order.push('broadcast'));

      const env = envelope();
      const res = await service.broadcastEvent('comp-1', env);

      expect(res).toEqual({ status: 'COMMITTED', eventId: env.eventId, sequence: env.sequence, attempts: 1 });
      expect(order).toEqual(['persist', 'broadcast']);
      const data = prisma.v12SpatialHistoryEvent.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        eventId: env.eventId, sequence: BigInt(env.sequence), companyId: 'comp-1', entityId: 'ent-1',
        entityType: V12EntityType.PERSON, correlationId: 'corr-1', causationId: 'cause-1', eventType: V12EventType.ENTITY_UPDATED,
      });
      expect(data.authoritativeTimestamp).toEqual(new Date(env.authoritativeTimestamp));
    });

    it('does NOT broadcast and surfaces a typed error when persistence fails', async () => {
      prisma.v12SpatialHistoryEvent.create.mockRejectedValue(new Error('connection refused'));
      const received: V12EventEnvelope[] = [];
      const failures: SpatialHistoryPersistenceError[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));
      service.persistenceFailures().subscribe(f => failures.push(f));

      const env = envelope();
      await expect(service.broadcastEvent('comp-1', env)).rejects.toBeInstanceOf(SpatialHistoryPersistenceError);

      expect(received).toHaveLength(0);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ eventId: env.eventId, companyId: 'comp-1', attempts: 3, retryable: true });
      expect(service.getHistoryHealth()).toMatchObject({ failures: 1, committed: 0 });
    });

    it('retries transient failures and broadcasts once on success', async () => {
      prisma.v12SpatialHistoryEvent.create
        .mockRejectedValueOnce(new Error('timeout'))
        .mockImplementationOnce(async ({ data }) => { prisma.rows.set(data.eventId, data); return data; });
      const received: V12EventEnvelope[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));

      const res = await service.broadcastEvent('comp-1', envelope());
      expect(res.status).toBe('COMMITTED');
      expect(res.attempts).toBe(2);
      expect(received).toHaveLength(1);
    });

    it('recovers an ambiguous earlier write (row landed, error returned) and broadcasts exactly once', async () => {
      prisma.v12SpatialHistoryEvent.create.mockImplementationOnce(async ({ data }) => {
        prisma.rows.set(data.eventId, data);
        throw new Error('socket hang up after commit');
      });
      const received: V12EventEnvelope[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));

      const res = await service.broadcastEvent('comp-1', envelope());
      expect(res.status).toBe('RECOVERED');
      expect(received).toHaveLength(1);
    });

    it('is idempotent for duplicate eventIds: persisted once, broadcast once', async () => {
      const received: V12EventEnvelope[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));
      const env = envelope();

      expect((await service.broadcastEvent('comp-1', env)).status).toBe('COMMITTED');
      expect((await service.broadcastEvent('comp-1', env)).status).toBe('DUPLICATE');
      expect(prisma.rows.size).toBe(1);
      expect(received).toHaveLength(1);
      expect(service.getHistoryHealth()).toMatchObject({ committed: 1, duplicates: 1 });
    });

    it('rejects an eventId reused for a different event without broadcasting', async () => {
      const env = envelope();
      await service.broadcastEvent('comp-1', env);
      const forged = { ...envelope(), eventId: env.eventId };
      const received: V12EventEnvelope[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));

      await expect(service.broadcastEvent('comp-1', forged)).rejects.toMatchObject({ retryable: false });
      expect(received).toHaveLength(0);
    });

    it('fails (no broadcast) on a sequence collision and re-seeds so later events recover', async () => {
      prisma.rows.set('other-writer', { eventId: 'other-writer', companyId: 'comp-1', sequence: BigInt(1) });
      const env = envelope(); // sequence 1, stale counter
      await expect(service.broadcastEvent('comp-1', env)).rejects.toBeInstanceOf(SpatialHistoryPersistenceError);
      expect(service.getCurrentSequence('comp-1')).toBe(1);
      const next = envelope();
      expect(next.sequence).toBe(2);
      expect((await service.broadcastEvent('comp-1', next)).status).toBe('COMMITTED');
    });

    it('commits serially per company so persisted and broadcast order equals sequence order', async () => {
      let release!: () => void;
      const gate = new Promise<void>(r => { release = r; });
      prisma.v12SpatialHistoryEvent.create.mockImplementationOnce(async ({ data }) => { await gate; prisma.rows.set(data.eventId, data); return data; });
      const received: number[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e.sequence));

      const a = envelope(); const b = envelope(); const c = envelope();
      const pa = service.broadcastEvent('comp-1', a);
      const pb = service.broadcastEvent('comp-1', b);
      const pc = service.broadcastEvent('comp-1', c);
      await new Promise(r => setImmediate(r));
      expect(received).toEqual([]);
      release();
      await Promise.all([pa, pb, pc]);
      expect(received).toEqual([a.sequence, b.sequence, c.sequence]);
      expect([a.sequence, b.sequence, c.sequence]).toEqual([1, 2, 3]);
    });

    it('a failure does not block later commits for the same company', async () => {
      prisma.v12SpatialHistoryEvent.create.mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'));
      await expect(service.broadcastEvent('comp-1', envelope())).rejects.toBeDefined();
      expect((await service.broadcastEvent('comp-1', envelope())).status).toBe('COMMITTED');
    });

    it('seeds sequences from persisted history so ordering survives restarts (no wall-clock seeds)', async () => {
      prisma.rows.set('x', { eventId: 'x', companyId: 'comp-9', sequence: BigInt(41) });
      await service.seedSequences();
      expect(service.getCurrentSequence('comp-9')).toBe(41);
      expect(service.getCurrentSequence('never-seen')).toBe(0);
      expect(envelope('comp-9').sequence).toBe(42);
      expect(service.getHistoryHealth().sequencesSeeded).toBe(true);
    });

    it('keeps running (and reports) when the history store is unavailable at startup', async () => {
      prisma.v12SpatialHistoryEvent.groupBy.mockRejectedValueOnce(new Error('relation does not exist'));
      await service.seedSequences();
      expect(service.getHistoryHealth().sequencesSeeded).toBe(false);
    });

    it('commits baselines inside the queue and broadcasts only a lightweight marker', async () => {
      const received: V12EventEnvelope[] = [];
      service.getCompanyStream('comp-1').subscribe(e => received.push(e));
      const res = await service.commitBaseline('comp-1', async () => ({ entities: { a: { id: 'a' }, b: { id: 'b' } } }));
      expect(res.status).toBe('COMMITTED');
      const stored = prisma.rows.get(res.eventId);
      expect(stored.eventType).toBe(V12EventType.WORLD_BASELINE);
      expect(Object.keys(stored.payload.entities)).toEqual(['a', 'b']);
      expect(received[0].payload).toEqual({ baseline: true, entityCount: 2 });
    });
  });
});

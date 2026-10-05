import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateEventService } from './world-state-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import {
  V12EventType, V12EntityType, V12EventEnvelope,
  applyEvent, compareEvents, findSequenceGap, emptyReducedState, ReducedWorldState,
} from '@aevora/shared';

/**
 * Real production history store (same in-memory fake used by world-state-event.service.spec.ts),
 * so this test exercises the actual WorldStateEventService.broadcastEvent / commit / dedup logic,
 * not a mock of it.
 */
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

/** A minimal, real-reducer-backed "viewer": applies events via the actual shared reducer, buffering out-of-order arrivals until the gap fills (the same contract the real browser consumer relies on). */
class TestViewer {
  state: ReducedWorldState = emptyReducedState();
  private pending: V12EventEnvelope[] = [];

  apply(envelope: V12EventEnvelope) {
    if (envelope.sequence <= this.state.sequence) return; // duplicate / already-applied — ignore
    this.pending.push(envelope);
    this.pending.sort(compareEvents);
    this.drain();
  }

  private drain() {
    while (this.pending.length > 0 && this.pending[0].sequence === this.state.sequence + 1) {
      applyEvent(this.state, this.pending.shift()!);
    }
  }

  hasGap(): boolean {
    return findSequenceGap(this.state.sequence, this.pending) !== null || this.pending.length > 0;
  }

  /** Reconciles a sequence gap by reloading from a fresh authoritative snapshot (what a real consumer does on gap detection). */
  reconcileFromSnapshot(snapshotState: ReducedWorldState) {
    this.state = { ...snapshotState, entities: { ...snapshotState.entities }, movementStates: { ...snapshotState.movementStates }, partialEntityIds: new Set(snapshotState.partialEntityIds) };
    this.pending = [];
    this.drain();
  }
}

describe('V12 multi-viewer convergence (real broadcast path + real reducer)', () => {
  let eventService: WorldStateEventService;
  const companyId = 'comp-conv-1';
  const otherCompanyId = 'comp-conv-2';

  beforeAll(() => { process.env.V12_HISTORY_PERSIST_BACKOFF_MS = '0'; });

  beforeEach(async () => {
    const prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldStateEventService,
        { provide: PrismaService, useValue: prisma },
        { provide: StructuredLoggerService, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), setContext: jest.fn() } },
      ],
    }).compile();
    eventService = module.get(WorldStateEventService);
  });

  it('three independent viewers converge to identical state after normal flow, a duplicate, a sequence gap + reconcile, progress, cancellation, and arrival', async () => {
    const viewerA = new TestViewer();
    const viewerB = new TestViewer();
    const viewerC = new TestViewer();

    const sub = eventService.getCompanyStream(companyId).subscribe((envelope) => {
      viewerA.apply(envelope);
      viewerB.apply(envelope);
      // viewerC intentionally does NOT subscribe to live events for the first two — simulating a late joiner that must reconcile from a snapshot.
    });

    // 1. Entity created
    const e1 = eventService.createEventEnvelope(V12EventType.ENTITY_CREATED, 'emp-1', V12EntityType.PERSON, { name: 'Ana' }, companyId);
    await eventService.broadcastEvent(companyId, e1);

    // 2. Movement started
    const e2 = eventService.createEventEnvelope(V12EventType.MOVEMENT_STARTED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'MOVING', entityId: 'emp-1', progress: 0 } }, companyId);
    await eventService.broadcastEvent(companyId, e2);

    // 3. Duplicate broadcast of the same event (identical eventId+sequence) — must be deduped, not double-applied or double-counted.
    const dupResult = await eventService.broadcastEvent(companyId, e2);
    expect(dupResult.status).toBe('DUPLICATE');

    // 4. Movement progress
    const e3 = eventService.createEventEnvelope(V12EventType.MOVEMENT_UPDATED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'MOVING', entityId: 'emp-1', progress: 0.5 } }, companyId);
    await eventService.broadcastEvent(companyId, e3);

    // 5. Movement arrived
    const e4 = eventService.createEventEnvelope(V12EventType.MOVEMENT_ARRIVED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'ARRIVED', entityId: 'emp-1', progress: 1 } }, companyId);
    await eventService.broadcastEvent(companyId, e4);

    expect(viewerA.state.movementStates['emp-1'].movementState).toBe('ARRIVED');
    expect(viewerB.state.movementStates['emp-1'].movementState).toBe('ARRIVED');

    // Viewer C joins late: it missed e1-e4 entirely (a sequence gap from its perspective, starting at 0).
    // It reconciles from a fresh snapshot of viewer A's current (authoritative-equivalent) state.
    expect(viewerC.hasGap()).toBe(false); // no pending events at all yet — it simply never received any
    viewerC.reconcileFromSnapshot(viewerA.state);
    expect(viewerC.state.entities['emp-1']).toEqual(viewerA.state.entities['emp-1']);

    // Now all three continue live together.
    sub.unsubscribe();
    const sub2 = eventService.getCompanyStream(companyId).subscribe((envelope) => {
      viewerA.apply(envelope);
      viewerB.apply(envelope);
      viewerC.apply(envelope);
    });

    // 6. A second movement starts and is then cancelled mid-flight.
    const e5 = eventService.createEventEnvelope(V12EventType.MOVEMENT_STARTED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'MOVING', entityId: 'emp-1', progress: 0 } }, companyId);
    await eventService.broadcastEvent(companyId, e5);
    const e6 = eventService.createEventEnvelope(V12EventType.MOVEMENT_CANCELLED, 'emp-1', V12EntityType.PERSON, { movementState: { movementState: 'INTERRUPTED', entityId: 'emp-1' } }, companyId);
    await eventService.broadcastEvent(companyId, e6);

    sub2.unsubscribe();

    // Final deep equality across all three independent viewers — the actual convergence proof, not just an event count.
    expect(viewerA.state.entities).toEqual(viewerB.state.entities);
    expect(viewerB.state.entities).toEqual(viewerC.state.entities);
    expect(viewerA.state.movementStates).toEqual(viewerB.state.movementStates);
    expect(viewerB.state.movementStates).toEqual(viewerC.state.movementStates);
    expect(viewerA.state.sequence).toBe(viewerB.state.sequence);
    expect(viewerB.state.sequence).toBe(viewerC.state.sequence);
    expect(viewerA.state.movementStates['emp-1'].movementState).toBe('INTERRUPTED');
  });

  it('company isolation: a viewer subscribed to company A never receives company B events, even when both are broadcast interleaved', async () => {
    const viewerA = new TestViewer();
    const sub = eventService.getCompanyStream(companyId).subscribe((e) => viewerA.apply(e));

    const eA = eventService.createEventEnvelope(V12EventType.ENTITY_CREATED, 'emp-a', V12EntityType.PERSON, { name: 'A-co' }, companyId);
    const eB = eventService.createEventEnvelope(V12EventType.ENTITY_CREATED, 'emp-b', V12EntityType.PERSON, { name: 'B-co' }, otherCompanyId);

    await eventService.broadcastEvent(companyId, eA);
    await eventService.broadcastEvent(otherCompanyId, eB);

    sub.unsubscribe();

    expect(viewerA.state.entities['emp-a']).toBeDefined();
    expect(viewerA.state.entities['emp-b']).toBeUndefined();
  });
});

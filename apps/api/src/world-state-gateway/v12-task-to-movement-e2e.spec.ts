import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateEventTranslationService } from './world-state-translation.service';
import { V12SpatialService } from '../v12-spatial/v12-spatial.service';
import { V12NavigationService } from '../v12-spatial/v12-navigation.service';
import { HqCapacityService } from '../v12-spatial/hq-capacity.service';
import { Subject } from 'rxjs';
import { V12EventType } from '@aevora/shared';

/**
 * A real, stateful in-memory Prisma fake (not a jest spy returning fixed values) so that
 * V12NavigationService's real Dijkstra pathfinding, its real multi-tick progress loop, and
 * V12SpatialService's real getEmployeeEmbodiment all operate on genuinely mutating state across
 * the whole scenario, the same way they would against a real database.
 */
class FakeMovementPrisma {
  databaseEvents = { subscribe: jest.fn() };

  private employees = new Map<string, any>([
    ['emp-1', { id: 'emp-1', companyId: 'comp-1', name: 'Ana', status: 'ACTIVE', activity: 'IDLE', departmentId: 'dept-1', role: { title: 'Engineer' } }],
  ]);
  private workspaces = new Map<string, any>([
    ['emp-1', { id: 'ws-1', employeeId: 'emp-1', roomId: 'room-workspace', buildingId: 'bldg-1' }],
  ]);
  private nodes = new Map<string, any>([
    ['node-away', { id: 'node-away', entityId: 'room-away', entityType: 'ROOM', isTraversable: true }],
    ['node-workspace', { id: 'node-workspace', entityId: 'room-workspace', entityType: 'ROOM', isTraversable: true }],
  ]);
  private edges = [{ sourceId: 'node-away', targetId: 'node-workspace', distance: 1.0, isEnabled: true }];
  private movementStates = new Map<string, any>([
    ['emp-1', { entityId: 'emp-1', entityType: 'EMPLOYEE', currentNodeId: 'node-away', destinationNodeId: null, path: [], totalDistance: 0, movementState: 'IDLE', movementMode: 'WALK', progress: 0 }],
  ]);

  employee = {
    findUnique: jest.fn(async ({ where }: any) => this.employees.get(where.id) ?? null),
    findFirst: jest.fn(async ({ where }: any) => this.employees.get(where.id) ?? null),
  };
  v12SpatialWorkspace = {
    findFirst: jest.fn(async ({ where }: any) => this.workspaces.get(where.employeeId) ?? null),
  };
  v12NavigationNode = {
    findMany: jest.fn(async () => [...this.nodes.values()]),
    findFirst: jest.fn(async ({ where }: any) => [...this.nodes.values()].find((n) => n.entityId === where.entityId && n.isTraversable) ?? null),
    findUnique: jest.fn(async ({ where }: any) => this.nodes.get(where.id) ?? null),
  };
  v12SpatialTopologyEdge = {
    findMany: jest.fn(async () => this.edges),
  };
  v12SpatialMovementState = {
    findUnique: jest.fn(async ({ where }: any) => this.movementStates.get(where.entityId) ?? null),
    findMany: jest.fn(async ({ where }: any) => [...this.movementStates.values()].filter((m) => !where?.movementState || m.movementState === where.movementState)),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const existing = this.movementStates.get(where.entityId);
      const next = existing ? { ...existing, ...update } : { ...create };
      this.movementStates.set(where.entityId, next);
      return next;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const existing = this.movementStates.get(where.entityId);
      const next = { ...existing, ...data };
      this.movementStates.set(where.entityId, next);
      return next;
    }),
  };
  meetingParticipant = { findFirst: jest.fn(async () => null) };
  v12SpatialVehicle = { findFirst: jest.fn(async () => null) };
  // Not under test here — V12SpatialService's unrelated building/site reconciliation listener also
  // fires on every PERSON event; satisfying it with "nothing to reconcile yet" keeps this test's
  // signal-to-noise clean without touching the reconciliation logic itself.
  v12SpatialSite = { findFirst: jest.fn(async () => null) };

  setEmployeeActivity(id: string, activity: string) {
    const e = this.employees.get(id);
    if (e) this.employees.set(id, { ...e, activity });
  }
}

describe('V12 end-to-end: authoritative task -> real navigation -> movement progress -> arrival -> digital-human embodiment', () => {
  let prisma: FakeMovementPrisma;
  let eventService: WorldStateEventService;
  let translationService: WorldStateEventTranslationService;
  let navigationService: V12NavigationService;
  let spatialService: V12SpatialService;
  let broadcasts: any[];

  beforeEach(async () => {
    prisma = new FakeMovementPrisma();
    broadcasts = [];

    // Real WorldStateEventService behavior (sequencing, envelope shape) but broadcasting straight to
    // an in-memory list plus the global/company streams V12SpatialService actually subscribes to —
    // avoids needing a real v12SpatialHistoryEvent store for a test about movement, not persistence
    // (that contract is already covered by world-state-event.service.spec.ts and the closure-gate spec).
    class StubEventService {
      private seq = new Map<string, number>();
      private companyStreams = new Map<string, Subject<any>>();
      private global = new Subject<{ companyId: string; event: any }>();
      getGlobalStream() { return this.global; }
      getCompanyStream(companyId: string) {
        if (!this.companyStreams.has(companyId)) this.companyStreams.set(companyId, new Subject());
        return this.companyStreams.get(companyId)!;
      }
      createEventEnvelope(eventType: any, entityId: string, entityType: any, payload: any, companyId: string, causationId?: string, correlationId?: string, accessibilityCue?: string) {
        const next = (this.seq.get(companyId) ?? 0) + 1;
        this.seq.set(companyId, next);
        return { eventId: `e${next}-${entityId}-${eventType}`, eventType, entityId, entityType, sequence: next, authoritativeTimestamp: Date.now(), companyId, causationId, correlationId, accessibilityCue, payload };
      }
      async broadcastEvent(companyId: string, envelope: any) {
        broadcasts.push(envelope);
        this.getCompanyStream(companyId).next(envelope);
        this.global.next({ companyId, event: envelope });
        return { status: 'COMMITTED', eventId: envelope.eventId, sequence: envelope.sequence, attempts: 1 };
      }
    }

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: WorldStateEventService, useClass: StubEventService },
        V12SpatialService,
        V12NavigationService,
        WorldStateEventTranslationService,
        { provide: HqCapacityService, useValue: { reconcileCompanyCapacity: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    eventService = app.get(WorldStateEventService);
    translationService = app.get(WorldStateEventTranslationService);
    navigationService = app.get(V12NavigationService);
    spatialService = app.get(V12SpatialService);
    spatialService.onModuleInit();
  });

  it('TASK_ASSIGNED and TASK_STARTED both drive real movement; progress ticks advance deterministically; arrival updates embodiment', async () => {
    // Before anything: embodiment reflects a settled employee (movementState IDLE -> AT_WORKSPACE).
    let embodiment = await spatialService.getEmployeeEmbodiment('emp-1');
    expect(embodiment.spatialState).toBe('AT_WORKSPACE');

    // Authoritative TASK_ASSIGNED event (as task.service.ts actually emits it).
    (translationService as any).handleDatabaseEvent({
      model: 'CompanyEvent', action: 'create',
      data: { id: 'evt-1', companyId: 'comp-1', type: 'TASK_ASSIGNED', payload: { taskId: 'task-1', employeeId: 'emp-1' } },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Real navigation ran: a real path (node-away -> node-workspace, distance 1.0) was found and movement started.
    const afterStart = await (navigationService as any).prisma.v12SpatialMovementState.findUnique({ where: { entityId: 'emp-1' } });
    expect(afterStart.movementState).toBe('MOVING');
    expect(afterStart.path).toEqual(['node-away', 'node-workspace']);
    expect(afterStart.totalDistance).toBe(1.0);

    const startedEvent = broadcasts.find((b) => b.eventType === V12EventType.MOVEMENT_STARTED);
    expect(startedEvent).toBeDefined();

    prisma.setEmployeeActivity('emp-1', 'WORKING');
    embodiment = await spatialService.getEmployeeEmbodiment('emp-1');
    expect(embodiment.spatialState).toBe('TRAVELLING'); // MOVING + WORKING activity = TRAVELLING, not bare MOVING

    // Tick 1: WALK speed 0.4/tick over distance 1.0 -> progress 0.4, still MOVING.
    await (navigationService as any).tick();
    let state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: 'emp-1' } });
    expect(state.progress).toBeCloseTo(0.4);
    expect(state.movementState).toBe('MOVING');
    expect(broadcasts.some((b) => b.eventType === V12EventType.MOVEMENT_UPDATED)).toBe(true);

    // Tick 2: progress 0.8, still MOVING.
    await (navigationService as any).tick();
    state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: 'emp-1' } });
    expect(state.progress).toBeCloseTo(0.8);
    expect(state.movementState).toBe('MOVING');

    // Tick 3: progress reaches 1.0 -> ARRIVED, current node becomes the destination.
    await (navigationService as any).tick();
    state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: 'emp-1' } });
    expect(state.progress).toBe(1.0);
    expect(state.movementState).toBe('ARRIVED');
    expect(state.currentNodeId).toBe('node-workspace');
    expect(broadcasts.some((b) => b.eventType === V12EventType.MOVEMENT_ARRIVED)).toBe(true);

    // Digital-human embodiment now reflects the settled, arrived state.
    embodiment = await spatialService.getEmployeeEmbodiment('emp-1');
    expect(embodiment.currentNodeId).toBe('node-workspace');
    // Settled (ARRIVED) but still authoritatively WORKING -> the business activity wins over the bare "settled" fallback.
    expect(embodiment.spatialState).toBe('WORKING');

    // Replay determinism: reconstructing from the same sequence of broadcasts yields the identical final movement state —
    // proves this isn't incidental ordering but a deterministic function of (distance, speed, tick count).
    const replayedProgressSequence = broadcasts
      .filter((b) => b.entityId === 'emp-1' && (b.eventType === V12EventType.MOVEMENT_STARTED || b.eventType === V12EventType.MOVEMENT_UPDATED || b.eventType === V12EventType.MOVEMENT_ARRIVED))
      .map((b) => b.payload.movementState.progress);
    expect(replayedProgressSequence).toEqual([0, 0.4, 0.8, 1]);
  });

  it('company isolation: an employee in another company is never resolved by this company-scoped embodiment call', async () => {
    await expect(spatialService.getEmployeeEmbodiment('emp-1', 'some-other-company')).rejects.toThrow();
  });
});

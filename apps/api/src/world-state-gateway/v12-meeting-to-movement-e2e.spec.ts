import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { WorldStateEventTranslationService } from './world-state-translation.service';
import { V12SpatialService } from '../spatial/spatial.service';
import { V12NavigationService } from '../spatial/navigation.service';
import { HqCapacityService } from '../spatial/hq-capacity.service';
import { Subject } from 'rxjs';
import { V12EventType } from '@aevora/shared';

/**
 * Real, stateful in-memory Prisma fake covering two employees, their workspaces, a meeting room in
 * the same building, and a mutable meeting/participant table — so MEETING_STARTED/MEETING_COMPLETED
 * drive real pathfinding and real multi-tick movement exactly as they would in production, not a
 * mocked single-call assertion.
 */
class FakeMeetingPrisma {
  databaseEvents = { subscribe: jest.fn() };

  private employees = new Map<string, any>([
    ['emp-1', { id: 'emp-1', companyId: 'comp-1', name: 'Ana', status: 'ACTIVE', activity: 'IDLE', departmentId: 'dept-1', role: { title: 'Engineer' } }],
    ['emp-2', { id: 'emp-2', companyId: 'comp-1', name: 'Ben', status: 'ACTIVE', activity: 'IDLE', departmentId: 'dept-1', role: { title: 'Engineer' } }],
  ]);
  private workspaces = new Map<string, any>([
    ['emp-1', { id: 'ws-1', employeeId: 'emp-1', roomId: 'room-workspace', buildingId: 'bldg-1' }],
    ['emp-2', { id: 'ws-2', employeeId: 'emp-2', roomId: 'room-workspace', buildingId: 'bldg-1' }],
  ]);
  private nodes = new Map<string, any>([
    ['node-workspace', { id: 'node-workspace', entityId: 'room-workspace', entityType: 'ROOM', isTraversable: true }],
    ['node-meeting', { id: 'node-meeting', entityId: 'room-meeting', entityType: 'ROOM', isTraversable: true }],
  ]);
  private edges = [
    { sourceId: 'node-workspace', targetId: 'node-meeting', distance: 1.0, isEnabled: true },
    { sourceId: 'node-meeting', targetId: 'node-workspace', distance: 1.0, isEnabled: true },
  ];
  private movementStates = new Map<string, any>([
    ['emp-1', { entityId: 'emp-1', entityType: 'EMPLOYEE', currentNodeId: 'node-workspace', destinationNodeId: null, path: [], totalDistance: 0, movementState: 'IDLE', movementMode: 'WALK', progress: 0 }],
    ['emp-2', { entityId: 'emp-2', entityType: 'EMPLOYEE', currentNodeId: 'node-workspace', destinationNodeId: null, path: [], totalDistance: 0, movementState: 'IDLE', movementMode: 'WALK', progress: 0 }],
  ]);
  private meetingStatus = new Map<string, string>([['m1', 'SCHEDULED']]);
  private meetingParticipants = new Map<string, string[]>([['m1', ['emp-1', 'emp-2']]]);

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
  v12SpatialTopologyEdge = { findMany: jest.fn(async () => this.edges) };
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
      const next = { ...this.movementStates.get(where.entityId), ...data };
      this.movementStates.set(where.entityId, next);
      return next;
    }),
  };
  v12SpatialRoom = {
    findFirst: jest.fn(async ({ where }: any) => {
      // Mirrors the real query shape: type: 'MEETING_ROOM', floor: { buildingId }. Only bldg-1 has a meeting room.
      if (where.type === 'MEETING_ROOM' && where.floor?.buildingId === 'bldg-1') return { id: 'room-meeting' };
      return null;
    }),
  };
  v12SpatialVehicle = { findFirst: jest.fn(async () => null) };
  v12SpatialSite = { findFirst: jest.fn(async () => null) };
  meetingParticipant = {
    findFirst: jest.fn(async ({ where }: any) => {
      const participantMeetings = [...this.meetingParticipants.entries()].filter(([, ids]) => ids.includes(where.employeeId));
      const activeMeeting = participantMeetings.find(([meetingId]) => this.meetingStatus.get(meetingId) === where.meeting?.status);
      return activeMeeting ? { meetingId: activeMeeting[0], employeeId: where.employeeId } : null;
    }),
  };

  setEmployeeActivity(id: string, activity: string) {
    const e = this.employees.get(id);
    if (e) this.employees.set(id, { ...e, activity });
  }
  setMeetingStatus(meetingId: string, status: string) {
    this.meetingStatus.set(meetingId, status);
  }
}

describe('V12 end-to-end: authoritative meeting -> real navigation -> movement -> IN_MEETING -> completion -> workspace return', () => {
  let prisma: FakeMeetingPrisma;
  let translationService: WorldStateEventTranslationService;
  let navigationService: V12NavigationService;
  let spatialService: V12SpatialService;
  let broadcasts: any[];

  beforeEach(async () => {
    prisma = new FakeMeetingPrisma();
    broadcasts = [];

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

    translationService = app.get(WorldStateEventTranslationService);
    navigationService = app.get(V12NavigationService);
    spatialService = app.get(V12SpatialService);
    spatialService.onModuleInit();
  });

  it('moves both participants to the meeting room, marks them IN_MEETING on arrival, then returns both to their workspace on completion', async () => {
    // --- Meeting starts ---
    prisma.setEmployeeActivity('emp-1', 'IN_MEETING');
    prisma.setEmployeeActivity('emp-2', 'IN_MEETING');
    prisma.setMeetingStatus('m1', 'IN_PROGRESS');
    (translationService as any).handleDatabaseEvent({
      model: 'CompanyEvent', action: 'create',
      data: { id: 'evt-1', companyId: 'comp-1', type: 'MEETING_STARTED', payload: { meetingId: 'm1', participantIds: ['emp-1', 'emp-2'] } },
    });
    await new Promise((r) => setTimeout(r, 20));

    for (const empId of ['emp-1', 'emp-2']) {
      const state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: empId } });
      expect(state.movementState).toBe('MOVING');
      expect(state.path).toEqual(['node-workspace', 'node-meeting']);
    }
    // Meeting room resolution never crossed into another building — only bldg-1's room was queried/returned.
    expect(prisma.v12SpatialRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ floor: { buildingId: 'bldg-1' } }) }));

    // Drive 3 real ticks (WALK 0.4/tick over distance 1.0) to arrival for both participants.
    for (let i = 0; i < 3; i++) await (navigationService as any).tick();

    for (const empId of ['emp-1', 'emp-2']) {
      const state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: empId } });
      expect(state.movementState).toBe('ARRIVED');
      expect(state.currentNodeId).toBe('node-meeting');

      const embodiment = await spatialService.getEmployeeEmbodiment(empId);
      expect(embodiment.spatialState).toBe('IN_MEETING');
      expect(embodiment.meetingId).toBe('m1');
    }

    // --- Meeting completes ---
    prisma.setEmployeeActivity('emp-1', 'IDLE');
    prisma.setEmployeeActivity('emp-2', 'IDLE');
    prisma.setMeetingStatus('m1', 'COMPLETED');
    (translationService as any).handleDatabaseEvent({
      model: 'CompanyEvent', action: 'create',
      data: { id: 'evt-2', companyId: 'comp-1', type: 'MEETING_COMPLETED', payload: { meetingId: 'm1', participantIds: ['emp-1', 'emp-2'] } },
    });
    await new Promise((r) => setTimeout(r, 20));

    for (const empId of ['emp-1', 'emp-2']) {
      const state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: empId } });
      expect(state.movementState).toBe('MOVING');
      expect(state.path).toEqual(['node-meeting', 'node-workspace']);
    }

    for (let i = 0; i < 3; i++) await (navigationService as any).tick();

    for (const empId of ['emp-1', 'emp-2']) {
      const state = await prisma.v12SpatialMovementState.findUnique({ where: { entityId: empId } });
      expect(state.movementState).toBe('ARRIVED');
      expect(state.currentNodeId).toBe('node-workspace');

      const embodiment = await spatialService.getEmployeeEmbodiment(empId);
      expect(embodiment.spatialState).toBe('AT_WORKSPACE');
      expect(embodiment.meetingId).toBeNull();
    }

    // Deterministic progress sequence identical for both participants proves this wasn't incidental.
    const empProgress = (empId: string) => broadcasts
      .filter((b) => b.entityId === empId && [V12EventType.MOVEMENT_STARTED, V12EventType.MOVEMENT_UPDATED, V12EventType.MOVEMENT_ARRIVED].includes(b.eventType))
      .map((b) => b.payload.movementState.progress);
    expect(empProgress('emp-1')).toEqual([0, 0.4, 0.8, 1, 0, 0.4, 0.8, 1]);
    expect(empProgress('emp-2')).toEqual(empProgress('emp-1'));
  });
});

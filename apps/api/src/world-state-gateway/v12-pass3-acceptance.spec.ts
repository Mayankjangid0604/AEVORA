import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { WorldStateEventTranslationService } from '../world-state-gateway/world-state-translation.service';
import { V12SpatialService } from '../v12-spatial/v12-spatial.service';
import { V12NavigationService } from '../v12-spatial/v12-navigation.service';
import { V12SpatialModule } from '../v12-spatial/v12-spatial.module';
import { WorldStateGatewayModule } from '../world-state-gateway/world-state-gateway.module';
class MockPrismaService {
  databaseEvents = { subscribe: jest.fn() };
  v12SpatialWorkspace = {
    create: jest.fn().mockResolvedValue({ id: 'ws-1', roomId: 'room-1', buildingId: 'bldg-1' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'ws-1', roomId: 'room-1', buildingId: 'bldg-1' })
  };
  v12NavigationNode = {
    create: jest.fn().mockResolvedValue({ id: 'node-1' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'node-1' }),
    findUnique: jest.fn().mockResolvedValue({ id: 'node-1' })
  };
  employee = {
    findUnique: jest.fn().mockResolvedValue({ id: 'emp-1', companyId: 'comp-1', name: 'Test' })
  };
  v12SpatialMovementState = {
    upsert: jest.fn().mockResolvedValue({ id: 'mov-1' }),
    findUnique: jest.fn().mockResolvedValue(null)
  };
  v12SpatialRoom = {
    findFirst: jest.fn().mockResolvedValue({ id: 'meeting-room-1' })
  };
  $transaction = jest.fn(async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(this);
  });
}
const mockPrismaService = new MockPrismaService();

import { Subject } from 'rxjs';
class MockWorldStateEventService {
    private stream = new Subject<any>();
    getGlobalStream() { return this.stream; }
    createEventEnvelope(eventType: any, entityId: any, entityType: any, payload: any, companyId: any, causationId: any) {
        return { 
           eventId: 'ev-1', 
           eventType, 
           entityType, 
           entityId, 
           payload,
           causationId
        };
    }
    async publishEvent(envelope: any, state: any) {
        this.stream.next({ companyId: envelope.companyId || 'comp-1', event: envelope });
    }
    async broadcastEvent(companyId: string, envelope: any) {
        this.stream.next({ companyId, event: envelope });
    }
}
const mockWorldStateEventService = new MockWorldStateEventService();

describe('V12 Enterprise Pass 3 - Autonomous Spatial Behavior', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let translationService: WorldStateEventTranslationService;
  let navigationService: V12NavigationService;
  let spatialService: V12SpatialService;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      providers: [
          { provide: PrismaService, useValue: mockPrismaService },
          V12SpatialService,
          V12NavigationService,
          WorldStateEventTranslationService,
          {
              provide: WorldStateEventService,
              useValue: mockWorldStateEventService
          }
      ],
    }).compile();

    await app.init();

    prisma = app.get(PrismaService);
    translationService = app.get(WorldStateEventTranslationService);
    navigationService = app.get(V12NavigationService);
    spatialService = app.get(V12SpatialService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Scenario 1: Employee Works on Task', () => {
    it('should trigger employee movement to their workspace when TASK_STARTED event occurs', async () => {
       // Seed workspace first
       await prisma.v12SpatialWorkspace.create({
           data: { employeeId: 'emp-1', roomId: 'room-1', name: 'Test Workspace' }
       });
       await prisma.v12NavigationNode.create({
           data: { id: 'node-workspace', entityId: 'room-1', entityType: 'ROOM', isTraversable: true }
       });

       const requestMovementSpy = jest.spyOn(navigationService, 'requestEntityMovement').mockImplementation(async () => ({} as any));

       // Emulate authoritative event
       (translationService as any).handleDatabaseEvent({
          model: 'CompanyEvent',
          action: 'create',
          data: {
              id: 'evt-1',
              companyId: 'comp-1',
              type: 'TASK_STARTED',
              payload: { employeeId: 'emp-1', taskId: 'task-1' }
          }
       });

       // We need to wait for the observable chain
       await new Promise(resolve => setTimeout(resolve, 50));

       expect(requestMovementSpy).toHaveBeenCalledWith('emp-1', 'room-1', expect.anything());
    });
  });

  describe('Scenario 2: Meeting Start/Completion', () => {
    it('should move participants to the meeting room on MEETING_STARTED and back to their workspace on MEETING_COMPLETED', async () => {
      const requestMovementSpy = jest.spyOn(navigationService, 'requestEntityMovement').mockImplementation(async () => ({} as any));

      (translationService as any).handleDatabaseEvent({
        model: 'CompanyEvent',
        action: 'create',
        data: {
          id: 'evt-2',
          companyId: 'comp-1',
          type: 'MEETING_STARTED',
          payload: { meetingId: 'meeting-1', participantIds: ['emp-1'] },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(requestMovementSpy).toHaveBeenCalledWith('emp-1', 'meeting-room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_MEETING' }));

      requestMovementSpy.mockClear();

      (translationService as any).handleDatabaseEvent({
        model: 'CompanyEvent',
        action: 'create',
        data: {
          id: 'evt-3',
          companyId: 'comp-1',
          type: 'MEETING_COMPLETED',
          payload: { meetingId: 'meeting-1', participantIds: ['emp-1'] },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(requestMovementSpy).toHaveBeenCalledWith('emp-1', 'room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_MEETING' }));
    });
  });
});

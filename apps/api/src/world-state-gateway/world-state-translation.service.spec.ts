import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateEventTranslationService } from './world-state-translation.service';
import { PrismaService, DatabaseEvent } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { Subject } from 'rxjs';
import { V12EventType, V12EntityType } from '@aevora/shared';

describe('WorldStateEventTranslationService', () => {
  let service: WorldStateEventTranslationService;
  let eventService: WorldStateEventService;
  let databaseEvents: Subject<DatabaseEvent>;

  beforeEach(async () => {
    databaseEvents = new Subject<DatabaseEvent>();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldStateEventTranslationService,
        {
          provide: PrismaService,
          useValue: {
            databaseEvents
          }
        },
        {
          provide: WorldStateEventService,
          useValue: {
            createEventEnvelope: jest.fn().mockImplementation((eventType, entityId, entityType, payload, companyId, causationId) => ({
              eventType, entityId, entityType, payload, sequence: 101, companyId, causationId
            })),
            broadcastEvent: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<WorldStateEventTranslationService>(WorldStateEventTranslationService);
    eventService = module.get<WorldStateEventService>(WorldStateEventService);
    
    // Manually init to subscribe
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should translate EMPLOYEE_HIRED company event to V12 ENTITY_CREATED event', () => {
    const companyEventData = {
      id: 'evt-123',
      companyId: 'comp-1',
      type: 'EMPLOYEE_HIRED',
      payload: { employeeId: 'emp-1', name: 'John' }
    };

    databaseEvents.next({
      model: 'CompanyEvent',
      action: 'create',
      data: companyEventData
    });

    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_CREATED,
      'v12_person_emp-1',
      V12EntityType.PERSON,
      { name: 'John', aevoraId: 'emp-1' },
      'comp-1',
      'evt-123'
    );
    expect(eventService.broadcastEvent).toHaveBeenCalled();
  });
  
  it('should translate TASK_ASSIGNED to V12 ENTITY_UPDATED event for employee activity', () => {
    const companyEventData = {
      id: 'evt-456',
      companyId: 'comp-1',
      type: 'TASK_ASSIGNED',
      payload: { taskId: 'task-1', employeeId: 'emp-1' }
    };

    databaseEvents.next({
      model: 'CompanyEvent',
      action: 'create',
      data: companyEventData
    });

    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_UPDATED,
      'v12_person_emp-1',
      V12EntityType.PERSON,
      { currentActivity: 'WORKING', originalEvent: 'TASK_ASSIGNED' },
      'comp-1',
      'evt-456'
    );
  });

  it('should translate TASK_COMPLETED with employeeId (regression: payload previously lacked employeeId, so this never reached consumers)', () => {
    databaseEvents.next({
      model: 'CompanyEvent', action: 'create',
      data: { id: 'evt-tc', companyId: 'comp-1', type: 'TASK_COMPLETED', payload: { taskId: 'task-1', employeeId: 'emp-1' } },
    });

    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_UPDATED, 'v12_person_emp-1', V12EntityType.PERSON,
      { currentActivity: 'TASK_COMPLETED', taskId: 'task-1' }, 'comp-1', 'evt-tc',
    );
  });

  it('should translate MEETING_STARTED into a PERSON ENTITY_UPDATED event per participant', () => {
    databaseEvents.next({
      model: 'CompanyEvent',
      action: 'create',
      data: {
        id: 'evt-789',
        companyId: 'comp-1',
        type: 'MEETING_STARTED',
        payload: { meetingId: 'meeting-1', participantIds: ['emp-1', 'emp-2'] },
      },
    });

    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_UPDATED, 'v12_person_emp-1', V12EntityType.PERSON,
      { currentActivity: 'IN_MEETING', originalEvent: 'MEETING_STARTED', meetingId: 'meeting-1' }, 'comp-1', 'evt-789',
    );
    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_UPDATED, 'v12_person_emp-2', V12EntityType.PERSON,
      { currentActivity: 'IN_MEETING', originalEvent: 'MEETING_STARTED', meetingId: 'meeting-1' }, 'comp-1', 'evt-789',
    );
    expect(eventService.broadcastEvent).toHaveBeenCalledTimes(2);
  });

  it('should translate MEETING_COMPLETED into a PERSON ENTITY_UPDATED event per participant', () => {
    databaseEvents.next({
      model: 'CompanyEvent',
      action: 'create',
      data: {
        id: 'evt-790',
        companyId: 'comp-1',
        type: 'MEETING_COMPLETED',
        payload: { meetingId: 'meeting-1', participantIds: ['emp-1'] },
      },
    });

    expect(eventService.createEventEnvelope).toHaveBeenCalledWith(
      V12EventType.ENTITY_UPDATED, 'v12_person_emp-1', V12EntityType.PERSON,
      { currentActivity: 'IDLE', originalEvent: 'MEETING_COMPLETED', meetingId: 'meeting-1' }, 'comp-1', 'evt-790',
    );
  });
});

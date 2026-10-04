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
      { currentActivity: 'TASK_ASSIGNED' },
      'comp-1',
      'evt-456'
    );
  });
});

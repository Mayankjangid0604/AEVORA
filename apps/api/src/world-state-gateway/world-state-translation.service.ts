import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService, DatabaseEvent } from '../prisma/prisma.service';
import { WorldStateEventService } from './world-state-event.service';
import { Subscription } from 'rxjs';
import { V12EntityType, V12EventType } from '@aevora/shared';

@Injectable()
export class WorldStateEventTranslationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldStateEventTranslationService.name);
  private subscription: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: WorldStateEventService
  ) {}

  onModuleInit() {
    this.subscription = this.prisma.databaseEvents.subscribe((event) => {
      this.handleDatabaseEvent(event);
    });
    this.logger.log('Started listening to authoritative database events for V12 translation');
  }

  onModuleDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private handleDatabaseEvent(event: DatabaseEvent) {
    try {
      if (event.model === 'CompanyEvent' && event.action === 'create') {
        this.translateCompanyEvent(event.data);
      } else if (event.model === 'Employee' && (event.action === 'update' || event.action === 'create')) {
        this.translateEmployeeChange(event.data, event.action);
      }
      // Add more authoritative mapping as needed
    } catch (error) {
      this.logger.error(`Error translating database event: ${error.message}`, error.stack);
    }
  }

  /** Persist-then-broadcast. Failures are already logged/published by WorldStateEventService; never swallowed silently. */
  private emit(companyId: string, envelope: any) {
    Promise.resolve(this.eventService.broadcastEvent(companyId, envelope)).catch((err) => {
      this.logger.error(`V12 event ${envelope.eventId} (${envelope.eventType}) was not persisted and was not broadcast: ${err?.message}`);
    });
  }

  private translateCompanyEvent(companyEvent: any) {
    if (!companyEvent || !companyEvent.companyId) return;

    // Example translation: Employee Hired
    if (companyEvent.type === 'EMPLOYEE_HIRED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.employeeId) {
        const envelope = this.eventService.createEventEnvelope(
          V12EventType.ENTITY_CREATED,
          `v12_person_${payload.employeeId}`,
          V12EntityType.PERSON,
          { name: payload.name, aevoraId: payload.employeeId },
          companyEvent.companyId,
          companyEvent.id // causationId
        );
        this.emit(companyEvent.companyId, envelope);
      }
    }
    
    // Example: Task assigned (affects employee activity visually)
    if (companyEvent.type === 'TASK_ASSIGNED' || companyEvent.type === 'TASK_STARTED') {
       const payload = companyEvent.payload as any;
       if (payload && payload.employeeId) {
         // Create a generic entity updated event for the person
         const envelope = this.eventService.createEventEnvelope(
           V12EventType.ENTITY_UPDATED,
           `v12_person_${payload.employeeId}`,
           V12EntityType.PERSON,
           { currentActivity: companyEvent.type },
           companyEvent.companyId,
           companyEvent.id
         );
         this.emit(companyEvent.companyId, envelope);
       }
    }
    
    // Handle location movement (EMPLOYEE_MOVEMENT_STARTED, EMPLOYEE_ARRIVED)
    if (companyEvent.type === 'EMPLOYEE_MOVEMENT_STARTED' || companyEvent.type === 'EMPLOYEE_ARRIVED') {
        const payload = companyEvent.payload as any;
        if (payload && payload.employeeId) {
          const envelope = this.eventService.createEventEnvelope(
            V12EventType.ENTITY_UPDATED,
            `v12_person_${payload.employeeId}`,
            V12EntityType.PERSON,
            { currentActivity: companyEvent.type, locationId: payload.locationId },
            companyEvent.companyId,
            companyEvent.id
          );
          this.emit(companyEvent.companyId, envelope);
        }
    }
  }

  private translateEmployeeChange(employeeData: any, action: string) {
    if (!employeeData || !employeeData.companyId || !employeeData.id) return;
    
    const eventType = action === 'create' ? V12EventType.ENTITY_CREATED : V12EventType.ENTITY_UPDATED;
    
    const envelope = this.eventService.createEventEnvelope(
      eventType,
      `v12_person_${employeeData.id}`,
      V12EntityType.PERSON,
      { name: employeeData.name, currentActivity: employeeData.activity },
      employeeData.companyId
    );
    this.emit(employeeData.companyId, envelope);
  }
}

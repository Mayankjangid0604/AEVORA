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
           { currentActivity: 'WORKING', originalEvent: companyEvent.type },
           companyEvent.companyId,
           companyEvent.id
         );
         this.emit(companyEvent.companyId, envelope);
       }
    }
    
    // Handle location movement (EMPLOYEE_MOVEMENT_STARTED, EMPLOYEE_ARRIVED)
    if (companyEvent.type === 'EMPLOYEE_MOVEMENT_STARTED') {
        const payload = companyEvent.payload as any;
        if (payload && payload.employeeId) {
          const envelope = this.eventService.createEventEnvelope(
            V12EventType.ENTITY_UPDATED,
            `v12_person_${payload.employeeId}`,
            V12EntityType.PERSON,
            { currentActivity: 'TRAVELING', locationId: payload.locationId },
            companyEvent.companyId,
            companyEvent.id
          );
          this.emit(companyEvent.companyId, envelope);
        }
    }
    
    if (companyEvent.type === 'EMPLOYEE_ARRIVED') {
        const payload = companyEvent.payload as any;
        if (payload && payload.employeeId) {
          const envelope = this.eventService.createEventEnvelope(
            V12EventType.ENTITY_UPDATED,
            `v12_person_${payload.employeeId}`,
            V12EntityType.PERSON,
            { currentActivity: 'IDLE', locationId: payload.locationId },
            companyEvent.companyId,
            companyEvent.id
          );
          this.emit(companyEvent.companyId, envelope);
        }
    }

    if (companyEvent.type === 'EMPLOYEE_TRANSFERRED' || companyEvent.type === 'EMPLOYEE_PROMOTED' || companyEvent.type === 'EMPLOYEE_TERMINATED' || companyEvent.type === 'EMPLOYEE_REHIRED' || companyEvent.type === 'EMPLOYEE_SUSPENDED' || companyEvent.type === 'EMPLOYEE_ON_HOLD' || companyEvent.type === 'EMPLOYEE_REACTIVATED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.employeeId) {
        const envelope = this.eventService.createEventEnvelope(
          V12EventType.ENTITY_UPDATED,
          `v12_person_${payload.employeeId}`,
          V12EntityType.PERSON,
          { statusChanged: companyEvent.type, ...payload },
          companyEvent.companyId,
          companyEvent.id
        );
        this.emit(companyEvent.companyId, envelope);
      }
    }

    if (companyEvent.type === 'COMPANY_CREATED' || companyEvent.type === 'COMPANY_PAUSED' || companyEvent.type === 'COMPANY_RESUMED' || companyEvent.type === 'COMPANY_CLOSED') {
      const envelope = this.eventService.createEventEnvelope(
        companyEvent.type === 'COMPANY_CREATED' ? V12EventType.ENTITY_CREATED : V12EventType.ENTITY_UPDATED,
        `v12_company_${companyEvent.companyId}`,
        V12EntityType.COMPANY,
        { statusChanged: companyEvent.type, ...(companyEvent.payload as any) },
        companyEvent.companyId,
        companyEvent.id
      );
      this.emit(companyEvent.companyId, envelope);
    }

    if (companyEvent.type === 'DEPARTMENT_CREATED' || companyEvent.type === 'DEPARTMENT_CHANGED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.departmentId) {
        const envelope = this.eventService.createEventEnvelope(
          companyEvent.type === 'DEPARTMENT_CREATED' ? V12EventType.ENTITY_CREATED : V12EventType.ENTITY_UPDATED,
          `v12_department_${payload.departmentId}`,
          V12EntityType.DEPARTMENT_SPACE,
          payload,
          companyEvent.companyId,
          companyEvent.id
        );
        this.emit(companyEvent.companyId, envelope);
      }
    }

    if (companyEvent.type === 'PROJECT_CREATED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.projectId) {
        const envelope = this.eventService.createEventEnvelope(
          V12EventType.ENTITY_CREATED,
          `v12_project_${payload.projectId}`,
          V12EntityType.ROOM,
          payload,
          companyEvent.companyId,
          companyEvent.id
        );
        this.emit(companyEvent.companyId, envelope);
      }
    }

    if (companyEvent.type === 'TASK_COMPLETED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.employeeId) {
        const envelope = this.eventService.createEventEnvelope(
          V12EventType.ENTITY_UPDATED,
          `v12_person_${payload.employeeId}`,
          V12EntityType.PERSON,
          { currentActivity: 'TASK_COMPLETED', taskId: payload.taskId },
          companyEvent.companyId,
          companyEvent.id
        );
        this.emit(companyEvent.companyId, envelope);
      }
    }

    if (companyEvent.type === 'MEETING_CREATED') {
      const payload = companyEvent.payload as any;
      if (payload && payload.meetingId) {
        const envelope = this.eventService.createEventEnvelope(
          V12EventType.ENTITY_CREATED,
          `v12_meeting_${payload.meetingId}`,
          V12EntityType.MEETING_ROOM,
          payload,
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

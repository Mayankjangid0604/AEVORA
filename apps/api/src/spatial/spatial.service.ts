import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { Subscription } from 'rxjs';
import { V12EntityType } from '@aevora/shared';
import { NavigationService } from './navigation.service';
import { V12EventType } from '@aevora/shared';
import { deriveEmployeeSpatialState, EmployeeSpatialState } from '@aevora/shared';

import { HqCapacityService } from './hq-capacity.service';

export interface DigitalHumanEmbodiment {
  employeeId: string;
  companyId: string;
  name: string;
  departmentId: string | null;
  roleTitle: string | null;
  spatialState: EmployeeSpatialState;
  currentNodeId: string | null;
  destinationNodeId: string | null;
  workspaceId: string | null;
  meetingId: string | null;
  vehicleId: string | null;
}

@Injectable()
export class SpatialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SpatialService.name);
  private sub: Subscription;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly worldStateEventService: WorldStateEventService,
    private readonly navigationService: NavigationService,
    private readonly hqCapacityService: HqCapacityService,
  ) {}

  onModuleInit() {
    this.sub = this.worldStateEventService.getGlobalStream().subscribe(({ companyId, event }) => {
      try {
        if (event.entityType === V12EntityType.PERSON) {
          const empId = event.entityId.replace(/^(v12_person_|spatial_person_|person_)/, '');
          this.triggerEmployeeReconciliation(empId);
          this.handlePersonActivityChange(empId, event);
        } else if (event.entityType === V12EntityType.COMPANY && event.payload?.statusChanged === 'COMPANY_CLOSED') {
          // Aevora's own closeCompany() only sets Company.status = CLOSED — it does not terminate
          // employees or alter departments. V12 mirrors exactly that scope: the site becomes
          // inactive (a visibility/access treatment), nothing is deleted, and no extra business
          // consequence (no employee termination, no vehicle repossession) is invented beyond what
          // Aevora itself does.
          this.deactivateCompanySite(companyId);
        } else if (
          event.entityType === V12EntityType.COMPANY ||
          event.entityType === V12EntityType.DEPARTMENT_SPACE ||
          event.entityType === V12EntityType.ROOM
        ) {
          this.triggerCompanyReconciliation(companyId);
        }
      } catch (err: any) {
        this.logger.error(`Failed to handle spatial consequence for event ${event.eventId}: ${err.message}`, err.stack);
      }
    });
  }

  onModuleDestroy() {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  async seedSaahvikWorld() {
    this.logger.log('Seeding Saahvik World (Idempotent)...');
    
    // 1. World
    const world = await this.prisma.v12SpatialWorld.upsert({
      where: { name: 'Saahvik' },
      update: {},
      create: { name: 'Saahvik', description: 'The authoritative digital enterprise world' }
    });

    // 2. Region
    let region = await this.prisma.v12SpatialRegion.findFirst({ where: { name: 'Core Region', worldId: world.id } });
    if (!region) {
      region = await this.prisma.v12SpatialRegion.create({
        data: { name: 'Core Region', worldId: world.id, posX: 0, posY: 0, posZ: 0 }
      });
    }

    let country = await this.prisma.v12SpatialCountry.findFirst({ where: { name: 'Aevora Republic', regionId: region.id } });
    if (!country) {
      country = await this.prisma.v12SpatialCountry.create({
        data: { name: 'Aevora Republic', regionId: region.id, posX: 0, posY: 0, posZ: 0 }
      });
    }

    let city = await this.prisma.v12SpatialCity.findFirst({ where: { name: 'Genesis City', countryId: country.id } });
    if (!city) {
      city = await this.prisma.v12SpatialCity.create({
        data: { name: 'Genesis City', countryId: country.id, posX: 0, posY: 0, posZ: 0 }
      });
    }

    let site = await this.prisma.v12SpatialSite.findFirst({ where: { name: 'Aevora HQ Campus', cityId: city.id } });
    if (!site) {
      site = await this.prisma.v12SpatialSite.create({
        data: { name: 'Aevora HQ Campus', cityId: city.id, posX: 0, posY: 0, posZ: 0 }
      });
    }
    
    // Headquarters building
    let building = await this.prisma.v12SpatialBuilding.findFirst({ where: { name: 'Aevora Tower', siteId: site.id } });
    if (!building) {
      building = await this.prisma.v12SpatialBuilding.create({
        data: { name: 'Aevora Tower', siteId: site.id, posX: 0, posY: 0, posZ: 0 }
      });
    }
    
    // Floors
    let floor1 = await this.prisma.v12SpatialFloor.findFirst({ where: { name: 'Ground Floor', buildingId: building.id } });
    if (!floor1) {
      floor1 = await this.prisma.v12SpatialFloor.create({
        data: { name: 'Ground Floor', level: 1, buildingId: building.id, posX: 0, posY: 0, posZ: 0 }
      });
    }
    
    let execFloor = await this.prisma.v12SpatialFloor.findFirst({ where: { name: 'Executive Level', buildingId: building.id } });
    if (!execFloor) {
      execFloor = await this.prisma.v12SpatialFloor.create({
        data: { name: 'Executive Level', level: 100, buildingId: building.id, posX: 0, posY: 100, posZ: 0 }
      });
    }

    // HQ Structure
    let chairmanOffice = await this.prisma.v12SpatialRoom.findFirst({ where: { name: 'Chairman Office', floorId: execFloor.id } });
    if (!chairmanOffice) {
      chairmanOffice = await this.prisma.v12SpatialRoom.create({
        data: { name: 'Chairman Office', type: 'CHAIRMAN_OFFICE', floorId: execFloor.id, posX: 0, posY: 0, posZ: -10 }
      });
    }
    
    let ceoOffice = await this.prisma.v12SpatialRoom.findFirst({ where: { name: 'CEO Office', floorId: execFloor.id } });
    if (!ceoOffice) {
      ceoOffice = await this.prisma.v12SpatialRoom.create({
        data: { name: 'CEO Office', type: 'CEO_OFFICE', floorId: execFloor.id, posX: 10, posY: 0, posZ: -10 }
      });
    }
    
    // Parking
    let parking = await this.prisma.v12SpatialParkingArea.findFirst({ where: { name: 'HQ Parking', siteId: site.id } });
    if (!parking) {
      parking = await this.prisma.v12SpatialParkingArea.create({
        data: { name: 'HQ Parking', siteId: site.id, posX: 50, posY: 0, posZ: 50 }
      });
    }

    this.logger.log('Saahvik World Seeded.');
    return { world, region, country, city, site, building, execFloor, chairmanOffice, ceoOffice, parking };
  }

  async reconcileCompanySpatialPresence(companyId: string) {
    this.logger.log(`Reconciling spatial presence for company ${companyId}`);
    
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        departments: true,
        employees: true,
        officeLocations: true
      }
    });

    if (!company) {
      this.logger.warn(`Company ${companyId} not found for spatial reconciliation.`);
      return;
    }

    await this.seedSaahvikWorld();
    await this.hqCapacityService.reconcileCompanyCapacity(companyId);

    // Parking area preservation
    const site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId: company.id } });
    if (site) {
      const parking = await this.prisma.v12SpatialParkingArea.findFirst({ where: { siteId: site.id } });
      if (!parking) {
        await this.prisma.v12SpatialParkingArea.create({
          data: { name: `${company.name} Parking`, siteId: site.id, capacity: 100, availableSpots: 100 }
        });
      }
    }

    this.logger.log(`Spatial presence reconciled for company ${company.name}`);
  }

  async reconcileEmployeeSpatialPresence(employeeId: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { department: true, role: true, company: true }
    });
    
    if (!emp || !emp.companyId) return;

    await this.hqCapacityService.reconcileCompanyCapacity(emp.companyId);
  }

  async backfillAllCompanies() {
    this.logger.log('Starting spatial backfill for all active companies...');
    const companies = await this.prisma.company.findMany();
    for (const company of companies) {
      await this.reconcileCompanySpatialPresence(company.id);
    }
    this.logger.log('Spatial backfill completed.');
  }

  triggerEmployeeReconciliation(employeeId: string) {
    this.reconcileEmployeeSpatialPresence(employeeId).catch(err => {
      this.logger.error(`[RESILIENCE] Spatial reconciliation failed for employee ${employeeId}. Dispatched for background retry.`, err?.stack || String(err));
    });
  }

  /** Marks a closed company's spatial site inactive. Never deletes the site/building/room/history — closure is a visibility/access treatment, reconstructable at any time from the (still intact) authoritative spatial records. */
  async deactivateCompanySite(companyId: string) {
    await this.prisma.v12SpatialSite.updateMany({ where: { companyId }, data: { isActive: false } });
    this.logger.log(`Deactivated spatial site for closed company ${companyId}`);
  }

  triggerCompanyReconciliation(companyId: string) {
    this.reconcileCompanySpatialPresence(companyId).catch(err => {
      this.logger.error(`[RESILIENCE] Spatial reconciliation failed for company ${companyId}. Dispatched for background retry.`, err?.stack || String(err));
    });
  }

  /**
   * The V12 backend "digital human" read-model: authoritative Employee identity plus only the
   * spatial/embodiment concerns V12 owns (position context, activity, meeting/vehicle context).
   * This is NOT a second Employee authority — nothing here is stored independently; it is composed
   * fresh from Employee, V12SpatialMovementState, V12SpatialWorkspace, MeetingParticipant and
   * V12SpatialVehicle on every read, using the same deterministic state machine as the rest of V12.
   */
  async getEmployeeEmbodiment(employeeId: string, requestingCompanyId?: string): Promise<DigitalHumanEmbodiment> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { role: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (requestingCompanyId && employee.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Employee does not belong to the requesting company');
    }

    const [movement, workspace, activeMeeting, ownedVehicle] = await Promise.all([
      this.prisma.v12SpatialMovementState.findUnique({ where: { entityId: employeeId } }),
      this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } }),
      this.prisma.meetingParticipant.findFirst({ where: { employeeId, meeting: { status: 'IN_PROGRESS' } } }),
      this.prisma.v12SpatialVehicle.findFirst({ where: { ownerEmployeeId: employeeId } }),
    ]);

    const spatialState = deriveEmployeeSpatialState({
      movementState: movement?.movementState as any,
      movementMode: movement?.movementMode,
      currentActivity: employee.activity,
      employeeStatus: employee.status,
    });

    return {
      employeeId: employee.id,
      companyId: employee.companyId,
      name: employee.name,
      departmentId: employee.departmentId ?? null,
      roleTitle: employee.role?.title ?? null,
      spatialState,
      currentNodeId: movement?.currentNodeId ?? null,
      destinationNodeId: movement?.destinationNodeId ?? null,
      workspaceId: workspace?.id ?? null,
      meetingId: activeMeeting?.meetingId ?? null,
      vehicleId: spatialState === EmployeeSpatialState.IN_VEHICLE ? (ownedVehicle?.id ?? null) : null,
    };
  }

  async handlePersonActivityChange(employeeId: string, event: any) {
    if (event.eventType !== V12EventType.ENTITY_UPDATED) return;
    const payload = event.payload || {};

    // 1. Employee is assigned or starts a task -> Move to Workspace
    if (payload.currentActivity === 'WORKING' && (payload.originalEvent === 'TASK_STARTED' || payload.originalEvent === 'TASK_ASSIGNED')) {
      const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } });
      if (ws && ws.roomId) {
        await this.navigationService.requestEntityMovement(employeeId, ws.roomId, {
          intentSource: 'ENTERPRISE_TASK',
          intentId: event.causationId,
        }).catch(err => this.logger.error(`Failed to trigger movement to workspace: ${err.message}`));
      }
    }

    // 2. Employee enters a meeting -> Move to a meeting room in their own company's building (company-isolated;
    // the schema has no per-meeting room reservation, so this picks the employee's building's meeting room
    // deterministically, not any company's room).
    if (payload.currentActivity === 'IN_MEETING' && payload.meetingId) {
      const meetingRoom = await this.resolveCompanyMeetingRoom(employeeId);
      if (meetingRoom) {
        await this.navigationService.requestEntityMovement(employeeId, meetingRoom.id, {
          intentSource: 'ENTERPRISE_MEETING',
          intentId: event.causationId,
        }).catch(err => this.logger.error(`Failed to trigger movement to meeting: ${err.message}`));
      }
    }

    // 3. Task completes -> Move back to workspace
    if (payload.currentActivity === 'TASK_COMPLETED') {
      const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } });
      if (ws && ws.roomId) {
        await this.navigationService.requestEntityMovement(employeeId, ws.roomId, {
          intentSource: 'ENTERPRISE_TASK',
          intentId: event.causationId,
        }).catch(err => this.logger.error(`Failed to trigger movement to workspace after task completion: ${err.message}`));
      }
    }

    // 4. Meeting completes -> Move back to workspace
    if (payload.currentActivity === 'IDLE' && payload.originalEvent === 'MEETING_COMPLETED') {
      const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } });
      if (ws && ws.roomId) {
        await this.navigationService.requestEntityMovement(employeeId, ws.roomId, {
          intentSource: 'ENTERPRISE_MEETING',
          intentId: event.causationId,
        }).catch(err => this.logger.error(`Failed to trigger movement to workspace after meeting: ${err.message}`));
      }
    }
  }

  /** Resolves a deterministic meeting room within the employee's own company building (never another company's). */
  private async resolveCompanyMeetingRoom(employeeId: string) {
    const ws = await this.prisma.v12SpatialWorkspace.findFirst({ where: { employeeId } });
    if (!ws || !ws.buildingId) return null;
    return this.prisma.v12SpatialRoom.findFirst({
      where: { type: 'MEETING_ROOM', floor: { buildingId: ws.buildingId } },
      orderBy: { id: 'asc' },
    });
  }
}

export const V12SpatialService = SpatialService;
export type V12SpatialService = SpatialService;

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './v12-navigation.service';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { V12EntityType } from '@aevora/shared';
import {
  VehiclePolicy,
  DEFAULT_VEHICLE_POLICY,
  calculateParkingAreaPosition,
} from './vehicle-policy';

export interface AutoProvisionFleetDto {
  count: number;
  vehicleClass?: 'STANDARD' | 'EXECUTIVE' | 'ASSISTANT' | 'CHAIRMAN' | 'CEO' | 'MD';
  ownerEmployeeId?: string;
  policyOverrides?: Partial<VehiclePolicy>;
}

export interface FleetReconciliationResult {
  companyId: string;
  currentFleetCount: number;
  targetFleetCount: number;
  provisionedCount: number;
  parkingAreasAllocated: number;
  durationMs: number;
  status: 'SYNCHRONIZED' | 'PROVISIONED';
}

/**
 * Authoritative V12 spatial vehicle service.
 * Manages the authoritative lifecycle, fleet auto-provisioning, deterministic
 * parking allocation, parking capacity expansion, and spatial movement state.
 */
@Injectable()
export class V12VehicleService {
  private readonly logger = new Logger(V12VehicleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: WorldStateEventService,
    private readonly navigationService: V12NavigationService,
    private readonly assetRegistry: V12AssetRegistryService,
  ) {}

  /** Retrieves the active vehicle policy with optional company-scoped overrides. */
  getPolicy(overrides?: Partial<VehiclePolicy>): VehiclePolicy {
    return { ...DEFAULT_VEHICLE_POLICY, ...(overrides || {}) };
  }

  /** Derives the vehicle class from the owner's authoritative Role — never invented, only read. */
  private deriveVehicleClass(roleTitle: string | undefined, accessLevel: string | undefined): 'STANDARD' | 'EXECUTIVE' | 'ASSISTANT' | 'CHAIRMAN' | 'CEO' | 'MD' {
    const title = (roleTitle || '').toUpperCase();
    if (accessLevel === 'CHAIRMAN' || title.includes('CHAIRMAN')) return 'CHAIRMAN';
    if (title.includes('CEO')) return 'CEO';
    if (title.includes('MD')) return 'MD';
    if (accessLevel === 'MANAGEMENT') return 'EXECUTIVE';
    return 'STANDARD';
  }

  /**
   * Existing method preserved for full backward compatibility.
   * Creates an authoritative vehicle for an employee and allocates parking.
   */
  async createVehicleForEmployee(ownerEmployeeId: string) {
    const owner = await this.prisma.employee.findUnique({
      where: { id: ownerEmployeeId },
      include: { role: true },
    });
    if (!owner) throw new NotFoundException('Owner employee not found');

    const existing = await this.prisma.v12SpatialVehicle.findUnique({ where: { ownerEmployeeId } });
    if (existing) return existing;

    const vehicleClass = this.deriveVehicleClass(owner.role?.title, owner.role?.accessLevel);
    
    // Allocate parking spot using deterministic policy
    let parking = await this.prisma.v12SpatialParkingArea.findFirst({
      where: { site: { companyId: owner.companyId }, availableSpots: { gt: 0 } },
      orderBy: { id: 'asc' },
    });

    if (!parking) {
      // Fallback to any existing parking area for compatibility with legacy tests
      parking = await this.prisma.v12SpatialParkingArea.findFirst({
        where: { site: { companyId: owner.companyId } },
        orderBy: { id: 'asc' },
      });
    }

    // Resolve visual asset deterministically
    const assetId = this.assetRegistry.resolveAssetId(`VEHICLE_CHASSIS_${vehicleClass}`);

    const vehicle = await this.prisma.v12SpatialVehicle.create({
      data: {
        companyId: owner.companyId,
        ownerEmployeeId,
        vehicleClass,
        assetId,
        occupantEmployeeIds: [],
        parkingAreaId: parking?.id,
        isParked: true,
      },
    });

    if (parking && parking.availableSpots > 0) {
      await this.prisma.v12SpatialParkingArea.update({
        where: { id: parking.id },
        data: { availableSpots: Math.max(0, parking.availableSpots - 1) },
      });
    }

    // Initialize spatial movement state foundation
    try {
      await this.prisma.v12SpatialMovementState.upsert({
        where: { entityId: vehicle.id },
        create: {
          entityId: vehicle.id,
          entityType: 'VEHICLE',
          currentLocationId: parking?.id || 'UNASSIGNED',
          currentLocationType: 'PARKING',
          movementState: 'IDLE',
          movementMode: 'VEHICLE',
          path: [],
          totalDistance: 0,
          progress: 0,
        },
        update: {
          currentLocationId: parking?.id || 'UNASSIGNED',
          currentLocationType: 'PARKING',
          movementState: 'IDLE',
          movementMode: 'VEHICLE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failure isolating spatial movement state for vehicle ${vehicle.id}: ${err.message}`);
    }

    // Broadcast world state event
    try {
      const envelope = this.eventService.createEventEnvelope(
        'VEHICLE_CREATED',
        vehicle.id,
        V12EntityType.VEHICLE,
        { vehicle, ownerEmployeeId },
        owner.companyId,
      );
      await this.eventService.broadcastEvent(owner.companyId, envelope);
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast VEHICLE_CREATED event: ${err.message}`);
    }

    return vehicle;
  }

  /**
   * Deterministically allocates a parking spot for a company.
   * Allocation hierarchy:
   * 1. Existing parking area with available spots.
   * 2. Expansion of existing parking area capacity (if below maxCapacityPerArea).
   * 3. Provision of an additional parking area on the campus site (with navigation node & edge).
   */
  async allocateParkingSlot(
    companyId: string,
    policy: VehiclePolicy = DEFAULT_VEHICLE_POLICY,
  ): Promise<any> {
    let site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId } });
    if (!site) {
      // Find default or first site for company
      site = await this.prisma.v12SpatialSite.findFirst();
      if (!site) {
        throw new NotFoundException(`No spatial site found for company ${companyId}`);
      }
    }

    // 1. Check existing parking areas with available spots
    let parkingAreas = await this.prisma.v12SpatialParkingArea.findMany({
      where: { siteId: site.id },
      orderBy: { id: 'asc' },
    });

    for (const area of parkingAreas) {
      if (area.availableSpots > 0) {
        const updated = await this.prisma.v12SpatialParkingArea.update({
          where: { id: area.id },
          data: { availableSpots: area.availableSpots - 1 },
        });
        return updated;
      }
    }

    // 2. Check if the latest parking area can be expanded in place
    if (parkingAreas.length > 0) {
      const latest = parkingAreas[parkingAreas.length - 1];
      if (latest.capacity < policy.maxCapacityPerArea) {
        const expansionSpots = Math.min(
          policy.defaultSpotsPerParkingArea,
          policy.maxCapacityPerArea - latest.capacity,
        );
        const updated = await this.prisma.v12SpatialParkingArea.update({
          where: { id: latest.id },
          data: {
            capacity: latest.capacity + expansionSpots,
            availableSpots: expansionSpots - 1, // 1 allocated immediately
          },
        });
        this.logger.log(`Expanded parking area ${latest.id} capacity to ${updated.capacity}`);
        return updated;
      }
    }

    // 3. Provision a new parking area on the campus
    if (parkingAreas.length >= policy.maxParkingAreasPerSite) {
      throw new BadRequestException(
        `Maximum spatial parking area capacity reached for site (${policy.maxParkingAreasPerSite} areas)`,
      );
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const companyName = company?.name || 'Enterprise';
    const areaIndex = parkingAreas.length;
    const pos = calculateParkingAreaPosition(areaIndex);

    const newParkingArea = await this.prisma.v12SpatialParkingArea.create({
      data: {
        siteId: site.id,
        name: `${companyName} Parking Area ${areaIndex + 1}`,
        capacity: policy.defaultSpotsPerParkingArea,
        availableSpots: policy.defaultSpotsPerParkingArea - 1, // 1 spot claimed immediately
        posX: pos.posX,
        posY: pos.posY,
        posZ: pos.posZ,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
      },
    });

    // Integrate with Navigation Graph: Create waypoint navigation node
    try {
      const navNodeId = `node_parking_${newParkingArea.id}`;
      await this.prisma.v12NavigationNode.upsert({
        where: { id: navNodeId },
        create: {
          id: navNodeId,
          entityId: newParkingArea.id,
          entityType: 'PARKING',
          posX: newParkingArea.posX,
          posY: newParkingArea.posY,
          posZ: newParkingArea.posZ,
          siteId: site.id,
          nodeType: 'WAYPOINT',
          isTraversable: true,
          metadata: { capacity: newParkingArea.capacity },
        },
        update: {
          posX: newParkingArea.posX,
          posY: newParkingArea.posY,
          posZ: newParkingArea.posZ,
        },
      });

      // Link to campus primary entrance or first building node
      const campusNode = await this.prisma.v12NavigationNode.findFirst({
        where: { siteId: site.id, nodeType: 'WAYPOINT', NOT: { id: navNodeId } },
      });

      if (campusNode) {
        await this.prisma.v12SpatialTopologyEdge.create({
          data: {
            sourceId: navNodeId,
            sourceType: 'WAYPOINT',
            targetId: campusNode.id,
            targetType: 'WAYPOINT',
            distance: 15.0,
            traversalType: 'WALK',
            accessibility: 'ALL',
            isEnabled: true,
          },
        });
      }
    } catch (navErr: any) {
      this.logger.warn(`Non-fatal navigation integration warning: ${navErr.message}`);
    }

    // Broadcast PARKING_CREATED event
    try {
      const envelope = this.eventService.createEventEnvelope(
        'PARKING_CREATED',
        newParkingArea.id,
        V12EntityType.PARKING,
        { parking: newParkingArea },
        companyId,
      );
      await this.eventService.broadcastEvent(companyId, envelope);
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast PARKING_CREATED: ${err.message}`);
    }

    return newParkingArea;
  }

  /**
   * Authoritative automatic vehicle provisioning.
   * Creates authoritative vehicle records, allocates deterministic parking,
   * initializes spatial movement state, and emits world-state events.
   */
  async autoProvisionFleet(
    companyId: string,
    actorId: string,
    dto: AutoProvisionFleetDto,
  ) {
    const policy = this.getPolicy(dto.policyOverrides);

    // 1. Validate authenticated actor belongs to company
    const actor = await this.prisma.employee.findUnique({
      where: { id: actorId },
    });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to authorized company context');
    }

    // 2. Validate requested quantity
    if (!dto.count || dto.count < 1 || dto.count > 100) {
      throw new BadRequestException('Provisioning quantity must be between 1 and 100');
    }

    // 3. Validate vehicle class policy
    const vehicleClass = dto.vehicleClass || policy.defaultVehicleClass;
    if (!policy.allowedVehicleClasses.includes(vehicleClass)) {
      throw new BadRequestException(`Vehicle class ${vehicleClass} is not permitted by policy`);
    }

    const createdVehicles = [];

    // 4. Provision vehicles sequentially to guarantee atomic parking allocation
    for (let i = 0; i < dto.count; i++) {
      // Allocate spatial parking capacity
      const parking = await this.allocateParkingSlot(companyId, policy);

      // Resolve deterministic visual asset reference
      const assetId = this.assetRegistry.resolveAssetId(`VEHICLE_CHASSIS_${vehicleClass}`);

      // Create authoritative record
      const vehicle = await this.prisma.v12SpatialVehicle.create({
        data: {
          companyId,
          vehicleClass,
          assetId,
          ownerEmployeeId: dto.ownerEmployeeId || null,
          parkingAreaId: parking.id,
          occupantEmployeeIds: [],
          isParked: true,
        },
      });

      // Upsert spatial movement state
      try {
        await this.prisma.v12SpatialMovementState.upsert({
          where: { entityId: vehicle.id },
          create: {
            entityId: vehicle.id,
            entityType: 'VEHICLE',
            currentLocationId: parking.id,
            currentLocationType: 'PARKING',
            movementState: 'IDLE',
            movementMode: 'VEHICLE',
            path: [],
            totalDistance: 0,
            progress: 0,
          },
          update: {
            currentLocationId: parking.id,
            currentLocationType: 'PARKING',
            movementState: 'IDLE',
            movementMode: 'VEHICLE',
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failure isolating movement state for vehicle ${vehicle.id}: ${err.message}`);
      }

      // Broadcast world-state event
      try {
        const envelope = this.eventService.createEventEnvelope(
          'VEHICLE_CREATED',
          vehicle.id,
          V12EntityType.VEHICLE,
          { vehicle, parkingAreaId: parking.id },
          companyId,
        );
        await this.eventService.broadcastEvent(companyId, envelope);
      } catch (err: any) {
        this.logger.warn(`Failed to broadcast VEHICLE_CREATED: ${err.message}`);
      }

      createdVehicles.push(vehicle);
    }

    this.logger.log(`Auto-provisioned ${createdVehicles.length} vehicles for company ${companyId}`);

    return {
      companyId,
      provisionedCount: createdVehicles.length,
      vehicles: createdVehicles,
    };
  }

  /**
   * Deterministic Fleet Reconciliation.
   * Evaluates current authoritative fleet against target requirements.
   * If deficit exists, provisions additional vehicles and expands parking.
   * Preserves historical vehicles on surplus (idempotent, never deletes business records).
   */
  async reconcileFleetCapacity(
    companyId: string,
    targetFleetCount: number,
    policyOverrides?: Partial<VehiclePolicy>,
  ): Promise<FleetReconciliationResult> {
    const startTime = Date.now();
    const policy = this.getPolicy(policyOverrides);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const existingVehicles = await this.prisma.v12SpatialVehicle.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });

    const currentCount = existingVehicles.length;
    let provisionedCount = 0;

    // Deficit evaluation
    if (currentCount < targetFleetCount) {
      const deficit = targetFleetCount - currentCount;
      this.logger.log(`Fleet deficit detected for ${company.name}: requiring ${deficit} additional vehicles`);

      for (let i = 0; i < deficit; i++) {
        const parking = await this.allocateParkingSlot(companyId, policy);
        const vehicleClass = policy.defaultVehicleClass;
        const assetId = this.assetRegistry.resolveAssetId(`VEHICLE_CHASSIS_${vehicleClass}`);

        const vehicle = await this.prisma.v12SpatialVehicle.create({
          data: {
            companyId,
            vehicleClass,
            assetId,
            ownerEmployeeId: null,
            parkingAreaId: parking.id,
            occupantEmployeeIds: [],
            isParked: true,
          },
        });

        try {
          await this.prisma.v12SpatialMovementState.upsert({
            where: { entityId: vehicle.id },
            create: {
              entityId: vehicle.id,
              entityType: 'VEHICLE',
              currentLocationId: parking.id,
              currentLocationType: 'PARKING',
              movementState: 'IDLE',
              movementMode: 'VEHICLE',
              path: [],
              totalDistance: 0,
              progress: 0,
            },
            update: {
              currentLocationId: parking.id,
              currentLocationType: 'PARKING',
              movementState: 'IDLE',
              movementMode: 'VEHICLE',
            },
          });
        } catch (err: any) {
          this.logger.warn(`Failure isolating movement state for vehicle ${vehicle.id}: ${err.message}`);
        }

        try {
          const envelope = this.eventService.createEventEnvelope(
            'VEHICLE_CREATED',
            vehicle.id,
            V12EntityType.VEHICLE,
            { vehicle, parkingAreaId: parking.id },
            companyId,
          );
          await this.eventService.broadcastEvent(companyId, envelope);
        } catch (err: any) {
          this.logger.warn(`Failed to broadcast VEHICLE_CREATED: ${err.message}`);
        }

        provisionedCount++;
      }
    }

    // Reconcile any unassigned parking slots for active vehicles
    for (const v of existingVehicles) {
      if (!v.parkingAreaId) {
        try {
          const parking = await this.allocateParkingSlot(companyId, policy);
          await this.prisma.v12SpatialVehicle.update({
            where: { id: v.id },
            data: { parkingAreaId: parking.id, isParked: true },
          });
        } catch (err: any) {
          this.logger.warn(`Could not allocate parking for unparked vehicle ${v.id}: ${err.message}`);
        }
      }
    }

    const finalParkingAreas = await this.prisma.v12SpatialParkingArea.count({
      where: { site: { companyId } },
    });

    const durationMs = Date.now() - startTime;

    return {
      companyId,
      currentFleetCount: currentCount + provisionedCount,
      targetFleetCount,
      provisionedCount,
      parkingAreasAllocated: finalParkingAreas,
      durationMs,
      status: provisionedCount > 0 ? 'PROVISIONED' : 'SYNCHRONIZED',
    };
  }

  /**
   * Decommissions / deactivates a vehicle without destroying historical records.
   * Frees up parking slot and updates spatial movement state.
   */
  async decommissionVehicle(vehicleId: string, companyId: string) {
    const vehicle = await this.prisma.v12SpatialVehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.companyId !== companyId) {
      throw new ForbiddenException('Unauthorized cross-company vehicle mutation');
    }

    // Free up parking spot if currently parked
    if (vehicle.parkingAreaId) {
      const parking = await this.prisma.v12SpatialParkingArea.findUnique({
        where: { id: vehicle.parkingAreaId },
      });
      if (parking) {
        await this.prisma.v12SpatialParkingArea.update({
          where: { id: parking.id },
          data: { availableSpots: Math.min(parking.capacity, parking.availableSpots + 1) },
        });
      }
    }

    // Update vehicle status
    const updated = await this.prisma.v12SpatialVehicle.update({
      where: { id: vehicleId },
      data: {
        isParked: false,
        parkingAreaId: null,
      },
    });

    // Update movement state to DECOMMISSIONED
    try {
      await this.prisma.v12SpatialMovementState.upsert({
        where: { entityId: vehicleId },
        create: {
          entityId: vehicleId,
          entityType: 'VEHICLE',
          currentLocationId: 'DECOMMISSIONED',
          currentLocationType: 'NONE',
          movementState: 'BLOCKED',
          movementMode: 'VEHICLE',
        },
        update: {
          movementState: 'BLOCKED',
          currentLocationType: 'NONE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failure isolating movement state deactivation for vehicle ${vehicleId}: ${err.message}`);
    }

    // Broadcast VEHICLE_DEACTIVATED event
    try {
      const envelope = this.eventService.createEventEnvelope(
        'VEHICLE_DEACTIVATED',
        vehicleId,
        V12EntityType.VEHICLE,
        { vehicleId },
        companyId,
      );
      await this.eventService.broadcastEvent(companyId, envelope);
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast VEHICLE_DEACTIVATED: ${err.message}`);
    }

    return updated;
  }

  /** Requests spatial entity movement for a vehicle using V12NavigationService. */
  async requestVehicleMovement(vehicleId: string, destinationId: string, context: any = {}) {
    const vehicle = await this.prisma.v12SpatialVehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const state = await this.navigationService.requestEntityMovement(vehicleId, destinationId, {
      ...context,
      entityType: 'VEHICLE',
      movementMode: 'VEHICLE',
    });

    if (state && state.movementState !== 'BLOCKED' && vehicle.isParked && vehicle.parkingAreaId) {
      // Leaving its parking spot frees it up
      const parking = await this.prisma.v12SpatialParkingArea.findUnique({ where: { id: vehicle.parkingAreaId } });
      if (parking) {
        await this.prisma.v12SpatialParkingArea.update({
          where: { id: parking.id },
          data: { availableSpots: Math.min(parking.capacity, parking.availableSpots + 1) },
        });
      }
      await this.prisma.v12SpatialVehicle.update({ where: { id: vehicleId }, data: { isParked: false } });
    } else if (state && state.movementState !== 'BLOCKED') {
      await this.prisma.v12SpatialVehicle.update({ where: { id: vehicleId }, data: { isParked: false } });
    }

    return state;
  }

  /** Assigns an occupant to a vehicle. Both employee and vehicle must belong to the same company. */
  async assignOccupant(vehicleId: string, employeeId: string) {
    const vehicle = await this.prisma.v12SpatialVehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.companyId !== vehicle.companyId) {
      throw new ForbiddenException('Employee does not belong to the vehicle\'s company');
    }

    const occupants: string[] = Array.isArray(vehicle.occupantEmployeeIds) ? vehicle.occupantEmployeeIds as string[] : [];
    const updatedOccupants = occupants.includes(employeeId) ? occupants : [...occupants, employeeId];

    const updated = await this.prisma.v12SpatialVehicle.update({
      where: { id: vehicleId },
      data: { occupantEmployeeIds: updatedOccupants },
    });

    try {
      const envelope = this.eventService.createEventEnvelope(
        'VEHICLE_OCCUPANCY_CHANGED',
        vehicleId,
        V12EntityType.VEHICLE,
        { occupantEmployeeIds: updatedOccupants },
        vehicle.companyId,
      );
      await this.eventService.broadcastEvent(vehicle.companyId, envelope);
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast VEHICLE_OCCUPANCY_CHANGED: ${err.message}`);
    }

    return updated;
  }
}

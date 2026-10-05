import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './v12-navigation.service';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { V12EntityType } from '@aevora/shared';

/**
 * Authoritative V12 spatial embodiment of a vehicle. Aevora has no business-level vehicle
 * concept, so this is NOT a second business authority: ownership and classification are derived
 * from the authoritative Employee/Role at creation time and never invented here. Movement reuses
 * the existing entity-agnostic V12SpatialMovementState/V12NavigationService machinery.
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

  /** Derives the vehicle class from the owner's authoritative Role — never invented, only read. */
  private deriveVehicleClass(roleTitle: string | undefined, accessLevel: string | undefined): string {
    const title = (roleTitle || '').toUpperCase();
    if (accessLevel === 'CHAIRMAN' || title.includes('CHAIRMAN')) return 'CHAIRMAN';
    if (title.includes('CEO')) return 'CEO';
    if (title.includes('MD')) return 'MD';
    if (accessLevel === 'MANAGEMENT') return 'EXECUTIVE';
    return 'STANDARD';
  }

  async createVehicleForEmployee(ownerEmployeeId: string) {
    const owner = await this.prisma.employee.findUnique({
      where: { id: ownerEmployeeId },
      include: { role: true },
    });
    if (!owner) throw new NotFoundException('Owner employee not found');

    const existing = await this.prisma.v12SpatialVehicle.findUnique({ where: { ownerEmployeeId } });
    if (existing) return existing;

    const vehicleClass = this.deriveVehicleClass(owner.role?.title, owner.role?.accessLevel);
    const parking = await this.prisma.v12SpatialParkingArea.findFirst({
      where: { site: { companyId: owner.companyId } },
      orderBy: { id: 'asc' },
    });

    // Resolve this vehicle's visual representation through the real asset registry by deterministic
    // id — never constructs an unregistered/guessed asset reference. Null (not a fake id) if the
    // registry genuinely has nothing registered for this class.
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

    if (parking) {
      await this.prisma.v12SpatialParkingArea.update({
        where: { id: parking.id },
        data: { availableSpots: Math.max(0, parking.availableSpots - 1) },
      });
    }

    const envelope = this.eventService.createEventEnvelope(
      'VEHICLE_CREATED',
      vehicle.id,
      V12EntityType.VEHICLE,
      { vehicle, ownerEmployeeId },
      owner.companyId,
    );
    await this.eventService.broadcastEvent(owner.companyId, envelope);

    return vehicle;
  }

  async requestVehicleMovement(vehicleId: string, destinationId: string, context: any = {}) {
    const vehicle = await this.prisma.v12SpatialVehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const state = await this.navigationService.requestEntityMovement(vehicleId, destinationId, {
      ...context,
      entityType: 'VEHICLE',
      movementMode: 'VEHICLE',
    });

    if (state && state.movementState !== 'BLOCKED' && vehicle.isParked && vehicle.parkingAreaId) {
      // Leaving its parking spot frees it up — bookkeeping the backend otherwise never touched.
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

  /** Assigns an occupant to a vehicle. Both employee and vehicle must belong to the same company — no cross-company riders. */
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

    const envelope = this.eventService.createEventEnvelope(
      'VEHICLE_OCCUPANCY_CHANGED',
      vehicleId,
      V12EntityType.VEHICLE,
      { occupantEmployeeIds: updatedOccupants },
      vehicle.companyId,
    );
    await this.eventService.broadcastEvent(vehicle.companyId, envelope);

    return updated;
  }
}

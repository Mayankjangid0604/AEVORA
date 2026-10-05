import { Test, TestingModule } from '@nestjs/testing';
import { V12VehicleService } from './v12-vehicle.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './v12-navigation.service';
import { V12AssetRegistryService } from './v12-asset-registry.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('V12VehicleService', () => {
  let service: V12VehicleService;

  const mockPrisma = {
    employee: { findUnique: jest.fn() },
    v12SpatialVehicle: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    v12SpatialParkingArea: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const mockEventService = {
    createEventEnvelope: jest.fn().mockReturnValue({ eventType: 'MOCK' }),
    broadcastEvent: jest.fn(),
  };
  const mockNavService = {
    requestEntityMovement: jest.fn(),
  };
  const mockAssetRegistry = {
    resolveAssetId: jest.fn().mockReturnValue('asset_vehicle_chassis_standard_v1'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAssetRegistry.resolveAssetId.mockReturnValue('asset_vehicle_chassis_standard_v1');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12VehicleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService },
        { provide: V12NavigationService, useValue: mockNavService },
        { provide: V12AssetRegistryService, useValue: mockAssetRegistry },
      ],
    }).compile();

    service = module.get(V12VehicleService);
  });

  describe('createVehicleForEmployee', () => {
    it('derives CHAIRMAN vehicle class from the owner\'s authoritative role', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', role: { title: 'Chairman', accessLevel: 'CHAIRMAN' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      mockPrisma.v12SpatialParkingArea.findFirst.mockResolvedValue({ id: 'parking-1', capacity: 10, availableSpots: 10 });
      mockPrisma.v12SpatialVehicle.create.mockResolvedValue({ id: 'veh1', vehicleClass: 'CHAIRMAN' });

      const result = await service.createVehicleForEmployee('emp1');

      expect(mockPrisma.v12SpatialVehicle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ companyId: 'c1', ownerEmployeeId: 'emp1', vehicleClass: 'CHAIRMAN', parkingAreaId: 'parking-1' }),
      }));
      expect(mockEventService.broadcastEvent).toHaveBeenCalled();
      expect(result).toEqual({ id: 'veh1', vehicleClass: 'CHAIRMAN' });
    });

    it('claims a parking spot on creation (availableSpots decremented, never below zero)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', role: { title: 'Engineer', accessLevel: 'STANDARD' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      mockPrisma.v12SpatialParkingArea.findFirst.mockResolvedValue({ id: 'parking-1', capacity: 10, availableSpots: 3 });
      mockPrisma.v12SpatialVehicle.create.mockResolvedValue({ id: 'veh3' });

      await service.createVehicleForEmployee('emp1');

      expect(mockPrisma.v12SpatialParkingArea.update).toHaveBeenCalledWith({ where: { id: 'parking-1' }, data: { availableSpots: 2 } });
    });

    it('derives STANDARD vehicle class for a non-management employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp2', companyId: 'c1', role: { title: 'Engineer', accessLevel: 'STANDARD' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      mockPrisma.v12SpatialParkingArea.findFirst.mockResolvedValue(null);
      mockPrisma.v12SpatialVehicle.create.mockResolvedValue({ id: 'veh2', vehicleClass: 'STANDARD' });

      await service.createVehicleForEmployee('emp2');

      expect(mockPrisma.v12SpatialVehicle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ vehicleClass: 'STANDARD' }),
      }));
    });

    it('is idempotent: returns the existing vehicle rather than creating a duplicate', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', role: { title: 'Chairman', accessLevel: 'CHAIRMAN' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh-existing' });

      const result = await service.createVehicleForEmployee('emp1');

      expect(mockPrisma.v12SpatialVehicle.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'veh-existing' });
    });

    it('resolves the vehicle\'s asset through the real asset registry by its derived class, never a guessed id', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', role: { title: 'Chairman', accessLevel: 'CHAIRMAN' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      mockPrisma.v12SpatialParkingArea.findFirst.mockResolvedValue({ id: 'parking-1', capacity: 10, availableSpots: 10 });
      mockAssetRegistry.resolveAssetId.mockReturnValue('asset_vehicle_chassis_chairman_v1');
      mockPrisma.v12SpatialVehicle.create.mockResolvedValue({ id: 'veh1' });

      await service.createVehicleForEmployee('emp1');

      expect(mockAssetRegistry.resolveAssetId).toHaveBeenCalledWith('VEHICLE_CHASSIS_CHAIRMAN');
      expect(mockPrisma.v12SpatialVehicle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ assetId: 'asset_vehicle_chassis_chairman_v1' }),
      }));
    });

    it('never fabricates an asset id: stores null when the registry has nothing registered for the class', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', role: { title: 'Engineer', accessLevel: 'STANDARD' } });
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      mockPrisma.v12SpatialParkingArea.findFirst.mockResolvedValue(null);
      mockAssetRegistry.resolveAssetId.mockReturnValue(null);
      mockPrisma.v12SpatialVehicle.create.mockResolvedValue({ id: 'veh1' });

      await service.createVehicleForEmployee('emp1');

      expect(mockPrisma.v12SpatialVehicle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ assetId: null }),
      }));
    });

    it('throws NotFoundException for an unknown owner', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.createVehicleForEmployee('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestVehicleMovement', () => {
    it('delegates to the navigation service as entityType VEHICLE and marks the vehicle unparked', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh1', companyId: 'c1' });
      mockNavService.requestEntityMovement.mockResolvedValue({ movementState: 'MOVING' });

      await service.requestVehicleMovement('veh1', 'dest-1', {});

      expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('veh1', 'dest-1', expect.objectContaining({ entityType: 'VEHICLE', movementMode: 'VEHICLE' }));
      expect(mockPrisma.v12SpatialVehicle.update).toHaveBeenCalledWith({ where: { id: 'veh1' }, data: { isParked: false } });
    });

    it('frees its parking spot (availableSpots incremented, capped at capacity) when it leaves a parked state', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh1', companyId: 'c1', isParked: true, parkingAreaId: 'parking-1' });
      mockPrisma.v12SpatialParkingArea.findUnique.mockResolvedValue({ id: 'parking-1', capacity: 10, availableSpots: 9 });
      mockNavService.requestEntityMovement.mockResolvedValue({ movementState: 'MOVING' });

      await service.requestVehicleMovement('veh1', 'dest-1', {});

      expect(mockPrisma.v12SpatialParkingArea.update).toHaveBeenCalledWith({ where: { id: 'parking-1' }, data: { availableSpots: 10 } });
    });

    it('does not unpark the vehicle when movement is blocked', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh1', companyId: 'c1' });
      mockNavService.requestEntityMovement.mockResolvedValue({ movementState: 'BLOCKED' });

      await service.requestVehicleMovement('veh1', 'dest-1', {});

      expect(mockPrisma.v12SpatialVehicle.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown vehicle', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue(null);
      await expect(service.requestVehicleMovement('ghost', 'dest-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignOccupant (company isolation)', () => {
    it('adds an occupant from the same company', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh1', companyId: 'c1', occupantEmployeeIds: [] });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1' });
      mockPrisma.v12SpatialVehicle.update.mockResolvedValue({ id: 'veh1', occupantEmployeeIds: ['emp1'] });

      const result = await service.assignOccupant('veh1', 'emp1');

      expect(mockPrisma.v12SpatialVehicle.update).toHaveBeenCalledWith({ where: { id: 'veh1' }, data: { occupantEmployeeIds: ['emp1'] } });
      expect(result.occupantEmployeeIds).toEqual(['emp1']);
    });

    it('rejects an occupant from a different company', async () => {
      mockPrisma.v12SpatialVehicle.findUnique.mockResolvedValue({ id: 'veh1', companyId: 'c1', occupantEmployeeIds: [] });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-other', companyId: 'c2' });

      await expect(service.assignOccupant('veh1', 'emp-other')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.v12SpatialVehicle.update).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { V12VehicleController } from './vehicle.controller';
import { V12VehicleService } from './vehicle.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

describe('V12VehicleController', () => {
  let controller: V12VehicleController;

  const mockVehicleService = {
    autoProvisionFleet: jest.fn().mockResolvedValue({ provisionedCount: 3 }),
    reconcileFleetCapacity: jest.fn().mockResolvedValue({ currentFleetCount: 5, status: 'SYNCHRONIZED' }),
    decommissionVehicle: jest.fn().mockResolvedValue({ id: 'veh1', isParked: false }),
  };

  const mockPrisma = {
    v12SpatialVehicle: {
      findMany: jest.fn().mockResolvedValue([{ id: 'veh1', companyId: 'comp-1' }]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [V12VehicleController],
      providers: [
        { provide: V12VehicleService, useValue: mockVehicleService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<V12VehicleController>(V12VehicleController);
  });

  describe('Company Scoping & Authentication', () => {
    it('throws UnauthorizedException if no authenticated user exists', async () => {
      await expect(
        controller.autoProvisionFleet({} as any, 'comp-1', { count: 1 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException if authenticated user belongs to another company', async () => {
      const req = { user: { id: 'user-b', companyId: 'comp-2' } };
      await expect(
        controller.autoProvisionFleet(req as any, 'comp-1', { count: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows auto-provisioning for authorized company context', async () => {
      const req = { user: { id: 'user-a', companyId: 'comp-1' } };
      const res = await controller.autoProvisionFleet(req as any, 'comp-1', { count: 3 });
      expect(res).toEqual({ provisionedCount: 3 });
      expect(mockVehicleService.autoProvisionFleet).toHaveBeenCalledWith('comp-1', 'user-a', { count: 3 });
    });

    it('allows fleet reconciliation for authorized company context', async () => {
      const req = { user: { id: 'user-a', companyId: 'comp-1' } };
      const res = await controller.reconcileFleet(req as any, 'comp-1', { targetCount: 5 });
      expect(res).toEqual({ currentFleetCount: 5, status: 'SYNCHRONIZED' });
      expect(mockVehicleService.reconcileFleetCapacity).toHaveBeenCalledWith('comp-1', 5, undefined);
    });

    it('allows fleet querying for authorized company context', async () => {
      const req = { user: { id: 'user-a', companyId: 'comp-1' } };
      const res = await controller.getCompanyFleet(req as any, 'comp-1');
      expect(res).toEqual([{ id: 'veh1', companyId: 'comp-1' }]);
    });

    it('allows vehicle decommissioning for authorized company context', async () => {
      const req = { user: { id: 'user-a', companyId: 'comp-1' } };
      const res = await controller.decommissionVehicle(req as any, 'comp-1', 'veh1');
      expect(res).toEqual({ id: 'veh1', isParked: false });
      expect(mockVehicleService.decommissionVehicle).toHaveBeenCalledWith('veh1', 'comp-1');
    });
  });
});

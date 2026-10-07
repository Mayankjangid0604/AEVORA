import { Test, TestingModule } from '@nestjs/testing';
import { V12SpatialService } from './v12-spatial.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12NavigationService } from './v12-navigation.service';
import { HqCapacityService } from './hq-capacity.service';
import { V12EventType } from '@aevora/shared';
import { Subject } from 'rxjs';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('V12SpatialService.handlePersonActivityChange', () => {
  let service: V12SpatialService;

  const mockPrisma = {
    v12SpatialWorkspace: { findFirst: jest.fn() },
    v12SpatialRoom: { findFirst: jest.fn() },
    employee: { findUnique: jest.fn() },
    v12SpatialMovementState: { findUnique: jest.fn() },
    meetingParticipant: { findFirst: jest.fn() },
    v12SpatialVehicle: { findFirst: jest.fn() },
  };
  const mockNavService = {
    requestEntityMovement: jest.fn().mockResolvedValue({}),
  };
  const mockEventService = {
    getGlobalStream: jest.fn().mockReturnValue(new Subject()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12SpatialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService },
        { provide: V12NavigationService, useValue: mockNavService },
        { provide: HqCapacityService, useValue: { reconcileCompanyCapacity: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get(V12SpatialService);
  });

  const updatedEvent = (payload: any) => ({ eventType: V12EventType.ENTITY_UPDATED, payload, causationId: 'c1' });

  it('moves the employee to their workspace on TASK_STARTED', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue({ roomId: 'room-1' });

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'WORKING', originalEvent: 'TASK_STARTED' }));

    expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('emp1', 'room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_TASK' }));
  });

  it('also moves the employee to their workspace on TASK_ASSIGNED (regression: previously silently dropped)', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue({ roomId: 'room-1' });

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'WORKING', originalEvent: 'TASK_ASSIGNED' }));

    expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('emp1', 'room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_TASK' }));
  });

  it('moves the employee to a meeting room in their own company building on IN_MEETING', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue({ roomId: 'room-1', buildingId: 'bldg-1' });
    mockPrisma.v12SpatialRoom.findFirst.mockResolvedValue({ id: 'meeting-room-1' });

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'IN_MEETING', meetingId: 'm1' }));

    expect(mockPrisma.v12SpatialRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'MEETING_ROOM', floor: { buildingId: 'bldg-1' } }),
    }));
    expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('emp1', 'meeting-room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_MEETING' }));
  });

  it('never resolves a meeting room outside the employee\'s own building (company isolation)', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue(null); // no workspace => no building known

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'IN_MEETING', meetingId: 'm1' }));

    expect(mockPrisma.v12SpatialRoom.findFirst).not.toHaveBeenCalled();
    expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
  });

  it('moves the employee back to their workspace when a task completes (regression: previously no spatial consequence at all)', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue({ roomId: 'room-1' });

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'TASK_COMPLETED', taskId: 'task-1' }));

    expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('emp1', 'room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_TASK' }));
  });

  it('moves the employee back to their workspace when a meeting completes', async () => {
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue({ roomId: 'room-1' });

    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'IDLE', originalEvent: 'MEETING_COMPLETED' }));

    expect(mockNavService.requestEntityMovement).toHaveBeenCalledWith('emp1', 'room-1', expect.objectContaining({ intentSource: 'ENTERPRISE_MEETING' }));
  });

  it('does nothing for an unrelated activity change', async () => {
    await service.handlePersonActivityChange('emp1', updatedEvent({ currentActivity: 'UNAVAILABLE' }));
    expect(mockNavService.requestEntityMovement).not.toHaveBeenCalled();
  });
});

describe('V12SpatialService.getEmployeeEmbodiment', () => {
  let service: V12SpatialService;

  const mockPrisma = {
    v12SpatialWorkspace: { findFirst: jest.fn() },
    v12SpatialRoom: { findFirst: jest.fn() },
    employee: { findUnique: jest.fn() },
    v12SpatialMovementState: { findUnique: jest.fn() },
    meetingParticipant: { findFirst: jest.fn() },
    v12SpatialVehicle: { findFirst: jest.fn() },
  };
  const mockNavService = { requestEntityMovement: jest.fn() };
  const mockEventService = { getGlobalStream: jest.fn().mockReturnValue(new Subject()) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        V12SpatialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorldStateEventService, useValue: mockEventService },
        { provide: V12NavigationService, useValue: mockNavService },
        { provide: HqCapacityService, useValue: { reconcileCompanyCapacity: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get(V12SpatialService);

    mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue(null);
    mockPrisma.v12SpatialWorkspace.findFirst.mockResolvedValue(null);
    mockPrisma.meetingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.v12SpatialVehicle.findFirst.mockResolvedValue(null);
  });

  it('derives IN_MEETING state and surfaces the active meeting id', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', name: 'Ana', departmentId: 'd1', activity: 'IN_MEETING', status: 'ACTIVE', role: { title: 'Engineer' } });
    mockPrisma.meetingParticipant.findFirst.mockResolvedValue({ meetingId: 'm1' });

    const result = await service.getEmployeeEmbodiment('emp1');

    expect(result.spatialState).toBe('IN_MEETING');
    expect(result.meetingId).toBe('m1');
  });

  it('derives IN_VEHICLE state and surfaces the owned vehicle id only in that state', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', name: 'Ana', departmentId: 'd1', activity: 'WORKING', status: 'ACTIVE', role: { title: 'Engineer' } });
    mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ movementState: 'MOVING', movementMode: 'VEHICLE', currentNodeId: 'n1', destinationNodeId: 'n2' });
    mockPrisma.v12SpatialVehicle.findFirst.mockResolvedValue({ id: 'veh1' });

    const result = await service.getEmployeeEmbodiment('emp1');

    expect(result.spatialState).toBe('IN_VEHICLE');
    expect(result.vehicleId).toBe('veh1');
  });

  it('never surfaces a vehicle id when the employee is not currently in a vehicle', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', name: 'Ana', departmentId: 'd1', activity: 'IDLE', status: 'ACTIVE', role: { title: 'Engineer' } });
    mockPrisma.v12SpatialVehicle.findFirst.mockResolvedValue({ id: 'veh1' }); // owns one, but isn't in it

    const result = await service.getEmployeeEmbodiment('emp1');

    expect(result.vehicleId).toBeNull();
  });

  it('enforces company isolation: throws when the employee belongs to a different company', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c2', name: 'Ana', departmentId: 'd1', activity: 'IDLE', status: 'ACTIVE', role: { title: 'Engineer' } });

    await expect(service.getEmployeeEmbodiment('emp1', 'c1')).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for an unknown employee', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.getEmployeeEmbodiment('ghost')).rejects.toThrow(NotFoundException);
  });

  it('a terminated employee is UNAVAILABLE regardless of stale movement data', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp1', companyId: 'c1', name: 'Ana', departmentId: 'd1', activity: 'WORKING', status: 'TERMINATED', role: { title: 'Engineer' } });
    mockPrisma.v12SpatialMovementState.findUnique.mockResolvedValue({ movementState: 'MOVING', movementMode: 'WALK' });

    const result = await service.getEmployeeEmbodiment('emp1');

    expect(result.spatialState).toBe('UNAVAILABLE');
  });
});

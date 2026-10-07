import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorldStateEventService } from '../world-state-gateway/world-state-event.service';
import { V12EntityType, V12EventType } from '@aevora/shared';

export interface HqCapacityPolicy {
  /** Maximum number of workspaces (desks) configured per department room */
  workspacesPerDepartmentRoom: number;
  /** Maximum operational rooms accommodated per floor slab */
  maxOperationalRoomsPerFloor: number;
  /** Maximum operational floors accommodated in a building before provisioning an expansion wing */
  maxOperationalFloorsPerBuilding: number;
  /** Preserved level index for the executive penthouse floor */
  executiveLevelNumber: number;
}

export const DEFAULT_HQ_CAPACITY_POLICY: HqCapacityPolicy = {
  workspacesPerDepartmentRoom: 6,
  maxOperationalRoomsPerFloor: 6,
  maxOperationalFloorsPerBuilding: 4,
  executiveLevelNumber: 100,
};

export interface DepartmentCapacityMetric {
  departmentId: string;
  departmentName: string;
  headcount: number;
  roomsCount: number;
  workspacesCount: number;
  occupiedWorkspacesCount: number;
  availableWorkspacesCount: number;
  requiredRoomsCount: number;
  requiredWorkspacesCount: number;
  deficitRooms: number;
  deficitWorkspaces: number;
}

export interface HqCapacityEvaluation {
  companyId: string;
  companyName: string;
  policy: HqCapacityPolicy;
  totalEmployees: number;
  activeEmployees: number;
  totalBuildings: number;
  totalFloors: number;
  operationalFloors: number;
  totalRooms: number;
  totalWorkspaces: number;
  occupiedWorkspaces: number;
  availableWorkspaces: number;
  occupancyRate: number;
  departmentMetrics: DepartmentCapacityMetric[];
  requiresExpansion: boolean;
  requiredNewRooms: number;
  requiredNewWorkspaces: number;
  requiredNewFloors: number;
  requiredNewBuildings: number;
}

export interface HqCapacityReconciliationResult {
  companyId: string;
  policy: HqCapacityPolicy;
  evaluationBefore: HqCapacityEvaluation;
  created: {
    buildings: number;
    floors: number;
    rooms: number;
    workspaces: number;
    navigationNodes: number;
    topologyEdges: number;
  };
  evaluationAfter: HqCapacityEvaluation;
  durationMs: number;
}

@Injectable()
export class HqCapacityService {
  private readonly logger = new Logger(HqCapacityService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly worldStateEventService: WorldStateEventService,
  ) {}

  getPolicy(): HqCapacityPolicy {
    return { ...DEFAULT_HQ_CAPACITY_POLICY };
  }

  /**
   * Evaluates current spatial capacity against authoritative workforce state.
   * Completely read-only, deterministic, and isolated to the specified company.
   */
  async evaluateCapacity(
    companyId: string,
    policyOverrides?: Partial<HqCapacityPolicy>,
  ): Promise<HqCapacityEvaluation> {
    const policy: HqCapacityPolicy = { ...DEFAULT_HQ_CAPACITY_POLICY, ...(policyOverrides || {}) };

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        departments: true,
        employees: {
          include: { role: true, department: true },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId } });
    const siteIds = site ? [site.id] : [];

    const buildings = await this.prisma.v12SpatialBuilding.findMany({ where: { siteId: { in: siteIds } } });
    const buildingIds = buildings.map((b) => b.id);

    const floors = await this.prisma.v12SpatialFloor.findMany({ where: { buildingId: { in: buildingIds } } });
    const operationalFloors = floors.filter((f) => f.level < policy.executiveLevelNumber);

    const rooms = await this.prisma.v12SpatialRoom.findMany({
      where: { floorId: { in: floors.map((f) => f.id) } },
    });

    const workspaces = await this.prisma.v12SpatialWorkspace.findMany({
      where: { companyId },
    });

    const activeEmployees = company.employees.filter((e) => e.status === 'ACTIVE');
    const occupiedWorkspaces = workspaces.filter((w) => w.isOccupied && w.employeeId);
    const availableWorkspaces = workspaces.filter((w) => !w.isOccupied);

    let totalDeficitRooms = 0;
    let totalDeficitWorkspaces = 0;
    const departmentMetrics: DepartmentCapacityMetric[] = [];

    for (const dept of company.departments) {
      const deptEmployees = activeEmployees.filter((e) => e.departmentId === dept.id);
      const deptRooms = rooms.filter((r) => r.departmentId === dept.id);
      const deptWorkspaces = workspaces.filter((w) => w.departmentId === dept.id);
      const deptOccupied = deptWorkspaces.filter((w) => w.isOccupied);

      const headcount = deptEmployees.length;
      const requiredRoomsCount = Math.max(1, Math.ceil(headcount / policy.workspacesPerDepartmentRoom));
      const requiredWorkspacesCount = requiredRoomsCount * policy.workspacesPerDepartmentRoom;

      const deficitRooms = Math.max(0, requiredRoomsCount - deptRooms.length);
      const deficitWorkspaces = Math.max(0, requiredWorkspacesCount - deptWorkspaces.length);

      totalDeficitRooms += deficitRooms;
      totalDeficitWorkspaces += deficitWorkspaces;

      departmentMetrics.push({
        departmentId: dept.id,
        departmentName: dept.name,
        headcount,
        roomsCount: deptRooms.length,
        workspacesCount: deptWorkspaces.length,
        occupiedWorkspacesCount: deptOccupied.length,
        availableWorkspacesCount: deptWorkspaces.length - deptOccupied.length,
        requiredRoomsCount,
        requiredWorkspacesCount,
        deficitRooms,
        deficitWorkspaces,
      });
    }

    const currentRoomsOnOperationalFloors = rooms.filter((r) => {
      const f = floors.find((fl) => fl.id === r.floorId);
      return f && f.level < policy.executiveLevelNumber;
    }).length;

    const operationalRoomsCapacity = operationalFloors.length * policy.maxOperationalRoomsPerFloor;
    const roomsOverflow = Math.max(0, currentRoomsOnOperationalFloors + totalDeficitRooms - operationalRoomsCapacity);
    const requiredNewFloors = Math.ceil(roomsOverflow / policy.maxOperationalRoomsPerFloor);

    const operationalFloorsAfterExpansion = operationalFloors.length + requiredNewFloors;
    const maxFloorsPerBuilding = policy.maxOperationalFloorsPerBuilding;
    const requiredBuildings = Math.max(1, Math.ceil(operationalFloorsAfterExpansion / maxFloorsPerBuilding));
    const requiredNewBuildings = Math.max(0, requiredBuildings - buildings.length);

    const requiresExpansion =
      totalDeficitRooms > 0 ||
      totalDeficitWorkspaces > 0 ||
      requiredNewFloors > 0 ||
      requiredNewBuildings > 0;

    return {
      companyId: company.id,
      companyName: company.name,
      policy,
      totalEmployees: company.employees.length,
      activeEmployees: activeEmployees.length,
      totalBuildings: buildings.length,
      totalFloors: floors.length,
      operationalFloors: operationalFloors.length,
      totalRooms: rooms.length,
      totalWorkspaces: workspaces.length,
      occupiedWorkspaces: occupiedWorkspaces.length,
      availableWorkspaces: availableWorkspaces.length,
      occupancyRate: workspaces.length > 0 ? occupiedWorkspaces.length / workspaces.length : 0,
      departmentMetrics,
      requiresExpansion,
      requiredNewRooms: totalDeficitRooms,
      requiredNewWorkspaces: totalDeficitWorkspaces,
      requiredNewFloors,
      requiredNewBuildings,
    };
  }

  /**
   * Deterministically and idempotently expands the spatial enterprise to satisfy
   * authoritative capacity demand. Provisions rooms, floors, wings, workspaces,
   * navigation nodes, and topology edges as required by explicit capacity policy.
   */
  async reconcileCompanyCapacity(
    companyId: string,
    policyOverrides?: Partial<HqCapacityPolicy>,
  ): Promise<HqCapacityReconciliationResult> {
    const startTime = Date.now();
    const policy: HqCapacityPolicy = { ...DEFAULT_HQ_CAPACITY_POLICY, ...(policyOverrides || {}) };

    const evaluationBefore = await this.evaluateCapacity(companyId, policy);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        departments: true,
        employees: {
          include: { role: true, department: true },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const isHQ = company.name.toLowerCase().includes('aevora') || !company.groupId;
    const created = {
      buildings: 0,
      floors: 0,
      rooms: 0,
      workspaces: 0,
      navigationNodes: 0,
      topologyEdges: 0,
    };

    // 1. Site
    let site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId } });
    if (!site) {
      let city = await this.prisma.v12SpatialCity.findFirst();
      if (!city) {
        let world = await this.prisma.v12SpatialWorld.findFirst();
        if (!world) {
          world = await this.prisma.v12SpatialWorld.create({
            data: { name: 'Saahvik', description: 'The authoritative digital enterprise world' },
          });
        }
        let region = await this.prisma.v12SpatialRegion.findFirst({ where: { worldId: world.id } });
        if (!region) {
          region = await this.prisma.v12SpatialRegion.create({
            data: { name: 'Core Region', worldId: world.id, posX: 0, posY: 0, posZ: 0 },
          });
        }
        let country = await this.prisma.v12SpatialCountry.findFirst({ where: { regionId: region.id } });
        if (!country) {
          country = await this.prisma.v12SpatialCountry.create({
            data: { name: 'Aevora Republic', regionId: region.id, posX: 0, posY: 0, posZ: 0 },
          });
        }
        city = await this.prisma.v12SpatialCity.create({
          data: { name: 'Genesis City', countryId: country.id, posX: 0, posY: 0, posZ: 0 },
        });
      }

      site = await this.prisma.v12SpatialSite.create({
        data: {
          name: `${company.name} Campus`,
          cityId: city.id,
          companyId,
          posX: companyId.charCodeAt(0) * 10 + companyId.charCodeAt(1),
          posY: 0,
          posZ: companyId.charCodeAt(companyId.length - 1) * 10 + companyId.charCodeAt(companyId.length - 2),
        },
      });
    }

    // 2. Primary Building
    let primaryBuilding = await this.prisma.v12SpatialBuilding.findFirst({ where: { siteId: site.id } });
    if (!primaryBuilding) {
      primaryBuilding = await this.prisma.v12SpatialBuilding.create({
        data: {
          name: `${company.name} HQ Building`,
          siteId: site.id,
          posX: 0,
          posY: 0,
          posZ: 0,
        },
      });
      created.buildings++;
      this.emitCreated(companyId, `v12_building_${primaryBuilding.id}`, V12EntityType.BUILDING, {
        name: primaryBuilding.name,
        siteId: site.id,
      });
    }

    // 3. Base Floors in Primary Building
    let mainFloor = await this.prisma.v12SpatialFloor.findFirst({
      where: { buildingId: primaryBuilding.id, level: 1 },
    });
    if (!mainFloor) {
      mainFloor = await this.prisma.v12SpatialFloor.create({
        data: {
          name: 'Main Floor',
          level: 1,
          buildingId: primaryBuilding.id,
          posX: 0,
          posY: 0,
          posZ: 0,
        },
      });
      created.floors++;
      this.emitCreated(companyId, `v12_floor_${mainFloor.id}`, V12EntityType.FLOOR, {
        name: mainFloor.name,
        level: mainFloor.level,
        buildingId: primaryBuilding.id,
      });
    }

    let execFloor = await this.prisma.v12SpatialFloor.findFirst({
      where: { buildingId: primaryBuilding.id, level: policy.executiveLevelNumber },
    });
    if (!execFloor) {
      execFloor = await this.prisma.v12SpatialFloor.create({
        data: {
          name: 'Executive Level',
          level: policy.executiveLevelNumber,
          buildingId: primaryBuilding.id,
          posX: 0,
          posY: 16,
          posZ: 0,
        },
      });
      created.floors++;
      this.emitCreated(companyId, `v12_floor_${execFloor.id}`, V12EntityType.FLOOR, {
        name: execFloor.name,
        level: execFloor.level,
        buildingId: primaryBuilding.id,
      });
    }

    // 4. Ensure Core Executive and Ground Shared Spaces
    await this.ensureCoreRooms(companyId, primaryBuilding.id, mainFloor.id, execFloor.id, isHQ, created);

    // 5. Expand Department Rooms across Operational Floors
    await this.expandDepartmentRooms(company, site.id, primaryBuilding, policy, created);

    // 6. Provision Workspaces in all Department and Executive Rooms
    await this.provisionWorkspaces(company, policy, created);

    // 7. Reconcile Employee Workspace Assignments & Retention
    await this.reconcileEmployeeAssignments(company, execFloor.id, isHQ);

    // 8. Generate Complete Navigation Mesh & Topology Edges
    await this.reconcileNavigationTopology(site.id, created);

    const evaluationAfter = await this.evaluateCapacity(companyId, policy);
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[HQ Capacity] Reconciled company ${company.name} in ${durationMs}ms: +${created.buildings} buildings, +${created.floors} floors, +${created.rooms} rooms, +${created.workspaces} workspaces, +${created.navigationNodes} nodes, +${created.topologyEdges} edges`
    );

    return {
      companyId,
      policy,
      evaluationBefore,
      created,
      evaluationAfter,
      durationMs,
    };
  }

  /**
   * Ensures essential non-departmental shared and executive rooms exist once.
   */
  private async ensureCoreRooms(
    companyId: string,
    buildingId: string,
    mainFloorId: string,
    execFloorId: string,
    isHQ: boolean,
    created: { rooms: number },
  ) {
    const coreDefinitions = [
      // Ground floor common areas
      { floorId: mainFloorId, name: 'Main Lobby', type: 'LOBBY', posX: -6, posY: 0, posZ: 6 },
      { floorId: mainFloorId, name: 'Main Reception', type: 'RECEPTION', posX: 6, posY: 0, posZ: 6 },
      { floorId: mainFloorId, name: 'Ground Corridor', type: 'CORRIDOR', posX: 0, posY: 0, posZ: 0 },
      { floorId: mainFloorId, name: 'Main Meeting Room', type: 'MEETING_ROOM', posX: 8, posY: 0, posZ: -6 },
      // Executive floor leadership suites
      { floorId: execFloorId, name: 'Chairman Office', type: 'CHAIRMAN_OFFICE', posX: -6, posY: 16, posZ: -6 },
      { floorId: execFloorId, name: isHQ ? 'CEO/Main Executive Office' : 'CEO Office', type: 'CEO_OFFICE', posX: 6, posY: 16, posZ: -6 },
      { floorId: execFloorId, name: isHQ ? 'Head Office' : 'MD Office', type: isHQ ? 'HEAD_OFFICE' : 'MD_OFFICE', posX: -6, posY: 16, posZ: 6 },
      { floorId: execFloorId, name: 'Boardroom', type: 'CONFERENCE_ROOM', posX: 6, posY: 16, posZ: 6 },
      { floorId: execFloorId, name: 'Exec Corridor', type: 'CORRIDOR', posX: 0, posY: 16, posZ: 0 },
    ];

    for (const def of coreDefinitions) {
      const existing = await this.prisma.v12SpatialRoom.findFirst({
        where: { floorId: def.floorId, type: def.type },
      });
      if (!existing) {
        const room = await this.prisma.v12SpatialRoom.create({
          data: {
            name: def.name,
            type: def.type,
            floorId: def.floorId,
            posX: def.posX,
            posY: def.posY,
            posZ: def.posZ,
          },
        });
        created.rooms++;
        this.emitCreated(companyId, `v12_room_${room.id}`, V12EntityType.ROOM, {
          name: room.name,
          type: room.type,
          floorId: room.floorId,
        });
      }
    }
  }

  /**
   * Deterministically allocates and expands department rooms across operational floors.
   * If a floor is full, provisions the next floor. If a building is full, provisions a new wing.
   */
  private async expandDepartmentRooms(
    company: any,
    siteId: string,
    primaryBuilding: any,
    policy: HqCapacityPolicy,
    created: { buildings: number; floors: number; rooms: number },
  ) {
    const activeEmployees = company.employees.filter((e: any) => e.status === 'ACTIVE');

    for (const dept of company.departments) {
      const deptEmployees = activeEmployees.filter((e: any) => e.departmentId === dept.id);
      const requiredRooms = Math.max(1, Math.ceil(deptEmployees.length / policy.workspacesPerDepartmentRoom));

      // Find existing rooms for this department
      const existingRooms = await this.prisma.v12SpatialRoom.findMany({
        where: { departmentId: dept.id },
        orderBy: { createdAt: 'asc' },
      });

      if (existingRooms.length >= requiredRooms) {
        continue; // Already has sufficient room capacity
      }

      const roomsToCreate = requiredRooms - existingRooms.length;

      for (let i = 0; i < roomsToCreate; i++) {
        const roomIndex = existingRooms.length + i + 1;
        const roomName = requiredRooms === 1 && roomIndex === 1
          ? `${dept.name} Space`
          : `${dept.name} Space ${roomIndex}`;

        // Find an operational floor with available room capacity
        const targetFloor = await this.findOrCreateOperationalFloor(
          company.id,
          siteId,
          primaryBuilding,
          policy,
          created,
        );

        // Calculate deterministic room coordinates on floor
        const currentRoomsOnFloor = await this.prisma.v12SpatialRoom.count({
          where: { floorId: targetFloor.id, type: 'DEPARTMENT_SPACE' },
        });

        const slot = currentRoomsOnFloor % policy.maxOperationalRoomsPerFloor;
        const coords = this.calculateRoomSlotCoordinates(slot, targetFloor.posY);

        const newRoom = await this.prisma.v12SpatialRoom.create({
          data: {
            name: roomName,
            type: 'DEPARTMENT_SPACE',
            floorId: targetFloor.id,
            departmentId: dept.id,
            posX: coords.x,
            posY: coords.y,
            posZ: coords.z,
          },
        });
        created.rooms++;

        this.emitCreated(company.id, `v12_room_${newRoom.id}`, V12EntityType.DEPARTMENT_SPACE, {
          name: newRoom.name,
          departmentId: dept.id,
          floorId: targetFloor.id,
        });
      }
    }
  }

  /**
   * Finds an operational floor with room capacity. If all current floors are full,
   * creates the next floor. If building floor capacity is reached, provisions a new wing.
   */
  private async findOrCreateOperationalFloor(
    companyId: string,
    siteId: string,
    primaryBuilding: any,
    policy: HqCapacityPolicy,
    created: { buildings: number; floors: number },
  ) {
    const buildings = await this.prisma.v12SpatialBuilding.findMany({
      where: { siteId },
      orderBy: { createdAt: 'asc' },
    });

    for (const b of buildings) {
      const operationalFloors = await this.prisma.v12SpatialFloor.findMany({
        where: { buildingId: b.id, level: { lt: policy.executiveLevelNumber } },
        orderBy: { level: 'asc' },
      });

      for (const f of operationalFloors) {
        const roomCount = await this.prisma.v12SpatialRoom.count({
          where: { floorId: f.id, type: 'DEPARTMENT_SPACE' },
        });
        if (roomCount < policy.maxOperationalRoomsPerFloor) {
          return f; // Found available floor
        }
      }

      // Check if we can add a floor to this building
      if (operationalFloors.length < policy.maxOperationalFloorsPerBuilding) {
        const nextLevel = operationalFloors.length + 1;
        const newFloor = await this.prisma.v12SpatialFloor.create({
          data: {
            name: `Floor ${nextLevel}`,
            level: nextLevel,
            buildingId: b.id,
            posX: b.posX,
            posY: (nextLevel - 1) * 4,
            posZ: b.posZ,
          },
        });
        created.floors++;
        this.emitCreated(companyId, `v12_floor_${newFloor.id}`, V12EntityType.FLOOR, {
          name: newFloor.name,
          level: newFloor.level,
          buildingId: b.id,
        });
        return newFloor;
      }
    }

    // All existing buildings are at full floor capacity: provision an expansion wing!
    const wingLetter = String.fromCharCode(65 + buildings.length); // B, C, D...
    const wingOffsetX = buildings.length * 36;

    const newBuilding = await this.prisma.v12SpatialBuilding.create({
      data: {
        name: `${buildings[0]?.name || 'HQ Building'} Wing ${wingLetter}`,
        siteId,
        posX: wingOffsetX,
        posY: 0,
        posZ: 0,
      },
    });
    created.buildings++;
    this.emitCreated(companyId, `v12_building_${newBuilding.id}`, V12EntityType.BUILDING, {
      name: newBuilding.name,
      siteId,
    });

    // Create Floor 1 in the new wing
    const wingFloor1 = await this.prisma.v12SpatialFloor.create({
      data: {
        name: `Wing ${wingLetter} - Floor 1`,
        level: 1,
        buildingId: newBuilding.id,
        posX: wingOffsetX,
        posY: 0,
        posZ: 0,
      },
    });
    created.floors++;
    this.emitCreated(companyId, `v12_floor_${wingFloor1.id}`, V12EntityType.FLOOR, {
      name: wingFloor1.name,
      level: wingFloor1.level,
      buildingId: newBuilding.id,
    });

    return wingFloor1;
  }

  /**
   * Arranges room slots symmetrically around floor corridor.
   */
  private calculateRoomSlotCoordinates(slot: number, floorPosY: number) {
    const slots = [
      { x: -8, z: -6 },
      { x: 0, z: -6 },
      { x: 8, z: -6 },
      { x: -8, z: 6 },
      { x: 0, z: 6 },
      { x: 8, z: 6 },
    ];
    const s = slots[slot % slots.length] || { x: 0, z: 0 };
    return { x: s.x, y: floorPosY, z: s.z };
  }

  /**
   * Ensures required workspaces exist in all department rooms and executive spaces.
   */
  private async provisionWorkspaces(
    company: any,
    policy: HqCapacityPolicy,
    created: { workspaces: number },
  ) {
    const site = await this.prisma.v12SpatialSite.findFirst({ where: { companyId: company.id } });
    if (!site) return;

    const buildings = await this.prisma.v12SpatialBuilding.findMany({ where: { siteId: site.id } });
    const floors = await this.prisma.v12SpatialFloor.findMany({
      where: { buildingId: { in: buildings.map((b) => b.id) } },
    });
    const rooms = await this.prisma.v12SpatialRoom.findMany({
      where: { floorId: { in: floors.map((f) => f.id) } },
    });

    for (const room of rooms) {
      if (room.type === 'DEPARTMENT_SPACE') {
        const existingWs = await this.prisma.v12SpatialWorkspace.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: 'asc' },
        });

        const targetCount = policy.workspacesPerDepartmentRoom;
        if (existingWs.length < targetCount) {
          const needed = targetCount - existingWs.length;
          const floor = floors.find((f) => f.id === room.floorId);
          const building = buildings.find((b) => b.id === floor?.buildingId);

          for (let i = 0; i < needed; i++) {
            const deskIdx = existingWs.length + i;
            const deskPos = this.calculateDeskCoordinates(room.posX, room.posY, room.posZ, deskIdx);

            const ws = await this.prisma.v12SpatialWorkspace.create({
              data: {
                name: `${room.name} Desk ${deskIdx + 1}`,
                roomId: room.id,
                companyId: company.id,
                departmentId: room.departmentId,
                floorId: room.floorId,
                buildingId: building?.id || '',
                isActive: true,
                isOccupied: false,
                employeeId: null,
                posX: deskPos.x,
                posY: deskPos.y,
                posZ: deskPos.z,
              },
            });
            created.workspaces++;
            this.emitCreated(company.id, `v12_workspace_${ws.id}`, V12EntityType.WORKSPACE, {
              name: ws.name,
              roomId: room.id,
              companyId: company.id,
            });
          }
        }
      }
    }
  }

  /**
   * Arranges desks in orderly dual rows inside a room.
   */
  private calculateDeskCoordinates(roomX: number, roomY: number, roomZ: number, deskIdx: number) {
    const offsets = [
      { dx: -1.8, dz: -1.2 },
      { dx: 0.0, dz: -1.2 },
      { dx: 1.8, dz: -1.2 },
      { dx: -1.8, dz: 1.2 },
      { dx: 0.0, dz: 1.2 },
      { dx: 1.8, dz: 1.2 },
    ];
    const off = offsets[deskIdx % offsets.length] || { dx: 0, dz: 0 };
    return { x: roomX + off.dx, y: roomY + 0.4, z: roomZ + off.dz };
  }

  /**
   * Reconciles active employees to available workspaces. Retains previously provisioned
   * workspaces upon employee termination/reduction without deleting physical spaces.
   * Establishes V12SpatialMovementState and propagates non-sensitive 3D employee state.
   */
  private async reconcileEmployeeAssignments(company: any, execFloorId: string, isHQ: boolean) {
    const activeEmployees = company.employees.filter((e: any) => e.status === 'ACTIVE');
    const inactiveEmployeeIds = new Set(
      company.employees.filter((e: any) => e.status !== 'ACTIVE').map((e: any) => e.id)
    );

    // 1. Vacate workspaces and update movement state for inactive / terminated employees (retention rule)
    if (inactiveEmployeeIds.size > 0) {
      await this.prisma.v12SpatialWorkspace.updateMany({
        where: {
          companyId: company.id,
          employeeId: { in: Array.from(inactiveEmployeeIds) as string[] },
        },
        data: {
          isOccupied: false,
          employeeId: null,
        },
      });

      if (this.prisma.v12SpatialMovementState) {
        await this.prisma.v12SpatialMovementState.updateMany({
          where: { entityId: { in: Array.from(inactiveEmployeeIds) as string[] } },
          data: {
            currentLocationId: 'NONE',
            currentLocationType: 'NONE',
            currentNodeId: null,
            destinationNodeId: null,
            movementState: 'IDLE',
          },
        });
      }

      for (const empId of inactiveEmployeeIds) {
        this.emitUpdated(company.id, `v12_person_${empId}`, V12EntityType.PERSON, {
          spatialState: 'UNAVAILABLE',
          isOccupied: false,
          statusChanged: 'TERMINATED',
        });
      }
    }

    // 2. Assign active employees to designated workspaces and establish movement foundation
    for (const emp of activeEmployees) {
      const roleTitle = emp.role?.title?.toUpperCase() || '';
      let targetRoom: any = null;
      let assignedWs: any = null;

      // Executive office mapping
      if (roleTitle.includes('CHAIRMAN')) {
        targetRoom = await this.prisma.v12SpatialRoom.findFirst({ where: { floorId: execFloorId, type: 'CHAIRMAN_OFFICE' } });
      } else if (roleTitle.includes('CEO')) {
        targetRoom = await this.prisma.v12SpatialRoom.findFirst({ where: { floorId: execFloorId, type: 'CEO_OFFICE' } });
      } else if (roleTitle.includes('MD')) {
        targetRoom = await this.prisma.v12SpatialRoom.findFirst({ where: { floorId: execFloorId, type: 'MD_OFFICE' } });
      } else if (isHQ && roleTitle.includes('HEAD')) {
        targetRoom = await this.prisma.v12SpatialRoom.findFirst({ where: { floorId: execFloorId, type: 'HEAD_OFFICE' } });
      }

      // Department space mapping
      if (!targetRoom && emp.departmentId) {
        // Find employee's existing workspace first (preserves deterministic assignment)
        const existingEmpWs = await this.prisma.v12SpatialWorkspace.findFirst({
          where: { employeeId: emp.id, companyId: company.id },
        });

        if (existingEmpWs) {
          assignedWs = existingEmpWs;
          if (!existingEmpWs.isOccupied) {
            assignedWs = await this.prisma.v12SpatialWorkspace.update({
              where: { id: existingEmpWs.id },
              data: { isOccupied: true },
            });
          }
        } else {
          // Find available vacant workspace in employee's department rooms
          const vacantWs = await this.prisma.v12SpatialWorkspace.findFirst({
            where: {
              companyId: company.id,
              departmentId: emp.departmentId,
              isOccupied: false,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });

          if (vacantWs) {
            assignedWs = await this.prisma.v12SpatialWorkspace.update({
              where: { id: vacantWs.id },
              data: {
                employeeId: emp.id,
                isOccupied: true,
                name: `${emp.name} Workspace`,
              },
            });
          }
        }
      }

      // Executive suite workspace handling
      if (targetRoom) {
        let execWs = await this.prisma.v12SpatialWorkspace.findFirst({
          where: { roomId: targetRoom.id, companyId: company.id },
        });

        if (!execWs) {
          assignedWs = await this.prisma.v12SpatialWorkspace.create({
            data: {
              name: `${emp.name} Workspace`,
              roomId: targetRoom.id,
              companyId: company.id,
              employeeId: emp.id,
              floorId: targetRoom.floorId,
              buildingId: targetRoom.floor?.buildingId || '',
              isActive: true,
              isOccupied: true,
              posX: targetRoom.posX,
              posY: targetRoom.posY + 0.4,
              posZ: targetRoom.posZ,
            },
          });
        } else {
          assignedWs = await this.prisma.v12SpatialWorkspace.update({
            where: { id: execWs.id },
            data: {
              employeeId: emp.id,
              isOccupied: true,
              name: `${emp.name} Workspace`,
            },
          });
        }
      }

      // 3. Movement state creation and realtime spatial employee world-state propagation
      if (assignedWs) {
        const roomNavNode = await this.prisma.v12NavigationNode.findFirst({
          where: { entityId: assignedWs.roomId },
        });

        if (this.prisma.v12SpatialMovementState) {
          await this.prisma.v12SpatialMovementState.upsert({
            where: { entityId: emp.id },
            create: {
              entityId: emp.id,
              entityType: 'EMPLOYEE',
              currentLocationId: assignedWs.id,
              currentLocationType: 'WORKSPACE',
              currentNodeId: roomNavNode?.id || null,
              movementState: 'IDLE',
              movementMode: 'WALK',
              progress: 1.0,
            },
            update: {
              currentLocationId: assignedWs.id,
              currentLocationType: 'WORKSPACE',
              ...(roomNavNode ? { currentNodeId: roomNavNode.id } : {}),
              movementState: 'IDLE',
              movementMode: 'WALK',
            },
          });
        }

        const personEnvelope = this.worldStateEventService.createEventEnvelope(
          V12EventType.ENTITY_UPDATED,
          `v12_person_${emp.id}`,
          V12EntityType.PERSON,
          {
            name: emp.name,
            aevoraId: emp.id,
            aevoraType: 'EMPLOYEE',
            departmentId: emp.departmentId,
            departmentName: emp.department?.name || '',
            roleId: emp.roleId,
            roleTitle: emp.role?.title || '',
            workspaceId: assignedWs.id,
            floorId: assignedWs.floorId,
            buildingId: assignedWs.buildingId,
            currentActivity: emp.activity || 'WORKING',
            spatialState: 'AT_WORKSPACE',
          },
          company.id,
        );

        // Deterministic anchor at employee's assigned workspace desk
        (personEnvelope.payload as any).transform = {
          position: { x: assignedWs.posX, y: assignedWs.posY + 1.0, z: assignedWs.posZ },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        };

        this.worldStateEventService.broadcastEvent(company.id, personEnvelope).catch((err) => {
          this.logger.warn(`Failed to broadcast person event for ${emp.id}: ${err?.message}`);
        });
      }
    }
  }

  /**
   * Generates navigation nodes for all rooms, corridors, and elevator shafts,
   * connecting them into a fully traversable topological graph.
   */
  private async reconcileNavigationTopology(
    siteId: string,
    created: { navigationNodes: number; topologyEdges: number },
  ) {
    const buildings = await this.prisma.v12SpatialBuilding.findMany({ where: { siteId } });
    const floors = await this.prisma.v12SpatialFloor.findMany({
      where: { buildingId: { in: buildings.map((b) => b.id) } },
    });
    const rooms = await this.prisma.v12SpatialRoom.findMany({
      where: { floorId: { in: floors.map((f) => f.id) } },
    });

    const floorElevatorNodes = new Map<string, string>(); // floorId -> elevatorNodeId
    const buildingGroundCorridorNodes = new Map<string, string>(); // buildingId -> groundCorridorNodeId

    // 1. Ensure Navigation Node for every Room
    for (const room of rooms) {
      let node = await this.prisma.v12NavigationNode.findFirst({
        where: { entityId: room.id, entityType: 'ROOM' },
      });

      if (!node) {
        node = await this.prisma.v12NavigationNode.create({
          data: {
            entityId: room.id,
            entityType: 'ROOM',
            nodeType: 'ROOM',
            posX: room.posX,
            posY: room.posY,
            posZ: room.posZ,
            floorId: room.floorId,
            siteId,
            isTraversable: true,
          },
        });
        created.navigationNodes++;
      }
    }

    // 2. Ensure Corridor and Elevator nodes for every Floor
    for (const floor of floors) {
      // Floor Corridor Node
      let corridorNode = await this.prisma.v12NavigationNode.findFirst({
        where: { floorId: floor.id, nodeType: 'CORRIDOR' },
      });

      if (!corridorNode) {
        corridorNode = await this.prisma.v12NavigationNode.create({
          data: {
            entityId: floor.id,
            entityType: 'FLOOR',
            nodeType: 'CORRIDOR',
            posX: floor.posX || 0,
            posY: floor.posY || 0,
            posZ: floor.posZ || 0,
            floorId: floor.id,
            buildingId: floor.buildingId,
            siteId,
            isTraversable: true,
          },
        });
        created.navigationNodes++;
      }

      if (floor.level === 1) {
        buildingGroundCorridorNodes.set(floor.buildingId, corridorNode.id);
      }

      // Floor Elevator Node
      let elevatorNode = await this.prisma.v12NavigationNode.findFirst({
        where: { floorId: floor.id, nodeType: 'ELEVATOR' },
      });

      if (!elevatorNode) {
        elevatorNode = await this.prisma.v12NavigationNode.create({
          data: {
            entityId: floor.id,
            entityType: 'FLOOR',
            nodeType: 'ELEVATOR',
            posX: (floor.posX || 0) + 12,
            posY: floor.posY || 0,
            posZ: floor.posZ || 0,
            floorId: floor.id,
            buildingId: floor.buildingId,
            siteId,
            isTraversable: true,
          },
        });
        created.navigationNodes++;
      }

      floorElevatorNodes.set(floor.id, elevatorNode.id);

      // Connect Floor Corridor <-> Floor Elevator
      await this.ensureEdge(corridorNode.id, elevatorNode.id, 4, 'WALK', created);

      // Connect each Room on this floor <-> Floor Corridor
      const floorRooms = rooms.filter((r) => r.floorId === floor.id);
      for (const r of floorRooms) {
        const roomNode = await this.prisma.v12NavigationNode.findFirst({
          where: { entityId: r.id, entityType: 'ROOM' },
        });
        if (roomNode) {
          await this.ensureEdge(roomNode.id, corridorNode.id, 5, 'WALK', created);
        }
      }
    }

    // 3. Connect Elevator shafts vertically across floors within each building
    for (const b of buildings) {
      const bFloors = floors
        .filter((f) => f.buildingId === b.id)
        .sort((a, b) => a.level - b.level);

      for (let i = 0; i < bFloors.length - 1; i++) {
        const lowerElevator = floorElevatorNodes.get(bFloors[i]!.id);
        const upperElevator = floorElevatorNodes.get(bFloors[i + 1]!.id);
        if (lowerElevator && upperElevator) {
          await this.ensureEdge(lowerElevator, upperElevator, 6, 'ELEVATOR', created);
        }
      }
    }

    // 4. Connect Campus Walkways between Buildings (Wing A <-> Wing B)
    if (buildings.length > 1) {
      const b0Node = buildingGroundCorridorNodes.get(buildings[0]!.id);
      for (let i = 1; i < buildings.length; i++) {
        const bNNode = buildingGroundCorridorNodes.get(buildings[i]!.id);
        if (b0Node && bNNode) {
          await this.ensureEdge(b0Node, bNNode, 20, 'WALK', created);
        }
      }
    }
  }

  /**
   * Helper to idempotently create bidirectional topology edges between two navigation nodes.
   */
  private async ensureEdge(
    nodeAId: string,
    nodeBId: string,
    distance: number,
    traversalType: string,
    created: { topologyEdges: number },
  ) {
    if (nodeAId === nodeBId) return;

    const existingAB = await this.prisma.v12SpatialTopologyEdge.findFirst({
      where: { sourceId: nodeAId, targetId: nodeBId },
    });
    if (!existingAB) {
      await this.prisma.v12SpatialTopologyEdge.create({
        data: {
          sourceId: nodeAId,
          sourceType: 'NODE',
          targetId: nodeBId,
          targetType: 'NODE',
          distance,
          traversalType,
          accessibility: 'PUBLIC',
          isEnabled: true,
        },
      });
      created.topologyEdges++;
    }

    const existingBA = await this.prisma.v12SpatialTopologyEdge.findFirst({
      where: { sourceId: nodeBId, targetId: nodeAId },
    });
    if (!existingBA) {
      await this.prisma.v12SpatialTopologyEdge.create({
        data: {
          sourceId: nodeBId,
          sourceType: 'NODE',
          targetId: nodeAId,
          targetType: 'NODE',
          distance,
          traversalType,
          accessibility: 'PUBLIC',
          isEnabled: true,
        },
      });
      created.topologyEdges++;
    }
  }

  /**
   * Helper to emit authoritative world-state creation events.
   */
  private emitCreated(companyId: string, entityId: string, entityType: V12EntityType, payload: any) {
    try {
      const envelope = this.worldStateEventService.createEventEnvelope(
        V12EventType.ENTITY_CREATED,
        entityId,
        entityType,
        payload,
        companyId,
      );
      this.worldStateEventService.broadcastEvent(companyId, envelope).catch((err) => {
        this.logger.warn(`Failed to broadcast spatial event for ${entityId}: ${err?.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Event creation skipped for ${entityId}: ${err?.message}`);
    }
  }

  /**
   * Helper to emit authoritative world-state update events.
   */
  private emitUpdated(companyId: string, entityId: string, entityType: V12EntityType, payload: any) {
    try {
      const envelope = this.worldStateEventService.createEventEnvelope(
        V12EventType.ENTITY_UPDATED,
        entityId,
        entityType,
        payload,
        companyId,
      );
      this.worldStateEventService.broadcastEvent(companyId, envelope).catch((err) => {
        this.logger.warn(`Failed to broadcast spatial update event for ${entityId}: ${err?.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Event update skipped for ${entityId}: ${err?.message}`);
    }
  }
}

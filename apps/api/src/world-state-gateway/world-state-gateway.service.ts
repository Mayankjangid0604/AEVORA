import { Injectable } from '@nestjs/common';
import { StructuredLoggerService } from '../logger/structured-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { 
  WorldSnapshot, 
  WorldEntity, 
  V12EntityType, 
  CompanyEntity, 
  Transform,
  VisibilityMetadata,
  Region,
  City,
  Campus,
  Building,
  Floor,
  Room,
  Parking,
  Office,
  DepartmentSpace,
  MeetingRoom,
  NavigationNode,
  Vehicle,
} from '@aevora/shared';
import { WorldStateEventService } from './world-state-event.service';
import { HierarchicalStreamingManager, RegionNode, StreamingState } from '@aevora/shared';
import { calculateSlotCoordinate } from '../spatial/vehicle-policy';

const REGION_HIERARCHY_TYPES = new Set([
  V12EntityType.REGION, V12EntityType.CITY, V12EntityType.CAMPUS,
  V12EntityType.BUILDING, V12EntityType.FLOOR, V12EntityType.ROOM,
  V12EntityType.OFFICE, V12EntityType.DEPARTMENT_SPACE, V12EntityType.MEETING_ROOM,
]);

@Injectable()
export class WorldStateGatewayService {
  private readonly logger: StructuredLoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: WorldStateEventService,
    logger: StructuredLoggerService
  ) {
    this.logger = logger;
    this.logger.setContext(WorldStateGatewayService.name);
  }

  private getDefaultTransform(): Transform {
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    };
  }
  
  private createTransform(posX: number, posY: number, posZ: number, rotX: number, rotY: number, rotZ: number, scaleX: number, scaleY: number, scaleZ: number): Transform {
    return {
      position: { x: posX, y: posY, z: posZ },
      rotation: { x: rotX, y: rotY, z: rotZ, w: 1 },
      scale: { x: scaleX, y: scaleY, z: scaleZ }
    };
  }

  private getDefaultVisibility(): VisibilityMetadata {
    return {
      isVisible: true,
      opacity: 1,
      renderState: 'NORMAL'
    };
  }

  /**
   * `companyId` scopes everything from Site downward (Site.companyId and below) — Region/Country/
   * City above it are shared geography, intentionally global. Before this fix, every call below
   * Site queried `findMany()` with no scope at all, so every company's buildings, rooms, and
   * workspaces (including `employeeId` references) leaked into every other company's snapshot —
   * a real cross-company isolation bug, not merely a performance one.
   */
  private async fetchSpatialState(entities: Record<string, WorldEntity>, companyId: string) {
    // Region
    const regions = await this.prisma.v12SpatialRegion.findMany();
    for (const dbRegion of regions) {
      const region: Region = {
        id: `v12_region_${dbRegion.id}`,
        type: V12EntityType.REGION,
        name: dbRegion.name,
        transform: this.createTransform(dbRegion.posX, dbRegion.posY, dbRegion.posZ, dbRegion.rotX, dbRegion.rotY, dbRegion.rotZ, dbRegion.scaleX, dbRegion.scaleY, dbRegion.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[region.id] = region;
    }

    // Cities
    const cities = await this.prisma.v12SpatialCity.findMany();
    for (const dbCity of cities) {
      const city: City = {
        id: `v12_city_${dbCity.id}`,
        type: V12EntityType.CITY,
        name: dbCity.name,
        transform: this.createTransform(dbCity.posX, dbCity.posY, dbCity.posZ, dbCity.rotX, dbCity.rotY, dbCity.rotZ, dbCity.scaleX, dbCity.scaleY, dbCity.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[city.id] = city;
    }

    // Sites (Campus) — scoped to this company only.
    const sites = await this.prisma.v12SpatialSite.findMany({ where: { companyId } });
    const siteIds = sites.map((s: any) => s.id);
    for (const dbSite of sites) {
      const campus: Campus = {
        id: `v12_campus_${dbSite.id}`,
        type: V12EntityType.CAMPUS,
        name: dbSite.name,
        parentId: dbSite.cityId ? `v12_city_${dbSite.cityId}` : undefined,
        transform: this.createTransform(dbSite.posX, dbSite.posY, dbSite.posZ, dbSite.rotX, dbSite.rotY, dbSite.rotZ, dbSite.scaleX, dbSite.scaleY, dbSite.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[campus.id] = campus;
    }

    // Buildings — scoped to this company's sites only.
    const buildings = await this.prisma.v12SpatialBuilding.findMany({ where: { siteId: { in: siteIds } } });
    const buildingIds = buildings.map((b: any) => b.id);
    for (const dbBuilding of buildings) {
      const building: Building = {
        id: `v12_building_${dbBuilding.id}`,
        type: V12EntityType.BUILDING,
        name: dbBuilding.name,
        parentId: dbBuilding.siteId ? `v12_campus_${dbBuilding.siteId}` : undefined,
        floors: [], // Populated below or implicitly linked via parentId on floor
        transform: this.createTransform(dbBuilding.posX, dbBuilding.posY, dbBuilding.posZ, dbBuilding.rotX, dbBuilding.rotY, dbBuilding.rotZ, dbBuilding.scaleX, dbBuilding.scaleY, dbBuilding.scaleZ),
        visibility: this.getDefaultVisibility(),
        assetId: 'asset_building_default_v1',
      };
      entities[building.id] = building;
    }

    // Floors — scoped to this company's buildings only.
    const floors = await this.prisma.v12SpatialFloor.findMany({ where: { buildingId: { in: buildingIds } } });
    const floorIds = floors.map((f: any) => f.id);
    for (const dbFloor of floors) {
      const floor: Floor = {
        id: `v12_floor_${dbFloor.id}`,
        type: V12EntityType.FLOOR,
        name: dbFloor.name,
        level: dbFloor.level,
        parentId: `v12_building_${dbFloor.buildingId}`,
        rooms: [], // Populated below or implicitly linked via parentId on room
        transform: this.createTransform(dbFloor.posX, dbFloor.posY, dbFloor.posZ, dbFloor.rotX, dbFloor.rotY, dbFloor.rotZ, dbFloor.scaleX, dbFloor.scaleY, dbFloor.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[floor.id] = floor;
      
      const b = entities[`v12_building_${dbFloor.buildingId}`] as Building;
      if (b) { b.floors.push(floor.id); }
    }

    // Rooms & Specialized Rooms — scoped to this company's floors only.
    const rooms = await this.prisma.v12SpatialRoom.findMany({ where: { floorId: { in: floorIds } } });
    for (const dbRoom of rooms) {
      let type = V12EntityType.ROOM;
      const roomObj: Room | Office | DepartmentSpace | MeetingRoom | any = {
        id: `v12_room_${dbRoom.id}`,
        name: dbRoom.name,
        parentId: `v12_floor_${dbRoom.floorId}`,
        roomType: dbRoom.type,
        transform: this.createTransform(dbRoom.posX, dbRoom.posY, dbRoom.posZ, dbRoom.rotX, dbRoom.rotY, dbRoom.rotZ, dbRoom.scaleX, dbRoom.scaleY, dbRoom.scaleZ),
        visibility: this.getDefaultVisibility()
      };

      if (['CHAIRMAN_OFFICE', 'CEO_OFFICE', 'MD_OFFICE', 'HEAD_OFFICE', 'OFFICE'].includes(dbRoom.type)) {
        type = V12EntityType.OFFICE;
        roomObj.type = type;
      } else if (dbRoom.type === 'DEPARTMENT_SPACE') {
        type = V12EntityType.DEPARTMENT_SPACE;
        roomObj.type = type;
        roomObj.departmentId = dbRoom.departmentId;
      } else if (['MEETING_ROOM', 'CONFERENCE_ROOM'].includes(dbRoom.type)) {
        type = V12EntityType.MEETING_ROOM;
        roomObj.type = type;
      } else {
        type = V12EntityType.ROOM;
        roomObj.type = type;
      }

      entities[roomObj.id] = roomObj;
      
      const f = entities[`v12_floor_${dbRoom.floorId}`] as Floor;
      if (f) { f.rooms.push(roomObj.id); }
    }
    
    // Workspaces — scoped to this company directly (V12SpatialWorkspace carries its own companyId).
    const workspaces = await this.prisma.v12SpatialWorkspace.findMany({ where: { companyId } });
    for (const dbWs of workspaces) {
      const workspace: any = {
        id: `v12_workspace_${dbWs.id}`,
        type: V12EntityType.WORKSPACE,
        name: dbWs.name,
        parentId: `v12_room_${dbWs.roomId}`,
        employeeId: dbWs.employeeId,
        companyId: dbWs.companyId,
        departmentId: dbWs.departmentId,
        isActive: dbWs.isActive,
        isOccupied: dbWs.isOccupied,
        transform: this.createTransform(dbWs.posX, dbWs.posY, dbWs.posZ, dbWs.rotX, dbWs.rotY, dbWs.rotZ, dbWs.scaleX, dbWs.scaleY, dbWs.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[workspace.id] = workspace;
    }
    
    // Parking — scoped to this company's sites only.
    const parkings = await this.prisma.v12SpatialParkingArea.findMany({ where: { siteId: { in: siteIds } } });
    for (const p of parkings) {
      const parking: Parking = {
        id: `v12_parking_${p.id}`,
        type: V12EntityType.PARKING,
        name: p.name,
        parentId: p.siteId ? `v12_campus_${p.siteId}` : undefined,
        capacity: p.capacity,
        availableSpots: p.availableSpots,
        transform: this.createTransform(p.posX, p.posY, p.posZ, p.rotX, p.rotY, p.rotZ, p.scaleX, p.scaleY, p.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[parking.id] = parking;
    }

    // Vehicles — scoped to this company
    const vehicles = this.prisma.v12SpatialVehicle
      ? await this.prisma.v12SpatialVehicle.findMany({
          where: { companyId },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const parkingMap = new Map(parkings.map((p) => [p.id, p]));
    const parkingSlotCounters = new Map<string, number>();

    for (const v of vehicles) {
      const parking = v.parkingAreaId ? parkingMap.get(v.parkingAreaId) : null;
      let posX = 0;
      let posY = 0;
      let posZ = 0;

      if (parking) {
        const slotIdx = parkingSlotCounters.get(parking.id) || 0;
        parkingSlotCounters.set(parking.id, slotIdx + 1);
        const slotCoord = calculateSlotCoordinate(parking, slotIdx);
        posX = slotCoord.x;
        posY = slotCoord.y;
        posZ = slotCoord.z;
      }

      const vehicleEntity: Vehicle & {
        isParked?: boolean;
        parkingAreaId?: string | null;
        slotIndex?: number;
      } = {
        id: `v12_vehicle_${v.id}`,
        type: V12EntityType.VEHICLE,
        name: `${v.vehicleClass} Fleet Vehicle`,
        parentId: v.parkingAreaId ? `v12_parking_${v.parkingAreaId}` : undefined,
        ownerId: v.ownerEmployeeId || undefined,
        vehicleClass: v.vehicleClass as any,
        assetId: v.assetId,
        occupants: (Array.isArray(v.occupantEmployeeIds) ? v.occupantEmployeeIds : []) as string[],
        isParked: v.isParked,
        parkingAreaId: v.parkingAreaId,
        transform: this.createTransform(posX, posY, posZ, 0, 0, 0, 1, 1, 1),
        visibility: this.getDefaultVisibility(),
      };
      entities[vehicleEntity.id] = vehicleEntity;
    }
  }

  /**
   * Generates a deterministic initial world snapshot from Aevora Truth.
   * Maps Company -> CompanyEntity, Employee -> Person.
   */
  public async generateSnapshot(companyId: string, viewportEntityId?: string): Promise<WorldSnapshot> {
    this.logger.log(`Generating Spatial World Snapshot`, '', { companyId, viewportEntityId });
    const entities: Record<string, WorldEntity> = {};

    // 1. Fetch Authoritative State
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        employees: true,
        officeLocations: true
      }
    });

    if (!company) {
      throw new Error('Company not found');
    }
    
    // Fetch spatial environment scoped to this company (plus shared Region/Country/City geography).
    await this.fetchSpatialState(entities, companyId);

    // 2. Translate Company to WorldEntity
    const companyEntity: CompanyEntity = {
      id: `v12_company_${company.id}`,
      type: V12EntityType.COMPANY,
      name: company.name,
      transform: this.getDefaultTransform(),
      visibility: this.getDefaultVisibility(),
      aevoraId: company.id,
      aevoraType: 'Company'
    };
    entities[companyEntity.id] = companyEntity;

    // 3. Translate Employees to Persons
    for (const employee of company.employees) {
      const empWs = this.prisma.v12SpatialWorkspace?.findFirst
        ? await this.prisma.v12SpatialWorkspace.findFirst({
            where: { employeeId: employee.id, companyId },
          })
        : null;
      const movementState = this.prisma.v12SpatialMovementState?.findUnique
        ? await this.prisma.v12SpatialMovementState.findUnique({
            where: { entityId: employee.id }
          })
        : null;

      const transform = empWs
        ? this.createTransform(empWs.posX, empWs.posY + 1.0, empWs.posZ, 0, 0, 0, 1, 1, 1)
        : this.getDefaultTransform();

      const isEmployeeActive = employee.status === 'ACTIVE';

      const person: any = {
        id: `v12_person_${employee.id}`,
        type: V12EntityType.PERSON,
        name: employee.name,
        transform,
        visibility: isEmployeeActive
          ? this.getDefaultVisibility()
          : { isVisible: false, opacity: 0, renderState: 'HIDDEN' },
        parentId: companyEntity.id,
        aevoraId: employee.id,
        aevoraType: 'Employee',
        departmentId: employee.departmentId,
        roleId: employee.roleId,
        workspaceId: empWs?.id || undefined,
        currentActivity: employee.activity || 'WORKING',
        spatialState: isEmployeeActive ? (empWs ? 'AT_WORKSPACE' : 'PROVISIONED') : 'UNAVAILABLE',
        assetId: 'asset_digital_human_body_v1',
      };

      if (movementState) {
        person.movement = {
          movementState: movementState.movementState as any,
          currentLocationId: movementState.currentLocationId,
          currentLocationType: movementState.currentLocationType as any,
          currentNodeId: movementState.currentNodeId || undefined,
          destinationNodeId: movementState.destinationNodeId || undefined,
          path: movementState.path as string[],
          progress: movementState.progress,
          intentSource: movementState.intentSource as any,
          intentId: movementState.intentId || undefined,
          blockedReason: movementState.blockedReason || undefined
        };
      }

      entities[person.id] = person;
    }

    // 3.5 Fetch Navigation Nodes — scoped to this company's site/building/floor chain, plus any
    // genuinely unscoped (site/building/floor all null) shared/global nodes. Was previously
    // unconditional `findMany()`, the same cross-company leak as the spatial-structure queries above.
    const companySiteIds = Object.values(entities).filter((e: any) => e.type === V12EntityType.CAMPUS).map((e: any) => e.aevoraId || e.id.replace('v12_campus_', ''));
    const companyBuildingIds = Object.values(entities).filter((e: any) => e.type === V12EntityType.BUILDING).map((e: any) => e.id.replace('v12_building_', ''));
    const companyFloorIds = Object.values(entities).filter((e: any) => e.type === V12EntityType.FLOOR).map((e: any) => e.id.replace('v12_floor_', ''));
    const navNodes = await this.prisma.v12NavigationNode.findMany({
      where: {
        OR: [
          { siteId: { in: companySiteIds } },
          { buildingId: { in: companyBuildingIds } },
          { floorId: { in: companyFloorIds } },
          { AND: [{ siteId: null }, { buildingId: null }, { floorId: null }] },
        ],
      },
    });
    const navigationNodes: NavigationNode[] = navNodes.map(node => ({
      id: node.id,
      entityId: node.entityId,
      entityType: node.entityType as any,
      isTraversable: node.isTraversable,
      nodeType: node.nodeType,
      position: { x: node.posX, y: node.posY, z: node.posZ }
    }));
    const navNodeIds = new Set(navNodes.map((n: any) => n.id));

    // 4. Fetch Topology — filtered to edges between nodes actually in this company's scoped node set.
    const allTopology = await this.prisma.v12SpatialTopologyEdge.findMany();
    const topology = allTopology.filter((e: any) => navNodeIds.has(e.sourceId) || navNodeIds.has(e.targetId));
    const topologyEdges = topology.map(edge => ({
      id: edge.id,
      sourceId: edge.sourceId,
      sourceType: edge.sourceType as any,
      targetId: edge.targetId,
      targetType: edge.targetType as any,
      distance: edge.distance,
      traversalType: edge.traversalType as any,
      accessibility: edge.accessibility as any,
      isEnabled: edge.isEnabled
    }));

    // 5. Viewport Culling
    if (viewportEntityId && entities[viewportEntityId]) {
      const visibleEntities: Record<string, WorldEntity> = {};
      
      const includeWithChildren = (id: string) => {
        if (!entities[id] || visibleEntities[id]) return;
        visibleEntities[id] = entities[id];
        for (const childId of Object.keys(entities)) {
          if (entities[childId].parentId === id) {
            includeWithChildren(childId);
          }
        }
      };

      const includeParents = (id: string) => {
        let current = entities[id];
        while (current && current.parentId && entities[current.parentId]) {
          current = entities[current.parentId];
          visibleEntities[current.id] = current;
        }
      };

      includeWithChildren(viewportEntityId);
      includeParents(viewportEntityId);

      const companyEntityId = `v12_company_${companyId}`;
      if (entities[companyEntityId]) visibleEntities[companyEntityId] = entities[companyEntityId];

      // Decision 98: real hierarchical streaming state, derived from the viewer's actual current
      // location (viewportEntityId) — never random. The manager never touches entity data (see
      // packages/shared/src/v12/streaming.ts); this only annotates which regions are
      // UNLOADED/LOADING/LOADED/ACTIVE/EVICTING for whatever consumed the snapshot.
      const streamingStates = this.resolveStreamingStates(entities, viewportEntityId);

      return {
        version: '1.0.0',
        sequence: this.eventService.getCurrentSequence(companyId),
        timestamp: Date.now(),
        entities: visibleEntities,
        topology: topologyEdges,
        navigationNodes,
        streamingStates,
      } as any;
    }

    // Return the full snapshot
    return {
      version: '1.0.0',
      sequence: this.eventService.getCurrentSequence(companyId),
      timestamp: Date.now(),
      entities,
      topology: topologyEdges,
      navigationNodes
    };
  }

  /**
   * Builds a real `HierarchicalStreamingManager` from the actual region-type entities in this
   * snapshot (Region→City→Campus→Building→Floor→Room and the specialized room types) and activates
   * the chain containing the viewer's current location. Returns every region's resulting state —
   * never just the active ones — so a consumer can distinguish UNLOADED from ACTIVE explicitly.
   */
  private resolveStreamingStates(entities: Record<string, WorldEntity>, viewportEntityId: string): Record<string, StreamingState> {
    const regionNodes: RegionNode[] = Object.values(entities)
      .filter((e) => REGION_HIERARCHY_TYPES.has(e.type))
      .map((e) => ({ id: e.id, parentId: (e.parentId && entities[e.parentId] && REGION_HIERARCHY_TYPES.has(entities[e.parentId].type)) ? e.parentId : null }));

    if (regionNodes.length === 0) return {};

    const manager = new HierarchicalStreamingManager(regionNodes, Math.max(regionNodes.length, 1));

    // The viewport entity itself may not be a region (e.g. a Person or Workspace) — walk up to the
    // nearest ancestor that genuinely is one.
    let target: WorldEntity | undefined = entities[viewportEntityId];
    while (target && !REGION_HIERARCHY_TYPES.has(target.type) && target.parentId) {
      target = entities[target.parentId];
    }
    if (target && REGION_HIERARCHY_TYPES.has(target.type)) {
      manager.activate(target.id);
    }

    const states: Record<string, StreamingState> = {};
    for (const node of regionNodes) states[node.id] = manager.getState(node.id);
    return states;
  }
}

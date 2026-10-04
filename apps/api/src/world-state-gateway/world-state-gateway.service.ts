import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  WorldSnapshot, 
  WorldEntity, 
  V12EntityType, 
  CompanyEntity, 
  Person,
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
  TopologyEdge,
  NavigationNode,
  MovementState
} from '@aevora/shared';
import { WorldStateEventService } from './world-state-event.service';

@Injectable()
export class WorldStateGatewayService {
  private readonly logger = new Logger(WorldStateGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: WorldStateEventService
  ) {}

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

  private async fetchSpatialState(entities: Record<string, WorldEntity>) {
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

    // Sites (Campus)
    const sites = await this.prisma.v12SpatialSite.findMany();
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

    // Buildings
    const buildings = await this.prisma.v12SpatialBuilding.findMany();
    for (const dbBuilding of buildings) {
      const building: Building = {
        id: `v12_building_${dbBuilding.id}`,
        type: V12EntityType.BUILDING,
        name: dbBuilding.name,
        parentId: dbBuilding.siteId ? `v12_campus_${dbBuilding.siteId}` : undefined,
        floors: [], // Populated below or implicitly linked via parentId on floor
        transform: this.createTransform(dbBuilding.posX, dbBuilding.posY, dbBuilding.posZ, dbBuilding.rotX, dbBuilding.rotY, dbBuilding.rotZ, dbBuilding.scaleX, dbBuilding.scaleY, dbBuilding.scaleZ),
        visibility: this.getDefaultVisibility()
      };
      entities[building.id] = building;
    }

    // Floors
    const floors = await this.prisma.v12SpatialFloor.findMany();
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

    // Rooms & Specialized Rooms
    const rooms = await this.prisma.v12SpatialRoom.findMany();
    for (const dbRoom of rooms) {
      let type = V12EntityType.ROOM;
      let roomObj: Room | Office | DepartmentSpace | MeetingRoom | any = {
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
    
    // Workspaces
    const workspaces = await this.prisma.v12SpatialWorkspace.findMany();
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
    
    // Parking
    const parkings = await this.prisma.v12SpatialParkingArea.findMany();
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
  }

  /**
   * Generates a deterministic initial world snapshot from Aevora Truth.
   * Maps Company -> CompanyEntity, Employee -> Person.
   */
  public async generateSnapshot(companyId: string): Promise<WorldSnapshot> {
    this.logger.log(`Generating V12 World Snapshot for company: ${companyId}`);
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
    
    // Fetch generic spatial environment
    await this.fetchSpatialState(entities);

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
      const person: Person = {
        id: `v12_person_${employee.id}`,
        type: V12EntityType.PERSON,
        name: employee.name,
        transform: this.getDefaultTransform(), // Needs spatial state mapping later
        visibility: this.getDefaultVisibility(),
        parentId: companyEntity.id,
        aevoraId: employee.id,
        aevoraType: 'Employee',
        currentActivity: employee.activity
      };
      entities[person.id] = person;

      const movementState = await this.prisma.v12SpatialMovementState.findUnique({
        where: { entityId: employee.id }
      });
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
    }

    // 3.5 Fetch Navigation Nodes
    const navNodes = await this.prisma.v12NavigationNode.findMany();
    const navigationNodes: NavigationNode[] = navNodes.map(node => ({
      id: node.id,
      entityId: node.entityId,
      entityType: node.entityType as any,
      isTraversable: node.isTraversable,
      nodeType: node.nodeType,
      position: { x: node.posX, y: node.posY, z: node.posZ }
    }));

    // 4. Fetch Topology
    const topology = await this.prisma.v12SpatialTopologyEdge.findMany();
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

    // Return the snapshot
    return {
      version: '1.0.0',
      sequence: this.eventService.getCurrentSequence(companyId),
      timestamp: Date.now(),
      entities,
      topology: topologyEdges,
      navigationNodes
    };
  }
}

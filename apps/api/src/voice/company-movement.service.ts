import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyAutonomyService } from './company-autonomy.service';

export interface LocationNode {
  id: string;
  name: string;
  type: string;
  connections: string[];
}

@Injectable()
export class CompanyMovementService {
  private readonly logger = new Logger(CompanyMovementService.name);
  
  // In-memory navigation graph mapping locationId to LocationNode
  private navigationGraphs = new Map<string, Map<string, LocationNode>>();
  
  // Track active movements to allow interruption and prevent duplication
  private activeMovements = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompanyAutonomyService))
    private readonly autonomyService: CompanyAutonomyService,
  ) {}

  async onModuleInit() {
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' } });
    for (const company of companies) {
      await this.initializeOfficeLayout(company.id);
    }
  }

  /**
   * Initializes the physical layout of the office in the DB if it doesn't exist.
   * Matches the canonical departments from the frontend's office-layout.ts.
   */
  async initializeOfficeLayout(companyId: string) {
    let office = await this.prisma.officeLocation.findFirst({
      where: { companyId, type: 'OFFICE' }
    });
    
    if (!office) {
      this.logger.log(`Initializing canonical office layout for company ${companyId}`);
      // The entrance / main hallway
      office = await this.prisma.officeLocation.create({
        data: {
          companyId,
          name: 'Main Entrance',
          type: 'OFFICE',
        }
      });
      
      await this.prisma.officeLocation.create({
        data: { companyId, name: 'Main Hallway', type: 'HALLWAY' }
      });
      
      await this.prisma.officeLocation.create({
        data: { companyId, name: 'Cafeteria', type: 'CAFETERIA' }
      });
      
      await this.prisma.officeLocation.create({
        data: { companyId, name: 'Meeting Room', type: 'MEETING_ROOM' }
      });

      // Map existing active departments to locations
      const departments = await this.prisma.department.findMany({
        where: { companyId, status: 'ACTIVE' }
      });

      for (const dept of departments) {
        await this.prisma.officeLocation.create({
          data: {
            companyId,
            name: dept.name,
            type: 'DEPARTMENT',
            departmentId: dept.id
          }
        });
      }
      
      // Update employee default locations based on their department
      const employees = await this.prisma.employee.findMany({
        where: { companyId, status: 'ACTIVE' }
      });
      
      for (const emp of employees) {
        const deptLocation = await this.prisma.officeLocation.findFirst({
          where: { companyId, departmentId: emp.departmentId }
        });
        
        if (deptLocation) {
          await this.prisma.employee.update({
            where: { id: emp.id },
            data: { locationId: deptLocation.id }
          });
        }
      }
    }
    
    await this.buildNavigationGraph(companyId);
  }

  private async buildNavigationGraph(companyId: string) {
    const locations = await this.prisma.officeLocation.findMany({
      where: { companyId }
    });
    
    const graph = new Map<string, LocationNode>();
    
    const hallway = locations.find(l => l.type === 'HALLWAY');
    
    if (!hallway) return; // Should not happen after init
    
    for (const loc of locations) {
      const connections: string[] = [];
      
      if (loc.type === 'OFFICE') {
        connections.push(hallway.id);
      } else if (loc.type === 'HALLWAY') {
        // Hallway connects to everything except Office (which connects TO hallway)
        connections.push(...locations.filter(l => l.id !== loc.id).map(l => l.id));
      } else {
        // Rooms connect back to Hallway
        connections.push(hallway.id);
      }
      
      graph.set(loc.id, {
        id: loc.id,
        name: loc.name,
        type: loc.type,
        connections
      });
    }
    
    this.navigationGraphs.set(companyId, graph);
  }

  /**
   * BFS to find path from startId to targetId
   */
  findPath(companyId: string, startId: string, targetId: string): string[] | null {
    const graph = this.navigationGraphs.get(companyId);
    if (!graph || !graph.has(startId) || !graph.has(targetId)) return null;

    const queue: string[][] = [[startId]];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === targetId) return path;

      const node = graph.get(current);
      if (node) {
        for (const neighbor of node.connections) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push([...path, neighbor]);
          }
        }
      }
    }

    return null;
  }

  /**
   * Start moving an employee to a new location.
   */
  async moveEmployeeToLocation(employeeId: string, targetLocationId: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true }
    });
    
    if (!emp) return;
    
    // If the employee has no locationId, try to assign hallway as starting point
    let startLocationId = emp.locationId;
    if (!startLocationId) {
      const graph = this.navigationGraphs.get(emp.companyId);
      if (!graph) return;
      const hallwayNode = [...graph.values()].find(n => n.type === 'HALLWAY');
      if (!hallwayNode) return;
      startLocationId = hallwayNode.id;
      // Persist fallback start
      await this.prisma.employee.update({ where: { id: emp.id }, data: { locationId: startLocationId } });
    }
    
    if (startLocationId === targetLocationId) return; // Already there

    const path = this.findPath(emp.companyId, startLocationId, targetLocationId);
    
    if (!path || path.length < 2) return;
    
    const targetLoc = await this.prisma.officeLocation.findUnique({ where: { id: targetLocationId } });
    if (!targetLoc) return;

    // Cancel any existing movement for this employee
    if (this.activeMovements.has(emp.id)) {
      clearTimeout(this.activeMovements.get(emp.id));
      this.activeMovements.delete(emp.id);
    }
    
    // Broadcast movement started
    this.autonomyService.broadcast({
      type: 'AUTONOMOUS_EVENT',
      timestamp: Date.now(),
      payload: {
        id: `move_${employeeId}_${Date.now()}`,
        type: 'EMPLOYEE_MOVEMENT_STARTED',
        employeeId: emp.id,
        path: path,
        status: 'PROCESSING',
        targetLocationId: targetLoc.id,
        targetLocationName: targetLoc.name,
        targetLocationType: targetLoc.type
      } as any // Forcing type since it expects normal event, frontend handles it if designed flexibly
    });
    
    // Simulate walking (in a real system this would be async delays and steps)
    const timeout = setTimeout(async () => {
      this.activeMovements.delete(emp.id);
      try {
        await this.prisma.employee.update({
          where: { id: emp.id },
          data: { locationId: targetLocationId }
        });
      } catch (e: any) {
        this.logger.warn(`Movement of ${emp.id} failed: ${e.message}`);
        return;
      }
      
      this.autonomyService.broadcast({
        type: 'AUTONOMOUS_EVENT',
        timestamp: Date.now(),
        payload: {
          id: `move_arrived_${employeeId}_${Date.now()}`,
          type: 'EMPLOYEE_ARRIVED',
          employeeId: emp.id,
          locationId: targetLocationId,
          locationName: targetLoc.name,
          locationType: targetLoc.type,
          status: 'COMPLETED'
        } as any
      });
    }, path.length * 2000); // 2 seconds per node in path
    
    this.activeMovements.set(emp.id, timeout);
  }
}

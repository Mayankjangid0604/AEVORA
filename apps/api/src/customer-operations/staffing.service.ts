import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAssignmentStatus, EmployeeStatus } from '@prisma/client';

export interface AssignStaffDto {
  employeeId: string;
  role: string;
  allocation: number; // 0-100
}

@Injectable()
export class StaffingService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
  }

  async assignToProject(projectId: string, companyId: string, actorId: string, dto: AssignStaffDto) {
    await this.verifyActor(actorId, companyId);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project does not belong to company');
    }

    // Verify employee belongs to same company
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.companyId !== companyId) {
      throw new ForbiddenException('Cannot assign employee from another company');
    }
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException(`Cannot assign inactive employee (status: ${employee.status})`);
    }

    if (dto.allocation < 0 || dto.allocation > 100) {
      throw new BadRequestException('Allocation must be between 0 and 100');
    }

    // Check for existing active assignment
    const existing = await this.prisma.projectAssignment.findFirst({
      where: {
        projectId,
        employeeId: dto.employeeId,
        status: ProjectAssignmentStatus.ACTIVE,
      },
    });
    if (existing) {
      throw new BadRequestException('Employee already actively assigned to this project');
    }

    return this.prisma.projectAssignment.create({
      data: {
        projectId,
        employeeId: dto.employeeId,
        role: dto.role,
        allocation: dto.allocation,
        status: ProjectAssignmentStatus.ACTIVE,
      },
    });
  }

  async releaseFromProject(assignmentId: string, companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);

    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { id: assignmentId },
      include: { project: true },
    });
    if (!assignment || assignment.project.companyId !== companyId) {
      throw new ForbiddenException('Assignment not found or access denied');
    }

    return this.prisma.projectAssignment.update({
      where: { id: assignmentId },
      data: { status: ProjectAssignmentStatus.RELEASED, releasedAt: new Date() },
    });
  }

  async getProjectStaff(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }
    return this.prisma.projectAssignment.findMany({
      where: { projectId, status: ProjectAssignmentStatus.ACTIVE },
      include: { employee: true },
    });
  }

  async calculateCapacity(employeeId: string, companyId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw new ForbiddenException('Employee not found or access denied');
    }

    const activeAssignments = await this.prisma.projectAssignment.findMany({
      where: { employeeId, status: ProjectAssignmentStatus.ACTIVE },
      include: { project: true },
    });

    const totalAllocated = activeAssignments.reduce((sum, a) => sum + a.allocation, 0);
    const availableCapacity = Math.max(0, 100 - totalAllocated);

    return {
      employeeId,
      totalAllocated,
      availableCapacity,
      isOverAllocated: totalAllocated > 100,
      assignments: activeAssignments,
    };
  }

  async detectOverAllocation(companyId: string) {
    const activeAssignments = await this.prisma.projectAssignment.findMany({
      where: {
        status: ProjectAssignmentStatus.ACTIVE,
        project: { companyId },
      },
      include: { employee: true },
    });

    const byEmployee: Record<string, { employee: any; total: number; assignments: any[] }> = {};
    for (const a of activeAssignments) {
      if (!byEmployee[a.employeeId]) {
        byEmployee[a.employeeId] = { employee: a.employee, total: 0, assignments: [] };
      }
      byEmployee[a.employeeId].total += a.allocation;
      byEmployee[a.employeeId].assignments.push(a);
    }

    return Object.values(byEmployee).filter(e => e.total > 100);
  }
}

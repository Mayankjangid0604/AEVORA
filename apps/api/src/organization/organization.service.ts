import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeService } from '../employee/employee.service';
import { WorkerProfileService } from '../workforce/worker-profile.service';
import { WorkforceAuditService } from '../workforce/workforce-audit.service';
import { PerformanceReviewService } from '../workforce/performance-review.service';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeService: EmployeeService,
    private readonly profileService: WorkerProfileService,
    private readonly auditService: WorkforceAuditService,
    private readonly performanceReviewService: PerformanceReviewService,
  ) {}

  async getOrganization(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const departments = await this.prisma.department.findMany({ where: { companyId } });
    const employees = await this.employeeService.listEmployees(companyId);
    return { company, departments, employees };
  }

  async getOrganizationChart(companyId: string) {
    const profiles = await this.prisma.workerProfile.findMany({
      where: { companyId },
      include: {
        employee: { include: { role: true, department: true } },
      }
    });
    
    // Build tree
    const rootNodes = profiles.filter(p => !p.managerId);
    const buildTree = (nodeId: string): any => {
      const node = profiles.find(p => p.id === nodeId);
      if (!node) return null;
      const children = profiles.filter(p => p.managerId === nodeId).map(p => buildTree(p.id));
      return { ...node, directReports: children };
    };

    return rootNodes.map(n => buildTree(n.id));
  }

  async getDepartments(companyId: string) {
    return this.prisma.department.findMany({ where: { companyId } });
  }

  async getDepartment(companyId: string, id: string) {
    return this.prisma.department.findUnique({ where: { id, companyId } });
  }

  async getActivity(companyId: string) {
    return this.prisma.workerProfile.findMany({
      where: { companyId },
      select: {
        employeeId: true,
        activeTaskCount: true,
        employee: { select: { name: true, status: true } }
      }
    });
  }

  async getAudit(companyId: string) {
    return this.auditService.getCompanyAudit(companyId);
  }
}

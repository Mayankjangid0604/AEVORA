import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentStatus } from '@prisma/client';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  async createDepartment(companyId: string, name: string) {
    // Validate company exists
    const company = await this.prisma.company.findUnique({ where: { id: companyId }});
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          name,
          companyId,
          status: DepartmentStatus.ACTIVE,
        }
      });
      await tx.companyEvent.create({
        data: {
          companyId,
          type: 'DEPARTMENT_CREATED',
          payload: { departmentId: dept.id, name },
        }
      });
      return dept;
    });
  }

  async listDepartments(companyId: string) {
    return this.prisma.department.findMany({ where: { companyId } });
  }

  async getDepartment(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async updateDepartment(id: string, name: string) {
    await this.getDepartment(id);
    return this.prisma.department.update({
      where: { id },
      data: { name },
    });
  }
}

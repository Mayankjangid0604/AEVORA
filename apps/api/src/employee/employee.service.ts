import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import { bandSalaryAC } from '../config/salary-bands';

@Injectable()
export class EmployeeService {
  constructor(private prisma: PrismaService, private auth: AuthorizationService) {}

  async getEmployee(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: { role: true, department: true }
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async listEmployees(companyId: string) {
    return this.prisma.employee.findMany({ where: { companyId }, include: { role: true, department: true } });
  }

  async hireEmployee(actorId: string, companyId: string, data: { name: string; departmentId: string; roleId: string; salary: number; identitySeed: string; skills: { name: string; category: string; proficiency: number }[] }) {
    await this.auth.checkPermission(actorId, 'HIRE_EMPLOYEE', companyId);

    // Validate relationships
    const dept = await this.prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept || dept.companyId !== companyId) throw new BadRequestException('Invalid department for this company');

    const res = await this.prisma.$transaction(async (tx) => {
      const salary = data.salary > 0 ? data.salary : bandSalaryAC(await tx.role.findUnique({ where: { id: data.roleId } }));
      const emp = await tx.employee.create({
        data: {
          name: data.name,
          identitySeed: data.identitySeed,
          companyId,
          departmentId: data.departmentId,
          roleId: data.roleId,
          salary,
          status: EmployeeStatus.ACTIVE,
          skills: {
            create: data.skills.map(s => ({
              name: s.name,
              category: s.category,
              proficiency: Math.max(0, Math.min(100, s.proficiency)), // Enforce 0-100
            }))
          },
          history: {
            create: [
              { eventType: 'HIRED', newValue: 'ACTIVE', actor: actorId }
            ]
          }
        },
      });

      // Create AC Wallet
      await tx.aCWallet.create({
        data: { employeeId: emp.id, balance: 0 },
      });

      // Emit Event
      await tx.companyEvent.create({
        data: { companyId, type: 'EMPLOYEE_HIRED', payload: { employeeId: emp.id, name: emp.name } }
      });

      return emp;
    });
    return res;
  }

  private async _updateStatus(actorId: string, id: string, newStatus: EmployeeStatus, eventType: string) {
    const emp = await this.getEmployee(id);
    await this.auth.checkPermission(actorId, 'MANAGE_EMPLOYEES', emp.companyId);

    if (emp.status === newStatus) throw new BadRequestException(`Employee is already ${newStatus}`);
    
    // Prevent invalid transitions
    if (emp.status === EmployeeStatus.TERMINATED && newStatus !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException('A terminated employee can only be rehired (ACTIVE)');
    }

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { 
          status: newStatus,
          ...(newStatus === EmployeeStatus.TERMINATED ? { terminationDate: new Date() } : {})
        },
      });

      await tx.employmentHistory.create({
        data: {
          employeeId: id,
          eventType,
          previousValue: emp.status,
          newValue: newStatus,
          actor: actorId,
        }
      });

      await tx.companyEvent.create({
        data: {
          companyId: emp.companyId,
          type: eventType,
          payload: { employeeId: id, status: newStatus }
        }
      });

      return updated;
    });
    return res;
  }

  async holdEmployee(actorId: string, id: string) {
    return this._updateStatus(actorId, id, EmployeeStatus.ON_HOLD, 'EMPLOYEE_ON_HOLD');
  }

  async reactivateEmployee(actorId: string, id: string) {
    return this._updateStatus(actorId, id, EmployeeStatus.ACTIVE, 'EMPLOYEE_REACTIVATED');
  }

  async suspendEmployee(actorId: string, id: string) {
    return this._updateStatus(actorId, id, EmployeeStatus.SUSPENDED, 'EMPLOYEE_SUSPENDED');
  }

  async terminateEmployee(actorId: string, id: string) {
    const emp = await this.getEmployee(id);
    await this.auth.checkPermission(actorId, 'TERMINATE_EMPLOYEE', emp.companyId);
    return this._updateStatus(actorId, id, EmployeeStatus.TERMINATED, 'EMPLOYEE_TERMINATED');
  }

  async rehireEmployee(actorId: string, id: string) {
    const emp = await this.getEmployee(id);
    await this.auth.checkPermission(actorId, 'HIRE_EMPLOYEE', emp.companyId);
    if (emp.status !== EmployeeStatus.TERMINATED) throw new BadRequestException('Only terminated employees can be rehired');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { status: EmployeeStatus.ACTIVE, terminationDate: null },
      });
      await tx.employmentHistory.create({
        data: { employeeId: id, eventType: 'REHIRED', previousValue: 'TERMINATED', newValue: 'ACTIVE', actor: actorId }
      });
      await tx.companyEvent.create({
        data: { companyId: emp.companyId, type: 'EMPLOYEE_REHIRED', payload: { employeeId: id } }
      });
      return updated;
    });
    return res;
  }

  async transferEmployee(actorId: string, id: string, newDepartmentId: string) {
    const emp = await this.getEmployee(id);
    await this.auth.checkPermission(actorId, 'MANAGE_EMPLOYEES', emp.companyId);

    const dept = await this.prisma.department.findUnique({ where: { id: newDepartmentId }});
    if (!dept || dept.companyId !== emp.companyId) throw new BadRequestException('Cannot transfer across companies or to invalid department');

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { departmentId: newDepartmentId },
      });
      await tx.employmentHistory.create({
        data: { employeeId: id, eventType: 'DEPARTMENT_CHANGED', previousValue: emp.departmentId, newValue: newDepartmentId, actor: actorId }
      });
      await tx.companyEvent.create({
        data: { companyId: emp.companyId, type: 'EMPLOYEE_TRANSFERRED', payload: { employeeId: id, departmentId: newDepartmentId } }
      });
      return updated;
    });
    return res;
  }

  async promoteEmployee(actorId: string, id: string, newRoleId: string) {
    const emp = await this.getEmployee(id);
    await this.auth.checkPermission(actorId, 'CHANGE_ROLE', emp.companyId);

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { roleId: newRoleId },
      });
      await tx.employmentHistory.create({
        data: { employeeId: id, eventType: 'ROLE_CHANGED', previousValue: emp.roleId, newValue: newRoleId, actor: actorId }
      });
      await tx.companyEvent.create({
        data: { companyId: emp.companyId, type: 'EMPLOYEE_PROMOTED', payload: { employeeId: id, roleId: newRoleId } }
      });
      return updated;
    });
    return res;
  }

  async getHistory(id: string) {
    return this.prisma.employmentHistory.findMany({ where: { employeeId: id }, orderBy: { createdAt: 'desc' }});
  }

  async getSkills(id: string) {
    return this.prisma.employeeSkill.findMany({ where: { employeeId: id }});
  }
}

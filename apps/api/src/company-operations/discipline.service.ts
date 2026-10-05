import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DisciplinarySeverity } from '@prisma/client';

@Injectable()
export class DisciplineService {
  private readonly logger = new Logger(DisciplineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issueDisciplinaryAction(
    companyId: string,
    issuerId: string,
    employeeId: string,
    severity: DisciplinarySeverity,
    reason: string,
  ) {
    // Validate target employee belongs to the company
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee || employee.companyId !== companyId) {
      throw new NotFoundException('Employee not found or does not belong to the company');
    }

    const action = await this.prisma.employeeDisciplinaryAction.create({
      data: {
        employeeId,
        issuerId,
        severity,
        reason,
        status: 'ACTIVE',
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'DISCIPLINARY_ACTION_CREATED',
        payload: { actionId: action.id, employeeId, issuerId, severity },
      },
    });

    return action;
  }

  async resolveDisciplinaryAction(actionId: string, resolverId: string) {
    const action = await this.prisma.employeeDisciplinaryAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new NotFoundException('Disciplinary action not found');
    }

    const updated = await this.prisma.employeeDisciplinaryAction.update({
      where: { id: actionId },
      data: { status: 'RESOLVED' },
    });

    const employee = await this.prisma.employee.findUnique({ where: { id: action.employeeId }});

    if (employee) {
      await this.prisma.companyEvent.create({
        data: {
          companyId: employee.companyId,
          type: 'DISCIPLINARY_ACTION_RESOLVED',
          payload: { actionId, resolverId },
        },
      });
    }

    return updated;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalAlertSeverity } from '@prisma/client';

@Injectable()
export class OperationalAlertService {
  private readonly logger = new Logger(OperationalAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluateAlerts(companyId: string) {
    this.logger.debug(`Evaluating operational alerts for company ${companyId}`);

    // Find overdue tasks
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        companyId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        dueAt: { lt: new Date() },
      },
    });

    for (const task of overdueTasks) {
      await this.createAlertIfNotExists(
        companyId,
        OperationalAlertSeverity.WARNING,
        'TASK_OVERDUE',
        `Task Overdue: ${task.title}`,
        `Task ${task.id} is overdue.`,
        task.id,
      );
    }

    // Find blocked tasks
    const blockedTasks = await this.prisma.task.findMany({
      where: { companyId, status: 'BLOCKED' },
    });

    for (const task of blockedTasks) {
      await this.createAlertIfNotExists(
        companyId,
        OperationalAlertSeverity.WARNING,
        'TASK_BLOCKED',
        `Task Blocked: ${task.title}`,
        `Task ${task.id} is blocked.`,
        task.id,
      );
    }

    // High risk projects
    const highRisks = await this.prisma.projectRisk.findMany({
      where: { project: { companyId }, status: 'OPEN', severity: { gte: 80 } },
    });

    for (const risk of highRisks) {
      await this.createAlertIfNotExists(
        companyId,
        OperationalAlertSeverity.CRITICAL,
        'HIGH_PROJECT_RISK',
        `High Risk: ${risk.title}`,
        `Project risk ${risk.id} has severity ${risk.severity}.`,
        risk.id,
      );
    }
  }

  private async createAlertIfNotExists(
    companyId: string,
    severity: OperationalAlertSeverity,
    category: string,
    title: string,
    description: string,
    relatedEntityId: string,
  ) {
    const existing = await this.prisma.operationalAlert.findFirst({
      where: { companyId, relatedEntityId, status: 'ACTIVE', category },
    });

    if (!existing) {
      const alert = await this.prisma.operationalAlert.create({
        data: {
          companyId,
          severity,
          category,
          title,
          description,
          relatedEntityId,
        },
      });

      await this.prisma.companyEvent.create({
        data: {
          companyId,
          type: 'OPERATIONAL_ALERT_CREATED',
          payload: { alertId: alert.id, category, severity, relatedEntityId },
        },
      });
    }
  }

  async acknowledgeAlert(alertId: string) {
    return this.prisma.operationalAlert.update({
      where: { id: alertId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
  }

  async resolveAlert(alertId: string) {
    return this.prisma.operationalAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }
}

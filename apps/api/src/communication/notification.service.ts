import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export enum NotificationPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(
    companyId: string,
    employeeId: string,
    type: string,
    title: string,
    body: string,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    entityType?: string,
    entityId?: string
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw new ForbiddenException('Employee not in company');
    }

    return this.prisma.notification.create({
      data: {
        companyId,
        employeeId,
        type,
        title,
        body,
        priority,
        entityType,
        entityId,
      }
    });
  }

  async getNotifications(companyId: string, employeeId: string, unreadOnly = false) {
    const where: any = { companyId, employeeId };
    if (unreadOnly) {
      where.readAt = null;
    }
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markAsRead(companyId: string, notificationId: string, employeeId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.companyId !== companyId || notif.employeeId !== employeeId) {
      throw new ForbiddenException('Notification not accessible');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() }
    });
  }
}

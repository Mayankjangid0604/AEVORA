import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';

export interface ProactiveAlert {
  type: string;
  title: string;
  body: string;
  severity: 'CRITICAL' | 'HIGH';
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class ProactiveAlertService {
  private readonly logger = new Logger(ProactiveAlertService.name);
  private readonly COOLDOWN_MS = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Check if this alert type is on cooldown for this company.
   * Returns true if the alert should be suppressed.
   */
  private async isOnCooldown(companyId: string, alertType: string): Promise<boolean> {
    const lastEvent = await this.prisma.companyEvent.findFirst({
      where: {
        companyId,
        type: `PROACTIVE_ALERT:${alertType}`
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!lastEvent) return false;
    return Date.now() - lastEvent.createdAt.getTime() < this.COOLDOWN_MS;
  }

  private async setCooldown(companyId: string, alertType: string, payload?: any) {
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: `PROACTIVE_ALERT:${alertType}`,
        payload: payload || {},
      }
    });
  }

  /**
   * Evaluate and send proactive alerts for a company.
   * Called periodically or after significant events.
   * Only surfaces genuinely important events — not every ordinary change.
   */
  async evaluate(companyId: string): Promise<ProactiveAlert[]> {
    const sent: ProactiveAlert[] = [];

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { chairmanId: true } });
    if (!company) return sent;

    const [criticalAlerts, pendingHighRisk, failedPayments] = await Promise.all([
      this.prisma.operationalAlert.findMany({
        where: { companyId, severity: 'CRITICAL', status: 'ACTIVE' },
        select: { id: true, title: true, description: true },
        take: 5,
      }).catch(() => []),
      this.prisma.chairmanCommand.findMany({
        where: { companyId, riskLevel: 'HIGH', status: 'AWAITING_APPROVAL' },
        select: { id: true, naturalLanguage: true },
        take: 5,
      }).catch(() => []),
      this.prisma.paymentEvent.count({
        where: { companyId, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      }).catch(() => 0),
    ]);

    for (const alert of criticalAlerts) {
      if (await this.isOnCooldown(companyId, `critical_alert:${alert.id}`)) continue;
      const a: ProactiveAlert = {
        type: 'CRITICAL_ALERT',
        title: `Critical: ${alert.title ?? 'System Alert'}`,
        body: alert.description ?? 'A critical operational alert requires immediate attention.',
        severity: 'CRITICAL',
        entityType: 'OperationalAlert',
        entityId: alert.id,
      };
      this.notify(company.chairmanId, a);
      await this.setCooldown(companyId, `critical_alert:${alert.id}`);
      sent.push(a);
    }

    for (const cmd of pendingHighRisk) {
      if (await this.isOnCooldown(companyId, `high_risk_approval:${cmd.id}`)) continue;
      const a: ProactiveAlert = {
        type: 'APPROVAL_REQUIRED',
        title: 'High-risk command awaiting approval',
        body: (cmd.naturalLanguage ?? '').slice(0, 200),
        severity: 'HIGH',
        entityType: 'ChairmanCommand',
        entityId: cmd.id,
      };
      this.notify(company.chairmanId, a);
      await this.setCooldown(companyId, `high_risk_approval:${cmd.id}`);
      sent.push(a);
    }

    // Payment events: we don't want to alert on the same failed payment multiple times
    const failedPaymentEvents = await this.prisma.paymentEvent.findMany({
      where: { companyId, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      select: { id: true, amount: true, invoiceId: true }
    }).catch(() => []);

    for (const payment of failedPaymentEvents) {
      if (await this.isOnCooldown(companyId, `failed_payment:${payment.id}`)) continue;
      const a: ProactiveAlert = {
        type: 'FAILED_PAYMENT',
        title: `Failed payment detected`,
        body: `A payment of ${Math.round(payment.amount / 100)} failed. Review the financial dashboard for details.`,
        severity: 'CRITICAL',
        entityType: 'PaymentEvent',
        entityId: payment.id,
      };
      this.notify(company.chairmanId, a);
      await this.setCooldown(companyId, `failed_payment:${payment.id}`);
      sent.push(a);
    }

    return sent;
  }

  private notify(chairmanId: string, alert: ProactiveAlert) {
    this.realtime.broadcastToUser(chairmanId, 'assistant.proactive', {
      type: alert.type,
      title: alert.title,
      body: alert.body,
      severity: alert.severity,
      entityType: alert.entityType,
      entityId: alert.entityId,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Proactive alert sent: [${alert.severity}] ${alert.title}`);
  }

  /** Exposed for testing: check cooldown state */
  async isCoolingDown(companyId: string, alertType: string): Promise<boolean> {
    return this.isOnCooldown(companyId, alertType);
  }

  /** Exposed for testing: clear all cooldowns */
  async clearCooldowns() {
    await this.prisma.companyEvent.deleteMany({
      where: { type: { startsWith: 'PROACTIVE_ALERT:' } }
    });
  }
}

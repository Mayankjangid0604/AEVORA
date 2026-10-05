import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SurvivalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../devices/realtime.gateway';
import { EconomyService } from '../economy/economy.service';

/** Every kill-switch feature the autonomous loop checks. Shutdown disables all of them. */
export const SURVIVAL_FEATURES = ['GLOBAL_PRODUCTION', 'LEAD_GEN', 'SALES_OUTREACH', 'OUTBOUND_EMAIL', 'DELIVERY', 'AGENT_WORK_CYCLES'];
const SHUTDOWN_REASON = 'SURVIVAL_SHUTDOWN';

/**
 * CRITICAL = lower half of the band between min and warning.
 * A company that was never funded stays at WARNING (not SHUTDOWN): shutdown only
 * happens once money existed and the balance dropped below the minimum.
 */
export function classifyBalance(balance: number, minPaise: number, warningPaise: number, funded = true): SurvivalStatus {
  if (!funded && balance < warningPaise) return 'WARNING';
  if (balance < minPaise) return 'SHUTDOWN';
  if (balance < Math.floor((minPaise + warningPaise) / 2)) return 'CRITICAL';
  if (balance < warningPaise) return 'WARNING';
  return 'HEALTHY';
}

@Injectable()
export class SurvivalService {
  private readonly logger = new Logger(SurvivalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly economy: EconomyService,
  ) {}

  private getConfig(companyId: string) {
    return this.prisma.survivalConfig.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        minBalancePaise: Number(process.env.MIN_BALANCE_PAISE ?? 50_000),
        warningBalancePaise: Number(process.env.WARNING_BALANCE_PAISE ?? 200_000),
      },
    });
  }

  async checkSurvival(companyId: string): Promise<{ alive: boolean; status: SurvivalStatus; balancePaise: number; reason?: string }> {
    const config = await this.getConfig(companyId);
    const account = await this.prisma.realMoneyAccount.findUnique({ where: { companyId } });
    const balance = account?.balance ?? 0;
    const funded = !!account && (await this.prisma.realMoneyTransaction.count({ where: { accountId: account.id, amount: { gt: 0 } } })) > 0;
    const status = classifyBalance(balance, config.minBalancePaise, config.warningBalancePaise, funded);
    const previous = config.currentStatus;

    // Status change is claimed atomically so concurrent checks fire side effects once.
    const changed =
      status !== previous &&
      (await this.prisma.survivalConfig.updateMany({
        where: { companyId, currentStatus: previous },
        data: {
          currentStatus: status,
          lastBalancePaise: balance,
          lastCheckedAt: new Date(),
          ...(status === 'SHUTDOWN' ? { shutdownAt: new Date() } : {}),
        },
      })).count > 0;

    if (!changed) {
      await this.prisma.survivalConfig.update({ where: { companyId }, data: { lastBalancePaise: balance, lastCheckedAt: new Date() } });
    } else {
      await this.onTransition(companyId, previous, status, balance);
    }

    return status === 'SHUTDOWN'
      ? { alive: false, status, balancePaise: balance, reason: 'insufficient_funds' }
      : { alive: true, status, balancePaise: balance, ...(funded ? {} : { reason: 'not_funded' }) };
  }

  private async onTransition(companyId: string, from: SurvivalStatus, to: SurvivalStatus, balance: number) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { chairmanId: true } });
    await this.prisma.survivalEvent.create({ data: { companyId, event: `${from}->${to}`, balancePaise: balance } });
    this.logger.warn(`Company ${companyId} survival ${from} -> ${to} (balance ${balance} paise)`);

    if (to === 'SHUTDOWN') {
      await this.prisma.$transaction(
        SURVIVAL_FEATURES.map((feature) =>
          this.prisma.killSwitchConfig.upsert({
            where: { companyId_feature: { companyId, feature } },
            update: { isDisabled: true, reason: SHUTDOWN_REASON, updatedBy: 'SURVIVAL' },
            create: { companyId, feature, isDisabled: true, reason: SHUTDOWN_REASON, updatedBy: 'SURVIVAL' },
          }),
        ),
      );
      this.realtime.broadcastToUser(company.chairmanId, 'company.shutdown', { companyId, balancePaise: balance, reason: 'insufficient_funds' });
      return;
    }

    if (from === 'SHUTDOWN') {
      // Only lift switches survival itself set; a Chairman's manual kill switch stays on.
      await this.prisma.killSwitchConfig.updateMany({
        where: { companyId, feature: { in: SURVIVAL_FEATURES }, reason: SHUTDOWN_REASON, isDisabled: true },
        data: { isDisabled: false, reason: 'SURVIVAL_RECOVERED', updatedBy: 'SURVIVAL' },
      });
      this.realtime.broadcastToUser(company.chairmanId, 'company.recovered', { companyId, balancePaise: balance, status: to });
    }
    if (to === 'WARNING' || to === 'CRITICAL') {
      this.realtime.broadcastToUser(company.chairmanId, 'survival.warning', { companyId, balancePaise: balance, status: to });
    }
  }

  /** Chairman logs a real deposit → credit via EconomyService (idempotent) → re-check (may recover from SHUTDOWN). */
  async deposit(companyId: string, amountPaise: number, idempotencyKey: string, description?: string) {
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new BadRequestException('amountPaise must be a positive integer');
    if (!idempotencyKey) throw new BadRequestException('idempotencyKey is required');
    const transaction = await this.economy.injectChairmanCapital(companyId, amountPaise, description ?? 'Chairman deposit', `deposit:${companyId}:${idempotencyKey}`);
    await this.prisma.survivalEvent.create({ data: { companyId, event: 'DEPOSIT', balancePaise: amountPaise, detail: { transactionId: transaction.id } } });
    return { transaction, survival: await this.checkSurvival(companyId) };
  }

  async status(companyId: string) {
    const survival = await this.checkSurvival(companyId);
    const [config, events, deposits] = await Promise.all([
      this.getConfig(companyId),
      this.prisma.survivalEvent.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.realMoneyTransaction.findMany({
        where: { account: { companyId }, referenceType: 'CHAIRMAN_FUNDING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...survival, config, events, deposits };
  }
}

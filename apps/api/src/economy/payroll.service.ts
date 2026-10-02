import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EconomyService } from './economy.service';
import { PayrollStatus } from '@prisma/client';

const IST_MS = 330 * 60_000;
/** "2026-09" → [start, end) of that IST month as UTC instants. */
export function istMonthRange(month: string): [Date, Date] {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  return [new Date(Date.UTC(y, m - 1, 1) - IST_MS), new Date(Date.UTC(y, m, 1) - IST_MS)];
}
/** The IST month before the one containing `now`. */
export function previousIstMonth(now: Date): string {
  const d = new Date(now.getTime() + IST_MS), t = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

@Injectable()
export class PayrollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayrollService.name);
  private timer?: NodeJS.Timeout;
  constructor(
    private prisma: PrismaService,
    private economyService: EconomyService
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => this.payLastMonthForAll().catch((e) => this.logger.warn(`Monthly payroll: ${e.message}`));
    setTimeout(tick, 60_000).unref?.();
    this.timer = setInterval(tick, 3_600_000); this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Pays last month's salaries (internal AC) for every company, once: idempotent per company + month. */
  async payLastMonthForAll(now = new Date()) {
    const month = previousIstMonth(now);
    for (const c of await this.prisma.company.findMany({ select: { id: true } })) {
      try { await this.runMonthly(c.id, month); } catch (e: any) { this.logger.warn(`Payroll ${month} for ${c.id}: ${e.message}`); }
    }
  }

  async runMonthly(companyId: string, month: string) {
    const [start, end] = istMonthRange(month);
    let run = await this.prisma.payrollRun.findFirst({ where: { companyId, periodStart: start } });
    if (run?.status === PayrollStatus.PAID) return run;
    // An empty run (made before anyone had a salary) is recalculated instead of blocking the month forever.
    if (run?.status === PayrollStatus.CALCULATED && !run.totalAmount) { await this.prisma.payrollRun.delete({ where: { id: run.id } }); run = null; }
    if (!run) run = await this.createPayrollRun(companyId, start, end);
    if (!run.totalAmount) return run; // nobody on salary
    if (run.status === PayrollStatus.CALCULATED) run = await this.approvePayroll(run.id);
    return this.executePayrollPayment(run.id, `payroll:${companyId}:${month}`);
  }

  async createPayrollRun(companyId: string, periodStart: Date, periodEnd: Date) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: { acWallet: true }
    });

    let totalAmount = 0;
    const entries = [];

    for (const emp of employees) {
      if (emp.salary > 0) {
        totalAmount += emp.salary;
        entries.push({
          employeeId: emp.id,
          salary: emp.salary,
          currency: 'AC',
          status: 'CALCULATED'
        });
      }
    }

    return this.prisma.payrollRun.create({
      data: {
        companyId,
        periodStart,
        periodEnd,
        status: PayrollStatus.CALCULATED,
        totalAmount,
        entries: {
          create: entries
        }
      },
      include: { entries: true }
    });
  }

  async approvePayroll(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== PayrollStatus.CALCULATED) throw new BadRequestException('Payroll must be CALCULATED to approve');

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollStatus.APPROVED }
    });
  }

  async executePayrollPayment(runId: string, idempotencyKeyBase?: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { entries: { include: { employee: { include: { acWallet: true } } } } }
    });

    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === PayrollStatus.PAID) return run;
    if (run.status !== PayrollStatus.APPROVED) throw new BadRequestException('Payroll must be APPROVED to pay');

    const companyAcWallet = await this.prisma.aCWallet.findUnique({ where: { companyId: run.companyId } });
    if (!companyAcWallet) throw new BadRequestException('Company AC wallet not found');

    if (companyAcWallet.balance < run.totalAmount) {
      throw new BadRequestException('Insufficient company AC funds for payroll');
    }

    let successCount = 0;
    let failureCount = 0;

    for (const entry of run.entries) {
      // Older hires (and CEO hires before this fix) had no wallet, so they were silently never paid.
      if (entry.status !== 'PAID' && !entry.employee.acWallet) {
        entry.employee.acWallet = await this.prisma.aCWallet.upsert({ where: { employeeId: entry.employeeId }, update: {}, create: { employeeId: entry.employeeId, balance: 0 } })
          .catch(() => this.prisma.aCWallet.findUnique({ where: { employeeId: entry.employeeId } })); // lost a create race: use the winner's wallet
      }
      if (entry.status !== 'PAID' && entry.employee.acWallet) {
        const idempKey = idempotencyKeyBase ? `${idempotencyKeyBase}-${entry.id}` : undefined;
        try {
          await this.economyService.transferAC(
            companyAcWallet.id,
            entry.employee.acWallet.id,
            entry.salary,
            `Payroll for period ${run.periodStart.toISOString()}`,
            idempKey
          );

          await this.prisma.payrollEntry.update({
            where: { id: entry.id },
            data: { status: 'PAID', paidAt: new Date() }
          });
          successCount++;
        } catch (e) {
          this.logger.error(`Failed to pay employee ${entry.employeeId}: ${e?.message ?? e}`);
          
          await this.prisma.payrollEntry.update({
            where: { id: entry.id },
            data: { status: 'FAILED' }
          });
          failureCount++;
        }
      } else if (entry.status === 'PAID') {
        successCount++;
      }
    }

    let finalStatus: PayrollStatus = PayrollStatus.PAID;
    if (failureCount > 0) {
      finalStatus = successCount > 0 ? PayrollStatus.PARTIALLY_PAID : PayrollStatus.FAILED;
    }

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: finalStatus }
    });
  }
}

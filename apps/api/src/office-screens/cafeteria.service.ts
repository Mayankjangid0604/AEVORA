import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EconomyService } from '../economy/economy.service';
import { dayKey } from './screens.logic';

/** Cafeteria menu (prices in AC, integers). ponytail: fixed menu in code; a Chairman-editable menu can come later. */
export const CAFE_MENU = [
  { id: 'chai', name: 'Masala chai', priceAC: 20 },
  { id: 'coffee', name: 'Filter coffee', priceAC: 30 },
  { id: 'samosa', name: 'Samosa (2 pcs)', priceAC: 25 },
  { id: 'soda', name: 'Fresh lime soda', priceAC: 40 },
  { id: 'wrap', name: 'Paneer wrap', priceAC: 90 },
  { id: 'thali', name: 'Veg thali', priceAC: 120 },
] as const;
export const CAFE_PREFIX = 'Cafeteria: ';
const LUNCH = [13, 14]; // IST hours when people buy lunch

const istHour = (d: Date) => new Date(d.getTime() + 330 * 60_000).getUTCHours();
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** Each employee's lunch pick for the day: stable per person + day, and only something they can afford. */
export function pickItem(employeeId: string, day: string, balanceAC: number) {
  const affordable = CAFE_MENU.filter((i) => i.priceAC <= balanceAC);
  return affordable.length ? affordable[hash(employeeId + day) % affordable.length] : null;
}

/** Employees buy lunch at the counter with their AC wallet (employee → company wallet, via the AC ledger). */
@Injectable()
export class CafeteriaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CafeteriaService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly economy: EconomyService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { this.lunchRound().catch((e) => this.logger.warn(`Cafeteria: ${e.message}`)); }, 10 * 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** During lunch hours: every present employee buys one item per day (idempotent), never going below zero. */
  async lunchRound(now = new Date()) {
    if (istHour(now) < LUNCH[0] || istHour(now) >= LUNCH[1]) return { bought: 0 };
    const day = dayKey(now);
    const people = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE', acWallet: { isNot: null } },
      select: { id: true, name: true, companyId: true, acWallet: { select: { id: true, balance: true } } },
    });
    const companyWallets = new Map((await this.prisma.aCWallet.findMany({ where: { companyId: { in: [...new Set(people.map((p) => p.companyId))] } }, select: { id: true, companyId: true } })).map((w) => [w.companyId!, w.id]));
    let bought = 0;
    for (const p of people) {
      const to = companyWallets.get(p.companyId), item = pickItem(p.id, day, p.acWallet!.balance);
      if (!to || !item) continue;
      try {
        await this.economy.transferAC(p.acWallet!.id, to, item.priceAC, `${CAFE_PREFIX}${item.name}`, `cafe:${p.id}:${day}`);
        bought++;
      } catch (e: any) {
        this.logger.debug(`${p.name} skipped lunch: ${e.message}`); // insufficient funds → no purchase, never negative
      }
    }
    return { bought };
  }

  /** Menu + today's sales for the Chairman (and the menu board in the office). */
  async today(companyId: string, now = new Date()) {
    const wallet = await this.prisma.aCWallet.findUnique({ where: { companyId }, select: { id: true } });
    const start = new Date(Date.parse(dayKey(now)) - 330 * 60_000);
    const sales = wallet ? await this.prisma.aCTransaction.findMany({
      where: { toWalletId: wallet.id, reason: { startsWith: CAFE_PREFIX }, createdAt: { gte: start } },
      select: { amount: true, reason: true },
    }) : [];
    const byItem = CAFE_MENU.map((i) => {
      const rows = sales.filter((s) => s.reason === `${CAFE_PREFIX}${i.name}`);
      return { ...i, sold: rows.length, totalAC: rows.reduce((a, r) => a + r.amount, 0) };
    });
    return { day: dayKey(now), menu: CAFE_MENU, sales: { count: sales.length, totalAC: sales.reduce((a, s) => a + s.amount, 0), byItem } };
  }
}

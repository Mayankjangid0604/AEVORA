/** Pure helpers for the office wall screens: IST months, cumulative counts, monthly sums. No invented values. */

const IST_MS = 330 * 60_000;
/** "2026-09" for a date, in India time. */
export const monthKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 7);
export const dayKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

/** Last `n` month keys ending with the month of `now`, oldest first. */
export function lastMonths(now: Date, n = 12): string[] {
  const [y, m] = monthKey(now).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = (y * 12 + (m - 1)) - (n - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  });
}

/** How many items existed at the end of each month: from ≤ month, and (optionally) not ended before it. */
export function cumulativeByMonth(items: { from: Date; to?: Date | null }[], months: string[]): number[] {
  return months.map((mk) => items.filter((it) => monthKey(it.from) <= mk && (!it.to || monthKey(it.to) > mk)).length);
}

export function sumByKey<T>(rows: T[], key: (r: T) => string | null, amount: (r: T) => number, keys: string[]): number[] {
  const acc = new Map(keys.map((k) => [k, 0]));
  for (const r of rows) { const k = key(r); if (k && acc.has(k)) acc.set(k, acc.get(k)! + amount(r)); }
  return keys.map((k) => acc.get(k)!);
}

/** Whole days from `now` to `deadline` in India time (negative = overdue). */
export function daysLeft(deadline: Date | null | undefined, now: Date): number | null {
  if (!deadline) return null;
  return Math.round((Date.parse(dayKey(deadline)) - Date.parse(dayKey(now))) / 86_400_000);
}

/** Days left in the month of `now` including today. */
export function daysLeftInMonth(now: Date): number {
  const [y, m, d] = dayKey(now).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
}

/**
 * Paying clients, each counted once, with the date they first paid: paid client projects + CRM clients with a paid
 * invoice. A project's payment also creates an invoice on the CRM client, so a project counts under that client
 * (via its invoice) and only falls back to its lead when it has no invoice.
 */
export function payingClientFirstDates(
  paidProjects: { leadId: string; invoiceId: string | null; paidAt: Date | null }[],
  paidInvoices: { id: string; clientId: string; paidDate: Date | null }[],
): Map<string, Date> {
  const clientOfInvoice = new Map(paidInvoices.map((i) => [i.id, i.clientId]));
  const first = new Map<string, Date>();
  const add = (key: string, d: Date | null) => { if (d && (!first.has(key) || d < first.get(key)!)) first.set(key, d); };
  for (const i of paidInvoices) add(`client:${i.clientId}`, i.paidDate);
  for (const p of paidProjects) {
    const client = p.invoiceId ? clientOfInvoice.get(p.invoiceId) : undefined;
    add(client ? `client:${client}` : `lead:${p.leadId}`, p.paidAt);
  }
  return first;
}

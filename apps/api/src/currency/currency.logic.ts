/** Client-currency quoting: country → currency, integer conversion (no floats in money math), display. */
export const QUOTE_CURRENCIES = ['USD', 'GBP', 'AED', 'EUR'] as const;
export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number] | 'INR';

const EU = ['germany', 'france', 'netherlands', 'spain', 'italy', 'ireland', 'belgium', 'austria', 'portugal', 'finland', 'greece',
  'luxembourg', 'slovakia', 'slovenia', 'estonia', 'latvia', 'lithuania', 'malta', 'cyprus', 'croatia', 'berlin', 'paris', 'amsterdam',
  'madrid', 'rome', 'dublin', 'munich', 'milan', 'barcelona', 'vienna', 'lisbon', 'brussels'];
const RULES: [QuoteCurrency, RegExp][] = [
  ['USD', /\b(usa|u\.s\.a?|united states|america|new york|san francisco|los angeles|chicago|seattle|boston|texas|california)\b/],
  ['GBP', /\b(uk|u\.k|united kingdom|england|scotland|wales|britain|london|manchester|birmingham|edinburgh)\b/],
  ['AED', /\b(uae|u\.a\.e|united arab emirates|dubai|abu dhabi|sharjah|ajman)\b/],
  ['EUR', new RegExp(`\\b(eu|europe|${EU.join('|')})\\b`)],
  ['INR', /\b(india|bharat)\b/],
];

/** The lead/client's currency from their stored place ("Dubai, United Arab Emirates" → AED). Unknown → INR. */
export function currencyForPlace(place: string | null | undefined): QuoteCurrency {
  const t = ` ${String(place ?? '').toLowerCase()} `;
  for (const [code, re] of RULES) if (re.test(t)) return code;
  return 'INR';
}

/** paise × (units per ₹1 × 10⁶) → foreign minor units (cents/fils), rounded half up, exact integer math. */
export function convertPaise(amountPaise: number, unitsPerInrMicro: number): number {
  if (!Number.isSafeInteger(amountPaise) || !Number.isSafeInteger(unitsPerInrMicro) || unitsPerInrMicro <= 0) throw new Error('integer amount and positive rate required');
  const n = BigInt(amountPaise) * BigInt(unitsPerInrMicro);
  return Number((n + 500_000n) / 1_000_000n);
}

/** "0.012" / 0.012 → 12000 micro-units; rejects zero/negative/absurd rates. */
export function rateToMicros(unitsPerInr: number | string): number {
  const v = Number(unitsPerInr);
  if (!Number.isFinite(v) || v <= 0 || v > 1000) throw new Error('unitsPerInr must be a positive number (e.g. 0.012 for USD)');
  return Math.round(v * 1_000_000);
}

export const formatMinor = (minor: number, code: string) =>
  new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: code, maximumFractionDigits: code === 'INR' ? 0 : 2 }).format(minor / 100);

/** What a client sees: their currency first, the rupee amount for reference. */
export function quoteLabel(p: { quotedAmount?: number | null; quoteCurrency?: string | null; quoteAmountMinor?: number | null }): string {
  const inr = formatMinor(p.quotedAmount ?? 0, 'INR');
  return p.quoteCurrency && p.quoteCurrency !== 'INR' && p.quoteAmountMinor != null ? `${formatMinor(p.quoteAmountMinor, p.quoteCurrency)} (≈ ${inr})` : inr;
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTE_CURRENCIES, convertPaise, currencyForPlace, rateToMicros } from './currency.logic';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.currencyRate.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
  }

  /** Chairman sets "1 INR = x units of CODE" (e.g. USD 0.012). Stored as integer micro-units. */
  async setRate(companyId: string, actorId: string, code: string, unitsPerInr: number | string) {
    const c = String(code ?? '').toUpperCase();
    if (!(QUOTE_CURRENCIES as readonly string[]).includes(c)) throw new BadRequestException(`code must be one of ${QUOTE_CURRENCIES.join(', ')}`);
    let micros: number;
    try { micros = rateToMicros(unitsPerInr); } catch (e: any) { throw new BadRequestException(e.message); }
    return this.prisma.currencyRate.upsert({
      where: { companyId_code: { companyId, code: c } },
      create: { companyId, code: c, unitsPerInrMicro: micros, updatedById: actorId },
      update: { unitsPerInrMicro: micros, updatedById: actorId },
    });
  }

  /** The quote fields to store with an INR price: client's currency, converted amount and the rate used (INR if no rate). */
  async quoteFields(companyId: string, place: string | null | undefined, amountPaise: number) {
    const code = currencyForPlace(place);
    if (code === 'INR') return { quoteCurrency: 'INR', quoteAmountMinor: null, quoteRateMicros: null };
    const rate = await this.prisma.currencyRate.findUnique({ where: { companyId_code: { companyId, code } } });
    if (!rate) {
      this.logger.warn(`[${companyId}] no ${code} rate set — quoting in INR (set it: PUT /currency-rates/${code})`);
      return { quoteCurrency: 'INR', quoteAmountMinor: null, quoteRateMicros: null };
    }
    return { quoteCurrency: code, quoteAmountMinor: convertPaise(amountPaise, rate.unitsPerInrMicro), quoteRateMicros: rate.unitsPerInrMicro };
  }
}

import { Body, Controller, Get, Module, Param, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { CurrencyService } from './currency.service';

/** Exchange rates for quoting clients abroad (Chairman-maintained). */
@Controller('currency-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  @Get()
  list(@Request() req) { return this.currency.list(req.user.companyId); }

  /** Body: { unitsPerInr: 0.012 } → 1 ₹ buys 0.012 USD. */
  @Put(':code')
  set(@Request() req, @Param('code') code: string, @Body() body: { unitsPerInr: number | string }) {
    return this.currency.setRate(req.user.companyId, req.user.actorId, code, body?.unitsPerInr);
  }
}

@Module({ providers: [CurrencyService], controllers: [CurrencyController], exports: [CurrencyService] })
export class CurrencyModule {}

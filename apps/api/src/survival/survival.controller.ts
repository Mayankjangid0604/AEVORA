import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { SurvivalService } from './survival.service';

@Controller('survival')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurvivalController {
  constructor(private readonly survival: SurvivalService) {}

  @Get('status')
  status(@Request() req) {
    return this.survival.status(req.user.companyId);
  }

  @Post('deposit')
  @Roles('CHAIRMAN')
  deposit(@Request() req, @Body() body: { amountPaise: number; idempotencyKey: string; description?: string }) {
    return this.survival.deposit(req.user.companyId, Number(body.amountPaise), body.idempotencyKey, body.description);
  }
}

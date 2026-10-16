import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { emailStatus, readLastEmailTest } from './email-status';

/** Read-only. Reports whether email is configured and what the last controlled test did. Sends nothing. */
@Controller('system/email-status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT')
export class EmailStatusController {
  @Get()
  status() { return emailStatus(process.env, readLastEmailTest()); }
}

@Module({ controllers: [EmailStatusController] })
export class EmailStatusModule {}

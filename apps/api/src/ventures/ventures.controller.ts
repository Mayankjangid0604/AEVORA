import { BadRequestException, Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { NewVentureService } from './new-venture.service';

@Controller('ventures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenturesController {
  constructor(private readonly ventures: NewVentureService) {}

  @Get()
  list(@Request() req) {
    return this.ventures.list(req.user.companyId);
  }

  @Post()
  @Roles('CHAIRMAN')
  create(@Request() req, @Body() body: { idea: string; idempotencyKey: string }) {
    if (!body.idempotencyKey) throw new BadRequestException('idempotencyKey is required');
    return this.ventures.spawnTeam(body.idea, req.user.companyId, { idempotencyKey: body.idempotencyKey });
  }

  @Post(':id/status')
  @Roles('CHAIRMAN')
  status(@Request() req, @Param('id') id: string, @Body() body: { status: 'PAUSED' | 'ACTIVE' | 'CLOSED' }) {
    if (!['PAUSED', 'ACTIVE', 'CLOSED'].includes(body.status)) throw new BadRequestException('Invalid status');
    return this.ventures.setStatus(req.user.companyId, id, body.status);
  }
}

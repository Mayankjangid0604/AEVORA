import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { WorldStateGatewayService } from './world-state-gateway.service';

@Controller('v12/world')
@UseGuards(JwtAuthGuard)
export class WorldStateGatewayController {
  constructor(private readonly gateway: WorldStateGatewayService) {}

  @Get('state')
  getState(@Request() req: any) { return this.gateway.getState(req.user.companyId); }

  @Get('checkpoint')
  getCheckpoint(@Request() req: any) { return this.gateway.getCheckpoint(req.user.companyId); }

  @Get('reconciliation')
  getReconciliation(@Request() req: any) { return this.gateway.getReconciliation(req.user.companyId); }

  @Get('replay')
  replay(@Request() req: any, @Query('fromCheckpoint') fromCheckpoint?: string) {
    return this.gateway.replay(req.user.companyId, Number(fromCheckpoint ?? 0));
  }

  @Post('snapshot')
  snapshot(@Request() req: any, @Body() body: { scope?: 'GLOBAL'|'COMPANY'|'STREAM'; scopeKey?: string }) {
    return this.gateway.createSnapshot(req.user.companyId, body.scope ?? 'COMPANY', body.scopeKey ?? req.user.companyId);
  }

  @Post('snapshot/:snapshotId/restore')
  restore(@Request() req: any, @Param('snapshotId') snapshotId: string) {
    return this.gateway.restoreSnapshot(req.user.companyId, snapshotId);
  }

  @Post('commands')
  requestCommand(@Request() req: any, @Body() body: any) {
    return this.gateway.requestEnterpriseChange({
      companyId: req.user.companyId,
      actorId: req.user.actorId,
      action: body.action,
      target: body.target,
      parameters: body.parameters ?? {},
      correlationId: body.correlationId ?? '',
    });
  }
}

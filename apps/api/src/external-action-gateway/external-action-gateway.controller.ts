import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ExternalActionGatewayService } from './external-action-gateway.service';
import {
  ExternalActionRequest,
  ExternalActionResult,
  GatewayApprovalPreparation,
  ExternalActionAuditRecord,
  ExternalActionStatusCheck,
} from './external-action-gateway.types';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

@Controller('api/external-actions')
@UseGuards(JwtAuthGuard)
export class ExternalActionGatewayController {
  constructor(private readonly gatewayService: ExternalActionGatewayService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(
    @Req() req: any,
    @Body() body: ExternalActionRequest,
  ): Promise<ExternalActionResult> {
    const companyId = req.user?.companyId;
    if (body.companyId && body.companyId !== companyId) {
      throw new ForbiddenException('Cross-company action execution is prohibited.');
    }

    const actorId = req.user?.id || req.user?.sub;
    const actorRole = req.user?.role || 'EMPLOYEE';

    return this.gatewayService.executeAction({
      ...body,
      companyId: companyId || body.companyId,
      requestingActorId: body.requestingActorId || actorId,
      requestingActorRole: (body.requestingActorRole as any) || actorRole,
    });
  }

  @Post('prepare-approval')
  @HttpCode(HttpStatus.OK)
  async prepareApproval(
    @Req() req: any,
    @Body() body: ExternalActionRequest,
  ): Promise<GatewayApprovalPreparation> {
    const companyId = req.user?.companyId;
    if (body.companyId && body.companyId !== companyId) {
      throw new ForbiddenException('Cross-company approval preparation is prohibited.');
    }

    const actorId = req.user?.id || req.user?.sub;
    return this.gatewayService.prepareApprovalRequest({
      ...body,
      companyId: companyId || body.companyId,
      requestingActorId: body.requestingActorId || actorId,
    });
  }

  @Get('audit')
  async getAuditTrail(@Req() req: any): Promise<ExternalActionAuditRecord[]> {
    const companyId = req.user?.companyId;
    return this.gatewayService.getAuditTrail(companyId);
  }

  @Get('status-check')
  async statusCheck(
    @Query('provider') provider: string,
    @Query('referenceId') referenceId: string,
  ): Promise<ExternalActionStatusCheck> {
    return this.gatewayService.checkActionStatus(provider, referenceId);
  }
}

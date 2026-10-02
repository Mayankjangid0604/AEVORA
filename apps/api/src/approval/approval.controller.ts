import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ExecutionEnvironment, ApprovalRiskLevel } from '@prisma/client';

@Controller('approval')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post('request')
  async requestApproval(@Body() body: any, @Request() req) {
    return this.approvalService.requestApproval({
      companyId: req.user.companyId,
      requesterId: req.user.actorId,
      action: body.action,
      targetType: body.targetType,
      targetId: body.targetId,
      proposedParams: body.proposedParams,
      riskLevel: body.riskLevel || ApprovalRiskLevel.MEDIUM,
      financialImpact: body.financialImpact,
      reasoning: body.reasoning,
      environment: body.environment || ExecutionEnvironment.SIMULATION,
    });
  }

  @Post(':id/resolve')
  async resolveApproval(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; reason?: string },
    @Request() req
  ) {
    return this.approvalService.resolveApproval(
      id,
      req.user.actorId, // Authenticated identity
      body.decision,
      body.reason
    );
  }
}

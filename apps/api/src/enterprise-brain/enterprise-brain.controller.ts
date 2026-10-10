import { Controller, Get, Post, Body, Param, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { EnterpriseBrainService } from './enterprise-brain.service';
import { SignificanceEvaluationInput } from './enterprise-brain.types';

@Controller('enterprise-brain')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnterpriseBrainController {
  constructor(private readonly brainService: EnterpriseBrainService) {}

  @Get('state')
  async getDerivedState(@Request() req) {
    const companyId = req.user.companyId;
    if (!companyId) throw new BadRequestException('Company context required');
    return this.brainService.getDerivedEnterpriseState(companyId);
  }

  @Get('graph')
  async getRelationshipGraph(@Request() req) {
    const companyId = req.user.companyId;
    if (!companyId) throw new BadRequestException('Company context required');
    return this.brainService.getRelationshipGraph(companyId);
  }

  @Get('lineage/task/:taskId')
  async getTaskLineage(@Request() req, @Param('taskId') taskId: string) {
    const companyId = req.user.companyId;
    if (!companyId) throw new BadRequestException('Company context required');
    return this.brainService.getTaskLineage(companyId, taskId);
  }

  @Get('conflicts')
  async getConflicts(@Request() req) {
    const companyId = req.user.companyId;
    if (!companyId) throw new BadRequestException('Company context required');
    return this.brainService.getDetectedConflicts(companyId);
  }

  @Post('evaluate-significance')
  @Roles('CHAIRMAN', 'MANAGEMENT')
  async evaluateSignificance(@Request() req, @Body() body: SignificanceEvaluationInput) {
    const companyId = req.user.companyId;
    if (!companyId) throw new BadRequestException('Company context required');
    return this.brainService.evaluateSignificance(companyId, body);
  }
}

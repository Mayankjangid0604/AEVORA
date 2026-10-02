import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ResearchExecutionService } from '../services/research-execution.service';
import { JwtAuthGuard } from '../../authorization/jwt-auth.guard';
import { RolesGuard } from '../../authorization/roles.guard';
import { Roles } from '../../authorization/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT', 'SYSTEM', 'EMPLOYEE')
@Controller('research')
export class ResearchExecutionController {
  constructor(private readonly executionService: ResearchExecutionService) {}

  @Post()
  async createResearch(@Request() req: any, @Body() data: any) {
    return this.executionService.createResearch(req.user.companyId, req.user.actorId, data);
  }

  @Get(':id')
  async getResearch(@Param('id') id: string, @Request() req: any) {
    return this.executionService.getResearch(id, req.user.companyId);
  }

  @Post(':id/start')
  async startExecution(@Param('id') id: string, @Request() req: any) {
    return this.executionService.startExecution(id, req.user.companyId, req.user.actorId);
  }

  @Get(':id/executions')
  async getExecutions(@Param('id') id: string, @Request() req: any) {
    return this.executionService.getExecutions(id, req.user.companyId);
  }

  @Get(':id/sources')
  async getSources(@Param('id') id: string, @Request() req: any) {
    return this.executionService.getSources(id, req.user.companyId);
  }

  @Get(':id/findings')
  async getFindings(@Param('id') id: string, @Request() req: any) {
    return this.executionService.getFindings(id, req.user.companyId);
  }
}

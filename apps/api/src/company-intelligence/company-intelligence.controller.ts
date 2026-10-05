import { Controller, Get, Param, Query, UseGuards, Request, ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { CompanyIntelligenceService, V9IntelligenceQuery } from './company-intelligence.service';
import { GroupIntelligenceService } from './group-intelligence.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@Controller('company-intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyIntelligenceController {
  constructor(
    private readonly companyIntelligenceService: CompanyIntelligenceService,
    private readonly groupIntelligenceService: GroupIntelligenceService,
  ) {}

  @Get('company/:companyId')
  async getCompanyIntelligence(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: V9IntelligenceQuery,
    @Request() req
  ) {
    if (req.user.companyId && req.user.companyId !== companyId) {
      throw new ForbiddenException('Unauthorized cross-company data access attempt');
    }
    return this.companyIntelligenceService.generateCompanyIntelligence(companyId, query);
  }

  @Get('group/:groupId')
  @Roles('CHAIRMAN')
  async getGroupIntelligence(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: V9IntelligenceQuery,
    @Request() req
  ) {
    return this.groupIntelligenceService.generateGroupIntelligence(groupId, req.user.actorId, query);
  }
}

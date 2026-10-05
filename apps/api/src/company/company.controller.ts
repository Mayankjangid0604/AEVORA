import { Controller, Get, Post, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { CompanyService } from './company.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@UseGuards(RolesGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService, private readonly authz: AuthorizationService) {}

  /** Only the companies the authenticated actor can access. */
  @Get()
  async list(@Request() req) {
    return this.authz.accessibleCompanies(req.user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.getCompany(id);
  }

  /** The owner is always the authenticated Chairman; a body chairmanId is ignored. */
  @Roles('CHAIRMAN')
  @Post()
  async create(@Body() body: { name: string; legalName: string; description: string; groupId?: string }, @Request() req) {
    if (body.groupId) await this.authz.assertGroupOwnership(req.user, body.groupId);
    return this.companyService.createCompany(body.name, body.legalName, body.description, req.user.actorId, body.groupId);
  }

  @Roles('CHAIRMAN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; legalName?: string; description?: string }, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.updateCompany(id, { name: body.name, legalName: body.legalName, description: body.description });
  }

  @Roles('CHAIRMAN')
  @Post(':id/pause')
  async pause(@Param('id') id: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.pauseCompany(id);
  }

  @Roles('CHAIRMAN')
  @Post(':id/resume')
  async resume(@Param('id') id: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.resumeCompany(id);
  }

  @Roles('CHAIRMAN')
  @Post(':id/close')
  async close(@Param('id') id: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.closeCompany(id);
  }
}

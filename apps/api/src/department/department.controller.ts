import { Controller, Get, Post, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@UseGuards(RolesGuard)
@Controller()
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService, private readonly authz: AuthorizationService) {}

  @Get('companies/:companyId/departments')
  async list(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.departmentService.listDepartments(companyId);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Post('companies/:companyId/departments')
  async create(@Param('companyId') companyId: string, @Body() body: { name: string }, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.departmentService.createDepartment(companyId, body.name);
  }

  @Roles('CHAIRMAN', 'MANAGEMENT')
  @Patch('departments/:id')
  async update(@Param('id') id: string, @Body() body: { name: string }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'department', id);
    return this.departmentService.updateDepartment(id, body.name);
  }
}

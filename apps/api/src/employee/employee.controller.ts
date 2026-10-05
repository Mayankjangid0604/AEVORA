import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { AuthorizationService } from '../authorization/authorization.service';

/**
 * The acting principal is always the verified token's actorId (the old spoofable x-actor-id header is ignored).
 * Mutations are additionally permission-checked inside EmployeeService via AuthorizationService.checkPermission.
 */
@Controller()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService, private readonly authz: AuthorizationService) {}

  @Get('companies/:companyId/employees')
  async list(@Param('companyId') companyId: string, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.employeeService.listEmployees(companyId);
  }

  @Get('employees/:id')
  async get(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.getEmployee(id);
  }

  @Get('employees/:id/history')
  async history(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.getHistory(id);
  }

  @Get('employees/:id/skills')
  async skills(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.getSkills(id);
  }

  @Post('companies/:companyId/employees')
  async create(@Param('companyId') companyId: string, @Body() body: any, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.employeeService.hireEmployee(req.user.actorId, companyId, body);
  }

  @Post('employees/:id/hold')
  async hold(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.holdEmployee(req.user.actorId, id);
  }

  @Post('employees/:id/reactivate')
  async reactivate(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.reactivateEmployee(req.user.actorId, id);
  }

  @Post('employees/:id/suspend')
  async suspend(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.suspendEmployee(req.user.actorId, id);
  }

  @Post('employees/:id/terminate')
  async terminate(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.terminateEmployee(req.user.actorId, id);
  }

  @Post('employees/:id/rehire')
  async rehire(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.rehireEmployee(req.user.actorId, id);
  }

  @Post('employees/:id/transfer')
  async transfer(@Param('id') id: string, @Body() body: { departmentId: string }, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'employee', id);
    return this.employeeService.transferEmployee(req.user.actorId, id, body.departmentId);
  }

  @Post('employees/:id/promote')
  async promote(@Param('id') id: string, @Body() body: { roleId: string }, @Request() req) {
    const companyId = await this.authz.assertResourceAccess(req.user, 'employee', id);
    await this.authz.assertRoleUsable(companyId, body.roleId);
    return this.employeeService.promoteEmployee(req.user.actorId, id, body.roleId);
  }
}

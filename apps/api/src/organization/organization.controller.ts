import { Controller, Get, Post, Put, Patch, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { OrganizationService } from './organization.service';
import { EmployeeService } from '../employee/employee.service';
import { WorkerProfileService } from '../workforce/worker-profile.service';

@Controller('organization')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly employeeService: EmployeeService,
    private readonly profileService: WorkerProfileService,
  ) {}

  @Get()
  getOrganization(@Request() req: any) {
    return this.orgService.getOrganization(req.user.companyId);
  }

  @Get('chart')
  getOrganizationChart(@Request() req: any) {
    return this.orgService.getOrganizationChart(req.user.companyId);
  }

  @Get('departments')
  getDepartments(@Request() req: any) {
    return this.orgService.getDepartments(req.user.companyId);
  }

  @Get('departments/:id')
  getDepartment(@Request() req: any, @Param('id') id: string) {
    return this.orgService.getDepartment(req.user.companyId, id);
  }

  @Get('activity')
  getActivity(@Request() req: any) {
    return this.orgService.getActivity(req.user.companyId);
  }

  @Get('audit')
  getAudit(@Request() req: any) {
    return this.orgService.getAudit(req.user.companyId);
  }

  @Get('employees')
  getEmployees(@Request() req: any) {
    return this.employeeService.listEmployees(req.user.companyId);
  }

  @Post('employee')
  hireEmployee(@Request() req: any, @Body() body: any) {
    return this.employeeService.hireEmployee(req.user.actorId, req.user.companyId, body);
  }

  @Get('employee/:id')
  getEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.getEmployee(id); // Ensure company filtering exists
  }

  @Get('employee/:id/history')
  getEmployeeHistory(@Param('id') id: string) {
    return this.employeeService.getHistory(id);
  }

  @Patch('employee/:id')
  patchEmployee(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.employeeService.transferEmployee(req.user.actorId, id, body.departmentId || id);
  }

  @Post('employee/:id/onboard')
  onboardEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.reactivateEmployee(req.user.actorId, id);
  }

  @Post('employee/:id/activate')
  activateEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.reactivateEmployee(req.user.actorId, id);
  }

  @Post('employee/:id/suspend')
  suspendEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.suspendEmployee(req.user.actorId, id);
  }

  @Post('employee/:id/reactivate')
  reactivateEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.reactivateEmployee(req.user.actorId, id);
  }

  @Post('employee/:id/terminate')
  terminateEmployee(@Request() req: any, @Param('id') id: string) {
    return this.employeeService.terminateEmployee(req.user.actorId, id);
  }

  @Get('employee/:id/permissions')
  getEmployeePermissions(@Param('id') id: string) {
    return [];
  }

  @Patch('employee/:id/permissions')
  patchEmployeePermissions(@Param('id') id: string, @Body() body: any) {
    return [];
  }

  @Get('employee/:id/responsibilities')
  getEmployeeResponsibilities(@Param('id') id: string) {
    return [];
  }

  @Patch('employee/:id/responsibilities')
  patchEmployeeResponsibilities(@Param('id') id: string, @Body() body: any) {
    return [];
  }

  @Get('employee/:id/kpis')
  getEmployeeKpis(@Param('id') id: string) {
    return [];
  }

  @Post('employee/:id/kpis')
  postEmployeeKpis(@Param('id') id: string, @Body() body: any) {
    return [];
  }

  @Get('employee/:id/budget')
  getEmployeeBudget(@Param('id') id: string) {
    return { allocatedAmount: 0, spentAmount: 0 };
  }

  @Get('employee/:id/performance')
  getEmployeePerformance(@Param('id') id: string) {
    return [];
  }

  @Post('employee/:id/performance/evaluate')
  evaluateEmployeePerformance(@Param('id') id: string, @Body() body: any) {
    return { status: 'Evaluated' };
  }

  @Post('employee/:id/promote')
  promoteEmployee(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.employeeService.promoteEmployee(req.user.actorId, id, body.newRoleId);
  }

  @Post('employee/:id/transfer')
  transferEmployee(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.employeeService.transferEmployee(req.user.actorId, id, body.newDepartmentId);
  }

  @Get('employee/:id/succession')
  getEmployeeSuccession(@Param('id') id: string) {
    return [];
  }
}


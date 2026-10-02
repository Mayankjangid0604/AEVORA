import { Controller, Get, Post, Body, Param, Headers } from '@nestjs/common';
import { EmployeeService } from './employee.service';

@Controller()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('companies/:companyId/employees')
  async list(@Param('companyId') companyId: string) {
    return this.employeeService.listEmployees(companyId);
  }

  @Get('employees/:id')
  async get(@Param('id') id: string) {
    return this.employeeService.getEmployee(id);
  }

  @Get('employees/:id/history')
  async history(@Param('id') id: string) {
    return this.employeeService.getHistory(id);
  }

  @Get('employees/:id/skills')
  async skills(@Param('id') id: string) {
    return this.employeeService.getSkills(id);
  }

  @Post('companies/:companyId/employees')
  async create(
    @Param('companyId') companyId: string, 
    @Headers('x-actor-id') actorId: string,
    @Body() body: any
  ) {
    return this.employeeService.hireEmployee(actorId || 'SYSTEM', companyId, body);
  }

  @Post('employees/:id/hold')
  async hold(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.employeeService.holdEmployee(actorId || 'SYSTEM', id);
  }

  @Post('employees/:id/reactivate')
  async reactivate(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.employeeService.reactivateEmployee(actorId || 'SYSTEM', id);
  }

  @Post('employees/:id/suspend')
  async suspend(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.employeeService.suspendEmployee(actorId || 'SYSTEM', id);
  }

  @Post('employees/:id/terminate')
  async terminate(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.employeeService.terminateEmployee(actorId || 'SYSTEM', id);
  }

  @Post('employees/:id/rehire')
  async rehire(@Param('id') id: string, @Headers('x-actor-id') actorId: string) {
    return this.employeeService.rehireEmployee(actorId || 'SYSTEM', id);
  }

  @Post('employees/:id/transfer')
  async transfer(@Param('id') id: string, @Headers('x-actor-id') actorId: string, @Body() body: { departmentId: string }) {
    return this.employeeService.transferEmployee(actorId || 'SYSTEM', id, body.departmentId);
  }

  @Post('employees/:id/promote')
  async promote(@Param('id') id: string, @Headers('x-actor-id') actorId: string, @Body() body: { roleId: string }) {
    return this.employeeService.promoteEmployee(actorId || 'SYSTEM', id, body.roleId);
  }
}

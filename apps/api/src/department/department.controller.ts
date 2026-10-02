import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { DepartmentService } from './department.service';

@Controller()
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get('companies/:companyId/departments')
  async list(@Param('companyId') companyId: string) {
    return this.departmentService.listDepartments(companyId);
  }

  @Post('companies/:companyId/departments')
  async create(@Param('companyId') companyId: string, @Body() body: { name: string }) {
    return this.departmentService.createDepartment(companyId, body.name);
  }

  @Patch('departments/:id')
  async update(@Param('id') id: string, @Body() body: { name: string }) {
    return this.departmentService.updateDepartment(id, body.name);
  }
}

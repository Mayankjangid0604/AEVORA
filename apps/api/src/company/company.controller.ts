import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { CompanyService } from './company.service';

@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  async list() {
    return this.companyService.listCompanies();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.companyService.getCompany(id);
  }

  @Post()
  async create(@Body() body: { name: string; legalName: string; description: string; chairmanId: string }) {
    return this.companyService.createCompany(body.name, body.legalName, body.description, body.chairmanId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; legalName?: string; description?: string }) {
    return this.companyService.updateCompany(id, body);
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string) {
    return this.companyService.pauseCompany(id);
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string) {
    return this.companyService.resumeCompany(id);
  }

  @Post(':id/close')
  async close(@Param('id') id: string) {
    return this.companyService.closeCompany(id);
  }
}

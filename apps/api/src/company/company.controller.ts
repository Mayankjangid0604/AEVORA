import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CompanyService, CreateSubsidiaryDto, AutoProvisionCompanyDto } from './company.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@UseGuards(RolesGuard)
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Only the companies the authenticated actor can access. */
  @Get()
  async list(@Request() req: any) {
    return this.authz.accessibleCompanies(req.user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Request() req: any) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.getCompany(id);
  }

  /** The owner is always the authenticated Chairman; a body chairmanId is ignored. */
  @Roles('CHAIRMAN')
  @Post()
  async create(
    @Body() body: { name: string; legalName: string; description: string; groupId?: string },
    @Request() req: any,
  ) {
    if (body.groupId) await this.authz.assertGroupOwnership(req.user, body.groupId);
    return this.companyService.createCompany(
      body.name,
      body.legalName,
      body.description,
      req.user.actorId,
      body.groupId,
    );
  }

  /** Authoritative automatic subsidiary creation with initial spatial campus deployment. */
  @Post(':id/subsidiaries')
  async createSubsidiary(
    @Param('id') parentCompanyId: string,
    @Body() body: CreateSubsidiaryDto,
    @Request() req: any,
  ) {
    await this.authz.assertCompanyAccess(req.user, parentCompanyId);
    const actorId = req.user.actorId || req.user.id || req.user.employeeId;
    return this.companyService.createSubsidiary(parentCompanyId, actorId, body);
  }

  /** Lists all authoritative subsidiaries belonging to a parent company. */
  @Get(':id/subsidiaries')
  async listSubsidiaries(@Param('id') parentCompanyId: string, @Request() req: any) {
    await this.authz.assertCompanyAccess(req.user, parentCompanyId);
    return this.companyService.getSubsidiaries(parentCompanyId);
  }

  /** Unified company / subsidiary auto-provisioning entrypoint. */
  @Post('auto-provision')
  async autoProvision(@Body() body: AutoProvisionCompanyDto, @Request() req: any) {
    if (body.parentCompanyId) {
      await this.authz.assertCompanyAccess(req.user, body.parentCompanyId);
    } else if (body.groupId) {
      await this.authz.assertGroupOwnership(req.user, body.groupId);
    }
    const actorId = req.user.actorId || req.user.id || req.user.employeeId;
    return this.companyService.autoProvisionCompany(actorId, body);
  }

  /** Retries or reconciles spatial campus provisioning for an existing company. */
  @Post(':id/provision-campus')
  async provisionCampus(
    @Param('id') companyId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    await this.authz.assertCompanyAccess(req.user, companyId);
    return this.companyService.provisionCompanyCampus(companyId, body);
  }

  @Roles('CHAIRMAN')
  @Patch(':id')
  @Post(':id/update')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; legalName?: string; description?: string },
    @Request() req: any,
  ) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.updateCompany(id, {
      name: body.name,
      legalName: body.legalName,
      description: body.description,
    });
  }

  @Roles('CHAIRMAN')
  @Post(':id/pause')
  async pause(@Param('id') id: string, @Request() req: any) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.pauseCompany(id);
  }

  @Roles('CHAIRMAN')
  @Post(':id/resume')
  async resume(@Param('id') id: string, @Request() req: any) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.resumeCompany(id);
  }

  @Roles('CHAIRMAN')
  @Post(':id/close')
  async close(@Param('id') id: string, @Request() req: any) {
    await this.authz.assertCompanyAccess(req.user, id);
    return this.companyService.closeCompany(id);
  }
}

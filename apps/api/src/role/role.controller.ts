import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  async list(@Request() req: any) {
    const { companyId } = req.user;
    return this.roleService.listRoles(companyId);
  }

  @Post()
  async create(@Request() req: any, @Body() body: { title: string; level: number; permissions: string[]; description?: string }) {
    const { companyId } = req.user;
    return this.roleService.createRole(body.title, body.level, body.permissions, companyId, body.description);
  }
}

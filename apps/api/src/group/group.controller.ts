import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service';
import { GroupService } from './group.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class GroupController {
  constructor(private readonly groupService: GroupService, private readonly authz: AuthorizationService) {}

  @Get()
  async list(@Request() req) {
    return this.groupService.listGroups(req.user.actorId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Request() req) {
    await this.authz.assertGroupOwnership(req.user, id);
    return this.groupService.getGroup(id);
  }

  @Get(':id/report')
  async getReport(@Param('id') id: string, @Request() req) {
    return this.groupService.getGroupReport(id, req.user.actorId);
  }

  @Post()
  async create(@Body() body: { name: string; description: string }, @Request() req) {
    // Owner is always the authenticated Chairman; a body chairmanId is ignored.
    return this.groupService.createGroup(body.name, body.description, req.user.actorId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; description?: string }, @Request() req) {
    await this.authz.assertGroupOwnership(req.user, id);
    return this.groupService.updateGroup(id, { name: body.name, description: body.description });
  }
}

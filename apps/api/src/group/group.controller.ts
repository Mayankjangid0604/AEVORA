import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get()
  async list(@Request() req) {
    return this.groupService.listGroups(req.user.actorId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.groupService.getGroup(id);
  }

  @Get(':id/report')
  async getReport(@Param('id') id: string, @Request() req) {
    return this.groupService.getGroupReport(id, req.user.actorId);
  }

  @Post()
  async create(@Body() body: { name: string; description: string; chairmanId: string }) {
    return this.groupService.createGroup(body.name, body.description, body.chairmanId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    return this.groupService.updateGroup(id, body);
  }
}

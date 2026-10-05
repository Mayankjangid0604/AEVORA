import { Controller, Get, Param, Request, Query, UseGuards, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { V12SpatialAudioService } from './v12-spatial-audio.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

@Controller('v12-spatial-audio')
@UseGuards(JwtAuthGuard)
export class V12SpatialAudioController {
  constructor(private readonly audioService: V12SpatialAudioService) {}

  @Get('audible-sources/:companyId')
  async getAudibleSources(
    @Request() req,
    @Param('companyId') companyId: string,
    @Query('listenerNodeId') listenerNodeId: string
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (user.companyId !== companyId) {
      throw new ForbiddenException('Cannot access spatial audio for a different company');
    }
    if (!listenerNodeId) {
      throw new BadRequestException('listenerNodeId is required');
    }

    return this.audioService.resolveAudibleSourcesForListener(companyId, listenerNodeId);
  }
}

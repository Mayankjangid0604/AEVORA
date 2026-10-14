import { Controller, Get, Param, Request, Query, UseGuards, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SpatialAudioService } from './spatial-audio.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

@Controller(['spatial/audio', 'v12-spatial-audio'])
@UseGuards(JwtAuthGuard)
export class SpatialAudioController {
  constructor(private readonly audioService: SpatialAudioService) {}

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

export const V12SpatialAudioController = SpatialAudioController;
export type V12SpatialAudioController = SpatialAudioController;

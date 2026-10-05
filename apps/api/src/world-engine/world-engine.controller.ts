import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { WeWorldEventService, IngestWorldEventDto } from './we-world-event.service';
import { WeMarketStateService } from './we-market-state.service';

@Controller('world-engine')
@UseGuards(JwtAuthGuard)
export class WorldEngineController {
  constructor(
    private readonly worldEventService: WeWorldEventService,
    private readonly marketStateService: WeMarketStateService,
  ) {}

  @Post('events')
  async ingest(@Request() req: any, @Body() dto: IngestWorldEventDto) {
    const companyId = req.user.companyId;
    return this.worldEventService.ingest(companyId, dto);
  }

  @Get('events')
  async list(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: string,
  ) {
    const companyId = req.user.companyId;
    return this.worldEventService.getEvents(companyId, {
      category: category as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('events/:id/interpret')
  async interpret(@Param('id') id: string) {
    await this.worldEventService.interpret(id);
    return { ok: true };
  }

  @Get('market-state')
  async getMarketState(@Request() req: any) {
    const companyId = req.user.companyId;
    return this.marketStateService.getState(companyId);
  }

  @Post('market-state/reset')
  async resetMarketState(@Request() req: any) {
    const companyId = req.user.companyId;
    return this.marketStateService.reset(companyId);
  }

  @Post('mock/oil-shock')
  async mockOilShock(@Request() req: any, @Body() body: { magnitudePct: number }) {
    const companyId = req.user.companyId;
    const event = await this.worldEventService.createMockOilShock(companyId, body.magnitudePct);
    await this.worldEventService.interpret(event.id);
    return { event, isAdvisory: true };
  }

  @Post('mock/fx-move')
  async mockFxMove(
    @Request() req: any,
    @Body() body: { fromRate: number; toRate: number },
  ) {
    const companyId = req.user.companyId;
    const event = await this.worldEventService.createMockFxMove(companyId, body.fromRate, body.toRate);
    await this.worldEventService.interpret(event.id);
    return { event, isAdvisory: true };
  }

  @Post('mock/rate-hike')
  async mockRateHike(@Request() req: any, @Body() body: { newRate: number }) {
    const companyId = req.user.companyId;
    const event = await this.worldEventService.createMockRateHike(companyId, body.newRate);
    await this.worldEventService.interpret(event.id);
    return { event, isAdvisory: true };
  }
}

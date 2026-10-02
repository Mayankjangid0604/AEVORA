import { Controller, Get, Post, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  private getCompanyId(req: any) {
    const companyId = req.user?.companyId;
    if (!companyId) throw new BadRequestException('Company ID is missing from token');
    return companyId;
  }

  @Get('status')
  async getStatus(@Request() req) {
    return this.simulationService.getSimulationState(this.getCompanyId(req));
  }

  @Post('start')
  async start(@Request() req) {
    return this.simulationService.start(this.getCompanyId(req));
  }

  @Post('pause')
  async pause(@Request() req) {
    return this.simulationService.pause(this.getCompanyId(req));
  }

  @Post('resume')
  async resume(@Request() req) {
    return this.simulationService.resume(this.getCompanyId(req));
  }

  @Post('stop')
  async stop(@Request() req) {
    return this.simulationService.stop(this.getCompanyId(req));
  }

  @Get('events')
  async getEvents(@Request() _req) {
    return this.simulationService.getEvents();
  }

  @Get('metrics')
  async getMetrics(@Request() req) {
    return this.simulationService.getMetrics(this.getCompanyId(req));
  }
}

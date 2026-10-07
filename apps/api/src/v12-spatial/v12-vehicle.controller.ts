import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { V12VehicleService, AutoProvisionFleetDto } from './v12-vehicle.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v12-vehicles')
@UseGuards(JwtAuthGuard)
export class V12VehicleController {
  constructor(
    private readonly vehicleService: V12VehicleService,
    private readonly prisma: PrismaService,
  ) {}

  private scope(req: any, companyId: string) {
    const user = req?.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!user.companyId || user.companyId !== companyId) {
      throw new ForbiddenException('Fleet operations are strictly restricted to your authorized company scope');
    }
    return user;
  }

  @Post(':companyId/auto-provision')
  async autoProvisionFleet(
    @Request() req: any,
    @Param('companyId') companyId: string,
    @Body() body: AutoProvisionFleetDto,
  ) {
    const user = this.scope(req, companyId);
    const actorId = user.id || user.employeeId || user.userId;
    return this.vehicleService.autoProvisionFleet(companyId, actorId, body);
  }

  @Post(':companyId/reconcile')
  async reconcileFleet(
    @Request() req: any,
    @Param('companyId') companyId: string,
    @Body() body: { targetCount: number; policyOverrides?: any },
  ) {
    this.scope(req, companyId);
    return this.vehicleService.reconcileFleetCapacity(
      companyId,
      body.targetCount,
      body.policyOverrides,
    );
  }

  @Get(':companyId')
  async getCompanyFleet(
    @Request() req: any,
    @Param('companyId') companyId: string,
  ) {
    this.scope(req, companyId);
    return this.prisma.v12SpatialVehicle.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post(':companyId/:vehicleId/decommission')
  async decommissionVehicle(
    @Request() req: any,
    @Param('companyId') companyId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    this.scope(req, companyId);
    return this.vehicleService.decommissionVehicle(vehicleId, companyId);
  }
}

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
import { HqCapacityService, HqCapacityPolicy } from './hq-capacity.service';

@Controller('v12-capacity')
@UseGuards(JwtAuthGuard)
export class HqCapacityController {
  constructor(private readonly capacityService: HqCapacityService) {}

  private scope(req: any, companyId: string) {
    const user = req?.user;
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!user.companyId || user.companyId !== companyId) {
      throw new ForbiddenException('Capacity management is restricted to your company scope');
    }
  }

  @Get(':companyId/evaluation')
  async evaluateCapacity(@Request() req: any, @Param('companyId') companyId: string) {
    this.scope(req, companyId);
    return this.capacityService.evaluateCapacity(companyId);
  }

  @Post(':companyId/reconcile')
  async reconcileCapacity(
    @Request() req: any,
    @Param('companyId') companyId: string,
    @Body() body?: { policy?: Partial<HqCapacityPolicy> },
  ) {
    this.scope(req, companyId);
    return this.capacityService.reconcileCompanyCapacity(companyId, body?.policy);
  }
}
